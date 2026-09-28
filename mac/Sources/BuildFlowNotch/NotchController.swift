import AppKit
import BuildFlowNotchKit
import SwiftUI

/// How the current state was opened, which decides how it closes.
enum Opener {
    /// Hovering the notch: closes when the pointer leaves.
    case hover
    /// A click, the menu, or a ⌃⌥ tap: closes on a click outside or another toggle.
    case click
    /// Holding ⌃⌥ to talk: lasts while the keys are held.
    case hold
    /// The greeting or an alert: closes itself.
    case system
}

/// Owns the panel, places it on the notch, and moves between the six states.
@MainActor
final class NotchController {
    let model: NotchModel
    private(set) var panel: NotchPanel?
    private(set) var geometry: NotchGeometry?

    private var opener: Opener = .system
    private var openedAt = Date.distantPast
    private var pointerWasInside = false
    private var monitors: [Any] = []
    private var hoverWork: DispatchWorkItem?
    private var leaveWork: DispatchWorkItem?
    private var autoCloseWork: DispatchWorkItem?
    /// The dropdown's greeting springing into the full dropdown.
    private var greetingWork: DispatchWorkItem?
    private var pollTimer: Timer?

    var onOpenSettings: (() -> Void)?
    /// Appearance chosen in the dropdown's gear menu (the app delegate keeps it and tells the status menu).
    var onAppearance: ((Appearance) -> Void)?
    /// Set by the app delegate once the account and voice exist.
    var session: BuildFlowSession?
    var voice: VoiceController?
    var onConnect: (() -> Void)?

    /// Alerts waiting for the notch to be free, most urgent first.
    private var pendingAlerts: [AlertContent] = []
    private var ambientTimer: Timer?
    /// A menu (the crew picker) is open over the inbox: don't fold it away.
    private var menuOpen = false
    /// When a button inside an alert was last pressed: that click was the button's, not "open the inbox".
    private var alertButtonAt = Date.distantPast

    init(model: NotchModel) {
        self.model = model
    }

    var isResting: Bool { model.state == .resting }

    // MARK: Setup

    func install() {
        placePanel()
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                               object: nil, queue: .main) { [weak self] _ in self?.placePanel() }
        if let m = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged], handler: { [weak self] _ in
            self?.pointerMoved()
        }) { monitors.append(m) }
        if let m = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDragged], handler: { [weak self] e in
            self?.pointerMoved()
            return e
        }) { monitors.append(m) }
        if let m = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown], handler: { [weak self] _ in
            self?.clickedElsewhere()
        }) { monitors.append(m) }

        model.onTap = { [weak self] point in self?.tapped(at: point) }
        model.onAction = { [weak self] action in self?.perform(action) }

        // Once a second: start or end a countdown, and let a waiting alert through.
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.tickAmbient() }
        RunLoop.main.add(t, forMode: .common)
        ambientTimer = t
    }

    /// The screen with a notch, else the one with the menu bar.
    static func notchScreen() -> NSScreen? {
        NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 && $0.auxiliaryTopLeftArea != nil })
            ?? NSScreen.screens.first ?? NSScreen.main
    }

    func placePanel() {
        guard let screen = Self.notchScreen() else { Log.info("notch: no screen"); return }
        let facts = ScreenFacts(frame: screen.frame, visibleFrame: screen.visibleFrame,
                                safeAreaTop: screen.safeAreaInsets.top,
                                auxiliaryTopLeft: screen.auxiliaryTopLeftArea,
                                auxiliaryTopRight: screen.auxiliaryTopRightArea)
        let g = NotchGeometry.compute(facts)
        geometry = g
        model.notchSize = g.notchSize
        model.hasNotch = g.hasNotch

        let frame = g.panelFrame()
        if panel == nil {
            let p = NotchPanel(frame: frame)
            let host = NotchHostingView(rootView: NotchRootView(model: model))
            host.frame = NSRect(origin: .zero, size: frame.size)
            host.autoresizingMask = [.width, .height]
            p.contentView = host
            panel = p
        }
        if let panel, panel.frame != frame { panel.setFrame(frame, display: false) }
        panel?.orderFrontRegardless()

        let n = g.notchRect
        Log.info("notch: screen \"\(screen.localizedName)\" \(fmt(screen.frame.size)) pt @\(Int(screen.backingScaleFactor))x; "
            + (g.hasNotch ? "hardware notch" : "no notch, drawn stand-in")
            + " x \(fmt(n.minX))–\(fmt(n.maxX)) y \(fmt(n.minY))–\(fmt(n.maxY)) (\(fmt(n.width))×\(fmt(n.height)) pt); "
            + "safe-area top \(fmt(screen.safeAreaInsets.top)); menu bar \(fmt(g.menuBarHeight)) pt; "
            + "panel x \(fmt(frame.minX)) y \(fmt(frame.minY)) \(fmt(frame.width))×\(fmt(frame.height))")
    }

    private func fmt(_ v: CGFloat) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }

    private func fmt(_ s: CGSize) -> String { "\(fmt(s.width))×\(fmt(s.height))" }

    // MARK: Moving between states

    /// `via` says how the dropdown was brought up (⌃⌥, a click, hovering), which decides whether its
    /// greeting plays; the other states ignore it.
    func show(_ state: NotchState, opener: Opener, via: InboxOpening? = nil) {
        hoverWork?.cancel()
        leaveWork?.cancel()
        autoCloseWork?.cancel()
        greetingWork?.cancel()
        self.opener = opener
        openedAt = Date()
        pointerWasInside = false
        if model.state == .voice && state != .voice { voice?.dismiss() }
        if state == model.state && state != .greeting && state != .alert { refreshPointer(); return }
        if state == .inbox {
            let opening = via ?? (opener == .hover ? .hover : .click)
            model.beginInbox(opening, at: openedAt)
            Log.info("inbox: opened by \(opening.rawValue)" + (model.introPlays ? ", greeting plays" : ""))
        }
        model.shownAt = openedAt
        withAnimation(Motion.shape(opening: state != .resting, reduceMotion: model.reduceMotion)) {
            model.state = state
        }
        refreshPointer()

        switch state {
        case .alert:
            closeLater(after: 6, ifStill: .alert)       // then it waits in the inbox
        case .greeting:
            closeLater(after: GreetingTimeline.holdDuration, ifStill: .greeting)
        case .inbox:
            // Opening the inbox shows every alert there is: none needs to drop down later.
            pendingAlerts.removeAll()
            if model.tab == .notifications { session?.markShownSeen() }
            if model.inboxGreeting { springOpenLater() }
        default:
            break
        }
    }

    /// Put the notch away: to a countdown, a waiting alert, or rest.
    func rest() {
        let next = ambientState()
        if next == .alert, let alert = pendingAlerts.first {
            pendingAlerts.removeFirst()
            model.alert = alert
        }
        show(next, opener: .system)
    }

    /// What the notch shows when nobody has it open (plan: you talking, an alert,
    /// a meeting within 15 min, a job within 30 min, else rest). Only for a
    /// connected Mac: the example never counts down or alerts.
    func ambientState() -> NotchState {
        guard model.connection.isConnected else { return .resting }
        let live = model.presenter().liveActivity()
        return NotchPriority.ambient(talking: false, alertPending: !pendingAlerts.isEmpty, live: live)
    }

    private func tickAmbient() {
        guard model.state == .resting || model.state == .live else { return }
        guard hoverWork == nil else { return }
        let next = ambientState()
        if next != model.state { rest() }
    }

    /// A new alert from the live inbox: now if the notch is free, else when it is.
    func presentAlert(_ alert: AlertContent) {
        if model.state == .resting || model.state == .live {
            model.alert = alert
            show(.alert, opener: .system)
        } else if model.state == .inbox {
            // It's in the list in front of them already.
        } else if !pendingAlerts.contains(where: { $0.notificationId == alert.notificationId }) {
            pendingAlerts.append(alert)
            pendingAlerts = Array(pendingAlerts.prefix(3))
        }
    }

    private func closeLater(after seconds: Double, ifStill state: NotchState) {
        let startedAt = openedAt
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.model.state == state, self.openedAt == startedAt else { return }
            self.rest()
        }
        autoCloseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    /// Opened by ⌃⌥ or a click, the dropdown greets first; then the shape springs into the dropdown.
    private func springOpenLater() {
        let startedAt = openedAt
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.model.state == .inbox, self.openedAt == startedAt else { return }
            self.springOpen()
        }
        greetingWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + InboxIntro.greetingHold, execute: work)
    }

    private func springOpen() {
        greetingWork?.cancel()
        guard model.state == .inbox, model.inboxGreeting else { return }
        withAnimation(Motion.shape(opening: true, reduceMotion: model.reduceMotion)) {
            model.inboxGreeting = false
        }
        refreshPointer()
    }

    func toggleInbox(opener: Opener = .click, via: InboxOpening = .click) {
        if model.state == .inbox { rest() } else { show(.inbox, opener: opener, via: via) }
    }

    func presentGreeting(text: String, dayLine: [DayChip]) {
        model.greetingText = text
        model.greetingDayLine = dayLine
        model.greetingStartedAt = Date()
        show(.greeting, opener: .system)
    }

    /// "Preview state" in the menu.
    func preview(_ state: NotchState) {
        if state == .greeting {
            let part = PartOfDay.at(Date(), calendar: model.calendar)
            presentGreeting(text: GreetingWording.text(part: part, firstName: model.greetingFirstName), dayLine: model.greetingDayLine())
        } else {
            if state == .voice, model.voice == .idle { model.voice = .example }
            if state == .alert { model.alert = nil }
            show(state, opener: state == .resting ? .system : .click, via: .click)
        }
    }

    // MARK: Pointer

    private func hitRect() -> CGRect? {
        guard let g = geometry else { return nil }
        // Include the screen's very top row, which NSRect.contains leaves out.
        var r = g.shapeRect(model.spec)
        r.size.height += 1
        return r
    }

    /// Where the pointer may go without the dropdown closing: the dropdown's own rect, even while its
    /// smaller greeting shows (the pointer may already be on its way to where the list will be).
    private func leaveRect() -> CGRect? {
        guard let g = geometry else { return nil }
        var r = g.shapeRect(model.dropdownSpec)
        r.size.height += 1
        return r
    }

    private func refreshPointer() {
        guard let panel, let r = hitRect() else { return }
        panel.ignoresMouseEvents = !r.contains(NSEvent.mouseLocation)
        updatePolling()
    }

    /// While the panel takes clicks or something is open, also check the pointer
    /// 30 times a second: mouse-moved events over a non-key panel aren't
    /// guaranteed, and a missed exit would leave the panel eating clicks beside
    /// the shape. At rest the global monitor alone is enough.
    private func updatePolling() {
        let needed = !(panel?.ignoresMouseEvents ?? true) || model.state != .resting
        if needed, pollTimer == nil {
            let t = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in self?.pointerMoved() }
            RunLoop.main.add(t, forMode: .common)
            pollTimer = t
        } else if !needed, let t = pollTimer {
            t.invalidate()
            pollTimer = nil
        }
    }

    private func pointerMoved() {
        guard let panel, let g = geometry, let r = hitRect() else { return }
        let p = NSEvent.mouseLocation
        let inside = r.contains(p)
        // Pass clicks through everywhere except the black shape.
        if panel.ignoresMouseEvents == inside { panel.ignoresMouseEvents = !inside }
        updatePolling()

        switch model.state {
        case .resting, .live:
            var notch = g.notchRect
            notch.size.height += 1
            if notch.contains(p) || (model.state == .live && inside) {
                guard hoverWork == nil else { return }
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.hoverWork = nil
                    guard var n = self.geometry?.notchRect else { return }
                    n.size.height += 1
                    let still = n.contains(NSEvent.mouseLocation) || (self.hitRect()?.contains(NSEvent.mouseLocation) ?? false)
                    if still && (self.model.state == .resting || self.model.state == .live) {
                        self.show(.inbox, opener: .hover, via: .hover)
                    }
                }
                hoverWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: work)
            } else {
                hoverWork?.cancel()
                hoverWork = nil
            }
        case .inbox:
            let zone = (leaveRect() ?? r).insetBy(dx: -10, dy: -10)
            if menuOpen {
                leaveWork?.cancel()
                leaveWork = nil
            } else if zone.contains(p) {
                pointerWasInside = true
                leaveWork?.cancel()
                leaveWork = nil
            } else if opener == .hover || pointerWasInside {
                guard leaveWork == nil else { return }
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.leaveWork = nil
                    guard self.model.state == .inbox, let r = self.leaveRect(),
                          !r.insetBy(dx: -10, dy: -10).contains(NSEvent.mouseLocation) else { return }
                    self.rest()
                }
                leaveWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
            }
        default:
            break
        }
    }

    private func clickedElsewhere() {
        // A click that reached another app: close what a click or the menu opened.
        guard model.state == .inbox || model.state == .voice, opener != .hold, !menuOpen else { return }
        rest()
    }

    private func tapped(at point: CGPoint) {
        switch model.state {
        case .greeting:
            rest()                                  // click dismisses the greeting early
        case .resting, .live:
            show(.inbox, opener: .click, via: .click)
        case .alert:
            // A click on the alert opens the inbox, unless it was one of the alert's buttons, whose
            // action arrives in the same pass of the run loop: look once it has.
            DispatchQueue.main.async { [weak self] in
                guard let self, self.model.state == .alert, Date().timeIntervalSince(self.alertButtonAt) > 0.3 else { return }
                self.show(.inbox, opener: .click, via: .click)
            }
        case .inbox where model.inboxGreeting:
            springOpen()                            // a click on the greeting opens the dropdown now
        case .inbox, .voice:
            // Only the notch itself toggles closed; the rest of the panel is controls.
            let justHovered = opener == .hover && Date().timeIntervalSince(openedAt) < 0.6
            if model.notchZone.contains(point) && !justHovered { rest() }
        }
    }

    private func perform(_ action: NotchAction) {
        // Hovering the notch opens the inbox under a pointer that may be on its way to the menu bar;
        // a click that lands this soon was meant for the menu bar, not for "Call it off".
        if case .tabShown = action {} else if opener == .hover, Date().timeIntervalSince(openedAt) < 0.6 {
            Log.info("notch: ignored a click \(Int(Date().timeIntervalSince(openedAt) * 1000)) ms after the inbox opened under the pointer")
            return
        }
        switch action {
        case let .join(url):
            NSWorkspace.shared.open(url)
        case .openSettings:
            model.settingsMenuOpen = false
            onOpenSettings?()
        case .startVoice:
            show(.voice, opener: .click)
            voice?.begin(hold: false)
        case .markAllRead:
            withAnimation(.easeOut(duration: 0.2)) { session?.markAllRead() }
        case let .proposal(choice):
            voice?.proposal(choice)
        case let .open(target):
            session?.open(target)
        case let .task(taskId, actionId):
            runTask(taskId: taskId, actionId: actionId)
        case .connect:
            onConnect?()
        case let .voiceButton(b):
            voice?.button(b)
        case let .tabShown(tab):
            if model.settingsMenuOpen { withAnimation(.easeOut(duration: 0.15)) { model.settingsMenuOpen = false } }
            if tab == .notifications && model.state == .inbox { session?.markShownSeen() }
        case .toggleSettingsMenu:
            if !model.settingsMenuOpen {
                model.canCheckForUpdates = Updater.shared.canCheckForUpdates
                model.updateMenuTitle = Updater.shared.menuItem.title
            }
            withAnimation(model.reduceMotion ? Motion.reduced : .spring(response: 0.3, dampingFraction: 0.86)) {
                model.settingsMenuOpen.toggle()
            }
        case .checkForUpdates:
            model.settingsMenuOpen = false
            Updater.shared.checkForUpdates(nil)
        case let .setAppearance(appearance):
            onAppearance?(appearance)
        case let .empty(action):
            switch action {
            case .openBuildFlow:
                NSWorkspace.shared.open(session?.website ?? ServerOrigin.defaultOrigin)
            case .retry:
                session?.refresh()
            }
        case let .alert(action):
            alertButtonAt = Date()
            switch action {
            case let .open(target):
                session?.open(target)
                rest()
            case .later:
                rest()
            }
        }
    }

    /// A task's button. Booking a crew asks which crew first, in a menu at the pointer.
    private func runTask(taskId: String, actionId: String) {
        guard let session, let task = session.task(taskId), let action = task.actions.first(where: { $0.id == actionId }) else { return }
        guard action.request.needs.contains("crewId") else {
            session.run(taskId: taskId, actionId: actionId)
            return
        }
        let crews = model.inbox.crewChoices
        guard !crews.isEmpty, let view = panel?.contentView else {
            session.showBanner("There's no crew to choose here. Book it in BuildFlow.")
            NSWorkspace.shared.open(session.url(for: .task(taskId)) ?? session.website)
            return
        }
        let menu = NSMenu(title: "Choose a crew")
        let header = NSMenuItem(title: "Book \(task.title.replacingOccurrences(of: "No crew on ", with: "")) with…", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        var chosen: InboxCrew?
        let handler = MenuHandler { chosen = $0 as? InboxCrew }
        for crew in crews {
            let item = NSMenuItem(title: crew.name, action: #selector(MenuHandler.pick(_:)), keyEquivalent: "")
            item.representedObject = crew
            item.target = handler
            menu.addItem(item)
        }
        let inWindow = panel!.convertPoint(fromScreen: NSEvent.mouseLocation)
        menuOpen = true
        menu.popUp(positioning: nil, at: view.convert(inWindow, from: nil), in: view)
        menuOpen = false
        withExtendedLifetime(handler) {}
        if let crew = chosen {
            session.run(taskId: taskId, actionId: actionId, filling: ["crewId": .string(crew.id)])
        }
    }

    // MARK: Left ⌃ + left ⌥

    /// The chord (see ChordMonitor): a tap toggles the inbox, a hold talks.
    func chord(_ event: ChordEvent) {
        switch event {
        case .toggleInbox:
            // Opens from resting, a countdown, an alert or the greeting (and plays the dropdown's
            // greeting); closes an open inbox.
            toggleInbox(opener: .click, via: .chord)
        case .stopSpeaking:
            voice?.stopSpeaking()
        case .talkBegan:
            show(.voice, opener: .hold)
            voice?.begin(hold: true)
        case .talkEnded:
            guard model.state == .voice, opener == .hold else { return }
            // Let go: send, and keep the answer up until a click elsewhere.
            opener = .click
            voice?.end()
        case .talkCancelled:
            // Another key or a click joined: part of some other shortcut. Nothing is sent.
            voice?.cancelTalk()
            if model.state == .voice { rest() }
        }
    }
}

/// Target for the crew picker's items.
final class MenuHandler: NSObject {
    let onPick: (Any?) -> Void
    init(_ onPick: @escaping (Any?) -> Void) { self.onPick = onPick }
    @objc func pick(_ sender: NSMenuItem) { onPick(sender.representedObject) }
}
