import AppKit
import BuildFlowNotchKit

/// BuildFlow for Mac. Runs as a menu-bar agent (LSUIElement); no Dock icon.
///
///     BuildFlow                        run the app
///     BuildFlow --snapshot <dir>       render every state to PNG and exit
///     BuildFlow --snapshot <dir> --notch-outline   …with the hardware notch outlined
///     BuildFlow --quit-after 13 --cycle-states     smoke test: greet, step through
///                                                   every state, then quit
@main
enum BuildFlowNotchMain {
    @MainActor
    static func main() {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--snapshot") {
            guard i + 1 < args.count else {
                FileHandle.standardError.write(Data("usage: BuildFlow --snapshot <dir> [--notch-outline]\n".utf8))
                exit(2)
            }
            _ = NSApplication.shared
            exit(Snapshotter.run(outputDirectory: args[i + 1], outlineNotch: args.contains("--notch-outline")))
        }

        let app = NSApplication.shared
        let delegate = AppDelegate()
        if let i = args.firstIndex(of: "--quit-after"), i + 1 < args.count, let seconds = Double(args[i + 1]) {
            delegate.quitAfter = seconds
        }
        delegate.cycleStates = args.contains("--cycle-states")
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        withExtendedLifetime(delegate) { app.run() }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let model = NotchModel()
    private var controller: NotchController!
    private var greeter: GreetingCoordinator!
    private var statusMenu: StatusMenu!
    private var hotKey: HotKey?
    /// Step 5 replaces this with a source for `GET /api/desktop/inbox`.
    private var source: InboxSource?
    var quitAfter: Double?
    var cycleStates = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        ScriptFont.registerBundledFonts()

        controller = NotchController(model: model)
        controller.install()

        greeter = GreetingCoordinator(controller: controller, model: model)
        statusMenu = StatusMenu(controller: controller, greeter: greeter)
        controller.onOpenSettings = { [weak self] in self?.statusMenu.popUp() }

        hotKey = HotKey()
        hotKey?.onPress = { [weak self] in self?.controller.hotKeyPressed() }
        hotKey?.onRelease = { [weak self] in self?.controller.hotKeyReleased() }
        Log.info(hotKey == nil ? "hot key: ⌥Space not available" : "hot key: ⌥Space registered (tap = inbox, hold = voice)")

        if let url = ExampleInboxSource.defaultURL() {
            source = ExampleInboxSource(url: url, rebaseTo: Date(), calendar: model.calendar)
        } else {
            Log.info("inbox: example-inbox.json is missing from the bundle")
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                if let source = self.source {
                    self.model.inbox = try await source.fetchInbox()
                    let p = self.model.presenter()
                    Log.info("inbox: \(p.inbox.notifications.count) notifications, \(p.jobsToday.count) jobs today, "
                        + "\(p.inbox.meetings.count) meetings, \(p.inbox.tasks.count) tasks (example data)")
                }
            } catch {
                Log.info("inbox: couldn't read the example data: \(error)")
            }
            self.greeter.start()
        }

        if cycleStates {
            // After the launch greeting has folded away.
            let steps: [(Double, NotchState)] = [(5.6, .live), (7.0, .alert), (8.4, .inbox), (9.8, .voice), (11.2, .resting)]
            for (at, state) in steps {
                DispatchQueue.main.asyncAfter(deadline: .now() + at) { [weak self] in
                    Log.info("smoke: preview \(state.rawValue)")
                    self?.controller.preview(state)
                }
            }
        }
        if let quitAfter {
            DispatchQueue.main.asyncAfter(deadline: .now() + quitAfter) {
                Log.info("smoke: quitting after \(quitAfter) s")
                NSApp.terminate(nil)
            }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        DeepLinks.handle(urls)
    }
}
