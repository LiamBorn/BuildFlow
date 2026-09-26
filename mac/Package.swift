// swift-tools-version:5.8
// BuildFlow for Mac: the notch app. Builds with the Command Line Tools alone
// (no Xcode): `swift build`, `swift run BuildFlowNotchChecks`, `scripts/build-app.sh`.
import PackageDescription

let package = Package(
    name: "BuildFlowMac",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "BuildFlowNotch", targets: ["BuildFlowNotch"]),
        .executable(name: "BuildFlowNotchChecks", targets: ["BuildFlowNotchChecks"]),
    ],
    targets: [
        // Pure logic: inbox model and wording, greeting rules, notch geometry. No AppKit.
        .target(name: "BuildFlowNotchKit", path: "Sources/BuildFlowNotchKit"),
        // The menu-bar app: panel, SwiftUI states, hot key, status menu, triggers.
        .executableTarget(name: "BuildFlowNotch", dependencies: ["BuildFlowNotchKit"], path: "Sources/BuildFlowNotch"),
        // XCTest isn't available with the Command Line Tools, so the logic is
        // checked by a small executable that exits non-zero on any failure.
        .executableTarget(name: "BuildFlowNotchChecks", dependencies: ["BuildFlowNotchKit"], path: "Sources/BuildFlowNotchChecks"),
    ]
)
