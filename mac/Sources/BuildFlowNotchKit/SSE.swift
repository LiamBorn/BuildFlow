import Foundation

// MARK: - Server-sent events

public struct SSEEvent: Equatable {
    /// The `event:` field; "message" when there was none.
    public var event: String
    /// Every `data:` line of the event, joined with "\n".
    public var data: String
    public var id: String?

    public init(event: String = "message", data: String, id: String? = nil) {
        self.event = event
        self.data = data
        self.id = id
    }
}

public enum SSEItem: Equatable {
    case event(SSEEvent)
    /// A `:` line, such as the server's `: ping` every 25 s.
    case comment(String)
    /// A `retry:` field, in milliseconds.
    case retry(Int)
}

/// The text/event-stream parser (WHATWG HTML §9.2.6), fed bytes as they arrive.
///
/// Chunks can split anywhere: inside a line, between "\r" and "\n", inside a
/// multi-byte character. A line is decoded only once it is whole. One
/// deliberate difference from the spec: an event with a name but no `data:`
/// (the contract's `event: revoked` may come bare) is still dispatched.
public struct SSEParser {
    private var line = Data()
    private var skipLeadingLF = false
    private var atStart = true
    private var eventName = ""
    private var dataLines: [String] = []
    private var hasData = false
    private var lastEventId: String?

    public init() {}

    public mutating func feed(_ chunk: Data) -> [SSEItem] {
        var out: [SSEItem] = []
        for byte in chunk {
            if skipLeadingLF {
                skipLeadingLF = false
                if byte == 0x0A { continue }
            }
            if byte == 0x0A || byte == 0x0D {
                if byte == 0x0D { skipLeadingLF = true }
                if let item = takeLine() { out.append(item) }
            } else {
                line.append(byte)
            }
        }
        return out
    }

    public mutating func feed(_ text: String) -> [SSEItem] { feed(Data(text.utf8)) }

    /// The stream ended. A half-received event is dropped, as the spec says.
    public mutating func finish() -> [SSEItem] {
        line.removeAll()
        resetEvent()
        return []
    }

    private mutating func resetEvent() {
        eventName = ""
        dataLines = []
        hasData = false
    }

    private mutating func takeLine() -> SSEItem? {
        var text = String(decoding: line, as: UTF8.self)
        line.removeAll(keepingCapacity: true)
        if atStart {
            atStart = false
            if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
        }
        if text.isEmpty {
            // A blank line ends the event.
            defer { resetEvent() }
            guard hasData || !eventName.isEmpty else { return nil }
            return .event(SSEEvent(event: eventName.isEmpty ? "message" : eventName,
                                   data: dataLines.joined(separator: "\n"), id: lastEventId))
        }
        if text.hasPrefix(":") {
            var comment = String(text.dropFirst())
            if comment.hasPrefix(" ") { comment.removeFirst() }
            return .comment(comment)
        }
        let field: String
        var value: String
        if let colon = text.firstIndex(of: ":") {
            field = String(text[..<colon])
            value = String(text[text.index(after: colon)...])
            if value.hasPrefix(" ") { value.removeFirst() }
        } else {
            field = text
            value = ""
        }
        switch field {
        case "event":
            eventName = value
        case "data":
            dataLines.append(value)
            hasData = true
        case "id":
            if !value.contains("\u{0}") { lastEventId = value }
        case "retry":
            if !value.isEmpty, value.allSatisfy(\.isASCII), value.allSatisfy(\.isNumber), let ms = Int(value) { return .retry(ms) }
        default:
            break
        }
        return nil
    }
}

// MARK: - Reconnecting

/// The contract's reconnect schedule: 1, 2, 5, 10, then every 30 s.
public struct ReconnectBackoff: Equatable {
    public static let steps: [TimeInterval] = [1, 2, 5, 10, 30]
    public private(set) var attempt = 0

    public init() {}

    public mutating func next() -> TimeInterval {
        defer { attempt += 1 }
        return Self.steps[min(attempt, Self.steps.count - 1)]
    }

    /// A connection opened: start again from 1 s next time.
    public mutating func reset() { attempt = 0 }
}
