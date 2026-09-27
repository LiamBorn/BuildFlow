import AppKit
import BuildFlowNotchKit
import ServiceManagement

/// The menu-bar item: the connection (Connect this Mac… / Connected as … /
/// Disconnect), Show Inbox (⌃⌥), Replay Greeting, Preview State, Appearance, the
/// greeting and alert settings (quiet hours), Launch at Login and Quit.
@MainActor
final class StatusMenu: NSObject, NSMenuDelegate {
    private let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private let menu = NSMenu()
    private let controller: NotchController
    private let greeter: GreetingCoordinator
    private let session: BuildFlowSession
    private let connector: ConnectCoordinator

    private let accountItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let reasonItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let connectItem = NSMenuItem(title: "Connect this Mac…", action: #selector(connect), keyEquivalent: "")
    private let disconnectItem = NSMenuItem(title: "Disconnect", action: #selector(disconnect), keyEquivalent: "")
    private let inboxItem = NSMenuItem(title: "Show Inbox", action: #selector(toggleInbox), keyEquivalent: "")
    private let greetItem = NSMenuItem(title: "Show the Greeting", action: #selector(toggleGreeting), keyEquivalent: "")
    private let speakItem = NSMenuItem(title: "Speak the Greeting Aloud", action: #selector(toggleSpeak), keyEquivalent: "")
    private let alertsItem = NSMenuItem(title: "Show Alerts", action: #selector(toggleAlerts), keyEquivalent: "")
    private let quietItem = NSMenuItem(title: "Quiet Hours", action: nil, keyEquivalent: "")
    private let appearanceItem = NSMenuItem(title: "Appearance", action: nil, keyEquivalent: "")
    private let loginItem = NSMenuItem(title: "Launch at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")
    private let askItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let shortcutHelpItem = NSMenuItem(title: "Let BuildFlow See ⌃⌥…", action: #selector(explainShortcutPermission), keyEquivalent: "")
    /// Set by the app delegate: whether the ⌃⌥ shortcut can see the keys.
    var chord: ChordMonitor?
    /// Set by the app delegate: keeps an Appearance choice (the dropdown's gear menu offers the same).
    var onAppearance: ((Appearance) -> Void)?

    /// Quiet-hours choices: off, or a span in minutes after midnight.
    private static let quietChoices: [QuietHours] = [
        .off,
        QuietHours(enabled: true, start: 22 * 60, end: 7 * 60),
        QuietHours(enabled: true, start: 21 * 60, end: 6 * 60),
        QuietHours(enabled: true, start: 20 * 60, end: 6 * 60),
        QuietHours(enabled: true, start: 18 * 60, end: 7 * 60),
    ]

    init(controller: NotchController, greeter: GreetingCoordinator, session: BuildFlowSession, connector: ConnectCoordinator) {
        self.controller = controller
        self.greeter = greeter
        self.session = session
        self.connector = connector
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

        let quiet = NSMenu()
        for (i, choice) in Self.quietChoices.enumerated() {
            let q = NSMenuItem(title: choice.label, action: #selector(pickQuietHours(_:)), keyEquivalent: "")
            q.tag = i
            q.target = self
            quiet.addItem(q)
        }
        quietItem.submenu = quiet

        let appearances = NSMenu()
        for a in Appearance.allCases {
            let i = NSMenuItem(title: a.label, action: #selector(pickAppearance(_:)), keyEquivalent: "")
            i.representedObject = a.rawValue
            i.target = self
            appearances.addItem(i)
        }
        appearanceItem.submenu = appearances

        let replay = NSMenuItem(title: "Replay Greeting", action: #selector(replayGreeting), keyEquivalent: "")
        let open = NSMenuItem(title: "Open BuildFlow", action: #selector(openWebsite), keyEquivalent: "")
        let quit = NSMenuItem(title: "Quit BuildFlow", action: #selector(quit), keyEquivalent: "q")

        accountItem.isEnabled = false
        reasonItem.isEnabled = false
        // NSMenuItem can't show a modifier-only shortcut, so ⌃⌥ is drawn at the right like one.
        inboxItem.attributedTitle = Self.withShortcut("Show Inbox", "⌃⌥")
        askItem.attributedTitle = Self.withShortcut("Ask BuildFlow: hold", "⌃⌥")
        askItem.isEnabled = false
        shortcutHelpItem.isHidden = true
        for i in [connectItem, disconnectItem, inboxItem, replay, greetItem, speakItem, alertsItem, loginItem, open, quit, shortcutHelpItem] {
            i.target = self
        }

        menu.addItem(accountItem)
        menu.addItem(reasonItem)
        menu.addItem(connectItem)
        menu.addItem(disconnectItem)
        menu.addItem(.separator())
        menu.addItem(inboxItem)
        menu.addItem(askItem)
        menu.addItem(shortcutHelpItem)
        menu.addItem(replay)
        menu.addItem(previewItem)
        menu.addItem(appearanceItem)
        menu.addItem(.separator())
        menu.addItem(greetItem)
        menu.addItem(speakItem)
        menu.addItem(alertsItem)
        menu.addItem(quietItem)
        menu.addItem(loginItem)
        menu.addItem(Updater.shared.menuItem)
        menu.addItem(.separator())
        menu.addItem(open)
        menu.addItem(quit)
        menu.delegate = self
        item.menu = menu
        refresh()
    }

    /// A title with a shortcut drawn at the right edge, in the menu's secondary colour.
    static func withShortcut(_ title: String, _ shortcut: String) -> NSAttributedString {
        let style = NSMutableParagraphStyle()
        style.tabStops = [NSTextTab(textAlignment: .right, location: 230)]
        let font = NSFont.menuFont(ofSize: 0)
        let s = NSMutableAttributedString(string: title + "\t", attributes: [.font: font, .paragraphStyle: style])
        s.append(NSAttributedString(string: shortcut, attributes: [.font: font, .paragraphStyle: style,
                                                                   .foregroundColor: NSColor.secondaryLabelColor]))
        return s
    }

    /// The inbox's gear button opens this same menu.
    func popUp() {
        item.button?.performClick(nil)
    }

    /// The connection lines, from the model.
    func refresh() {
        let model = controller.model
        switch model.connection {
        case let .connected(name, workspace):
            accountItem.title = name.isEmpty ? "Connected · checking…" : "Connected as \(name) · \(workspace)"
            reasonItem.isHidden = true
            connectItem.isHidden = true
            disconnectItem.isHidden = false
        case .connecting:
            accountItem.title = "Connecting…"
            reasonItem.isHidden = true
            connectItem.isHidden = false
            disconnectItem.isHidden = true
        case let .notConnected(reason):
            accountItem.title = "Not connected · the inbox shows an example"
            reasonItem.title = reason ?? ""
            reasonItem.isHidden = (reason ?? "").isEmpty
            connectItem.isHidden = false
            disconnectItem.isHidden = true
        }
        shortcutHelpItem.isHidden = !(chord?.needsPermission ?? false)
        if session.origin != ServerOrigin.defaultOrigin {
            accountItem.title += "  (\(session.origin.host ?? "")\(session.origin.port.map { ":\($0)" } ?? ""))"
        }
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        refresh()
        inboxItem.attributedTitle = Self.withShortcut(controller.model.state == .inbox ? "Hide Inbox" : "Show Inbox", "⌃⌥")
        greetItem.state = greeter.store.enabled ? .on : .off
        speakItem.state = greeter.store.speakAloud ? .on : .off
        speakItem.isEnabled = greeter.store.enabled
        alertsItem.state = session.settings.alertsEnabled ? .on : .off
        let quiet = session.settings.quietHours
        quietItem.title = "Quiet Hours: \(quiet.label)"
        for q in quietItem.submenu?.items ?? [] {
            q.state = Self.quietChoices[q.tag] == quiet || (!quiet.enabled && q.tag == 0) ? .on : .off
        }
        let appearance = controller.model.appearance
        appearanceItem.title = "Appearance: \(appearance.label)"
        for i in appearanceItem.submenu?.items ?? [] {
            i.state = (i.representedObject as? String) == appearance.rawValue ? .on : .off
        }
        switch SMAppService.mainApp.status {
        case .enabled: loginItem.state = .on
        case .requiresApproval: loginItem.state = .mixed
        default: loginItem.state = .off
        }
    }

    @objc private func connect() { connector.connect() }

    /// Only shown when BuildFlow can't see the modifier keys at all.
    @objc private func explainShortcutPermission() {
        let alert = NSAlert()
        alert.messageText = "Let BuildFlow see ⌃⌥"
        alert.informativeText = "Tapping left Control and left Option together opens the inbox, and holding them asks BuildFlow. "
            + "This Mac isn't letting BuildFlow see those keys. Turn BuildFlow on in System Settings › Privacy & Security › "
            + "Input Monitoring. BuildFlow only looks at the modifier keys, never what you type."
        alert.addButton(withTitle: "Open Input Monitoring")
        alert.addButton(withTitle: "Not Now")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn { NSWorkspace.shared.open(ChordMonitor.inputMonitoringPane) }
    }

    @objc private func disconnect() {
        let alert = NSAlert()
        alert.messageText = "Disconnect this Mac from BuildFlow?"
        alert.informativeText = "The notch goes back to example data. You can connect again at any time."
        alert.addButton(withTitle: "Disconnect")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn { session.disconnect() }
    }

    @objc private func toggleInbox() { controller.toggleInbox(opener: .click) }

    @objc private func replayGreeting() { greeter.replay() }

    @objc private func previewState(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let state = NotchState(rawValue: raw) else { return }
        controller.preview(state)
    }

    @objc private func toggleGreeting() { greeter.store.enabled.toggle() }

    @objc private func toggleSpeak() { greeter.store.speakAloud.toggle() }

    @objc private func toggleAlerts() { session.settings.alertsEnabled.toggle() }

    @objc private func pickAppearance(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let appearance = Appearance(rawValue: raw) else { return }
        onAppearance?(appearance)
    }

    @objc private func pickQuietHours(_ sender: NSMenuItem) {
        session.settings.quietHours = Self.quietChoices[sender.tag]
    }

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

    @objc private func openWebsite() { NSWorkspace.shared.open(session.website) }

    @objc private func quit() { NSApp.terminate(nil) }
}
