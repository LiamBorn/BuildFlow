import Foundation

// MARK: - One thing at a time

/// What the notch shows when nobody has opened it: the plan's order is you
/// talking, then an alert, then a meeting within 15 minutes, then a job within
/// 30 minutes; otherwise it rests.
public enum NotchPriority {
    public static func ambient(talking: Bool, alertPending: Bool, live: LiveActivity?) -> NotchState {
        if talking { return .voice }
        if alertPending { return .alert }
        if live != nil { return .live }   // the presenter already put a meeting before a job
        return .resting
    }
}

// MARK: - Quiet hours

/// No alerts between `start` and `end` (minutes after midnight); the span may
/// run past midnight. What arrives then waits in the inbox.
public struct QuietHours: Equatable {
    public var enabled: Bool
    public var start: Int
    public var end: Int

    public init(enabled: Bool = false, start: Int = 22 * 60, end: Int = 7 * 60) {
        self.enabled = enabled
        self.start = start
        self.end = end
    }

    public static let off = QuietHours(enabled: false)

    public func contains(_ date: Date, calendar: Calendar) -> Bool {
        guard enabled, start != end else { return false }
        let c = calendar.dateComponents([.hour, .minute], from: date)
        let m = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        return start < end ? (m >= start && m < end) : (m >= start || m < end)
    }

    /// "10 PM – 7 AM"
    public var label: String {
        func t(_ m: Int) -> String { TimeText.clock(hour: m / 60, minute: m % 60, style: .hourly) }
        return enabled ? "\(t(start)) – \(t(end))" : "Off"
    }
}

// MARK: - Alerts, each one once

/// Decides which notifications drop down as an alert. An alert is for
/// something NEW that the website shows in red or amber and that can alert at
/// all (never equipment); it shows once, and then waits in the inbox.
///
/// The first inbox read after launch only learns what is already there, so
/// starting the app never replays old news.
public struct AlertTracker: Equatable {
    public private(set) var known: Set<String> = []
    public private(set) var primed = false

    public init() {}

    public static func wantsAlert(_ n: InboxNotification) -> Bool {
        n.alertable && n.kind != "equipment" && !n.read && !n.seen && ["red", "amber"].contains(n.tone.lowercased())
    }

    /// The notifications to alert for now, most urgent first. Everything in
    /// `inbox` is remembered, including what quiet hours hold back.
    public mutating func take(_ inbox: InboxSnapshot, at now: Date, quiet: QuietHours, calendar: Calendar) -> [InboxNotification] {
        let fresh = inbox.notifications.filter { !known.contains($0.id) }
        fresh.forEach { known.insert($0.id) }
        guard primed else { primed = true; return [] }
        guard !quiet.contains(now, calendar: calendar) else { return [] }
        return fresh.filter(Self.wantsAlert).sorted { a, b in
            let ra = a.tone.lowercased() == "red", rb = b.tone.lowercased() == "red"
            if ra != rb { return ra }
            return a.at > b.at
        }
    }

    /// Forget everything (a different account or server).
    public mutating func reset() {
        known = []
        primed = false
    }
}

// MARK: - Read and seen, batched

/// `POST /api/desktop/inbox/state`'s body.
public struct InboxStateChange: Equatable, Encodable {
    public var seen: [String]?
    public var read: [String]?
    public var allRead: Bool?

    public init(seen: [String]? = nil, read: [String]? = nil, allRead: Bool? = nil) {
        self.seen = seen
        self.read = read
        self.allRead = allRead
    }

    public var isEmpty: Bool { (seen ?? []).isEmpty && (read ?? []).isEmpty && allRead != true }
}

/// Collects read and seen marks and lets at most one call a second go out:
/// every save rewrites the whole database file on the server.
public struct InboxStateBuffer: Equatable {
    public let minimumInterval: TimeInterval
    private var seen: [String] = []
    private var read: [String] = []
    private var allRead = false
    public private(set) var lastSent: Date?

    public init(minimumInterval: TimeInterval = 1) {
        self.minimumInterval = minimumInterval
    }

    public var hasPending: Bool { !seen.isEmpty || !read.isEmpty || allRead }

    public mutating func mark(seen ids: [String] = [], read readIds: [String] = [], allRead all: Bool = false) {
        for id in ids where !seen.contains(id) { seen.append(id) }
        for id in readIds where !read.contains(id) { read.append(id) }
        if all { allRead = true }
    }

    /// When the pending marks may go out.
    public func dueAt(now: Date) -> Date? {
        guard hasPending else { return nil }
        guard let lastSent else { return now }
        return max(now, lastSent.addingTimeInterval(minimumInterval))
    }

    /// The call to make now, if one is due; the buffer then starts over.
    public mutating func take(now: Date) -> InboxStateChange? {
        guard let due = dueAt(now: now), due <= now else { return nil }
        let change = InboxStateChange(seen: seen.isEmpty ? nil : seen,
                                      read: allRead || read.isEmpty ? nil : read,
                                      allRead: allRead ? true : nil)
        seen = []
        read = []
        allRead = false
        lastSent = now
        return change
    }

    /// A call failed: put its marks back so the next one carries them.
    public mutating func restore(_ change: InboxStateChange) {
        mark(seen: change.seen ?? [], read: change.read ?? [], allRead: change.allRead == true)
    }
}

extension InboxSnapshot {
    /// The same inbox with some rows marked, as it will read once the server has them.
    public func marking(seen seenIds: Set<String> = [], read readIds: Set<String> = [], allRead: Bool = false) -> InboxSnapshot {
        var out = self
        out.notifications = notifications.map { n in
            var n = n
            if seenIds.contains(n.id) || readIds.contains(n.id) || allRead { n.seen = true }
            if readIds.contains(n.id) || allRead { n.read = true }
            return n
        }
        if var counts = out.counts {
            counts.unseen = max(0, counts.unseen - (notifications.filter { !$0.seen }.count - out.notifications.filter { !$0.seen }.count))
            counts.unread = max(0, counts.unread - (notifications.filter { !$0.read }.count - out.notifications.filter { !$0.read }.count))
            out.counts = counts
        }
        return out
    }
}
