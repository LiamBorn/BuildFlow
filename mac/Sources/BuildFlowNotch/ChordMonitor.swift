import AppKit
import BuildFlowNotchKit
import CoreGraphics
import IOKit.hid

/// Left ⌃ + left ⌥ — tap for the inbox, hold to talk — watched without a hot key
/// and without asking for a permission:
///
/// - `.flagsChanged` from global and local NSEvent monitors say when modifiers
///   go down and up (with the device bits that tell left from right).
/// - The session's key and click counters (`CGEventSource.counterForEventType`,
///   readable by any app) say whether another key or a click happened while the
///   chord was held, without a keyDown monitor, which would need Accessibility.
/// - While a press is in progress a 30 ms timer checks the hold threshold and
///   those counters, so a cancel lands within a tick.
///
/// Apple documents key-related global monitors as needing Accessibility, but on
/// macOS 13.7 an app with neither Accessibility nor Input Monitoring was seen to
/// receive flagsChanged, device bits included (a probe launched from Finder, 26
/// Sep 2026). In case a Mac differs: if flagsChanged events don't reach the app
/// (the session's own flagsChanged counter moves and the monitors saw nothing),
/// it polls the session's modifier flags every 30 ms instead; if those can't tell
/// left from right either, `needsPermission` becomes true and the status menu
/// offers Input Monitoring. It never asks at launch.
@MainActor
final class ChordMonitor {
    enum Source: String { case events, polling }

    var onEvent: ((ChordEvent) -> Void)?
    /// Is BuildFlow speaking? A chord then stops the speech rather than toggling.
    var isSpeaking: () -> Bool = { false }
    var onStatusChange: (() -> Void)?

    private(set) var source: Source = .events
    private(set) var needsPermission = false
    private(set) var eventsConfirmed = false

    private var recognizer = ChordRecognizer()
    private var monitors: [Any] = []
    private var tickTimer: Timer?
    private var healthTimer: Timer?
    private var delivered = 0
    private var lastSystemCount: UInt32 = 0
    private var strikes = 0
    private var lastPolled: UInt64 = 0
    private var pollSawModifier = false
    /// The polled flags told left from right (a poll without the device bits can't).
    private var pollSawDeviceBits = false

    static func counters() -> InputCounters {
        let s = CGEventSourceStateID.combinedSessionState
        return InputCounters(keyDown: CGEventSource.counterForEventType(s, eventType: .keyDown),
                             leftMouseDown: CGEventSource.counterForEventType(s, eventType: .leftMouseDown),
                             rightMouseDown: CGEventSource.counterForEventType(s, eventType: .rightMouseDown),
                             otherMouseDown: CGEventSource.counterForEventType(s, eventType: .otherMouseDown))
    }

    static var systemFlagsChanged: UInt32 {
        CGEventSource.counterForEventType(.combinedSessionState, eventType: .flagsChanged)
    }

    /// Input Monitoring as macOS has it for this app (asking never happens here).
    static var inputMonitoring: String {
        switch IOHIDCheckAccess(kIOHIDRequestTypeListenEvent) {
        case kIOHIDAccessTypeGranted: return "granted"
        case kIOHIDAccessTypeDenied: return "denied"
        default: return "not asked"
        }
    }

    func start() {
        if let m = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged, handler: { [weak self] e in
            let raw = UInt64(e.modifierFlags.rawValue), key = e.keyCode
            Task { @MainActor [weak self] in self?.monitored(raw, key) }
        }) { monitors.append(m) }
        if let m = NSEvent.addLocalMonitorForEvents(matching: .flagsChanged, handler: { [weak self] e in
            let raw = UInt64(e.modifierFlags.rawValue), key = e.keyCode
            Task { @MainActor [weak self] in self?.monitored(raw, key) }
            return e
        }) { monitors.append(m) }
        lastSystemCount = Self.systemFlagsChanged
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] _ in Task { @MainActor [weak self] in self?.checkHealth() } }
        t.tolerance = 0.2
        RunLoop.main.add(t, forMode: .common)
        healthTimer = t
        Log.info("shortcut: left ⌃⌥ (tap = inbox, hold = talk); listening for modifier changes "
            + "(Accessibility \(AXIsProcessTrusted() ? "on" : "off"), Input Monitoring \(Self.inputMonitoring))")
    }

    private func monitored(_ raw: UInt64, _ keyCode: UInt16) {
        delivered += 1
        guard source == .events else { return }
        feed(raw, keyCode: keyCode)
    }

    private func feed(_ raw: UInt64, keyCode: UInt16?) {
        let events = recognizer.flagsChanged(raw, keyCode: keyCode, counters: Self.counters(), at: Date(), speaking: isSpeaking())
        dispatch(events)
    }

    private func dispatch(_ events: [ChordEvent]) {
        for e in events { onEvent?(e) }
        updateTickTimer()
    }

    // MARK: The 30 ms tick

    private func updateTickTimer() {
        let needed = source == .polling || !recognizer.isIdle
        if needed, tickTimer == nil {
            let t = Timer(timeInterval: 0.03, repeats: true) { [weak self] _ in Task { @MainActor [weak self] in self?.tick() } }
            t.tolerance = 0.005
            RunLoop.main.add(t, forMode: .common)
            tickTimer = t
        } else if !needed, let t = tickTimer {
            t.invalidate()
            tickTimer = nil
        }
    }

    private func tick() {
        if source == .polling {
            let raw = CGEventSource.flagsState(.combinedSessionState).rawValue
            if raw & (ModifierBits.shift | ModifierBits.control | ModifierBits.option | ModifierBits.command) != 0 {
                pollSawModifier = true
                if raw & 0x207F != 0 { pollSawDeviceBits = true }
            }
            if raw != lastPolled {
                lastPolled = raw
                feed(raw, keyCode: nil)
            }
        }
        dispatch(recognizer.tick(counters: Self.counters(), at: Date()))
    }

    // MARK: Do modifier changes reach this app?

    private func checkHealth() {
        let now = Self.systemFlagsChanged
        let systemDelta = now &- lastSystemCount
        lastSystemCount = now
        defer { delivered = 0; pollSawModifier = false; pollSawDeviceBits = false }
        guard systemDelta >= 2 else { return }              // nobody pressed a modifier
        switch source {
        case .events:
            if delivered > 0 {
                if !eventsConfirmed {
                    eventsConfirmed = true
                    Log.info("shortcut: modifier changes reach BuildFlow (\(delivered) of \(systemDelta) this second); no permission needed")
                }
                strikes = 0
                return
            }
            strikes += 1
            guard strikes >= 2, !eventsConfirmed else { return }
            source = .polling
            strikes = 0
            Log.info("shortcut: modifier changes don't reach BuildFlow (\(systemDelta) went by unseen); watching the session's modifier flags instead")
            updateTickTimer()
            onStatusChange?()
        case .polling:
            if pollSawModifier && pollSawDeviceBits {
                strikes = 0
                if needsPermission { needsPermission = false; onStatusChange?() }
                return
            }
            strikes += 1
            if strikes >= 3, !needsPermission {
                needsPermission = true
                Log.info("shortcut: can't see the modifier keys at all; Input Monitoring is \(Self.inputMonitoring)")
                onStatusChange?()
            }
        }
    }

    static let inputMonitoringPane = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")!
}
