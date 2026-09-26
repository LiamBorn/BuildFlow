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

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let model = NotchModel()
    private var controller: NotchController!
    private var greeter: GreetingCoordinator!
    private var statusMenu: StatusMenu!
    private var chord: ChordMonitor!
    private var session: BuildFlowSession!
    private var connector: ConnectCoordinator!
    private var voice: VoiceController!
    var quitAfter: Double?
    var cycleStates = false

    @MainActor
    func applicationDidFinishLaunching(_ notification: Notification) {
        ScriptFont.registerBundledFonts()
        Updater.shared.start()

        controller = NotchController(model: model)
        controller.install()

        session = BuildFlowSession(model: model)
        connector = ConnectCoordinator(session: session)
        voice = VoiceController(model: model, session: session)
        DeepLinks.connector = connector

        controller.session = session
        controller.voice = voice
        controller.onConnect = { [weak self] in self?.connector.connect() }
        voice.onConnect = { [weak self] in self?.connector.connect() }
        voice.onDone = { [weak self] in
            guard let self, self.model.state == .voice else { return }
            self.controller.rest()
        }
        session.onAlert = { [weak self] alert in self?.controller.presentAlert(alert) }

        greeter = GreetingCoordinator(controller: controller, model: model)
        statusMenu = StatusMenu(controller: controller, greeter: greeter, session: session, connector: connector)
        session.onConnectionChange = { [weak self] in
            guard let self else { return }
            self.statusMenu.refresh()
            // Not connected any more: nothing may count down or alert from the example.
            if !self.model.connection.isConnected, self.model.state == .live || self.model.state == .alert { self.controller.rest() }
        }
        controller.onOpenSettings = { [weak self] in self?.statusMenu.popUp() }

        // Left ⌃ + left ⌥: tap for the inbox, hold to talk.
        chord = ChordMonitor()
        chord.isSpeaking = { [weak self] in self?.voice.isSpeaking ?? false }
        chord.onEvent = { [weak self] e in self?.controller.chord(e) }
        chord.onStatusChange = { [weak self] in self?.statusMenu.refresh() }
        statusMenu.chord = chord
        chord.start()

        session.start()
        // Greet once the day line can be real: the first inbox, or "not connected" (6 s at most).
        var greeted = false
        let greet = { [weak self] in
            guard let self, !greeted else { return }
            greeted = true
            self.greeter.start()
        }
        session.whenReady(greet)
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { greet() }

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
