import Foundation

// MARK: - What a row looks like, independent of SwiftUI

/// The icon names the app draws (Lucide shapes, as in the mock-up).
public enum NotchIcon: String, CaseIterable {
    case bell, hardHat, hardHatSmall, calendar, calendarPlain, listChecks, listSmall
    case mic, settings, triangleAlert, activity, checkSquare, cloudRain, cloudRainSmall
    case clock, video, mark
}

/// The website's tones, in their dark notch colours.
public enum NotchTone: String {
    case ok, warn, bad, info, brand, muted

    /// Accepts the server's colour words as well as the tone names.
    public static func from(_ word: String?) -> NotchTone {
        switch word?.lowercased() {
        case "green", "ok": return .ok
        case "amber", "yellow", "warn": return .warn
        case "red", "bad": return .bad
        case "purple", "violet", "info": return .info
        case "orange", "brand": return .brand
        default: return .muted
        }
    }
}

public enum RowTrailing: Equatable {
    case none
    case text(String)
    case twoLine(String, String)
    case join(String?)
}

public struct InboxRow: Equatable, Identifiable {
    public var id: String
    public var icon: NotchIcon
    public var tone: NotchTone
    public var title: String
    public var subtitle: String
    public var unread: Bool
    public var trailing: RowTrailing

    public init(id: String, icon: NotchIcon, tone: NotchTone, title: String, subtitle: String,
                unread: Bool = false, trailing: RowTrailing = .none) {
        self.id = id
        self.icon = icon
        self.tone = tone
        self.title = title
        self.subtitle = subtitle
        self.unread = unread
        self.trailing = trailing
    }
}

public enum InboxTab: String, CaseIterable {
    case notifications, jobs, meetings, tasks
}

public struct CardContent: Equatable {
    public var title: String
    public var note: String
    public var rows: [InboxRow]

    public init(title: String, note: String, rows: [InboxRow]) {
        self.title = title
        self.note = note
        self.rows = rows
    }
}

public struct LiveActivity: Equatable {
    public var icon: NotchIcon
    public var tone: NotchTone
    public var label: String
    public var countdown: String

    public init(icon: NotchIcon, tone: NotchTone, label: String, countdown: String) {
        self.icon = icon
        self.tone = tone
        self.label = label
        self.countdown = countdown
    }
}

public struct AlertContent: Equatable {
    public var icon: NotchIcon
    public var tone: NotchTone
    public var status: String
    public var title: String
    public var subtitle: String

    public init(icon: NotchIcon, tone: NotchTone, status: String, title: String, subtitle: String) {
        self.icon = icon
        self.tone = tone
        self.status = status
        self.title = title
        self.subtitle = subtitle
    }
}

public struct VoiceContent: Equatable {
    public var status: String
    public var question: String
    public var answer: String
    public var proposalSubject: String
    public var proposalFrom: String
    public var proposalTo: String

    public init(status: String, question: String, answer: String, proposalSubject: String,
                proposalFrom: String, proposalTo: String) {
        self.status = status
        self.question = question
        self.answer = answer
        self.proposalSubject = proposalSubject
        self.proposalFrom = proposalFrom
        self.proposalTo = proposalTo
    }

    /// The mock-up's voice card. Speech, the question and the answer arrive in step 6.
    public static let example = VoiceContent(
        status: "Answering",
        question: "What's Crew 2 doing tomorrow?",
        answer: "Crew 2 is framing at Oak Ridge tomorrow, 7:00 to 3:30. Rain is likely after 2 PM, so starting an hour early would finish the day dry.",
        proposalSubject: "Oak Ridge · Framing",
        proposalFrom: "7:00",
        proposalTo: "6:00 AM")
}

// MARK: - Inbox → rows

/// Turns one inbox read into the words on screen, for a given moment and time zone.
public struct InboxPresenter {
    public let inbox: InboxSnapshot
    public let now: Date
    public let calendar: Calendar

    public init(inbox: InboxSnapshot, now: Date, calendar: Calendar) {
        self.inbox = inbox
        self.now = now
        self.calendar = calendar
    }

    var today: Date { calendar.startOfDay(for: now) }
    var todayString: String { DayString.string(now, calendar: calendar) }

    // Counts on the tabs

    public var unreadCount: Int { inbox.notifications.filter { !$0.read }.count }

    public var tasksDueToday: Int { inbox.tasks.filter { isDueToday($0) }.count }

    public func count(for tab: InboxTab) -> Int? {
        switch tab {
        case .notifications: return unreadCount > 0 ? unreadCount : nil
        case .tasks: return tasksDueToday > 0 ? tasksDueToday : nil
        case .jobs, .meetings: return nil
        }
    }

    public func card(for tab: InboxTab, limit: Int = 3) -> CardContent {
        switch tab {
        case .notifications:
            return CardContent(title: "Notifications", note: "Mark all read", rows: notificationRows(limit: limit))
        case .jobs:
            return CardContent(title: "Upcoming jobs", note: "Projects I manage", rows: jobRows(limit: limit))
        case .meetings:
            let note = (inbox.calendars ?? []).joined(separator: " + ")
            return CardContent(title: "Meetings today", note: note, rows: meetingRows(limit: limit))
        case .tasks:
            return CardContent(title: "Waiting on you", note: "\(tasksDueToday) today", rows: taskRows(limit: limit))
        }
    }

    // Notifications

    public func notificationRows(limit: Int = 3) -> [InboxRow] {
        inbox.notifications
            .sorted { $0.at > $1.at }
            .prefix(limit)
            .map { n in
                InboxRow(id: n.id, icon: Self.icon(forNotificationKind: n.kind), tone: NotchTone.from(n.tone),
                         title: n.title,
                         subtitle: [n.project, Self.label(forNotificationKind: n.kind)].compactMap { $0 }.joined(separator: " · "),
                         unread: !n.read, trailing: .text(TimeText.age(from: n.at, to: now)))
            }
    }

    static func icon(forNotificationKind kind: String?) -> NotchIcon {
        switch kind {
        case "delayIQ": return .triangleAlert
        case "fieldUpdate": return .activity
        case "inspection": return .checkSquare
        case "weatherConflict", "weatherAlert": return .cloudRain
        case "booking": return .calendar
        case "material", "equipment": return .hardHatSmall
        default: return .bell
        }
    }

    static func label(forNotificationKind kind: String?) -> String? {
        switch kind {
        case "delayIQ": return "DelayIQ"
        case "fieldUpdate": return "Field update"
        case "inspection": return "Inspection"
        case "weatherConflict": return "WeatherIQ"
        case "weatherAlert": return "Weather alert"
        case "booking": return "Booking"
        case "material": return "Materials"
        case "equipment": return "Equipment"
        default: return nil
        }
    }

    // Jobs: today and the next 6 days, projects I manage first

    public func upcomingJobs() -> [InboxJob] {
        let last = calendar.date(byAdding: .day, value: 6, to: today) ?? today
        let lastString = DayString.string(last, calendar: calendar)
        return inbox.jobs
            .filter { $0.date >= todayString && $0.date <= lastString }
            .sorted { a, b in
                let am = a.mine ?? false, bm = b.mine ?? false
                if am != bm { return am }
                if a.date != b.date { return a.date < b.date }
                return (a.start ?? "") < (b.start ?? "")
            }
    }

    public var jobsToday: [InboxJob] { inbox.jobs.filter { $0.date == todayString } }

    public func jobRows(limit: Int = 3) -> [InboxRow] {
        upcomingJobs().prefix(limit).map { j in
            let watch = j.weather == "watch"
            let state = watch ? "Rain watch" : j.status
            let subtitle = ([j.project, j.crews.joined(separator: ", ")] + [state].compactMap { $0 })
                .filter { !$0.isEmpty }.joined(separator: " · ")
            return InboxRow(id: j.id, icon: watch ? .cloudRain : .hardHatSmall, tone: watch ? .warn : .brand,
                            title: j.name, subtitle: subtitle, unread: false,
                            trailing: .twoLine(dayLabel(j.date), j.start.flatMap { TimeText.clock(hm: $0, style: .compact) } ?? ""))
        }
    }

    func dayLabel(_ day: String) -> String {
        if day == todayString { return "Today" }
        guard let d = DayString.date(day, calendar: calendar) else { return day }
        let days = calendar.dateComponents([.day], from: today, to: d).day ?? 0
        return days < 7 ? TimeText.weekdayShort(d, calendar: calendar) : TimeText.monthDay(d, calendar: calendar)
    }

    // Meetings

    /// Today's meetings that haven't ended, in order.
    public func meetingsLeftToday() -> [InboxMeeting] {
        inbox.meetings
            .filter { calendar.isDate($0.startsAt, inSameDayAs: now) && ($0.endsAt ?? $0.startsAt.addingTimeInterval(1800)) > now }
            .sorted { $0.startsAt < $1.startsAt }
    }

    public var nextMeeting: InboxMeeting? {
        meetingsLeftToday().first
    }

    public func meetingRows(limit: Int = 3) -> [InboxRow] {
        meetingsLeftToday().prefix(limit).enumerated().map { i, m in
            let isNext = i == 0
            let joinable = isNext && m.joinUrl != nil
            let subtitle = [m.location, m.attendees.map { "\($0) people" }].compactMap { $0 }.joined(separator: " · ")
            return InboxRow(id: m.id ?? "\(m.title)-\(i)", icon: joinable ? .video : .calendarPlain,
                            tone: joinable ? .ok : .muted, title: m.title, subtitle: subtitle, unread: false,
                            trailing: joinable ? .join(m.joinUrl) : .text(TimeText.clock(m.startsAt, calendar: calendar, style: .full)))
        }
    }

    // Tasks

    func isDueToday(_ t: InboxTask) -> Bool {
        guard let due = t.due else { return false }
        if TimeText.parseHM(due) != nil { return true }
        return due == todayString
    }

    func dueSortKey(_ t: InboxTask) -> String {
        guard let due = t.due else { return "9999" }
        if TimeText.parseHM(due) != nil { return todayString + "T" + due }
        return due + "T99:99"
    }

    public func taskRows(limit: Int = 3) -> [InboxRow] {
        inbox.tasks.sorted { dueSortKey($0) < dueSortKey($1) }.prefix(limit).enumerated().map { i, t in
            let (icon, tone): (NotchIcon, NotchTone) = {
                switch t.kind {
                case "weather-call": return (.cloudRainSmall, .warn)
                case "time-cards": return (.clock, .brand)
                case "schedule-change": return (.activity, .info)
                case "unbooked-job": return (.hardHatSmall, .bad)
                default: return (.listSmall, .muted)
                }
            }()
            return InboxRow(id: t.id ?? "\(t.kind)-\(i)", icon: icon, tone: tone, title: t.title,
                            subtitle: [t.context, t.source].compactMap { $0 }.joined(separator: " · "),
                            unread: false, trailing: .text(dueLabel(t.due)))
        }
    }

    func dueLabel(_ due: String?) -> String {
        guard let due else { return "" }
        if let t = TimeText.parseHM(due) { return "By " + TimeText.clock(hour: t.hour, minute: t.minute, style: .hourly) }
        return dayLabel(due)
    }

    // Today card

    public var todayHeader: String { TimeText.dayHeader(now, calendar: calendar) }

    public func upNextText() -> String {
        guard let m = nextMeeting else { return "No more meetings today" }
        let minutes = Int((m.startsAt.timeIntervalSince(now) / 60).rounded(.up))
        if minutes <= 0 { return "\(m.title) now" }
        if minutes < 60 { return "\(m.title) in \(minutes) min" }
        return "\(m.title) at \(TimeText.clock(m.startsAt, calendar: calendar, style: .full))"
    }

    /// My first job today, or my next job this week.
    public var nextJob: InboxJob? {
        let mine = upcomingJobs().filter { $0.mine ?? true }
        return mine.first(where: { $0.date == todayString }) ?? mine.first
    }

    public func todayRows() -> [InboxRow] {
        var rows: [InboxRow] = []
        let m = nextMeeting
        rows.append(InboxRow(id: "up-next", icon: .video, tone: .ok, title: "Up next", subtitle: upNextText(),
                             unread: false, trailing: m?.joinUrl != nil ? .join(m?.joinUrl) : .none))
        if let j = nextJob {
            let start = j.start.flatMap { TimeText.clock(hm: $0, style: .compact) }
            rows.append(InboxRow(id: "next-job", icon: .hardHatSmall, tone: .brand, title: "Next job",
                                 subtitle: [j.name, start].compactMap { $0 }.joined(separator: " · "),
                                 unread: false, trailing: .text(j.crews.first ?? "")))
        }
        if let w = inbox.weather {
            var parts: [String] = []
            if let t = w.tempF { parts.append("\(t)°") }
            if let rain = w.rainFrom.flatMap({ TimeText.clock(hm: $0, style: .hourly) }) { parts.append("rain after \(rain)") }
            rows.append(InboxRow(id: "weather", icon: .cloudRain, tone: w.rainFrom == nil ? .muted : .warn, title: "Weather",
                                 subtitle: parts.joined(separator: " · "), unread: false, trailing: .text(w.site ?? "")))
        }
        return rows
    }

    // Live activity: a meeting within 15 minutes, else a job within 30

    public func liveActivity() -> LiveActivity? {
        if let m = nextMeeting, m.startsAt > now, m.startsAt.timeIntervalSince(now) <= 15 * 60 {
            return LiveActivity(icon: .video, tone: .ok, label: m.title, countdown: TimeText.countdown(from: now, to: m.startsAt))
        }
        for j in inbox.jobs where j.date == todayString && (j.mine ?? true) {
            guard let start = j.start.flatMap({ TimeText.date(on: now, hm: $0, calendar: calendar) }),
                  start > now, start.timeIntervalSince(now) <= 30 * 60 else { continue }
            return LiveActivity(icon: .hardHatSmall, tone: .brand, label: j.name, countdown: TimeText.countdown(from: now, to: start))
        }
        return nil
    }

    /// For "Preview state › Live activity": the next meeting whatever the hour.
    public func previewLiveActivity() -> LiveActivity {
        if let live = liveActivity() { return live }
        if let m = nextMeeting ?? inbox.meetings.sorted(by: { $0.startsAt < $1.startsAt }).first {
            return LiveActivity(icon: .video, tone: .ok, label: m.title, countdown: TimeText.countdown(from: now, to: max(now, m.startsAt)))
        }
        return LiveActivity(icon: .hardHatSmall, tone: .brand, label: "Nothing next", countdown: "—")
    }

    // Alert: the first weather hold today

    public func weatherHoldAlert() -> AlertContent? {
        guard let j = inbox.jobs.first(where: { $0.weather == "hold" && $0.date >= todayString }) else { return nil }
        let rain = inbox.weather?.rainFrom.flatMap { TimeText.clock(hm: $0, style: .hourly) }
        let sub = rain.map { "Rain likely from \($0). Call the day off, or keep it?" } ?? "Rain likely. Call the day off, or keep it?"
        return AlertContent(icon: .cloudRain, tone: .warn, status: "Weather hold", title: "\(j.project) · \(j.name)", subtitle: sub)
    }

    // The greeting's day line: jobs today · next meeting · rain (· tasks when there's room)

    public func dayLine() -> [String] {
        var parts: [String] = []
        let n = jobsToday.count
        parts.append(n == 0 ? "No jobs today" : n == 1 ? "1 job today" : "\(n) jobs today")
        if let m = meetingsLeftToday().first(where: { $0.startsAt > now }) {
            parts.append("\(m.title) at \(TimeText.clock(m.startsAt, calendar: calendar, style: .compact))")
        }
        if let w = inbox.weather, let hm = w.rainFrom, let start = TimeText.date(on: now, hm: hm, calendar: calendar) {
            if start > now {
                parts.append("Rain after \(TimeText.clock(start, calendar: calendar, style: .hourly))")
            } else {
                parts.append("Rain today")
            }
        }
        if parts.count < 3, tasksDueToday > 0 {
            parts.append(tasksDueToday == 1 ? "1 task waiting" : "\(tasksDueToday) tasks waiting")
        }
        return parts
    }
}
