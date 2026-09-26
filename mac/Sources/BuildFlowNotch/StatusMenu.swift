import AppKit
import BuildFlowNotchKit
import ServiceManagement

/// The menu-bar item: Show Inbox, Replay Greeting, Preview State, the greeting
/// settings, Launch at Login and Quit.
final class StatusMenu: NSObject, NSMenuDelegate {
    static let website = URL(string: "https://build-flow.replit.app/")!

    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let menu = NSMenu()
    private let controller: NotchController
    private let greeter: GreetingCoordinator

    private let inboxItem = NSMenuItem(title: "Show Inbox", action: #selector(toggleInbox), keyEquivalent: "")
    private let greetItem = NSMenuItem(title: "Show the Greeting", action: #selector(toggleGreeting), keyEquivalent: "")
    private let speakItem = NSMenuItem(title: "Speak the Greeting Aloud", action: #selector(toggleSpeak), keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")

    init(controller: NotchController, greeter: GreetingCoordinator) {
        self.controller = controller
        self.greeter = greeter
        super.init()

        item.button?.image = MenuBarIcon.image()
        item.button?.toolTip = "BuildFlow"

        let preview = NSMenu()
        for state in NotchState.allCases {
            let i = NSMenuItem(title: state.title, action: #selector(previewState(_:)), keyEquivalent: "")
            i.representedObject = state.rawValue
            i.target = self
            preview.addItem(i)
        }
        let previewItem = NSMenuItem(title: "Preview State", action: nil, keyEquivalent: "")
        previewItem.submenu = preview

        let replay = NSMenuItem(title: "Replay Greeting", action: #selector(replayGreeting), keyEquivalent: "")
        let open = NSMenuItem(title: "Open BuildFlow", action: #selector(openWebsite), keyEquivalent: "")
        let quit = NSMenuItem(title: "Quit BuildFlow", action: #selector(quit), keyEquivalent: "q")

        for i in [inboxItem, replay, greetItem, speakItem, loginItem, open, quit] { i.target = self }

        menu.addItem(inboxItem)
        menu.addItem(replay)
        menu.addItem(previewItem)
        menu.addItem(.separator())
        menu.addItem(greetItem)
        menu.addItem(speakItem)
        menu.addItem(loginItem)
        menu.addItem(.separator())
        menu.addItem(open)
        menu.addItem(quit)
        menu.delegate = self
        item.menu = menu
    }

    /// The inbox's gear button opens this same menu.
    func popUp() {
        item.button?.performClick(nil)
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        inboxItem.title = controller.model.state == .inbox ? "Hide Inbox" : "Show Inbox"
        greetItem.state = greeter.store.enabled ? .on : .off
        speakItem.state = greeter.store.speakAloud ? .on : .off
        speakItem.isEnabled = greeter.store.enabled
        switch SMAppService.mainApp.status {
        case .enabled: loginItem.state = .on
        case .requiresApproval: loginItem.state = .mixed
        default: loginItem.state = .off
        }
    }

    @objc private func toggleInbox() { controller.toggleInbox(opener: .click) }

    @objc private func replayGreeting() { greeter.replay() }

    @objc private func previewState(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let state = NotchState(rawValue: raw) else { return }
        controller.preview(state)
    }

    @objc private func toggleGreeting() { greeter.store.enabled.toggle() }

    @objc private func toggleSpeak() { greeter.store.speakAloud.toggle() }

    /// Registers or unregisters the app as a login item. Only ever runs when the
    /// person picks the menu item.
    @objc private func toggleLaunchAtLogin() {
        let service = SMAppService.mainApp
        do {
            switch service.status {
            case .enabled:
                try service.unregister()
            case .requiresApproval:
                SMAppService.openSystemSettingsLoginItems()
            default:
                try service.register()
            }
            Log.info("login item: now \(service.status.rawValue)")
        } catch {
            Log.info("login item: \(error.localizedDescription)")
            let alert = NSAlert()
            alert.messageText = "BuildFlow couldn't change Launch at Login"
            alert.informativeText = error.localizedDescription
            alert.runModal()
        }
    }

    @objc private func openWebsite() { NSWorkspace.shared.open(Self.website) }

    @objc private func quit() { NSApp.terminate(nil) }
}
