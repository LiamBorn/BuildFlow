import Foundation

/// Keeps the inbox current: re-reads `GET /api/desktop/inbox` on every
/// `event: inbox` nudge from `/api/desktop/events`, and every 60 s in case the
/// stream dropped; reconnects the stream with the contract's backoff; and stops
/// for good on `event: revoked` or any 401 (the key is already gone by then).
@MainActor
public final class InboxSync {
    public let client: DesktopClient
    public var timeZone: () -> String = { TimeZone.current.identifier }
    public var pollInterval: TimeInterval
    /// A new inbox (for a 304 only when this sync hasn't handed one over yet).
    public var onInbox: ((InboxSnapshot) -> Void)?
    /// Something went wrong reading (nil once reads work again).
    public var onProblem: ((DesktopError?) -> Void)?
    /// The key was revoked or refused: the sync has stopped and the key is deleted.
    public var onRevoked: ((DesktopError) -> Void)?
    /// The events stream connected (true) or dropped (false).
    public var onStream: ((Bool) -> Void)?

    public private(set) var isRunning = false
    public private(set) var reads = 0
    public private(set) var backoff = ReconnectBackoff()
    private var eventsTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var refreshing = false
    private var again = false
    private var hadProblem = false
    /// Has this sync handed over an inbox yet? Its first read always does, 304 or not.
    private var delivered = false
    /// Sleeps between reconnects; the checks shorten it.
    public var sleep: (TimeInterval) async -> Void = { seconds in
        try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
    }

    public init(client: DesktopClient, pollInterval: TimeInterval = 60) {
        self.client = client
        self.pollInterval = pollInterval
    }

    public func start() {
        guard !isRunning else { return }
        isRunning = true
        Task { await refresh() }
        startEvents()
        startPolling()
    }

    public func stop() {
        isRunning = false
        eventsTask?.cancel()
        pollTask?.cancel()
        eventsTask = nil
        pollTask = nil
    }

    /// Reads the inbox now. Calls that arrive while a read is running are folded into one more read.
    public func refresh() async {
        guard isRunning else { return }
        if refreshing { again = true; return }
        refreshing = true
        defer { refreshing = false }
        repeat {
            again = false
            do {
                let result = try await client.fetchInbox(timeZone: timeZone())
                reads += 1
                if hadProblem { hadProblem = false; onProblem?(nil) }
                switch result {
                case let .fresh(inbox, _):
                    delivered = true
                    onInbox?(inbox)
                case let .notModified(inbox) where !delivered:
                    delivered = true
                    onInbox?(inbox)
                case .notModified:
                    break
                }
            } catch let error as DesktopError {
                if case .unauthorized = error { revoked(error); return }
                hadProblem = true
                onProblem?(error)
            } catch is CancellationError {
                return
            } catch {
                hadProblem = true
                onProblem?(.network(error.localizedDescription))
            }
        } while again && isRunning
    }

    private func revoked(_ error: DesktopError) {
        guard isRunning else { return }
        stop()
        client.forgetKey()
        onRevoked?(error)
    }

    private func startPolling() {
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let interval = self?.pollInterval else { return }
                try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
                if Task.isCancelled { return }
                await self?.refresh()
            }
        }
    }

    private func startEvents() {
        eventsTask = Task { [weak self] in
            var connections = 0
            while !Task.isCancelled {
                guard let self else { return }
                do {
                    for try await signal in self.client.events() {
                        switch signal {
                        case .opened:
                            connections += 1
                            self.backoff.reset()
                            self.onStream?(true)
                            // Nudges may have been missed while the stream was down.
                            if connections > 1 { Task { await self.refresh() } }
                        case let .item(.event(e)) where e.event == "inbox":
                            Task { await self.refresh() }
                        case let .item(.event(e)) where e.event == "revoked":
                            self.revoked(.unauthorized(code: "device_revoked"))
                            return
                        default:
                            break
                        }
                    }
                } catch let error as DesktopError {
                    if case .unauthorized = error { self.revoked(error); return }
                } catch {
                    if Task.isCancelled { return }
                }
                if Task.isCancelled || !self.isRunning { return }
                self.onStream?(false)
                await self.sleep(self.backoff.next())
            }
        }
    }
}
