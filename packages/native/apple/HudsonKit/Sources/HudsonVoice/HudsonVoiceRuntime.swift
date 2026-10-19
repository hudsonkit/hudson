import Darwin
import Foundation

public enum HudsonVoiceRuntimeError: Error, LocalizedError, Equatable {
    case missing(URL)
    case invalid(String)
    case stale(pid: Int32)

    public var errorDescription: String? {
        switch self {
        case .missing(let url):
            return "Hudson voice runtime is not available at \(url.path). Launch the host app and try again."
        case .invalid(let reason):
            return "Hudson voice runtime is invalid: \(reason)"
        case .stale(let pid):
            return "Hudson voice runtime is stale; process \(pid) is not running."
        }
    }
}

public struct HudsonVoiceRuntimeCapability: Decodable, Equatable, Sendable {
    public let schemaVersion: Int
    public let service: String
    public let transport: String
    public let host: String
    public let port: UInt16
    public let webSocketUrl: String
    public let authToken: String
    public let socketPath: String?
    public let pid: Int32?
    public let startedAt: String?
    public let voxRuntimePath: String?

    public var endpoint: HudVoxEndpoint {
        HudVoxEndpoint(host: host, port: port, socketPath: socketPath)
    }
}

public struct HudsonVoiceRuntimeConnection: Equatable, Sendable {
    public let capability: HudsonVoiceRuntimeCapability
    public let endpoint: HudVoxEndpoint
    public let options: HudVoxLiveSessionOptions
}

public enum HudsonVoiceRuntime {
    public static let runtimePathEnvironmentKey = "HUDSON_VOICE_RUNTIME_PATH"

    public static var defaultRuntimeURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base
            .appendingPathComponent("Hudson", isDirectory: true)
            .appendingPathComponent("Vox", isDirectory: true)
            .appendingPathComponent("hudson-voice-runtime.json")
    }

    public static func runtimeURL(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        guard let rawPath = environment[runtimePathEnvironmentKey],
              !rawPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return defaultRuntimeURL
        }
        return URL(fileURLWithPath: rawPath)
    }

    public static func read(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fileManager: FileManager = .default
    ) throws -> HudsonVoiceRuntimeCapability {
        let url = runtimeURL(environment: environment)
        guard fileManager.fileExists(atPath: url.path) else {
            throw HudsonVoiceRuntimeError.missing(url)
        }
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw HudsonVoiceRuntimeError.invalid("capability cannot be opened safely") }
        defer { close(fd) }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_uid == geteuid(),
              info.st_mode & 0o077 == 0, info.st_nlink == 1, info.st_size > 0, info.st_size <= 65_536 else {
            throw HudsonVoiceRuntimeError.invalid("capability must be a private user-owned file")
        }
        var data = Data(count: Int(info.st_size))
        let count = data.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, $0.count) }
        guard count == data.count else { throw HudsonVoiceRuntimeError.invalid("incomplete capability") }
        let capability = try JSONDecoder().decode(HudsonVoiceRuntimeCapability.self, from: data)
        try validate(capability)
        return capability
    }

    public static func resolveConnection(
        clientId: String = "HudsonKit",
        modelId: String? = nil,
        language: String? = nil,
        mode: HudVoiceMode? = nil,
        metadata: [String: String] = [:],
        deviceId: String? = nil,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> HudsonVoiceRuntimeConnection {
        let capability = try read(environment: environment)
        let preferences = (try? HudsonVoicePreferences.load()) ?? HudsonVoicePreferences()
        let options = HudVoxLiveSessionOptions(
            clientId: clientId,
            modelId: clean(modelId) ?? preferences.preferredTranscriptionModelId,
            language: clean(language) ?? preferences.preferredLanguage,
            mode: mode ?? preferences.mode,
            metadata: metadata,
            authToken: capability.authToken,
            deviceId: clean(deviceId) ?? preferences.preferredInputDeviceId
        )
        return HudsonVoiceRuntimeConnection(
            capability: capability,
            endpoint: capability.endpoint,
            options: options
        )
    }

    public static func isAvailable(environment: [String: String] = ProcessInfo.processInfo.environment) -> Bool {
        (try? read(environment: environment)) != nil
    }

    private static func validate(_ capability: HudsonVoiceRuntimeCapability) throws {
        guard capability.service == "hudson-voice" else {
            throw HudsonVoiceRuntimeError.invalid("expected service hudson-voice")
        }
        if capability.transport == "unix+ws+json-rpc" {
            guard let path = capability.socketPath, path.hasPrefix("/"), !path.contains("\0") else {
                throw HudsonVoiceRuntimeError.invalid("missing private socket path")
            }
        } else if capability.transport != "ws+json-rpc" || capability.socketPath != nil {
            throw HudsonVoiceRuntimeError.invalid("unsupported transport")
        }
        guard capability.host == "127.0.0.1" || capability.host == "localhost" || capability.host == "::1" else {
            throw HudsonVoiceRuntimeError.invalid("runtime host must be loopback")
        }
        guard !capability.authToken.isEmpty else {
            throw HudsonVoiceRuntimeError.invalid("missing auth token")
        }
        if let pid = capability.pid, kill(pid, 0) != 0 {
            throw HudsonVoiceRuntimeError.stale(pid: pid)
        }
    }

    private static func clean(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}
