import Foundation

/// Any JSON value. A task's `request.body` and a proposal's `from` / `to` are
/// passed through as the server wrote them, so the Mac never has to know their
/// shape to send them back.
public enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Not a JSON value")
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(b): try c.encode(b)
        case let .int(i): try c.encode(i)
        case let .double(d): try c.encode(d)
        case let .string(s): try c.encode(s)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        }
    }

    /// The value as words, for a proposal's "from" and "to".
    public var text: String {
        switch self {
        case .null: return ""
        case let .bool(b): return b ? "yes" : "no"
        case let .int(i): return String(i)
        case let .double(d): return d == d.rounded() ? String(Int(d)) : String(d)
        case let .string(s): return s
        case let .array(a): return a.map(\.text).joined(separator: ", ")
        case let .object(o):
            for key in ["name", "label", "title", "id"] { if let v = o[key] { return v.text } }
            return ""
        }
    }

    public var stringValue: String? {
        if case let .string(s) = self { return s }
        return nil
    }
}
