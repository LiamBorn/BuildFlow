import Foundation

// MARK: - What `POST /api/desktop/ask` streams back

/// A change BuildFlow suggests. Nothing happens until the person presses Accept.
public struct Proposal: Decodable, Equatable, Identifiable {
    public struct Change: Decodable, Equatable {
        /// start, date, crew, end
        public var field: String
        /// As the card shows them: "7 AM", "Monday, September 28", "Framing Crew A".
        public var from: JSONValue
        public var to: JSONValue
        /// As the data holds them: "07:00", "2026-09-28", a crew id.
        public var fromValue: JSONValue?
        public var toValue: JSONValue?

        public init(field: String, from: JSONValue, to: JSONValue, fromValue: JSONValue? = nil, toValue: JSONValue? = nil) {
            self.field = field
            self.from = from
            self.to = to
            self.fromValue = fromValue
            self.toValue = toValue
        }
    }

    public var id: String
    public var kind: String
    public var summary: String
    public var jobId: String
    public var jobName: String
    public var project: String
    public var change: Change
    public var expiresAt: Date?

    public init(id: String, kind: String = "schedule_change", summary: String, jobId: String, jobName: String,
                project: String, change: Change, expiresAt: Date? = nil) {
        self.id = id
        self.kind = kind
        self.summary = summary
        self.jobId = jobId
        self.jobName = jobName
        self.project = project
        self.change = change
        self.expiresAt = expiresAt
    }

    enum CodingKeys: String, CodingKey { case id, kind, summary, jobId, jobName, project, change, expiresAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = (try? c.decodeIfPresent(String.self, forKey: .kind)) ?? "schedule_change"
        summary = (try? c.decodeIfPresent(String.self, forKey: .summary)) ?? ""
        jobId = (try? c.decodeIfPresent(String.self, forKey: .jobId)) ?? ""
        jobName = (try? c.decodeIfPresent(String.self, forKey: .jobName)) ?? ""
        project = (try? c.decodeIfPresent(String.self, forKey: .project)) ?? ""
        change = try c.decode(Change.self, forKey: .change)
        expiresAt = (try? c.decodeIfPresent(String.self, forKey: .expiresAt)).flatMap { InboxDecoding.parseISO8601($0) }
    }

    /// "Oak Ridge · Framing"
    public var subject: String {
        [project, jobName].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// "starts", "ends", "moves", "crew"
    public var verb: String {
        switch change.field {
        case "start": return "starts"
        case "end": return "ends"
        case "date": return "moves"
        case "crew": return "crew"
        default: return change.field
        }
    }

    /// A value as the card shows it: "07:00" → "7:00 AM", "2026-09-29" → "Tue, Sep 29".
    public static func display(_ value: JSONValue, calendar: Calendar = .current) -> String {
        let s = value.text
        if let t = TimeText.parseHM(s) { return TimeText.clock(hour: t.hour, minute: t.minute, style: .full) }
        if s.count == 10, let d = DayString.date(s, calendar: calendar) { return TimeText.dayHeader(d, calendar: calendar) }
        if s.count == 16, s.dropFirst(10).first == "T", let d = DayString.date(String(s.prefix(10)), calendar: calendar),
           let t = TimeText.parseHM(String(s.suffix(5))) {
            return TimeText.dayHeader(d, calendar: calendar) + " " + TimeText.clock(hour: t.hour, minute: t.minute, style: .full)
        }
        if let instant = InboxDecoding.parseISO8601(s) {
            return TimeText.dayHeader(instant, calendar: calendar) + " " + TimeText.clock(instant, calendar: calendar, style: .full)
        }
        return s
    }
}

public enum AskEvent: Equatable {
    case text(String)
    case proposal(Proposal)
    /// "live" when Claude answered; "demo" when the server answered from the inbox alone.
    case done(mode: String)
    /// rate_limited, ai_unavailable, refused, bad_request
    case failed(code: String, message: String)

    /// Reads one server-sent event of the ask stream; nil for anything else.
    public static func from(_ e: SSEEvent) -> AskEvent? {
        let data = Data(e.data.utf8)
        func object() -> [String: JSONValue]? { try? JSONDecoder().decode([String: JSONValue].self, from: data) }
        switch e.event {
        case "text":
            guard let delta = object()?["delta"]?.stringValue else { return nil }
            return .text(delta)
        case "proposal":
            guard let p = try? JSONDecoder().decode(Proposal.self, from: data) else { return nil }
            return .proposal(p)
        case "done":
            return .done(mode: object()?["mode"]?.stringValue ?? "live")
        case "error":
            let o = object()
            return .failed(code: o?["code"]?.stringValue ?? "ai_unavailable", message: o?["message"]?.stringValue ?? "")
        default:
            return nil
        }
    }

    /// What the notch says for an `error` event: the server's own words, else these.
    public static func plainWords(code: String, message: String) -> String {
        if let words = said(message) { return words }
        switch code {
        case "rate_limited": return "That's 40 questions this hour, BuildFlow's limit. Ask again a little later."
        case "ai_unavailable": return "BuildFlow's AI isn't answering right now. Try again in a minute."
        case "refused": return message.isEmpty ? "BuildFlow can't help with that one." : message
        case "bad_request": return "BuildFlow couldn't read that question. Try asking it another way."
        default: return message.isEmpty ? "Something went wrong answering that. Try again." : message
        }
    }
}

// MARK: - The conversation so far

public struct Turn: Codable, Equatable {
    /// "user" or "assistant"
    public var role: String
    public var text: String

    public init(role: String, text: String) {
        self.role = role
        self.text = text
    }
}

/// The last few turns, sent as `history` so "and Thursday?" makes sense.
/// The contract allows at most six.
public struct ConversationHistory: Equatable {
    public static let limit = 6
    public private(set) var turns: [Turn] = []
    /// Forget a conversation left alone this long.
    public var staleAfter: TimeInterval = 10 * 60
    private var lastAt: Date?

    public init() {}

    /// The turns to send with a new question asked at `now`.
    public mutating func forQuestion(at now: Date) -> [Turn] {
        if let lastAt, now.timeIntervalSince(lastAt) > staleAfter { turns = [] }
        return Array(turns.suffix(Self.limit))
    }

    public mutating func record(question: String, answer: String, at now: Date) {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        let a = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        turns.append(Turn(role: "user", text: q))
        if !a.isEmpty { turns.append(Turn(role: "assistant", text: a)) }
        turns = Array(turns.suffix(Self.limit))
        lastAt = now
    }

    public mutating func clear() {
        turns = []
        lastAt = nil
    }
}

// MARK: - Speaking as the answer arrives

/// Cuts streamed text into sentences, so speech can start on the first one
/// while the rest is still being written.
///
/// A sentence ends at . ! or ? followed by a space or a new line, or at a line
/// break. It doesn't end after "St." or "Dr." and friends, a single initial,
/// or inside "a.m." — and a full stop is only final once the next character
/// has arrived, so "0.30" is never cut.
public struct SentenceSplitter {
    static let abbreviations: Set<String> = [
        "st", "dr", "mr", "mrs", "ms", "ave", "rd", "blvd", "ln", "hwy", "mt", "ft", "vs", "etc",
        "approx", "dept", "est", "inc", "co", "jr", "sr", "e.g", "i.e", "a.m", "p.m", "u.s", "jan", "feb",
        "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "mon", "tue", "tues", "wed",
        "thu", "thur", "thurs", "fri", "sat", "sun",
    ]
    /// A run-on answer is spoken in pieces no longer than this.
    public var maxLength = 260
    private var buffer = ""

    public init() {}

    public mutating func feed(_ delta: String) -> [String] {
        buffer += delta
        var out: [String] = []
        while let cut = nextCut() {
            let sentence = String(buffer[..<cut]).trimmingCharacters(in: .whitespacesAndNewlines)
            buffer = String(buffer[cut...])
            if !sentence.isEmpty { out.append(sentence) }
        }
        return out
    }

    /// The answer is complete: whatever is left is the last sentence.
    public mutating func flush() -> String? {
        let rest = buffer.trimmingCharacters(in: .whitespacesAndNewlines)
        buffer = ""
        return rest.isEmpty ? nil : rest
    }

    private func nextCut() -> String.Index? {
        var i = buffer.startIndex
        while i < buffer.endIndex {
            let ch = buffer[i]
            let next = buffer.index(after: i)
            if ch == "\n" { return next }
            if ch == "." || ch == "!" || ch == "?" {
                // Swallow closing quotes and brackets that belong to the sentence.
                var end = next
                while end < buffer.endIndex, "\"'”’)]".contains(buffer[end]) { end = buffer.index(after: end) }
                guard end < buffer.endIndex else { return nil }          // wait for what follows
                if buffer[end].isWhitespace, ch != "." || !isAbbreviation(endingAt: i) {
                    return end
                }
            }
            i = next
        }
        if buffer.count > maxLength {
            // No sentence end in sight: cut after the last comma or space in range.
            let limit = buffer.index(buffer.startIndex, offsetBy: maxLength)
            let head = buffer[..<limit]
            if let comma = head.lastIndex(of: ",") { return buffer.index(after: comma) }
            if let space = head.lastIndex(of: " ") { return buffer.index(after: space) }
            return limit
        }
        return nil
    }

    /// Is the "." at `dot` the end of an abbreviation (or an initial) rather than a sentence?
    private func isAbbreviation(endingAt dot: String.Index) -> Bool {
        var start = dot
        while start > buffer.startIndex {
            let prev = buffer.index(before: start)
            let c = buffer[prev]
            if c.isLetter || c == "." { start = prev } else { break }
        }
        let word = buffer[start..<dot].lowercased()
        if word.isEmpty { return false }
        if abbreviationsContains(word) { return true }
        // A single capital letter: an initial, as in "J. Smith".
        if word.count == 1, let c = buffer[start..<dot].first, c.isUppercase { return true }
        return false
    }

    private func abbreviationsContains(_ word: String) -> Bool {
        Self.abbreviations.contains(word)
    }
}
