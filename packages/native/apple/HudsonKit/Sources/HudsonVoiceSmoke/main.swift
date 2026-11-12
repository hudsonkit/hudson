import Darwin
import Foundation
import HudsonVoice
import HudsonVoicePhonon

// End-to-end smoke for routed local speech.
//
//   hudson-voice-smoke --models DIR --out DIR [--install] [--no-play] [--text "..."]
//
// Without --install it never touches the network: a missing model is
// reported, not fetched.

var arguments = Array(CommandLine.arguments.dropFirst())
func option(_ name: String) -> String? {
    guard let index = arguments.firstIndex(of: name), index + 1 < arguments.count else { return nil }
    return arguments[index + 1]
}
let modelsDir = option("--models").map { URL(fileURLWithPath: $0, isDirectory: true) }
let outDir = URL(fileURLWithPath: option("--out") ?? FileManager.default.currentDirectoryPath, isDirectory: true)
let shouldInstall = arguments.contains("--install")
let shouldPlay = !arguments.contains("--no-play")
let text = option("--text")
    ?? "Hudson is speaking with Phonon, on this Mac. Local speech, with no network, after one install."

func rssMB() -> Double {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
            task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
        }
    }
    return result == KERN_SUCCESS ? Double(info.resident_size) / 1_048_576 : -1
}

func peakRSSMB() -> Double {
    var usage = rusage()
    getrusage(RUSAGE_SELF, &usage)
    return Double(usage.ru_maxrss) / 1_048_576
}

func json<T: Encodable>(_ value: T) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    return (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) } ?? "\(value)"
}

let clock = ContinuousClock()
func ms(_ duration: Duration) -> Int {
    Int(duration.components.seconds * 1000) + Int(duration.components.attoseconds / 1_000_000_000_000_000)
}

let engine = HudPhononSpeechEngine(directory: modelsDir)
print("model dir:", engine.directory.path)
print("state at launch:", await engine.currentState())

if shouldInstall {
    let watcher = Task {
        var last = ""
        for await state in await engine.stateUpdates() {
            let line = "\(state)"
            if line != last { print("  install state:", line); last = line }
        }
    }
    let t0 = clock.now
    do {
        try await engine.install()
        print("install:", ms(clock.now - t0), "ms")
    } catch {
        print("install failed:", error.localizedDescription)
        exit(1)
    }
    watcher.cancel()
}

let router = HudSpeechRouter(localEngines: [engine])
let catalog = await router.catalog()
if let phonon = catalog.provider(.phonon) {
    print("catalog phonon:", phonon.availability, phonon.models.map(\.id))
}

// Cold or warm load, measured on its own.
let tPrepare = clock.now
let rssBefore = rssMB()
do {
    try await engine.prepare()
} catch {
    print("prepare failed:", error.localizedDescription)
    // Still show the receipt for the local-only policy: no cloud escalation.
    let receipt = await router.speak(text, policy: await router.localOnlyPolicy())
    print(json(receipt))
    exit(2)
}
print("prepare:", ms(clock.now - tPrepare), "ms; rss", Int(rssBefore), "->", Int(rssMB()), "MB")

// Generation only: playable WAV through the same engine.
let generation = try await router.generate(text, policy: await router.localOnlyPolicy())
let wavURL = outDir.appending(path: "hudson-phonon-smoke.wav")
try generation.data.write(to: wavURL)
print("generated:", wavURL.path, generation.data.count, "bytes,", HudSpeechWAV.duration(of: generation.data) ?? 0, "s")
print("generate receipt:", json(generation.receipt))

// Fallback receipt: cloud-first with no credentials lands on Phonon.
let resolution = await router.resolve(router.cloudFirstPolicy())
print("cloudFirst route without keys:", resolution.route.map { "\($0.provider) \($0.modelId)" } ?? "none")

if shouldPlay {
    for pass in 1...2 {
        let events = HudEventLog()
        let receipt = await router.speak(text, policy: await router.cloudFirstPolicy(), requestId: "smoke-live-\(pass)") { event in
            events.append("\(event.phase.rawValue)\(event.localState.map { "(\($0))" } ?? "")")
        }
        print("live pass \(pass) phases:", events.lines.joined(separator: " > "))
        print("live pass \(pass) receipt:", json(receipt))
    }

    // Barge-in: cancel shortly after first audio; nothing plays afterwards.
    let cancelEvents = HudEventLog()
    let speaking = Task {
        await router.speak(text, policy: await router.localOnlyPolicy(), requestId: "smoke-cancel") { event in
            cancelEvents.append(event.phase.rawValue)
        }
    }
    try await Task.sleep(for: .milliseconds(600))
    await router.cancel()
    let cancelled = await speaking.value
    print("cancel phases:", cancelEvents.lines.joined(separator: " > "), "outcome:", cancelled.outcome)
}

print("rss now", Int(rssMB()), "MB; peak", Int(peakRSSMB()), "MB")

final class HudEventLog: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [String] = []
    func append(_ line: String) { lock.lock(); storage.append(line); lock.unlock() }
    var lines: [String] { lock.lock(); defer { lock.unlock() }; return storage }
}
