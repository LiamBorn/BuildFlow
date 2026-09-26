import AppKit
import BuildFlowNotchKit
import SwiftUI

/// How the current state was opened, which decides how it closes.
enum Opener {
    /// Hovering the notch: closes when the pointer leaves.
    case hover
    /// A click, the menu, or a ⌥Space tap: closes on a click outside or another toggle.
    case click
    /// Holding ⌥Space: lasts while the key is held.
    case hold
    /// The greeting or an alert: closes itself.
    case system
}

/// Owns the panel, places it on the notch, and moves between the six states.
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
    private var recognizer = HoldTapRecognizer(holdThreshold: 0.3)
    private var holdTimer: Timer?
    private var pollTimer: Timer?

    var onOpenSettings: (() -> Void)?

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

    func show(_ state: NotchState, opener: Opener) {
        hoverWork?.cancel()
        leaveWork?.cancel()
        autoCloseWork?.cancel()
        self.opener = opener
        openedAt = Date()
        pointerWasInside = false
        if state == model.state && state != .greeting { refreshPointer(); return }
        withAnimation(state == .resting ? Motion.close : Motion.open) {
            model.state = state
        }
        refreshPointer()

        switch state {
        case .alert:
            closeLater(after: 6, ifStill: .alert)       // then it waits in the inbox
        case .greeting:
            closeLater(after: GreetingTimeline.holdDuration, ifStill: .greeting)
        default:
            break
        }
    }

    func rest() { show(.resting, opener: .system) }

    private func closeLater(after seconds: Double, ifStill state: NotchState) {
        let startedAt = openedAt
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.model.state == state, self.openedAt == startedAt else { return }
            self.rest()
        }
        autoCloseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    func toggleInbox(opener: Opener = .click) {
        if model.state == .inbox { rest() } else { show(.inbox, opener: opener) }
    }

    func presentGreeting(text: String, dayLine: [String]) {
        model.greetingText = text
        model.greetingDayLine = dayLine
        model.greetingStartedAt = Date()
        show(.greeting, opener: .system)
    }

    /// "Preview state" in the menu.
    func preview(_ state: NotchState) {
        if state == .greeting {
            let p = model.presenter()
            let part = PartOfDay.at(Date(), calendar: model.calendar)
            presentGreeting(text: GreetingWording.text(part: part, firstName: model.inbox.me.firstName), dayLine: p.dayLine())
        } else {
            show(state, opener: state == .resting ? .system : .click)
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
                        self.show(.inbox, opener: .hover)
                    }
                }
                hoverWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: work)
            } else {
                hoverWork?.cancel()
                hoverWork = nil
            }
        case .inbox:
            let zone = r.insetBy(dx: -10, dy: -10)
            if zone.contains(p) {
                pointerWasInside = true
                leaveWork?.cancel()
                leaveWork = nil
            } else if opener == .hover || pointerWasInside {
                guard leaveWork == nil else { return }
                let work = DispatchWorkItem { [weak self] in
                    guard let self else { return }
                    self.leaveWork = nil
                    guard self.model.state == .inbox, let r = self.hitRect(),
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
        guard model.state == .inbox || model.state == .voice, opener != .hold else { return }
        rest()
    }

    private func tapped(at point: CGPoint) {
        switch model.state {
        case .greeting:
            rest()                                  // click dismisses the greeting early
        case .resting, .live, .alert:
            show(.inbox, opener: .click)
        case .inbox, .voice:
            // Only the notch itself toggles closed; the rest of the panel is controls.
            let justHovered = opener == .hover && Date().timeIntervalSince(openedAt) < 0.6
            if model.notchZone.contains(point) && !justHovered { rest() }
        }
    }

    private func perform(_ action: NotchAction) {
        switch action {
        case let .join(url):
            NSWorkspace.shared.open(url)
        case .openSettings:
            onOpenSettings?()
        case .startVoice:
            show(.voice, opener: .click)
        case .markAllRead:
            withAnimation(.easeOut(duration: 0.2)) { model.markAllRead() }
        case let .proposal(choice):
            // UI only until step 6; nothing is changed on the server.
            Log.info("voice: proposal \(choice) pressed (no-op until step 6)")
            if choice != .edit { rest() }
        }
    }

    // MARK: ⌥Space

    func hotKeyPressed() {
        recognizer.press(at: Date())
        holdTimer?.invalidate()
        holdTimer = Timer.scheduledTimer(withTimeInterval: recognizer.holdThreshold, repeats: false) { [weak self] _ in
            guard let self else { return }
            if self.recognizer.tick(at: Date().addingTimeInterval(0.001)) == .holdBegan {
                self.show(.voice, opener: .hold)
            }
        }
    }

    func hotKeyReleased() {
        holdTimer?.invalidate()
        holdTimer = nil
        switch recognizer.release(at: Date()) {
        case .tap:
            toggleInbox(opener: .click)
        case .holdEnded:
            if model.state == .voice && opener == .hold { rest() }
        default:
            break
        }
    }
}
