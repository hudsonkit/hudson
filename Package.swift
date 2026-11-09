// swift-tools-version: 5.9
import PackageDescription
import Foundation

// Single Hudson package manifest.
//
// This is the one source of truth for the Apple package. It replaces the former
// split between this root manifest and the inner
// `packages/native/apple/HudsonKit/Package.swift` dev/CI manifest.
//
// Terminal remains gated because it adds the full PTY/canvas stack. Voice is a
// stable product and is always present in the package graph; downloading the
// Parakeet model is controlled at runtime by HudsonVoice instead.
//   HUDSONKIT_WITH_TERMINAL=1  -> HudsonTerminal + Canvas surface
//   HUDSONKIT_WITH_VOICE=0     -> no HudsonVoice, and no Vox dependency, for a
//                                 host that links its own Vox checkout
let environment = ProcessInfo.processInfo.environment
let terminalEnabled = environment["HUDSONKIT_WITH_TERMINAL"] == "1"
let voiceEnabled = environment["HUDSONKIT_WITH_VOICE"] != "0"
let binaryDistributionEnabled = environment["HUDSONKIT_BINARY_DISTRIBUTION"] == "1"
let hudsonLibraryType: Product.Library.LibraryType? = binaryDistributionEnabled ? .dynamic : nil

func hudsonLibrary(name: String, targets: [String]) -> Product {
    .library(name: name, type: hudsonLibraryType, targets: targets)
}

func nonEmptyEnv(_ key: String) -> String? {
    guard let value = environment[key]?.trimmingCharacters(in: .whitespacesAndNewlines),
          !value.isEmpty
    else {
        return nil
    }
    return value
}

func packageIdentity(forGitURL url: String) -> String {
    var candidate = url.split(separator: "/").last.map(String.init) ?? url
    if candidate.hasSuffix(".git") {
        candidate.removeLast(4)
    }
    return candidate.lowercased()
}

@discardableResult
func appendGitDependency(
    to dependencies: inout [Package.Dependency],
    url defaultURL: String,
    branch defaultBranch: String = "main",
    envPrefix: String,
    defaultLocalPath: String? = nil,
    defaultRevision: String? = nil
) -> String {
    if let path = nonEmptyEnv("\(envPrefix)_PATH") {
        dependencies.append(.package(path: path))
        return nonEmptyEnv("\(envPrefix)_PACKAGE") ?? packageIdentity(forGitURL: path)
    }

    // Explicit path/git/package selections take precedence over a local
    // development default. Release builds continue to use the git graph.
    let hasGitOverride = ["GIT_URL", "GIT_REVISION", "GIT_BRANCH", "PACKAGE"].contains {
        nonEmptyEnv("\(envPrefix)_\($0)") != nil
    }
    if !hasGitOverride, let path = defaultLocalPath {
        dependencies.append(.package(path: path))
        return packageIdentity(forGitURL: path)
    }

    let url = nonEmptyEnv("\(envPrefix)_GIT_URL") ?? defaultURL

    let pinnedRevision = nonEmptyEnv("\(envPrefix)_GIT_REVISION")
        ?? (nonEmptyEnv("\(envPrefix)_GIT_BRANCH") == nil && nonEmptyEnv("\(envPrefix)_GIT_URL") == nil ? defaultRevision : nil)
    if let revision = pinnedRevision {
        dependencies.append(.package(url: url, revision: revision))
    } else {
        dependencies.append(
            .package(
                url: url,
                branch: nonEmptyEnv("\(envPrefix)_GIT_BRANCH") ?? defaultBranch
            )
        )
    }

    return nonEmptyEnv("\(envPrefix)_PACKAGE") ?? packageIdentity(forGitURL: url)
}

let src = "packages/native/apple/HudsonKit/Sources/"
let tst = "packages/native/apple/HudsonKit/Tests/"
let demo = "packages/native/apple/HudsonKit/Demo/"

var products: [Product] = [
    // This quarantine product is the only entry point for mechanics still
    // earning stable HudsonKit admission. Stable products must
    // never depend on it; scripts/apple/check-experimental-boundary.py enforces
    // that graph rule in CI.
    hudsonLibrary(name: "HudsonKitExperimental", targets: ["HudsonKitExperimental"]),
    hudsonLibrary(name: "HudsonObservability", targets: ["HudsonObservability"]),
    hudsonLibrary(name: "HudsonTranscription", targets: ["HudsonTranscription"]),
    hudsonLibrary(name: "HudsonTranscriptionUI", targets: ["HudsonTranscriptionUI"]),
    hudsonLibrary(name: "HudsonLive", targets: ["HudsonLive"]),
    hudsonLibrary(name: "HudsonDiff", targets: ["HudsonDiff"]),
    hudsonLibrary(name: "HudsonMarkup", targets: ["HudsonMarkup"]),
    hudsonLibrary(name: "HudsonUI", targets: ["HudsonUI"]),
    hudsonLibrary(name: "HudsonUIPermissions", targets: ["HudsonUIPermissions"]),
    hudsonLibrary(name: "HudsonUIAudio", targets: ["HudsonUIAudio"]),
    hudsonLibrary(name: "HudsonUICapture", targets: ["HudsonUICapture"]),
    hudsonLibrary(name: "HudsonUIWeb", targets: ["HudsonUIWeb"]),
    hudsonLibrary(name: "HudsonUIKeyboard", targets: ["HudsonUIKeyboard"]),
    hudsonLibrary(name: "HudsonUIOnboarding", targets: ["HudsonUIOnboarding"]),
    hudsonLibrary(name: "HudsonWorkflow", targets: ["HudsonWorkflow"]),
    hudsonLibrary(name: "HudsonBridge", targets: ["HudsonBridge"]),
    hudsonLibrary(name: "HudsonShell", targets: ["HudsonShell"]),
    hudsonLibrary(name: "HudsonAI", targets: ["HudsonAI"]),
    hudsonLibrary(name: "HudsonCanvasCore", targets: ["HudsonCanvasCore"]),
    hudsonLibrary(name: "HudsonCanvasCompanion", targets: ["HudsonCanvasCompanion"]),
    hudsonLibrary(name: "HudsonNotchCore", targets: ["HudsonNotchCore"]),
    hudsonLibrary(name: "HudsonNotch", targets: ["HudsonNotch"]),
    .executable(name: "hudson-notch", targets: ["HudsonNotchCLI"]),
]

var dependencies: [Package.Dependency] = []

products.append(hudsonLibrary(name: "HudsonTranscriptionCloud", targets: ["HudsonTranscriptionCloud"]))

var demoDependencies: [Target.Dependency] = ["HudsonUI", "HudsonShell", "HudsonVoice"]
var demoSwiftSettings: [SwiftSetting] = []

var targets: [Target] = [
    .target(name: "HudsonKitExperimental", path: src + "HudsonKitExperimental"),
    .target(name: "HudsonObservability", path: src + "HudsonObservability"),
    .target(name: "HudsonTranscription", path: src + "HudsonTranscription"),
    .target(name: "HudsonTranscriptionUI", dependencies: ["HudsonTranscription"], path: src + "HudsonTranscriptionUI"),
    .target(name: "HudsonLive", path: src + "HudsonLive"),
    .target(name: "HudsonDiff", path: src + "HudsonDiff"),
    .target(name: "HudsonMarkup", path: src + "HudsonMarkup"),
    .target(
        name: "HudsonUI",
        dependencies: ["HudsonLive", "HudsonObservability", "HudsonMarkup"],
        path: src + "HudsonUI"
    ),
    .target(name: "HudsonUIPermissions", dependencies: ["HudsonUI"], path: src + "HudsonUIPermissions"),
    .target(name: "HudsonUIAudio", dependencies: ["HudsonUI", "HudsonUIPermissions"], path: src + "HudsonUIAudio"),
    .target(name: "HudsonUICapture", dependencies: ["HudsonUI"], path: src + "HudsonUICapture"),
    .target(name: "HudsonUIWeb", path: src + "HudsonUIWeb"),
    .target(name: "HudsonUIKeyboard", dependencies: ["HudsonUI"], path: src + "HudsonUIKeyboard"),
    .target(name: "HudsonUIOnboarding", dependencies: ["HudsonUI"], path: src + "HudsonUIOnboarding"),
    .target(name: "HudsonWorkflow", dependencies: ["HudsonUI", "HudsonShell", "HudsonObservability"], path: src + "HudsonWorkflow"),
    .target(name: "HudsonBridge", dependencies: ["HudsonUI"], path: src + "HudsonBridge"),
    .target(name: "HudsonShell", dependencies: ["HudsonUI", "HudsonObservability"], path: src + "HudsonShell"),
    .target(name: "HudsonAI", dependencies: ["HudsonUI"], path: src + "HudsonAI"),
    .target(name: "HudsonCanvasCore", dependencies: ["HudsonUI"], path: src + "HudsonCanvasCore"),
    .target(name: "HudsonCanvasCompanion", dependencies: ["HudsonUI", "HudsonCanvasCore"], path: src + "HudsonCanvasCompanion"),
    .target(name: "HudsonNotchCore", path: src + "HudsonNotchCore"),
    .target(name: "HudsonNotch", dependencies: ["HudsonUI", "HudsonShell", "HudsonNotchCore"], path: src + "HudsonNotch"),
    .executableTarget(name: "HudsonNotchCLI", dependencies: ["HudsonNotchCore"], path: src + "HudsonNotchCLI"),
    .testTarget(name: "HudsonNotchCoreTests", dependencies: ["HudsonNotchCore"], path: tst + "HudsonNotchCoreTests"),

    .testTarget(name: "HudsonAITests", dependencies: ["HudsonAI"], path: tst + "HudsonAITests"),
    .testTarget(name: "HudsonMarkupTests", dependencies: ["HudsonMarkup"], path: tst + "HudsonMarkupTests"),
    .testTarget(
        name: "HudsonKitExperimentalTests",
        dependencies: ["HudsonKitExperimental"],
        path: tst + "HudsonKitExperimentalTests"
    ),
    .testTarget(name: "HudsonBridgeTests", dependencies: ["HudsonBridge"], path: tst + "HudsonBridgeTests"),
    .testTarget(name: "HudsonDiffTests", dependencies: ["HudsonDiff"], path: tst + "HudsonDiffTests"),
    .testTarget(name: "HudsonLiveTests", dependencies: ["HudsonLive"], path: tst + "HudsonLiveTests"),
    .testTarget(
        name: "HudsonTranscriptionTests",
        dependencies: ["HudsonTranscription"],
        path: tst + "HudsonTranscriptionTests"
    ),
    .testTarget(name: "HudsonShellTests", dependencies: ["HudsonShell"], path: tst + "HudsonShellTests"),
    .testTarget(name: "HudsonUIWebTests", dependencies: ["HudsonUIWeb"], path: tst + "HudsonUIWebTests"),
    .testTarget(
        name: "HudsonUITests",
        dependencies: [
            "HudsonUI",
            "HudsonUIPermissions",
            "HudsonUIAudio",
            "HudsonUICapture",
            "HudsonUIKeyboard",
            "HudsonUIOnboarding",
            "HudsonLive",
        ],
        path: tst + "HudsonUITests"
    ),
]

targets.append(.target(name: "HudsonTranscriptionCloud", dependencies: ["HudsonTranscription"], path: src + "HudsonTranscriptionCloud"))
targets.append(.testTarget(name: "HudsonTranscriptionCloudTests", dependencies: ["HudsonTranscriptionCloud"], path: tst + "HudsonTranscriptionCloudTests"))

products.append(hudsonLibrary(name: "HudsonTranscriptionElevenLabs", targets: ["HudsonTranscriptionElevenLabs"]))
targets.append(.target(name: "HudsonTranscriptionElevenLabs", dependencies: ["HudsonTranscription", "HudsonTranscriptionCloud"], path: src + "HudsonTranscriptionElevenLabs"))
targets.append(.testTarget(name: "HudsonTranscriptionElevenLabsTests", dependencies: ["HudsonTranscriptionElevenLabs"], path: tst + "HudsonTranscriptionElevenLabsTests"))

// Conversational voice: reusable two-way spoken assistant sessions. This stack
// is distinct from the transcription targets above; conversational output must
// never route through the transcription-only adapters.
products.append(hudsonLibrary(name: "HudsonConversation", targets: ["HudsonConversation"]))
products.append(hudsonLibrary(name: "HudsonConversationOpenAI", targets: ["HudsonConversationOpenAI"]))
products.append(hudsonLibrary(name: "HudsonConversationGemini", targets: ["HudsonConversationGemini"]))
products.append(hudsonLibrary(name: "HudsonConversationHost", targets: ["HudsonConversationHost"]))
targets.append(.target(name: "HudsonConversation", path: src + "HudsonConversation"))
targets.append(.target(name: "HudsonConversationOpenAI", dependencies: ["HudsonConversation"], path: src + "HudsonConversationOpenAI"))
targets.append(.target(name: "HudsonConversationGemini", dependencies: ["HudsonConversation"], path: src + "HudsonConversationGemini"))
targets.append(.target(name: "HudsonConversationHost", dependencies: ["HudsonConversation", "HudsonConversationOpenAI", "HudsonConversationGemini"], path: src + "HudsonConversationHost"))
targets.append(.testTarget(name: "HudsonConversationTests", dependencies: ["HudsonConversation"], path: tst + "HudsonConversationTests"))
targets.append(.testTarget(name: "HudsonConversationOpenAITests", dependencies: ["HudsonConversationOpenAI"], path: tst + "HudsonConversationOpenAITests"))
targets.append(.testTarget(name: "HudsonConversationGeminiTests", dependencies: ["HudsonConversationGemini"], path: tst + "HudsonConversationGeminiTests"))
targets.append(.testTarget(name: "HudsonConversationHostTests", dependencies: ["HudsonConversationHost", "HudsonConversationOpenAI", "HudsonConversationGemini"], path: tst + "HudsonConversationHostTests"))


if voiceEnabled {
    let siblingVox = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("vox").path
    let localVoxDefault = nonEmptyEnv("LATTICES_VOX_SOURCE")
        ?? (nonEmptyEnv("LATTICES_HUDSON_SOURCE") != "git"
            && FileManager.default.fileExists(atPath: siblingVox + "/Package.swift") ? siblingVox : nil)
    let voxPackage = appendGitDependency(
        to: &dependencies,
        url: "https://github.com/arach/vox.git",
        envPrefix: "HUDSON_VOX",
        defaultLocalPath: localVoxDefault,
        defaultRevision: "e1895152859779f4427296e8c5a8d0e38a16f123"
    )
    products.append(hudsonLibrary(name: "HudsonVoice", targets: ["HudsonVoice"]))
    targets.append(
        .target(
            name: "HudsonVoice",
            dependencies: [
                "HudsonUI",
                "HudsonObservability",
                .product(name: "VoxCore", package: voxPackage),
                .product(name: "VoxEngine", package: voxPackage),
                .product(name: "VoxAppleSpeech", package: voxPackage),
            ],
            path: src + "HudsonVoice"
        )
    )
    targets.append(
        .testTarget(
            name: "HudsonVoiceTests",
            dependencies: [
                "HudsonVoice",
                .product(name: "VoxService", package: voxPackage),
                .product(name: "VoxEngine", package: voxPackage),
                .product(name: "VoxAppleSpeech", package: voxPackage),
            ],
            path: tst + "HudsonVoiceTests"
        )
    )
}

if terminalEnabled {
    products.append(hudsonLibrary(name: "HudsonTerminal", targets: ["HudsonTerminal"]))
    products.append(hudsonLibrary(name: "HudsonCanvasSurface", targets: ["HudsonCanvasSurface"]))
    products.append(hudsonLibrary(name: "HudsonCanvas", targets: ["HudsonCanvas"]))
    let terminiPackage = appendGitDependency(
        to: &dependencies,
        url: "https://github.com/arach/Termini.git",
        envPrefix: "HUDSON_TERMINI"
    )
    targets.append(
        .target(
            name: "HudsonTerminal",
            dependencies: [
                "HudsonUI",
                "HudsonUIKeyboard",
                .product(name: "Termini", package: terminiPackage),
                .product(name: "TerminiSSH", package: terminiPackage),
            ],
            path: src + "HudsonTerminal"
        )
    )
    targets.append(
        .target(
            name: "HudsonCanvasSurface",
            dependencies: [
                "HudsonDiff",
                "HudsonLive",
                "HudsonObservability",
                "HudsonUI",
                "HudsonShell",
                "HudsonTerminal",
                "HudsonCanvasCore",
                .product(name: "Termini", package: terminiPackage),
            ],
            path: src + "HudsonCanvasSurface",
            resources: [
                .process("Resources")
            ]
        )
    )
    targets.append(
        .target(
            name: "HudsonCanvas",
            dependencies: [
                "HudsonUI",
                "HudsonCanvasCompanion",
                "HudsonCanvasCore",
                "HudsonCanvasSurface",
            ],
            path: src + "HudsonCanvas"
        )
    )
    targets.append(
        .testTarget(name: "HudsonCanvasTests", dependencies: ["HudsonCanvas", "HudsonCanvasSurface"], path: tst + "HudsonCanvasTests")
    )
    targets.append(
        .testTarget(name: "HudsonTerminalTests", dependencies: ["HudsonTerminal"], path: tst + "HudsonTerminalTests")
    )
    demoDependencies.append("HudsonTerminal")
    demoDependencies.append("HudsonCanvasSurface")
    demoDependencies.append("HudsonCanvas")
    demoSwiftSettings.append(.define("HUDSON_TERMINAL"))
    demoSwiftSettings.append(.define("HUDSON_CANVAS"))
}

// The demo has a voice tab, so it only exists with voice.
if voiceEnabled {
    targets.append(
        .executableTarget(
            name: "HudsonKitDemo",
            dependencies: demoDependencies,
            path: demo + "HudsonKitDemo",
            swiftSettings: demoSwiftSettings
        )
    )
}

targets.append(
    .executableTarget(
        name: "HudsonNotchDemo",
        dependencies: ["HudsonNotch", "HudsonNotchCore", "HudsonUI"],
        path: demo + "HudsonNotchDemo"
    )
)

targets.append(
    .executableTarget(
        name: "HudsonKitExperimentalDemo",
        dependencies: ["HudsonKitExperimental"],
        path: demo + "HudsonKitExperimentalDemo"
    )
)

targets.append(
    .executableTarget(
        name: "HudsonKitExperimentalVisualDemo",
        dependencies: ["HudsonKitExperimental"],
        path: demo + "HudsonKitExperimentalVisualDemo"
    )
)

let package = Package(
    name: "Hudson",
    platforms: [
        .iOS("26.0"),
        .macOS("26.0"),
    ],
    products: products,
    dependencies: dependencies,
    targets: targets
)
