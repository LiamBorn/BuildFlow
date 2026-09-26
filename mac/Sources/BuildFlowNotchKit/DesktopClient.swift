import Foundation

// MARK: - Shapes the device API answers with

public struct DesktopDevice: Decodable, Equatable {
    public struct Workspace: Decodable, Equatable {
        public var id: String
        public var name: String
    }

    public var id: String
    public var name: String
    public var platform: String?
    public var appVersion: String?
    public var workspace: Workspace?
    public var revokedAt: String?
}

/// `GET /api/desktop/me`
public struct DesktopMe: Decodable, Equatable {
    public var firstName: String
    public var name: String
    public var workspace: String
    public var role: String?
    public var device: DesktopDevice?

    public init(firstName: String, name: String, workspace: String, role: String? = nil, device: DesktopDevice? = nil) {
        self.firstName = firstName
        self.name = name
        self.workspace = workspace
        self.role = role
        self.device = device
    }
}

struct TokenResponse: Decodable {
    var key: String
    var device: DesktopDevice?
}

/// An error body: `{ error, code, message?, needs? }`.
struct ErrorBody: Decodable {
    var error: String?
    var code: String?
    var message: String?
    var needs: [String]?
}

// MARK: - What can go wrong, in plain words

public enum DesktopError: Error, Equatable {
    /// There is no key for this server: Connect first.
    case notConnected
    /// 401: the key is gone (already deleted from the Keychain). `code` is
    /// device_key_required, device_key_invalid or device_revoked.
    case unauthorized(code: String?)
    case http(status: Int, code: String?, message: String?, retryAfter: TimeInterval?)
    /// The server couldn't be reached.
    case network(String)
    case badResponse(String)

    public var status: Int? {
        if case let .http(status, _, _, _) = self { return status }
        if case .unauthorized = self { return 401 }
        return nil
    }

    public var code: String? {
        switch self {
        case let .unauthorized(code): return code
        case let .http(_, code, _, _): return code
        default: return nil
        }
    }

    /// For anything the device key does after Connect.
    public var plainWords: String {
        switch self {
        case .notConnected:
            return "This Mac isn't connected to BuildFlow yet."
        case let .unauthorized(code):
            return code == "device_revoked"
                ? "This Mac was disconnected from BuildFlow. Connect it again to see your inbox."
                : "This Mac isn't connected to BuildFlow any more. Connect it again to see your inbox."
        case let .http(status, code, message, retryAfter):
            if status == 429 { return Self.waitWords(retryAfter) }
            if status == 404 && code == nil { return "This BuildFlow server doesn't have that for Macs yet." }
            if status >= 500 { return "BuildFlow's server had a problem. It will try again shortly." }
            if let message, !message.isEmpty { return message }
            return "BuildFlow answered with an error (\(status))."
        case .network:
            return "Can't reach BuildFlow. Check the internet connection; it will keep trying."
        case .badResponse:
            return "BuildFlow sent something this app couldn't read. Updating the app may help."
        }
    }

    /// For the answer to `POST /api/desktop/token`, the end of Connect.
    public var connectWords: String {
        switch self {
        case let .http(status, code, message, retryAfter):
            switch (status, code) {
            case (400, "invalid_grant"):
                return "That connection expired or was already used. Choose Connect this Mac… again."
            case (400, _):
                return "BuildFlow couldn't finish connecting this Mac. Choose Connect this Mac… again."
            case (403, "demo_account"):
                return "The demo workspace can't connect a Mac. Sign in to BuildFlow with your own account, then connect again."
            case (409, "device_limit"):
                return message.flatMap { $0.isEmpty ? nil : $0 }
                    ?? "This account already has the most Macs it can connect. Disconnect one in BuildFlow under Settings › Devices."
            case (429, _):
                return Self.waitWords(retryAfter)
            default:
                return plainWords
            }
        default:
            return plainWords
        }
    }

    static func waitWords(_ retryAfter: TimeInterval?) -> String {
        guard let s = retryAfter, s > 0 else { return "Too many tries in a row. Wait a few minutes, then try again." }
        let minutes = Int((s / 60).rounded(.up))
        if s < 90 { return "Too many tries in a row. Wait a minute, then try again." }
        return "Too many tries in a row. Wait \(minutes) minutes, then try again."
    }
}

// MARK: - Answers the Mac acts on

public enum InboxFetch: Equatable {
    case fresh(InboxSnapshot, etag: String?)
    /// 304: nothing changed since the last read, which is handed back.
    case notModified(InboxSnapshot)

    public var inbox: InboxSnapshot {
        switch self {
        case let .fresh(i, _): return i
        case let .notModified(i): return i
        }
    }
}

/// The server's own words, when it sent some.
func said(_ s: String?) -> String? {
    guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
    return t
}

public enum TaskOutcome: Equatable {
    case done(etag: String?)
    /// 404 task_gone: the task is already gone, or the action no longer applies.
    case gone
    /// 404 no_user: this login has no row on the workspace's team.
    case notOnTeam
    /// 403, with the server's words.
    case forbidden(String?)
    /// 409: the record moved since the inbox was read.
    case conflict(String?)
    /// 400: still needs these fields.
    case needs([String])
    case failed(String)

    public func plainWords(label: String, title: String) -> String {
        switch self {
        case .done: return "Done: \(label.lowercased()) · \(title)"
        case .gone: return "That's already been handled, so nothing changed."
        case .notOnTeam: return "This login isn't on the workspace's team yet, so BuildFlow can't answer for you. An Owner or Admin can add you."
        case let .forbidden(message): return said(message) ?? "Your role can't do that. An Owner or Admin can."
        case let .conflict(message): return said(message) ?? "Someone changed this since your inbox was read. Nothing changed; take another look."
        case let .needs(fields): return fields.contains("crewId") ? "Choose a crew first." : "BuildFlow needs more before it can do that."
        case let .failed(words): return words
        }
    }
}

public enum ProposalOutcome: Equatable {
    case accepted
    case rejected
    /// 404 proposal_gone: expired, used, or someone else's.
    case gone
    /// 409 (stale, clash or gone): the job changed since; the proposal is spent.
    case conflict(String?)
    /// 403: the proposal isn't spent, but this role can't apply it.
    case forbidden(String?)
    case failed(String)

    public var plainWords: String {
        switch self {
        case .accepted: return "Done. The schedule is updated."
        case .rejected: return "Rejected. Nothing changed."
        case .gone: return "That suggestion has expired. Nothing changed; ask again."
        case let .conflict(message):
            let why = said(message) ?? "The job changed since this was suggested."
            return why + (why.lowercased().contains("nothing was changed") || why.lowercased().contains("nothing changed") ? " Ask again." : " Nothing changed; ask again.")
        case let .forbidden(message): return said(message) ?? "Your role can't change this job. An Owner or Admin can."
        case let .failed(words): return words
        }
    }
}

/// One signal from a text/event-stream connection.
public enum StreamSignal: Equatable {
    /// 200 and the stream has started.
    case opened
    case item(SSEItem)
}

// MARK: - The client

/// Everything the Mac says to BuildFlow after Connect: bearer auth, JSON,
/// server-sent events, ETags, the app-version header, and 401 handling (any
/// 401 deletes the key, then `onUnauthorized` runs).
public final class DesktopClient {
    public static let appVersionHeader = "X-BuildFlow-App-Version"
    /// The server takes a question of 1–2000 characters.
    public static let maxQuestion = 2000

    public let origin: URL
    public let keys: DeviceKeyStoring
    public let appVersion: String?
    public let session: URLSession
    /// This Mac's IANA zone, sent as `tz` on every call (the server reads "today" and the greeting by it).
    public var timeZone: () -> String = { TimeZone.current.identifier }
    /// Runs after a 401, once the key has been deleted. Not on the main thread.
    public var onUnauthorized: ((DesktopError) -> Void)?

    private let lock = NSLock()
    private var inboxETag: String?
    private var inboxCache: InboxSnapshot?

    public init(origin: URL, keys: DeviceKeyStoring, appVersion: String? = nil, session: URLSession = DesktopClient.makeSession()) {
        self.origin = origin
        self.keys = keys
        self.appVersion = appVersion
        self.session = session
    }

    /// No cookies (the device API reads only the key), no HTTP cache (ETags are handled here).
    public static func makeSession(protocolClasses: [AnyClass] = []) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.timeoutIntervalForRequest = 30
        if !protocolClasses.isEmpty { config.protocolClasses = protocolClasses + (config.protocolClasses ?? []) }
        return URLSession(configuration: config)
    }

    public var isConnected: Bool { keys.key(for: origin) != nil }

    /// Forget the key (Disconnect, or `event: revoked`).
    public func forgetKey() {
        keys.delete(for: origin)
        clearCache()
    }

    public func clearCache() {
        lock.lock()
        inboxETag = nil
        inboxCache = nil
        lock.unlock()
    }

    private func cachedInbox() -> (String?, InboxSnapshot?) {
        lock.lock(); defer { lock.unlock() }
        return (inboxETag, inboxCache)
    }

    private func keepInbox(_ inbox: InboxSnapshot, etag: String?) {
        lock.lock(); defer { lock.unlock() }
        inboxETag = etag
        inboxCache = inbox
    }

    public var lastInboxETag: String? {
        lock.lock(); defer { lock.unlock() }
        return inboxETag
    }

    // MARK: Requests

    /// A URL on this server. A path from the server (a task's action) must stay
    /// under /api/desktop on this same origin, so the key can't be sent elsewhere.
    func url(for path: String, query: [URLQueryItem] = []) throws -> URL {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("..") else {
            throw DesktopError.badResponse("unexpected path")
        }
        guard var c = URLComponents(string: path) else { throw DesktopError.badResponse("unexpected path") }
        c.scheme = origin.scheme
        c.host = origin.host
        c.port = origin.port
        if !query.isEmpty { c.queryItems = (c.queryItems ?? []) + query }
        guard let url = c.url else { throw DesktopError.badResponse("unexpected path") }
        return url
    }

    func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], json: Data? = nil,
                     accept: String = "application/json", authenticated: Bool = true) throws -> URLRequest {
        var query = query
        if authenticated, !query.contains(where: { $0.name == "tz" }) { query.append(URLQueryItem(name: "tz", value: timeZone())) }
        let url = try url(for: path, query: query)
        if authenticated, !path.lowercased().hasPrefix("/api/desktop/") {
            throw DesktopError.badResponse("a device key only goes to /api/desktop")
        }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.setValue(accept, forHTTPHeaderField: "Accept")
        if let appVersion { r.setValue(appVersion, forHTTPHeaderField: Self.appVersionHeader) }
        if authenticated {
            guard let key = keys.key(for: origin) else { throw DesktopError.notConnected }
            r.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }
        if let json {
            r.httpBody = json
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return r
    }

    static func encode<T: Encodable>(_ value: T) -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return (try? e.encode(value)) ?? Data("{}".utf8)
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw CancellationError()
        } catch let e as URLError where e.code == .cancelled {
            throw CancellationError()
        } catch {
            throw DesktopError.network(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw DesktopError.badResponse("not HTTP") }
        if http.statusCode == 401 { throw unauthorized(data) }
        return (data, http)
    }

    /// Deletes the key and says so. Every 401 comes through here.
    func unauthorized(_ body: Data) -> DesktopError {
        let code = (try? JSONDecoder().decode(ErrorBody.self, from: body))?.code
        forgetKey()
        let error = DesktopError.unauthorized(code: code)
        onUnauthorized?(error)
        return error
    }

    static func httpError(_ http: HTTPURLResponse, _ body: Data) -> DesktopError {
        let parsed = try? JSONDecoder().decode(ErrorBody.self, from: body)
        return .http(status: http.statusCode, code: parsed?.code, message: parsed?.message ?? parsed?.error,
                     retryAfter: retryAfter(http.value(forHTTPHeaderField: "Retry-After")))
    }

    /// Retry-After as seconds, or as an HTTP date.
    public static func retryAfter(_ value: String?, now: Date = Date()) -> TimeInterval? {
        guard let value = value?.trimmingCharacters(in: .whitespaces), !value.isEmpty else { return nil }
        if let s = TimeInterval(value) { return max(0, s) }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "GMT")
        f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return f.date(from: value).map { max(0, $0.timeIntervalSince(now)) }
    }

    func decode<T: Decodable>(_ type: T.Type, _ data: Data) throws -> T {
        do { return try JSONDecoder().decode(type, from: data) } catch {
            throw DesktopError.badResponse("\(T.self): \(error)")
        }
    }

    // MARK: Connect

    /// `POST /api/desktop/token`: swaps the Connect page's code for this Mac's
    /// key, and keeps the key in the store. The key is never returned.
    @discardableResult
    public func exchange(code: String, verifier: String, deviceName: String?, platform: String?) async throws -> DesktopDevice? {
        struct Body: Encodable {
            var code: String
            var code_verifier: String
            var device_name: String?
            var app_version: String?
            var platform: String?
        }
        let body = Body(code: code, code_verifier: verifier, device_name: deviceName, app_version: appVersion, platform: platform)
        let request = try makeRequest("POST", "/api/desktop/token", json: Self.encode(body), authenticated: false)
        let (data, http) = try await send(request)
        guard http.statusCode == 201 || http.statusCode == 200 else { throw Self.httpError(http, data) }
        let token = try decode(TokenResponse.self, data)
        guard token.key.hasPrefix("bfd_") else { throw DesktopError.badResponse("not a device key") }
        do { try keys.save(token.key, for: origin) } catch {
            throw DesktopError.badResponse("couldn't keep the key in the Keychain: \(error)")
        }
        clearCache()
        return token.device
    }

    public func me() async throws -> DesktopMe {
        let (data, http) = try await send(makeRequest("GET", "/api/desktop/me"))
        guard http.statusCode == 200 else { throw Self.httpError(http, data) }
        return try decode(DesktopMe.self, data)
    }

    /// `POST /api/desktop/disconnect`, then the key is forgotten whatever the answer.
    public func disconnect() async {
        defer { forgetKey() }
        guard let request = try? makeRequest("POST", "/api/desktop/disconnect", json: Data("{}".utf8)) else { return }
        _ = try? await send(request)
    }

    // MARK: Inbox

    /// `GET /api/desktop/inbox?tz=…`, with If-None-Match once there is a copy.
    public func fetchInbox(timeZone: String) async throws -> InboxFetch {
        var request = try makeRequest("GET", "/api/desktop/inbox", query: [URLQueryItem(name: "tz", value: timeZone)])
        let (etag, cached) = cachedInbox()
        if let etag, cached != nil { request.setValue(etag, forHTTPHeaderField: "If-None-Match") }
        let (data, http) = try await send(request)
        switch http.statusCode {
        case 304:
            guard let cached else { throw DesktopError.badResponse("304 without a copy") }
            return .notModified(cached)
        case 200:
            let inbox: InboxSnapshot
            do { inbox = try InboxDecoding.decode(data) } catch {
                throw DesktopError.badResponse("inbox: \(error)")
            }
            let newTag = http.value(forHTTPHeaderField: "ETag")
            keepInbox(inbox, etag: newTag)
            return .fresh(inbox, etag: newTag)
        default:
            throw Self.httpError(http, data)
        }
    }

    /// `POST /api/desktop/inbox/state`. Answers the new etag.
    @discardableResult
    public func postInboxState(_ change: InboxStateChange) async throws -> String? {
        let (data, http) = try await send(makeRequest("POST", "/api/desktop/inbox/state", json: Self.encode(change)))
        guard http.statusCode == 200 else { throw Self.httpError(http, data) }
        return (try? JSONDecoder().decode([String: JSONValue].self, from: data))?["etag"]?.stringValue
    }

    /// Sends a task's action exactly as the inbox gave it, with the fields it
    /// needed filled in.
    public func perform(_ action: TaskAction, filling: [String: JSONValue] = [:]) async throws -> TaskOutcome {
        var body = action.request.body
        for (k, v) in filling { body[k] = v }
        let missing = action.request.needs.filter { body[$0] == nil }
        if !missing.isEmpty { return .needs(missing) }
        let request = try makeRequest(action.request.method.uppercased(), action.request.path, json: Self.encode(body))
        let (data, http) = try await send(request)
        let parsed = try? JSONDecoder().decode(ErrorBody.self, from: data)
        switch http.statusCode {
        case 200, 201, 204:
            return .done(etag: (try? JSONDecoder().decode([String: JSONValue].self, from: data))?["etag"]?.stringValue)
        case 404: return parsed?.code == "no_user" ? .notOnTeam : .gone
        case 403: return .forbidden(parsed?.error ?? parsed?.message)
        case 409: return .conflict(parsed?.message ?? parsed?.error)
        case 400 where !(parsed?.needs ?? []).isEmpty: return .needs(parsed?.needs ?? [])
        default: return .failed(Self.httpError(http, data).plainWords)
        }
    }

    // MARK: Proposals

    public func acceptProposal(id: String) async throws -> ProposalOutcome {
        try await proposal(id: id, verb: "accept")
    }

    public func rejectProposal(id: String) async throws -> ProposalOutcome {
        try await proposal(id: id, verb: "reject")
    }

    func proposal(id: String, verb: String) async throws -> ProposalOutcome {
        let safe = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id
        let (data, http) = try await send(makeRequest("POST", "/api/desktop/proposals/\(safe)/\(verb)", json: Data("{}".utf8)))
        let parsed = try? JSONDecoder().decode(ErrorBody.self, from: data)
        switch http.statusCode {
        case 200, 201, 204: return verb == "accept" ? .accepted : .rejected
        case 404: return .gone
        case 409: return .conflict(parsed?.message ?? parsed?.error)
        case 403: return .forbidden(parsed?.error ?? parsed?.message)
        default: return .failed(Self.httpError(http, data).plainWords)
        }
    }

    // MARK: Streams

    /// `GET /api/desktop/events`: one connection's signals. Reconnecting is the caller's (see InboxSync).
    public func events() -> AsyncThrowingStream<StreamSignal, Error> {
        do {
            var request = try makeRequest("GET", "/api/desktop/events", accept: "text/event-stream")
            // The server pings every 25 s; a minute of silence means the line is dead.
            request.timeoutInterval = 70
            return stream(request)
        } catch {
            return AsyncThrowingStream { $0.finish(throwing: error) }
        }
    }

    /// `POST /api/desktop/ask`, streamed. Ends after `done` or `error`, or when the server closes.
    public func ask(text: String, history: [Turn], timeZone: String) -> AsyncThrowingStream<AskEvent, Error> {
        struct Body: Encodable {
            var text: String
            var history: [Turn]
            var tz: String
        }
        let request: URLRequest
        do {
            var r = try makeRequest("POST", "/api/desktop/ask",
                                    json: Self.encode(Body(text: String(text.prefix(Self.maxQuestion)), history: Array(history.suffix(ConversationHistory.limit)), tz: timeZone)),
                                    accept: "text/event-stream")
            r.timeoutInterval = 60
            request = r
        } catch {
            return AsyncThrowingStream { $0.finish(throwing: error) }
        }
        let signals = stream(request)
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await signal in signals {
                        guard case let .item(.event(e)) = signal, let event = AskEvent.from(e) else { continue }
                        continuation.yield(event)
                        if case .done = event { break }
                        if case .failed = event { break }
                    }
                    continuation.finish()
                } catch let error as DesktopError where error.status == 429 {
                    continuation.yield(.failed(code: "rate_limited", message: ""))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// Opens a text/event-stream request and parses it as bytes arrive.
    func stream(_ request: URLRequest) -> AsyncThrowingStream<StreamSignal, Error> {
        AsyncThrowingStream { continuation in
            let task = Task.detached { [session, weak self] in
                do {
                    let (bytes, response): (URLSession.AsyncBytes, URLResponse)
                    do {
                        (bytes, response) = try await session.bytes(for: request)
                    } catch let e as URLError where e.code == .cancelled {
                        throw CancellationError()
                    } catch is CancellationError {
                        throw CancellationError()
                    } catch {
                        throw DesktopError.network(error.localizedDescription)
                    }
                    guard let http = response as? HTTPURLResponse else { throw DesktopError.badResponse("not HTTP") }
                    guard http.statusCode == 200 else {
                        var body = Data()
                        for try await b in bytes {
                            body.append(b)
                            if body.count > 64 * 1024 { break }
                        }
                        if http.statusCode == 401, let self { throw self.unauthorized(body) }
                        throw DesktopClient.httpError(http, body)
                    }
                    continuation.yield(.opened)
                    var parser = SSEParser()
                    var chunk = Data()
                    chunk.reserveCapacity(1024)
                    do {
                        for try await b in bytes {
                            chunk.append(b)
                            // Hand over at every line end, so an event is seen the moment it's whole.
                            if b == 0x0A || b == 0x0D || chunk.count >= 16 * 1024 {
                                for item in parser.feed(chunk) { continuation.yield(.item(item)) }
                                chunk.removeAll(keepingCapacity: true)
                            }
                        }
                    } catch let e as URLError where e.code == .cancelled {
                        throw CancellationError()
                    } catch is CancellationError {
                        throw CancellationError()
                    } catch {
                        throw DesktopError.network(error.localizedDescription)
                    }
                    for item in parser.feed(chunk) { continuation.yield(.item(item)) }
                    _ = parser.finish()
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

// MARK: - The live inbox as an InboxSource

/// `GET /api/desktop/inbox` as an `InboxSource`: a 304 hands back the last copy.
public final class NetworkInboxSource: InboxSource {
    public let client: DesktopClient
    public var timeZone: () -> String

    public init(client: DesktopClient, timeZone: @escaping () -> String = { TimeZone.current.identifier }) {
        self.client = client
        self.timeZone = timeZone
    }

    public func fetchInbox() async throws -> InboxSnapshot {
        try await client.fetchInbox(timeZone: timeZone()).inbox
    }
}
