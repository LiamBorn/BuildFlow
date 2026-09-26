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

    /// Accepts the server's colour words (blue, green, amber, red, violet, slate) as well as the tone names.
    public static func from(_ word: String?) -> NotchTone {
        switch word?.lowercased() {
        case "green", "ok": return .ok
        case "amber", "yellow", "warn": return .warn
        case "red", "bad": return .bad
        case "purple", "violet", "info": return .info
        case "orange", "brand": return .brand
        default: return .muted          // blue, slate: news, not a call to act
        }
    }
}

/// A button at the end of a task row.
public struct RowButton: Equatable, Identifiable {
    public var id: String
    public var label: String
    public var primary: Bool

    public init(id: String, label: String, primary: Bool) {
        self.id = id
        self.label = label
        self.primary = primary
    }
}

public enum RowTrailing: Equatable {
    case none
    case text(String)
    case twoLine(String, String)
    case join(String?)
    case buttons([RowButton])
}

/// What a row is about, so the app can open it (and mark it read).
public enum RowTarget: Equatable {
    case notification(String)
    case job(String)
    case meeting(String)
    case task(String)
}

public struct InboxRow: Equatable, Identifiable {
    public var id: String
    public var icon: NotchIcon
    public var tone: NotchTone
    public var title: String
    public var subtitle: String
    public var unread: Bool
    public var trailing: RowTrailing
    public var target: RowTarget?

    public init(id: String, icon: NotchIcon, tone: NotchTone, title: String, subtitle: String,
                unread: Bool = false, trailing: RowTrailing = .none, target: RowTarget? = nil) {
        self.id = id
        self.icon = icon
        self.tone = tone
        self.title = title
        self.subtitle = subtitle
        self.unread = unread
        self.trailing = trailing
        self.target = target
    }
}

public enum InboxTab: String, CaseIterable {
    case notifications, jobs, meetings, tasks
}

public struct CardContent: Equatable {
    public var title: String
    public var note: String
    public var rows: [InboxRow]
    /// Shown instead of rows when there are none.
    public var empty: String

    public init(title: String, note: String, rows: [InboxRow], empty: String = "") {
        self.title = title
        self.note = note
        self.rows = rows
        self.empty = empty
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
    /// The notification it came from, if any.
    public var notificationId: String?

    public init(icon: NotchIcon, tone: NotchTone, status: String, title: String, subtitle: String, notificationId: String? = nil) {
        self.icon = icon
        self.tone = tone
        self.status = status
        self.title = title
        self.subtitle = subtitle
        self.notificationId = notificationId
    }
}

// MARK: - The voice state

/// BuildFlow's proposal card: Edit · Reject · Accept.
public struct ProposalCard: Equatable {
    public enum Phase: Equatable {
        case open
        case working
        /// Settled, with what to say and whether it went through.
        case settled(String, ok: Bool)
    }

    public var id: String
    public var jobId: String
    public var subject: String
    public var verb: String
    public var from: String
    public var to: String
    public var phase: Phase

    public init(id: String, jobId: String, subject: String, verb: String, from: String, to: String, phase: Phase = .open) {
        self.id = id
        self.jobId = jobId
        self.subject = subject
        self.verb = verb
        self.from = from
        self.to = to
        self.phase = phase
    }

    /// The server's display words (`from`, `to`) as given; the raw values only when those are missing.
    public init(_ p: Proposal, calendar: Calendar = .current) {
        func words(_ shown: JSONValue, _ raw: JSONValue?) -> String {
            if !shown.text.isEmpty { return Proposal.display(shown, calendar: calendar) }
            return raw.map { Proposal.display($0, calendar: calendar) } ?? ""
        }
        self.init(id: p.id, jobId: p.jobId, subject: p.subject, verb: p.verb,
                  from: words(p.change.from, p.change.fromValue), to: words(p.change.to, p.change.toValue))
    }
}

/// A button the voice state offers when something stands in the way.
public enum VoiceButton: Equatable {
    case connect
    case openPrivacy(String)
    case send
}

public struct VoiceContent: Equatable {
    public var status: String
    /// What you said: the live transcript while you talk.
    public var question: String
    public var answer: String
    public var proposal: ProposalCard?
    /// A small note, e.g. "AI not connected".
    public var hint: String?
    /// The sound bars move while the microphone is open.
    public var listening: Bool
    public var button: VoiceButton?

    public init(status: String, question: String = "", answer: String = "", proposal: ProposalCard? = nil,
                hint: String? = nil, listening: Bool = false, button: VoiceButton? = nil) {
        self.status = status
        self.question = question
        self.answer = answer
        self.proposal = proposal
        self.hint = hint
        self.listening = listening
        self.button = button
    }

    public static let idle = VoiceContent(status: "Ready", answer: "Hold ⌃ ⌥ and ask about your schedule.")

    /// The mock-up's voice card, shown in the preview menu and the not-connected snapshots.
    public static let example = VoiceContent(
        status: "Answering",
        question: "What's Crew 2 doing tomorrow?",
        answer: "Crew 2 is framing at Oak Ridge tomorrow, 7:00 to 3:30. Rain is likely after 2 PM, so starting an hour early would finish the day dry.",
        proposal: ProposalCard(id: "example", jobId: "j32", subject: "Oak Ridge · Framing", verb: "starts", from: "7:00", to: "6:00 AM"))
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

    /// Not yet shown to this person: the same number as the website bell's badge.
    public var unseenCount: Int { inbox.notifications.filter { !$0.seen }.count + hiddenUnseen }
    public var unreadCount: Int { inbox.notifications.filter { !$0.read }.count }

    /// Unseen notifications the server counted but left out of the (cut) list.
    var hiddenUnseen: Int {
        guard let counts = inbox.counts, counts.notifications > inbox.notifications.count else { return 0 }
        return max(0, counts.unseen - inbox.notifications.filter { !$0.seen }.count)
    }

    /// Tasks due today, overdue, or undated.
    public var tasksDueToday: Int { inbox.tasks.filter { isDueToday($0) }.count }

    public func count(for tab: InboxTab) -> Int? {
        switch tab {
        case .notifications: return unseenCount > 0 ? unseenCount : nil
        case .tasks: return tasksDueToday > 0 ? tasksDueToday : nil
        case .jobs, .meetings: return nil
        }
    }

    public func card(for tab: InboxTab, limit: Int = 40) -> CardContent {
        switch tab {
        case .notifications:
            return CardContent(title: "Notifications", note: unreadCount > 0 ? "Mark all read" : "All read",
                               rows: notificationRows(limit: limit), empty: "Nothing new.")
        case .jobs:
            return CardContent(title: "Upcoming jobs", note: "Mine first", rows: jobRows(limit: limit),
                               empty: "No jobs in the next seven days.")
        case .meetings:
            return CardContent(title: "Meetings", note: calendarsNote, rows: meetingRows(limit: limit),
                               empty: (inbox.calendar?.connected ?? []).isEmpty
                                   ? "Connect Google or Outlook in BuildFlow to see meetings here."
                                   : "No more meetings this week.")
        case .tasks:
            return CardContent(title: "Waiting on you", note: "\(tasksDueToday) today", rows: taskRows(limit: limit),
                               empty: "Nothing is waiting on you.")
        }
    }

    /// "Google Calendar", "Outlook"
    public static func calendarName(_ provider: String?) -> String {
        switch provider?.lowercased() {
        case "google": return "Google Calendar"
        case "microsoft", "outlook": return "Outlook"
        default: return "Calendar"
        }
    }

    /// "Google + Outlook"
    public var calendarsNote: String {
        let names = (inbox.calendar?.connected ?? []).map { p -> String in
            switch p.lowercased() {
            case "google": return "Google"
            case "microsoft", "outlook": return "Outlook"
            default: return p.capitalized
            }
        }
        return names.joined(separator: " + ")
    }

    // Notifications, newest first as the server sends them

    public func notificationRows(limit: Int = 40) -> [InboxRow] {
        inbox.notifications.prefix(limit).map { n in
            InboxRow(id: n.id, icon: Self.icon(forNotificationKind: n.kind), tone: NotchTone.from(n.tone),
                     title: n.title, subtitle: n.sub, unread: !n.read,
                     trailing: .text(n.atDay.map(dayLabel) ?? TimeText.age(from: n.at, to: now)),
                     target: .notification(n.id))
        }
    }

    public static func icon(forNotificationKind kind: String?) -> NotchIcon {
        switch kind {
        case "delayIQ": return .triangleAlert
        case "fieldUpdate": return .activity
        case "inspection": return .checkSquare
        case "weatherConflict", "weatherAlert": return .cloudRain
        case "assignment", "booking": return .calendar
        case "material", "equipment": return .hardHatSmall
        default: return .bell
        }
    }

    public static func label(forNotificationKind kind: String?) -> String? {
        switch kind {
        case "delayIQ": return "DelayIQ"
        case "fieldUpdate": return "Field update"
        case "inspection": return "Inspection"
        case "weatherConflict": return "WeatherIQ"
        case "weatherAlert": return "Weather alert"
        case "assignment", "booking": return "Schedule"
        case "material": return "Materials"
        case "equipment": return "Equipment"
        default: return nil
        }
    }

    // Jobs: today and the next 6 days, mine first

    public func upcomingJobs() -> [InboxJob] {
        let last = calendar.date(byAdding: .day, value: 6, to: today) ?? today
        let lastString = DayString.string(last, calendar: calendar)
        return inbox.jobs
            .filter { $0.date >= todayString && $0.date <= lastString }
            .sorted { a, b in
                if a.mine != b.mine { return a.mine }
                if a.date != b.date { return a.date < b.date }
                return (a.start ?? "99:99") < (b.start ?? "99:99")
            }
    }

    public var jobsToday: [InboxJob] { inbox.jobs.filter { $0.date == todayString } }

    /// "Rain hold", "Wind watch", "Called off"
    public static func weatherWord(_ w: JobWeather) -> String {
        if w.status == "cancelled" { return "Called off" }
        return "\(causeWord(w.cause)) \(w.severity == "hold" ? "hold" : "watch")"
    }

    /// The cause as the start of a sentence: "Rain", "Storms", "Freezing".
    public static func causeWord(_ cause: String) -> String {
        switch cause {
        case "lightning": return "Storms"
        case "cold": return "Freezing"
        default: return cause.prefix(1).uppercased() + cause.dropFirst()
        }
    }

    public func jobRows(limit: Int = 40) -> [InboxRow] {
        upcomingJobs().prefix(limit).map { j in
            let crew = j.crews.isEmpty ? "No crew" : j.crews.joined(separator: ", ")
            let state = j.weather.map(Self.weatherWord) ?? j.status
            let subtitle = [j.project, crew, state ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
            let weatherTone: NotchTone? = j.weather.map { $0.status == "cancelled" ? .info : $0.severity == "hold" ? .bad : .warn }
            return InboxRow(id: j.id, icon: j.weather == nil ? .hardHatSmall : .cloudRain, tone: weatherTone ?? .brand,
                            title: j.name, subtitle: subtitle, unread: false,
                            trailing: .twoLine(dayLabel(j.date), j.start.flatMap { TimeText.clock(hm: $0, style: .compact) } ?? ""),
                            target: .job(j.id))
        }
    }

    func dayLabel(_ day: String) -> String {
        if day == todayString { return "Today" }
        guard let d = DayString.date(day, calendar: calendar) else { return day }
        let days = calendar.dateComponents([.day], from: today, to: d).day ?? 0
        if days == -1 { return "Yesterday" }
        return (0..<7).contains(days) || (-6..<0).contains(days)
            ? TimeText.weekdayShort(d, calendar: calendar) : TimeText.monthDay(d, calendar: calendar)
    }

    // Meetings

    /// Meetings that haven't ended (and you haven't declined), soonest first.
    public func meetingsAhead() -> [InboxMeeting] {
        inbox.meetings
            .filter { $0.myResponse != "declined" && $0.endsAt > now }
            .sorted { a, b in
                if a.allDay != b.allDay { return !a.allDay }
                return a.startsAt < b.startsAt
            }
    }

    /// Today's timed meetings that haven't ended, in order.
    public func meetingsLeftToday() -> [InboxMeeting] {
        meetingsAhead().filter { !$0.allDay && calendar.isDate($0.startsAt, inSameDayAs: now) }
    }

    public var nextMeeting: InboxMeeting? {
        meetingsLeftToday().first
    }

    public func meetingRows(limit: Int = 40) -> [InboxRow] {
        let joinId = meetingsLeftToday().first(where: { $0.joinUrl != nil })?.id
        return meetingsAhead().prefix(limit).map { m in
            let joinable = m.id == joinId
            let when: String
            if m.allDay {
                when = "All day"
            } else if calendar.isDate(m.startsAt, inSameDayAs: now) {
                when = TimeText.clock(m.startsAt, calendar: calendar, style: .full)
            } else {
                when = dayLabel(DayString.string(m.startsAt, calendar: calendar)) + " " + TimeText.clock(m.startsAt, calendar: calendar, style: .compact)
            }
            let place = [m.conference ?? m.location, m.conference != nil ? m.location : nil]
                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            let subtitle = place.isEmpty ? Self.calendarName(m.provider) : place
            return InboxRow(id: m.id, icon: joinable ? .video : .calendarPlain, tone: joinable ? .ok : .muted,
                            title: m.title, subtitle: subtitle, unread: false,
                            trailing: joinable ? .join(m.joinUrl) : .text(when),
                            target: .meeting(m.id))
        }
    }

    // Tasks

    func isDueToday(_ t: InboxTask) -> Bool {
        guard let day = t.dueDay else { return true }
        return day <= todayString
    }

    func dueSortKey(_ t: InboxTask) -> String {
        guard let due = t.due else { return "0000" }                 // undated first: it's waiting now
        return due.count >= 16 ? due : due + "T99:99"
    }

    public func taskRows(limit: Int = 40) -> [InboxRow] {
        inbox.tasks.enumerated().sorted { a, b in
            let ka = dueSortKey(a.element), kb = dueSortKey(b.element)
            return ka == kb ? a.offset < b.offset : ka < kb
        }.map(\.element).prefix(limit).map { t in
            let icon: NotchIcon = {
                switch t.kind {
                case "weather-call": return .cloudRainSmall
                case "time-cards": return .clock
                case "schedule-change": return .activity
                case "unbooked-job": return .hardHatSmall
                default: return .listSmall
                }
            }()
            let due = dueLabel(t)
            let buttons = t.actions.enumerated().map { RowButton(id: $0.element.id, label: $0.element.label, primary: $0.offset == 0) }
            let subtitle = buttons.isEmpty ? t.detail : [due, t.detail].filter { !$0.isEmpty }.joined(separator: " · ")
            return InboxRow(id: t.id, icon: icon, tone: NotchTone.from(t.tone), title: t.title, subtitle: subtitle,
                            unread: false, trailing: buttons.isEmpty ? .text(due) : .buttons(buttons), target: .task(t.id))
        }
    }

    /// "By 2 PM", "Today", "Fri", "Tue 7 AM"
    func dueLabel(_ t: InboxTask) -> String {
        guard let day = t.dueDay else { return "" }
        if let hm = t.dueClock, let c = TimeText.parseHM(hm) {
            let time = TimeText.clock(hour: c.hour, minute: c.minute, style: .hourly)
            return day == todayString ? "By " + time : dayLabel(day) + " " + time
        }
        if day < todayString { return "Overdue" }
        return dayLabel(day)
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
        let mine = upcomingJobs().filter(\.mine)
        let todays = mine.filter { $0.date == todayString }
        let ahead = todays.first(where: { j in
            guard let s = j.start, let d = TimeText.date(on: now, hm: s, calendar: calendar) else { return true }
            return d > now
        })
        return ahead ?? todays.first ?? mine.first
    }

    /// The first weather at today's sites that still matters (not called off), earliest first.
    public var weatherToday: (job: InboxJob, weather: JobWeather)? {
        jobsToday
            .compactMap { j in j.weather.flatMap { $0.status == "cancelled" ? nil : (j, $0) } }
            .sorted { $0.1.start < $1.1.start }
            .first
    }

    public func todayRows() -> [InboxRow] {
        var rows: [InboxRow] = []
        let m = nextMeeting
        rows.append(InboxRow(id: "up-next", icon: .video, tone: .ok, title: "Up next", subtitle: upNextText(),
                             unread: false, trailing: m?.joinUrl != nil ? .join(m?.joinUrl) : .none,
                             target: m.map { .meeting($0.id) }))
        if let j = nextJob {
            let start = j.start.flatMap { TimeText.clock(hm: $0, style: .compact) }
            rows.append(InboxRow(id: "next-job", icon: .hardHatSmall, tone: .brand, title: "Next job",
                                 subtitle: [j.name, j.date == todayString ? start : dayLabel(j.date) + (start.map { " " + $0 } ?? "")]
                                     .compactMap { $0 }.joined(separator: " · "),
                                 unread: false, trailing: .text(j.crews.first ?? "No crew"), target: .job(j.id)))
        }
        if let (job, w) = weatherToday {
            let from = w.startClock.flatMap { TimeText.clock(hm: $0, style: .hourly) }
            let text = (from.map { "\(Self.causeWord(w.cause)) from \($0)" } ?? "\(Self.causeWord(w.cause)) today") + " · " + job.project
            rows.append(InboxRow(id: "weather", icon: .cloudRain, tone: w.severity == "hold" ? .bad : .warn, title: "Weather",
                                 subtitle: text, unread: false, trailing: .text(w.severity == "hold" ? "Hold" : "Watch"),
                                 target: .job(job.id)))
        } else if !inbox.tasks.isEmpty {
            let n = inbox.tasks.count
            rows.append(InboxRow(id: "waiting", icon: .listSmall, tone: .brand, title: "Waiting on you",
                                 subtitle: n == 1 ? "1 task" : "\(n) tasks", unread: false, trailing: .none))
        }
        return rows
    }

    // Live activity: a meeting within 15 minutes, else one of my jobs within 30

    public func liveActivity() -> LiveActivity? {
        if let m = nextMeeting, m.startsAt > now, m.startsAt.timeIntervalSince(now) <= 15 * 60 {
            return LiveActivity(icon: .video, tone: .ok, label: m.title, countdown: TimeText.countdown(from: now, to: m.startsAt))
        }
        let starts = jobsToday.filter(\.mine).compactMap { j -> (InboxJob, Date)? in
            guard let s = j.start, let d = TimeText.date(on: now, hm: s, calendar: calendar),
                  d > now, d.timeIntervalSince(now) <= 30 * 60 else { return nil }
            return (j, d)
        }.sorted { $0.1 < $1.1 }
        if let (j, d) = starts.first {
            return LiveActivity(icon: .hardHatSmall, tone: .brand, label: j.name, countdown: TimeText.countdown(from: now, to: d))
        }
        return nil
    }

    /// For "Preview state › Live activity": the next meeting whatever the hour.
    public func previewLiveActivity() -> LiveActivity {
        if let live = liveActivity() { return live }
        if let m = nextMeeting ?? meetingsAhead().first(where: { !$0.allDay }) {
            return LiveActivity(icon: .video, tone: .ok, label: m.title, countdown: TimeText.countdown(from: now, to: max(now, m.startsAt)))
        }
        return LiveActivity(icon: .hardHatSmall, tone: .brand, label: "Nothing next", countdown: "—")
    }

    // Alerts

    /// A notification as the alert that drops down for it.
    public static func alert(for n: InboxNotification) -> AlertContent {
        let tone = NotchTone.from(n.tone)
        let status: String
        switch n.kind {
        case "weatherConflict": status = n.tone == "red" ? "Weather hold" : n.tone == "violet" ? "Called off" : "Weather watch"
        default: status = label(forNotificationKind: n.kind) ?? "BuildFlow"
        }
        return AlertContent(icon: icon(forNotificationKind: n.kind), tone: tone, status: status, title: n.title,
                            subtitle: n.sub, notificationId: n.id)
    }

    /// The preview's alert: the first red or amber notification, else the first weather hold.
    public func previewAlert() -> AlertContent? {
        if let n = inbox.notifications.first(where: { $0.alertable && ["red", "amber"].contains($0.tone) }) {
            return Self.alert(for: n)
        }
        return weatherHoldAlert()
    }

    public func weatherHoldAlert() -> AlertContent? {
        guard let j = inbox.jobs.first(where: { $0.weather?.severity == "hold" && $0.date >= todayString }), let w = j.weather else { return nil }
        let from = w.startClock.flatMap { TimeText.clock(hm: $0, style: .hourly) }
        let cause = Self.causeWord(w.cause)
        let sub = from.map { "\(cause) likely from \($0). Call the day off, or keep it?" } ?? "\(cause) likely. Call the day off, or keep it?"
        return AlertContent(icon: .cloudRain, tone: .warn, status: "Weather hold", title: "\(j.project) · \(j.name)", subtitle: sub)
    }

    // The greeting's day line: jobs today · next meeting · weather (· tasks when there's room)

    public func dayLine() -> [String] {
        var parts: [String] = []
        let n = jobsToday.count
        parts.append(n == 0 ? "No jobs today" : n == 1 ? "1 job today" : "\(n) jobs today")
        if let m = meetingsLeftToday().first(where: { $0.startsAt > now }) {
            parts.append("\(m.title) at \(TimeText.clock(m.startsAt, calendar: calendar, style: .compact))")
        }
        if let (_, w) = weatherToday {
            let cause = Self.causeWord(w.cause)
            if let hm = w.startClock, let start = TimeText.date(on: now, hm: hm, calendar: calendar), start > now {
                parts.append("\(cause) after \(TimeText.clock(start, calendar: calendar, style: .hourly))")
            } else {
                parts.append("\(cause) today")
            }
        }
        if parts.count < 3, tasksDueToday > 0 {
            parts.append(tasksDueToday == 1 ? "1 task waiting" : "\(tasksDueToday) tasks waiting")
        }
        return parts
    }
}
