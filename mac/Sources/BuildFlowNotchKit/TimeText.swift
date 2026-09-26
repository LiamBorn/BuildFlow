import Foundation

/// Small, locale-free time wording, so the notch reads the same everywhere and
/// the checks can pin it down exactly.
public enum TimeText {
    public enum Style {
        /// "7:00" in the morning, "3:30 PM" after noon (jobs, the greeting's day line).
        case compact
        /// "9:30 AM", "1:00 PM" (meeting rows).
        case full
        /// "2 PM", "2:30 PM" (rain, due times).
        case hourly
    }

    public static func clock(hour: Int, minute: Int, style: Style) -> String {
        let pm = hour >= 12
        var h12 = hour % 12
        if h12 == 0 { h12 = 12 }
        let mm = String(format: "%02d", minute)
        switch style {
        case .compact:
            return pm ? "\(h12):\(mm) PM" : "\(h12):\(mm)"
        case .full:
            return "\(h12):\(mm) \(pm ? "PM" : "AM")"
        case .hourly:
            return minute == 0 ? "\(h12) \(pm ? "PM" : "AM")" : "\(h12):\(mm) \(pm ? "PM" : "AM")"
        }
    }

    public static func clock(_ date: Date, calendar: Calendar, style: Style) -> String {
        let c = calendar.dateComponents([.hour, .minute], from: date)
        return clock(hour: c.hour ?? 0, minute: c.minute ?? 0, style: style)
    }

    /// "07:00" → (7, 0)
    public static func parseHM(_ s: String) -> (hour: Int, minute: Int)? {
        let parts = s.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]),
              (0...23).contains(h), (0...59).contains(m) else { return nil }
        return (h, m)
    }

    public static func clock(hm: String, style: Style) -> String? {
        parseHM(hm).map { clock(hour: $0.hour, minute: $0.minute, style: style) }
    }

    /// The date at "HH:mm" on the same calendar day as `day`.
    public static func date(on day: Date, hm: String, calendar: Calendar) -> Date? {
        guard let t = parseHM(hm) else { return nil }
        return calendar.date(bySettingHour: t.hour, minute: t.minute, second: 0, of: day)
    }

    /// "now", "12m", "1h", "3d"
    public static func age(from then: Date, to now: Date) -> String {
        let minutes = Int(max(0, now.timeIntervalSince(then)) / 60)
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        return "\(hours / 24)d"
    }

    /// The live activity's countdown: "4:52" under an hour, "1:05:00" beyond.
    public static func countdown(from now: Date, to then: Date) -> String {
        let total = Int(max(0, then.timeIntervalSince(now)).rounded(.up))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    /// "Sat, Sep 26"
    public static func dayHeader(_ date: Date, calendar: Calendar) -> String {
        format(date, "EEE, MMM d", calendar)
    }

    /// "Mon"
    public static func weekdayShort(_ date: Date, calendar: Calendar) -> String {
        format(date, "EEE", calendar)
    }

    /// "Oct 9"
    public static func monthDay(_ date: Date, calendar: Calendar) -> String {
        format(date, "MMM d", calendar)
    }

    static func format(_ date: Date, _ pattern: String, _ calendar: Calendar) -> String {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = pattern
        return f.string(from: date)
    }
}
