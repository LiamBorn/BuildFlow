import Foundation

// MARK: - The inbox, shaped like the plan's `GET /api/desktop/inbox` response

/// One read of everything the notch shows. The field names follow the plan's
/// `GET /api/desktop/inbox` example (me, notifications, jobs, meetings, tasks);
/// `weather` and `calendars` are optional extras the Today card and the greeting's
/// day line use, so a server that leaves them out still decodes.
public struct InboxSnapshot: Codable, Equatable {
    public var me: Me
    public var notifications: [InboxNotification]
    public var jobs: [InboxJob]
    public var meetings: [InboxMeeting]
    public var tasks: [InboxTask]
    public var weather: InboxWeather?
    public var calendars: [String]?

    public init(me: Me, notifications: [InboxNotification] = [], jobs: [InboxJob] = [],
                meetings: [InboxMeeting] = [], tasks: [InboxTask] = [],
                weather: InboxWeather? = nil, calendars: [String]? = nil) {
        self.me = me
        self.notifications = notifications
        self.jobs = jobs
        self.meetings = meetings
        self.tasks = tasks
        self.weather = weather
        self.calendars = calendars
    }

    public static let empty = InboxSnapshot(me: Me(firstName: ""))

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        me = try c.decode(Me.self, forKey: .me)
        notifications = try c.decodeIfPresent([InboxNotification].self, forKey: .notifications) ?? []
        jobs = try c.decodeIfPresent([InboxJob].self, forKey: .jobs) ?? []
        meetings = try c.decodeIfPresent([InboxMeeting].self, forKey: .meetings) ?? []
        tasks = try c.decodeIfPresent([InboxTask].self, forKey: .tasks) ?? []
        weather = try c.decodeIfPresent(InboxWeather.self, forKey: .weather)
        calendars = try c.decodeIfPresent([String].self, forKey: .calendars)
    }
}

public struct Me: Codable, Equatable {
    public var firstName: String
    public var workspace: String?
    public var role: String?
    public init(firstName: String, workspace: String? = nil, role: String? = nil) {
        self.firstName = firstName
        self.workspace = workspace
        self.role = role
    }
}

public struct InboxNotification: Codable, Equatable, Identifiable {
    public var id: String
    /// delayIQ, fieldUpdate, inspection, weatherConflict, weatherAlert, booking, material, equipment
    public var kind: String?
    public var title: String
    public var project: String?
    /// The website's tones: amber, green, red, purple, orange (or ok/warn/bad/info/brand).
    public var tone: String?
    public var at: Date
    public var read: Bool
    public var link: String?
}

public struct InboxJob: Codable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var project: String
    public var crews: [String]
    /// Site-local calendar day, "yyyy-MM-dd".
    public var date: String
    /// Site-local "HH:mm".
    public var start: String?
    public var end: String?
    public var status: String?
    /// nil, "watch" (rain likely) or "hold" (a WeatherIQ conflict waiting on a call).
    public var weather: String?
    /// True for projects the signed-in person manages ("Projects I manage").
    public var mine: Bool?
}

public struct InboxMeeting: Codable, Equatable {
    public var id: String?
    public var title: String
    public var startsAt: Date
    public var endsAt: Date?
    public var joinUrl: String?
    /// "Google Meet", "Microsoft Teams", or a place such as "Maple St. Plaza · on site".
    public var location: String?
    public var attendees: Int?
}

public struct InboxTask: Codable, Equatable {
    public var id: String?
    /// weather-call, time-cards, readiness, schedule-change, unbooked-job
    public var kind: String
    public var title: String
    public var context: String?
    public var source: String?
    /// Either a time today ("14:00") or a day ("yyyy-MM-dd").
    public var due: String?
    public var actions: [String]?
}

public struct InboxWeather: Codable, Equatable {
    public var project: String?
    public var site: String?
    public var tempF: Int?
    /// Site-local "HH:mm" when rain is expected to start today.
    public var rainFrom: String?
}

// MARK: - Where the inbox comes from

/// Anything that can produce the inbox. Step 1 reads bundled example data;
/// step 5 swaps in a network source for `GET /api/desktop/inbox` without the
/// notch knowing the difference.
public protocol InboxSource: AnyObject {
    func fetchInbox() async throws -> InboxSnapshot
}

public enum InboxDecoding {
    /// Accepts ISO 8601 with or without fractional seconds (JavaScript's
    /// `toISOString()` always sends milliseconds).
    public static func decoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let date = parseISO8601(s) { return date }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Not an ISO 8601 date: \(s)")
        }
        return d
    }

    public static func parseISO8601(_ s: String) -> Date? {
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let d = plain.date(from: s) { return d }
        let frac = ISO8601DateFormatter()
        frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return frac.date(from: s)
    }

    public static func decode(_ data: Data) throws -> InboxSnapshot {
        try decoder().decode(InboxSnapshot.self, from: data)
    }
}

/// The bundled example data (the plan's mock-up). With `rebaseTo`, every date is
/// moved by whole days so the example's "today" (26 Sep 2026) lands on the given
/// day, and the example keeps looking like today's schedule whenever it runs.
public final class ExampleInboxSource: InboxSource {
    public static let anchorDay = "2026-09-26"

    public let url: URL
    public let rebaseTo: Date?
    public let calendar: Calendar

    public init(url: URL, rebaseTo: Date? = nil, calendar: Calendar = .current) {
        self.url = url
        self.rebaseTo = rebaseTo
        self.calendar = calendar
    }

    public func fetchInbox() async throws -> InboxSnapshot {
        try load()
    }

    public func load() throws -> InboxSnapshot {
        let inbox = try InboxDecoding.decode(Data(contentsOf: url))
        guard let target = rebaseTo else { return inbox }
        return Self.rebase(inbox, to: target, calendar: calendar)
    }

    /// The JSON in the app bundle's Resources, or, for `swift run`, the copy in
    /// the source tree (mac/Resources/example-inbox.json).
    public static func defaultURL(bundle: Bundle = .main) -> URL? {
        if let u = bundle.url(forResource: "example-inbox", withExtension: "json") { return u }
        let tree = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // BuildFlowNotchKit
            .deletingLastPathComponent()   // Sources
            .deletingLastPathComponent()   // mac
            .appendingPathComponent("Resources/example-inbox.json")
        return FileManager.default.fileExists(atPath: tree.path) ? tree : nil
    }

    public static func rebase(_ inbox: InboxSnapshot, to target: Date, calendar: Calendar) -> InboxSnapshot {
        guard let anchor = DayString.date(anchorDay, calendar: calendar) else { return inbox }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: anchor),
                                           to: calendar.startOfDay(for: target)).day ?? 0
        guard days != 0 else { return inbox }
        func shift(_ d: Date) -> Date { calendar.date(byAdding: .day, value: days, to: d) ?? d }
        func shiftDay(_ s: String) -> String {
            guard let d = DayString.date(s, calendar: calendar) else { return s }
            return DayString.string(shift(d), calendar: calendar)
        }
        var out = inbox
        out.notifications = inbox.notifications.map { var n = $0; n.at = shift(n.at); return n }
        out.jobs = inbox.jobs.map { var j = $0; j.date = shiftDay(j.date); return j }
        out.meetings = inbox.meetings.map {
            var m = $0
            m.startsAt = shift(m.startsAt)
            m.endsAt = m.endsAt.map(shift)
            return m
        }
        out.tasks = inbox.tasks.map {
            var t = $0
            if let due = t.due, due.count == 10 { t.due = shiftDay(due) }
            return t
        }
        return out
    }
}

/// "yyyy-MM-dd" in a given calendar's time zone.
public enum DayString {
    public static func formatter(_ calendar: Calendar) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    public static func date(_ s: String, calendar: Calendar) -> Date? {
        formatter(calendar).date(from: s)
    }

    public static func string(_ d: Date, calendar: Calendar) -> String {
        formatter(calendar).string(from: d)
    }
}
