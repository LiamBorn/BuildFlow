import Foundation

// MARK: - The inbox: `GET /api/desktop/inbox`

/// One read of everything the notch shows: the server's `DesktopInbox`
/// (server/src/desktopInbox.ts) plus the wave-2 contract's additions, a `url`
/// on every row and task actions rewritten to `/api/desktop/tasks/…`.
///
/// Decoding is forgiving on purpose: a field the Mac doesn't need to act on
/// may be missing or null and the rest still decodes, so a server a little
/// ahead of or behind the app keeps working. The bundled example
/// (Resources/example-inbox.json) is written in this same shape.
public struct InboxSnapshot: Decodable, Equatable {
    public var version: Int?
    /// The reader's date, "yyyy-MM-dd", in the time zone the Mac sent.
    public var today: String?
    public var me: Me
    public var counts: InboxCounts?
    public var notifications: [InboxNotification]
    public var jobs: [InboxJob]
    public var meetings: [InboxMeeting]
    public var calendar: InboxCalendars?
    public var tasks: [InboxTask]
    /// Not in the contract: the workspace's crews, for "Book a crew". Without
    /// it the Mac offers the crews named on the inbox's jobs.
    public var crews: [InboxCrew]?

    public init(me: Me, notifications: [InboxNotification] = [], jobs: [InboxJob] = [],
                meetings: [InboxMeeting] = [], tasks: [InboxTask] = [], today: String? = nil,
                counts: InboxCounts? = nil, calendar: InboxCalendars? = nil, crews: [InboxCrew]? = nil) {
        self.me = me
        self.notifications = notifications
        self.jobs = jobs
        self.meetings = meetings
        self.tasks = tasks
        self.today = today
        self.counts = counts
        self.calendar = calendar
        self.crews = crews
    }

    public static let empty = InboxSnapshot(me: Me(firstName: ""))

    enum CodingKeys: String, CodingKey {
        case version, today, me, counts, notifications, jobs, meetings, calendar, tasks, crews
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try? c.decodeIfPresent(Int.self, forKey: .version)
        today = try? c.decodeIfPresent(String.self, forKey: .today)
        me = try c.decode(Me.self, forKey: .me)
        counts = try? c.decodeIfPresent(InboxCounts.self, forKey: .counts)
        notifications = try c.decodeIfPresent([InboxNotification].self, forKey: .notifications) ?? []
        jobs = try c.decodeIfPresent([InboxJob].self, forKey: .jobs) ?? []
        meetings = try c.decodeIfPresent([InboxMeeting].self, forKey: .meetings) ?? []
        calendar = try? c.decodeIfPresent(InboxCalendars.self, forKey: .calendar)
        tasks = try c.decodeIfPresent([InboxTask].self, forKey: .tasks) ?? []
        crews = try? c.decodeIfPresent([InboxCrew].self, forKey: .crews)
    }

    /// Every project, job and crew name in the inbox: the speech recogniser's
    /// hints, so "Oak Ridge" isn't heard as "oak rich".
    public var vocabulary: [String] {
        var seen = Set<String>()
        var out: [String] = []
        func add(_ s: String?) {
            guard let s = s?.trimmingCharacters(in: .whitespaces), !s.isEmpty, seen.insert(s.lowercased()).inserted else { return }
            out.append(s)
        }
        for j in jobs { add(j.project); add(j.name); j.crews.forEach { add($0) } }
        for t in tasks { add(t.project) }
        for c in crews ?? [] { add(c.name) }
        for m in meetings { add(m.title) }
        return Array(out.prefix(100))
    }

    /// The crews a "Book a crew" can choose from.
    public var crewChoices: [InboxCrew] {
        if let crews, !crews.isEmpty { return crews }
        var seen = Set<String>()
        var out: [InboxCrew] = []
        for j in jobs {
            for (i, id) in j.crewIds.enumerated() where seen.insert(id).inserted {
                out.append(InboxCrew(id: id, name: i < j.crews.count ? j.crews[i] : id))
            }
        }
        return out.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
}

public struct Me: Decodable, Equatable {
    public var userId: String?
    public var name: String?
    public var firstName: String
    public var workspace: String?
    public var role: String?
    public var greeting: InboxGreeting?

    public init(firstName: String, name: String? = nil, workspace: String? = nil, role: String? = nil,
                userId: String? = nil, greeting: InboxGreeting? = nil) {
        self.firstName = firstName
        self.name = name
        self.workspace = workspace
        self.role = role
        self.userId = userId
        self.greeting = greeting
    }
}

public struct InboxGreeting: Decodable, Equatable {
    /// morning, afternoon, evening, late, welcome-back
    public var kind: String
    public var text: String

    public init(kind: String, text: String) {
        self.kind = kind
        self.text = text
    }
}

public struct InboxCounts: Decodable, Equatable {
    public var notifications: Int
    /// Not yet shown to this person: the website bell's badge.
    public var unseen: Int
    public var unread: Int
    public var tasks: Int
    public var jobsToday: Int
    public var meetingsToday: Int

    public init(notifications: Int = 0, unseen: Int = 0, unread: Int = 0, tasks: Int = 0, jobsToday: Int = 0, meetingsToday: Int = 0) {
        self.notifications = notifications
        self.unseen = unseen
        self.unread = unread
        self.tasks = tasks
        self.jobsToday = jobsToday
        self.meetingsToday = meetingsToday
    }

    enum CodingKeys: String, CodingKey { case notifications, unseen, unread, tasks, jobsToday, meetingsToday }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func n(_ k: CodingKeys) -> Int { (try? c.decodeIfPresent(Int.self, forKey: k)) ?? 0 }
        self.init(notifications: n(.notifications), unseen: n(.unseen), unread: n(.unread), tasks: n(.tasks),
                  jobsToday: n(.jobsToday), meetingsToday: n(.meetingsToday))
    }
}

public struct InboxCalendars: Decodable, Equatable {
    /// "google", "microsoft"
    public var connected: [String]
    public var failed: [String]

    public init(connected: [String] = [], failed: [String] = []) {
        self.connected = connected
        self.failed = failed
    }

    enum CodingKeys: String, CodingKey { case connected, failed }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        connected = (try? c.decodeIfPresent([String].self, forKey: .connected)) ?? []
        failed = (try? c.decodeIfPresent([String].self, forKey: .failed)) ?? []
    }
}

public struct InboxCrew: Decodable, Equatable {
    public var id: String
    public var name: String
    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

/// `{ kind, id }`: the record a row is about.
public struct RecordRef: Decodable, Equatable {
    public var kind: String
    public var id: String
    public init(kind: String, id: String) {
        self.kind = kind
        self.id = id
    }
}

// MARK: Notifications

public struct InboxNotification: Decodable, Equatable, Identifiable {
    public var id: String
    /// fieldUpdate, weatherConflict, weatherAlert, delayIQ, assignment, inspection, material, equipment
    public var kind: String
    public var title: String
    /// The line under the title (the bell's "detail").
    public var sub: String
    /// blue, green, amber, red, violet, slate
    public var tone: String
    public var at: Date
    /// The day as sent ("yyyy-MM-dd") when the source only carries a day, not a time.
    public var atDay: String?
    public var atIsDay: Bool { atDay != nil }
    public var seen: Bool
    public var read: Bool
    /// False for equipment: its rows are stamped "now" on every build, so it must never alert.
    public var alertable: Bool
    public var projectId: String?
    public var target: RecordRef?
    /// The website page that opens this record on a cold load.
    public var url: String?

    public init(id: String, kind: String, title: String, sub: String = "", tone: String = "slate", at: Date,
                atDay: String? = nil, seen: Bool = false, read: Bool = false, alertable: Bool = true,
                projectId: String? = nil, target: RecordRef? = nil, url: String? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.sub = sub
        self.tone = tone
        self.at = at
        self.atDay = atDay
        self.seen = seen
        self.read = read
        self.alertable = alertable && kind != "equipment"
        self.projectId = projectId
        self.target = target
        self.url = url
    }

    enum CodingKeys: String, CodingKey { case id, kind, title, sub, tone, at, seen, read, alertable, projectId, target, url }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? ""
        title = try c.decode(String.self, forKey: .title)
        sub = (try? c.decodeIfPresent(String.self, forKey: .sub)) ?? ""
        tone = (try? c.decodeIfPresent(String.self, forKey: .tone)) ?? "slate"
        let raw = try c.decode(String.self, forKey: .at)
        guard let parsed = InboxDecoding.parseInstantOrDay(raw) else {
            throw DecodingError.dataCorruptedError(forKey: .at, in: c, debugDescription: "Not a date: \(raw)")
        }
        at = parsed.date
        atDay = parsed.isDay ? raw : nil
        seen = (try? c.decodeIfPresent(Bool.self, forKey: .seen)) ?? false
        read = (try? c.decodeIfPresent(Bool.self, forKey: .read)) ?? false
        // Equipment can never alert, whatever the server says; a row that doesn't say, doesn't.
        alertable = kind != "equipment" && ((try? c.decodeIfPresent(Bool.self, forKey: .alertable)) ?? false)
        projectId = try? c.decodeIfPresent(String.self, forKey: .projectId)
        target = try? c.decodeIfPresent(RecordRef.self, forKey: .target)
        url = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .url))
    }
}

// MARK: Jobs

/// WeatherIQ's word on a job's day.
public struct JobWeather: Decodable, Equatable {
    /// watch, hold
    public var severity: String
    /// lightning, rain, snow, wind, heat, cold, fog
    public var cause: String
    /// open, kept, cancelled
    public var status: String
    public var reason: String
    /// Site-local "yyyy-MM-ddTHH:mm".
    public var start: String
    public var end: String
    public var conflictId: String?

    public init(severity: String, cause: String, status: String = "open", reason: String = "",
                start: String, end: String, conflictId: String? = nil) {
        self.severity = severity
        self.cause = cause
        self.status = status
        self.reason = reason
        self.start = start
        self.end = end
        self.conflictId = conflictId
    }

    enum CodingKeys: String, CodingKey { case severity, cause, status, reason, start, end, conflictId }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        severity = (try? c.decodeIfPresent(String.self, forKey: .severity)) ?? "watch"
        cause = (try? c.decodeIfPresent(String.self, forKey: .cause)) ?? "rain"
        status = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? "open"
        reason = (try? c.decodeIfPresent(String.self, forKey: .reason)) ?? ""
        start = (try? c.decodeIfPresent(String.self, forKey: .start)) ?? ""
        end = (try? c.decodeIfPresent(String.self, forKey: .end)) ?? ""
        conflictId = try? c.decodeIfPresent(String.self, forKey: .conflictId)
    }

    /// "HH:mm" of `start`.
    public var startClock: String? {
        start.count >= 16 ? String(start.suffix(5)) : nil
    }

    public var startDay: String? {
        start.count >= 10 ? String(start.prefix(10)) : nil
    }
}

public struct InboxJob: Decodable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var projectId: String?
    public var project: String
    /// Site-local calendar day, "yyyy-MM-dd".
    public var date: String
    /// Site-local "HH:mm"; nil when the job's time can't be read.
    public var start: String?
    public var end: String?
    public var crews: [String]
    public var crewIds: [String]
    public var status: String?
    public var weather: JobWeather?
    /// A project this person manages ("Projects I manage").
    public var mine: Bool
    public var days: [String]
    public var url: String?

    public init(id: String, name: String, project: String, date: String, start: String? = nil, end: String? = nil,
                crews: [String] = [], crewIds: [String] = [], status: String? = nil, weather: JobWeather? = nil,
                mine: Bool = false, days: [String] = [], projectId: String? = nil, url: String? = nil) {
        self.id = id
        self.name = name
        self.project = project
        self.date = date
        self.start = start
        self.end = end
        self.crews = crews
        self.crewIds = crewIds
        self.status = status
        self.weather = weather
        self.mine = mine
        self.days = days
        self.projectId = projectId
        self.url = url
    }

    enum CodingKeys: String, CodingKey { case id, name, projectId, project, date, start, end, crews, crewIds, status, weather, mine, days, url }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        projectId = try? c.decodeIfPresent(String.self, forKey: .projectId)
        project = (try? c.decodeIfPresent(String.self, forKey: .project)) ?? ""
        date = try c.decode(String.self, forKey: .date)
        start = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .start))
        end = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .end))
        crews = (try? c.decodeIfPresent([String].self, forKey: .crews)) ?? []
        crewIds = (try? c.decodeIfPresent([String].self, forKey: .crewIds)) ?? []
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        weather = try? c.decodeIfPresent(JobWeather.self, forKey: .weather)
        mine = (try? c.decodeIfPresent(Bool.self, forKey: .mine)) ?? false
        days = (try? c.decodeIfPresent([String].self, forKey: .days)) ?? [date]
        url = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .url))
    }
}

// MARK: Meetings

public struct InboxMeeting: Decodable, Equatable, Identifiable {
    public var id: String
    /// google, microsoft
    public var provider: String?
    public var title: String
    public var startsAt: Date
    public var endsAt: Date
    public var allDay: Bool
    /// nil when there's nothing to join (the server sends "").
    public var joinUrl: String?
    /// "Google Meet", "Microsoft Teams"
    public var conference: String?
    public var location: String?
    /// accepted, tentative, pending, organizer, declined
    public var myResponse: String?
    /// past, now, soon, later, when the server built it; the Mac counts down itself.
    public var state: String?
    public var url: String?

    public init(id: String, title: String, startsAt: Date, endsAt: Date? = nil, allDay: Bool = false,
                joinUrl: String? = nil, conference: String? = nil, location: String? = nil,
                provider: String? = nil, myResponse: String? = nil, state: String? = nil, url: String? = nil) {
        self.id = id
        self.title = title
        self.startsAt = startsAt
        self.endsAt = endsAt ?? startsAt.addingTimeInterval(1800)
        self.allDay = allDay
        self.joinUrl = joinUrl
        self.conference = conference
        self.location = location
        self.provider = provider
        self.myResponse = myResponse
        self.state = state
        self.url = url
    }

    enum CodingKeys: String, CodingKey {
        case id, provider, title, startsAt, endsAt, allDay, joinUrl, conference, location, myResponse, state, url
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        title = try c.decode(String.self, forKey: .title)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? title
        provider = try? c.decodeIfPresent(String.self, forKey: .provider)
        let rawStart = try c.decode(String.self, forKey: .startsAt)
        guard let start = InboxDecoding.parseInstantOrDay(rawStart) else {
            throw DecodingError.dataCorruptedError(forKey: .startsAt, in: c, debugDescription: "Not a date: \(rawStart)")
        }
        startsAt = start.date
        let rawEnd = try? c.decodeIfPresent(String.self, forKey: .endsAt)
        endsAt = rawEnd.flatMap { InboxDecoding.parseInstantOrDay($0) }?.date ?? start.date.addingTimeInterval(1800)
        allDay = (try? c.decodeIfPresent(Bool.self, forKey: .allDay)) ?? start.isDay
        joinUrl = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .joinUrl))
        conference = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .conference))
        location = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .location))
        myResponse = try? c.decodeIfPresent(String.self, forKey: .myResponse)
        state = try? c.decodeIfPresent(String.self, forKey: .state)
        url = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .url))
    }
}

// MARK: Tasks

public struct TaskRequest: Decodable, Equatable {
    public var method: String
    /// `/api/desktop/tasks/<taskId>/<actionId>` (the contract's desktop mirror).
    public var path: String
    public var body: [String: JSONValue]
    /// Fields the person has to supply before it can be sent, e.g. `crewId`.
    public var needs: [String]

    public init(method: String = "POST", path: String, body: [String: JSONValue] = [:], needs: [String] = []) {
        self.method = method
        self.path = path
        self.body = body
        self.needs = needs
    }

    enum CodingKeys: String, CodingKey { case method, path, body, needs }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        method = (try? c.decodeIfPresent(String.self, forKey: .method)) ?? "POST"
        path = try c.decode(String.self, forKey: .path)
        body = (try? c.decodeIfPresent([String: JSONValue].self, forKey: .body)) ?? [:]
        needs = (try? c.decodeIfPresent([String].self, forKey: .needs)) ?? []
    }
}

public struct TaskAction: Decodable, Equatable, Identifiable {
    /// accept, reject, cancel, keep, approve, book
    public var id: String
    public var label: String
    public var capability: String?
    public var request: TaskRequest

    public init(id: String, label: String, capability: String? = nil, request: TaskRequest) {
        self.id = id
        self.label = label
        self.capability = capability
        self.request = request
    }
}

public struct InboxTask: Decodable, Equatable, Identifiable {
    public var id: String
    /// schedule-change, weather-call, readiness, unbooked-job, time-cards
    public var kind: String
    public var title: String
    public var detail: String
    public var projectId: String?
    public var project: String
    /// "yyyy-MM-dd", or "yyyy-MM-ddTHH:mm" in site time; nil when it has no date.
    public var due: String?
    public var tone: String
    public var target: RecordRef?
    public var actions: [TaskAction]
    public var url: String?

    public init(id: String, kind: String, title: String, detail: String = "", project: String = "", due: String? = nil,
                tone: String = "slate", actions: [TaskAction] = [], projectId: String? = nil, target: RecordRef? = nil,
                url: String? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.detail = detail
        self.project = project
        self.due = due
        self.tone = tone
        self.actions = actions
        self.projectId = projectId
        self.target = target
        self.url = url
    }

    enum CodingKeys: String, CodingKey { case id, kind, title, detail, projectId, project, due, tone, target, actions, url }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? ""
        title = try c.decode(String.self, forKey: .title)
        detail = (try? c.decodeIfPresent(String.self, forKey: .detail)) ?? ""
        projectId = try? c.decodeIfPresent(String.self, forKey: .projectId)
        project = (try? c.decodeIfPresent(String.self, forKey: .project)) ?? ""
        due = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .due))
        tone = (try? c.decodeIfPresent(String.self, forKey: .tone)) ?? "slate"
        target = try? c.decodeIfPresent(RecordRef.self, forKey: .target)
        // One malformed action shouldn't hide the task.
        actions = ((try? c.decodeIfPresent([Lenient<TaskAction>].self, forKey: .actions)) ?? []).compactMap(\.value)
        url = InboxDecoding.nonEmpty(try? c.decodeIfPresent(String.self, forKey: .url))
    }

    /// The day part of `due`.
    public var dueDay: String? { due.map { String($0.prefix(10)) } }
    /// The time part of `due`, "HH:mm", when it has one.
    public var dueClock: String? {
        guard let due, due.count >= 16 else { return nil }
        return String(due.suffix(5))
    }
}

/// Decodes a T, or nil if that one element is malformed.
struct Lenient<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

// MARK: - Where the inbox comes from

/// Anything that can produce the inbox: the bundled example, or the server.
public protocol InboxSource: AnyObject {
    func fetchInbox() async throws -> InboxSnapshot
}

public enum InboxDecoding {
    public static func decoder() -> JSONDecoder { JSONDecoder() }

    /// Accepts ISO 8601 with or without fractional seconds (JavaScript's
    /// `toISOString()` always sends milliseconds).
    public static func parseISO8601(_ s: String) -> Date? {
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        if let d = plain.date(from: s) { return d }
        let frac = ISO8601DateFormatter()
        frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return frac.date(from: s)
    }

    /// An instant, or a bare "yyyy-MM-dd" (read as the start of that day on this Mac).
    public static func parseInstantOrDay(_ s: String, calendar: Calendar = .current) -> (date: Date, isDay: Bool)? {
        if let d = parseISO8601(s) { return (d, false) }
        if s.count == 10, let d = DayString.date(s, calendar: calendar) { return (d, true) }
        return nil
    }

    static func nonEmpty(_ s: String?) -> String? {
        guard let s else { return nil }
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    public static func decode(_ data: Data) throws -> InboxSnapshot {
        try decoder().decode(InboxSnapshot.self, from: data)
    }
}

/// The bundled example data (the plan's mock-up), shown while this Mac isn't
/// connected. With `rebaseTo`, every date moves by whole days so the example's
/// "today" (26 Sep 2026) lands on the given day.
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

    /// The JSON in the app bundle's Resources, or, for a bare binary, the copy
    /// in the source tree (mac/Resources/example-inbox.json).
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
            // "yyyy-MM-dd" or "yyyy-MM-ddTHH:mm": move the day, keep the time.
            guard s.count >= 10, let d = DayString.date(String(s.prefix(10)), calendar: calendar) else { return s }
            return DayString.string(shift(d), calendar: calendar) + s.dropFirst(10)
        }
        var out = inbox
        out.today = inbox.today.map(shiftDay)
        out.notifications = inbox.notifications.map { var n = $0; n.at = shift(n.at); return n }
        out.jobs = inbox.jobs.map {
            var j = $0
            j.date = shiftDay(j.date)
            j.days = j.days.map(shiftDay)
            if var w = j.weather { w.start = shiftDay(w.start); w.end = shiftDay(w.end); j.weather = w }
            return j
        }
        out.meetings = inbox.meetings.map {
            var m = $0
            m.startsAt = shift(m.startsAt)
            m.endsAt = shift(m.endsAt)
            return m
        }
        out.tasks = inbox.tasks.map { var t = $0; t.due = t.due.map(shiftDay); return t }
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
