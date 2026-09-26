import AppKit
#if canImport(Sparkle)
import Sparkle
#endif

/// Updates, through Sparkle 2 (mac/Vendor/Sparkle).
///
/// The feed is `SUFeedURL` in Info.plist: https://build-flow.replit.app/downloads/mac/appcast.xml,
/// served by the BuildFlow server from server/downloads/mac/ (mac/scripts/release.sh writes it).
/// Every update is a DMG signed with the EdDSA key whose public half is `SUPublicEDKey`, and Sparkle
/// checks that signature before it opens the DMG (`SUVerifyUpdateBeforeExtraction`), so a feed or a
/// server that lies can offer an update but never install one. Checks run once a day
/// (`SUScheduledCheckInterval`) without asking first (`SUEnableAutomaticChecks`).
///
/// For testing against a local feed:
///
///     defaults write com.buildflow.mac debugFeedURL http://127.0.0.1:8765/appcast.xml
///     BuildFlow.app/Contents/MacOS/BuildFlow --check-updates     # a background check at launch
///     defaults delete com.buildflow.mac debugFeedURL
///
/// The override is read through the updater delegate, takes https anywhere or http only on this
/// Mac, and cannot weaken the signature check: an update still has to be signed with our key.
///
/// Only an app bundle starts Sparkle; a bare binary (`swift run`, compile.sh output) has no
/// Info.plist to read the feed from. Without Sparkle (a SwiftPM build that doesn't link the vendored
/// framework) the menu item stays and is disabled.
final class Updater: NSObject, NSMenuItemValidation {
    static let shared = Updater()

    /// The UserDefaults key for a local test feed.
    static let debugFeedKey = "debugFeedURL"
    static let checkTitle = "Check for Updates…"

    /// "Check for Updates…" in the status menu. Its title changes to "Update Available…" while a
    /// scheduled check has found an update the person hasn't looked at yet.
    let menuItem = NSMenuItem(title: Updater.checkTitle, action: #selector(checkForUpdates(_:)), keyEquivalent: "")

    #if canImport(Sparkle)
    private var controller: SPUStandardUpdaterController?
    #endif

    private override init() {
        super.init()
        menuItem.target = self
    }

    /// Starts the updater. Called once, at launch. `--check-updates` also runs a background check
    /// straight away (used to test a release against a local feed).
    func start(arguments: [String] = CommandLine.arguments) {
        #if canImport(Sparkle)
        guard controller == nil else { return }
        guard Bundle.main.bundleURL.pathExtension == "app",
              Bundle.main.object(forInfoDictionaryKey: "SUFeedURL") != nil else {
            Log.info("updates: off (not running from an app bundle with SUFeedURL)")
            return
        }
        let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: self)
        self.controller = controller
        let updater = controller.updater
        Log.info("updates: Sparkle started; automatic checks \(updater.automaticallyChecksForUpdates ? "on" : "off"), "
            + "every \(Int(updater.updateCheckInterval / 3600)) h, feed \(updater.feedURL?.absoluteString ?? "none")")
        if arguments.contains("--check-updates") {
            Log.info("updates: checking in the background (--check-updates)")
            updater.checkForUpdatesInBackground()
        }
        #else
        Log.info("updates: off (built without Sparkle)")
        #endif
    }

    @objc func checkForUpdates(_ sender: Any?) {
        #if canImport(Sparkle)
        controller?.checkForUpdates(sender)
        #endif
    }

    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        #if canImport(Sparkle)
        return controller?.updater.canCheckForUpdates ?? false
        #else
        return false
        #endif
    }

    /// The test feed from `debugFeedURL`, or nil to use SUFeedURL. https anywhere; plain http only to
    /// this Mac, so a stray default can't send the check over the network in the clear.
    static func debugFeed(_ defaults: UserDefaults = .standard) -> String? {
        guard let raw = defaults.string(forKey: debugFeedKey)?.trimmingCharacters(in: .whitespaces),
              !raw.isEmpty, let url = URL(string: raw), let scheme = url.scheme?.lowercased() else { return nil }
        let host = url.host?.lowercased() ?? ""
        if scheme == "https" && !host.isEmpty { return raw }
        if scheme == "http" && ["127.0.0.1", "localhost", "::1"].contains(host) { return raw }
        Log.info("updates: ignoring debugFeedURL \(raw) (https, or http to this Mac only)")
        return nil
    }
}

#if canImport(Sparkle)
extension Updater: SPUUpdaterDelegate {
    func feedURLString(for updater: SPUUpdater) -> String? {
        guard let feed = Self.debugFeed() else { return nil }
        Log.info("updates: using the debug feed \(feed)")
        return feed
    }

    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        Log.info("updates: found \(item.displayVersionString) (build \(item.versionString)), "
            + "\(item.contentLength) bytes, minimum macOS \(item.minimumSystemVersion ?? "any")")
    }

    func updaterDidNotFindUpdate(_ updater: SPUUpdater, error: Error) {
        Log.info("updates: no update (\(error.localizedDescription))")
    }

    func updater(_ updater: SPUUpdater, didDownloadUpdate item: SUAppcastItem) {
        Log.info("updates: downloaded \(item.displayVersionString)")
    }

    func updater(_ updater: SPUUpdater, failedToDownloadUpdate item: SUAppcastItem, error: Error) {
        Log.info("updates: download of \(item.displayVersionString) failed: \(error.localizedDescription)")
    }

    /// Not yet proof of anything: a tampered image is reported here too, and fails its signature
    /// check just after ("The update is improperly signed…" through didAbortWithError).
    func updater(_ updater: SPUUpdater, didExtractUpdate item: SUAppcastItem) {
        Log.info("updates: \(item.displayVersionString) unpacked; checking its signature")
    }

    /// Only reached once the update has passed Sparkle's checks (its EdDSA signature against
    /// SUPublicEDKey, and the new app's code signature).
    func updater(_ updater: SPUUpdater, willInstallUpdateOnQuit item: SUAppcastItem,
                 immediateInstallationBlock immediateInstallHandler: @escaping () -> Void) -> Bool {
        Log.info("updates: \(item.displayVersionString) is validated and installs when BuildFlow quits")
        return false
    }

    func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
        Log.info("updates: stopped: \(error.localizedDescription)")
    }

    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: Error?) {
        Log.info("updates: check finished\(error.map { " (\($0.localizedDescription))" } ?? "")")
    }
}

extension Updater: SPUStandardUserDriverDelegate {
    /// BuildFlow lives in the menu bar and has no windows of its own to be in front of, so Sparkle's
    /// alert for a scheduled check would open behind whatever the person is doing. It still opens
    /// (Sparkle handles showing it), and the menu item says an update is waiting until they've seen it.
    var supportsGentleScheduledUpdateReminders: Bool { true }

    func standardUserDriverShouldHandleShowingScheduledUpdate(_ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool) -> Bool {
        true
    }

    func standardUserDriverWillHandleShowingUpdate(_ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem,
                                                   state: SPUUserUpdateState) {
        if !state.userInitiated { menuItem.title = "Update Available…" }
    }

    func standardUserDriverDidReceiveUserAttention(forUpdate update: SUAppcastItem) {
        menuItem.title = Self.checkTitle
    }

    func standardUserDriverWillFinishUpdateSession() {
        menuItem.title = Self.checkTitle
    }
}
#endif
