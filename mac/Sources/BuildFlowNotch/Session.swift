import AppKit
import BuildFlowNotchKit
import SystemConfiguration

/// Settings the status menu changes (UserDefaults; never the key).
final class AppSettings {
    enum Key {
        static let quietEnabled = "quietHours.enabled"
        static let quietStart = "quietHours.start"
        static let quietEnd = "quietHours.end"
        static let alerts = "alerts.enabled"
    }

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        defaults.register(defaults: [Key.quietEnabled: false, Key.quietStart: 22 * 60, Key.quietEnd: 7 * 60, Key.alerts: true])
    }

    var quietHours: QuietHours {
        get {
            QuietHours(enabled: defaults.bool(forKey: Key.quietEnabled),
                       start: defaults.integer(forKey: Key.quietStart), end: defaults.integer(forKey: Key.quietEnd))
        }
        set {
            defaults.set(newValue.enabled, forKey: Key.quietEnabled)
            defaults.set(newValue.start, forKey: Key.quietStart)
            defaults.set(newValue.end, forKey: Key.quietEnd)
        }
    }

    var alertsEnabled: Bool {
        get { defaults.bool(forKey: Key.alerts) }
        set { defaults.set(newValue, forKey: Key.alerts) }
    }

    /// The hidden debug setting: `defaults write com.buildflow.mac serverOrigin http://127.0.0.1:4417`.
    var origin: URL { ServerOrigin.resolve(defaults.string(forKey: ServerOrigin.defaultsKey)) }
}

enum AppInfo {
    /// "0.1.0 (1)"
    static var version: String {
        let info = Bundle.main.infoDictionary ?? [:]
        let short = info["CFBundleShortVersionString"] as? String ?? "0.1.0"
        let build = info["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    /// "macOS 13.3.1"
    static var platform: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "macOS \(v.majorVersion).\(v.minorVersion)" + (v.patchVersion > 0 ? ".\(v.patchVersion)" : "")
    }

    /// "Liam's MacBook Air", from Sharing settings.
    static var deviceName: String {
        (SCDynamicStoreCopyComputerName(nil, nil) as String?)?.trimmingCharacters(in: .whitespaces).nilIfEmpty
            ?? Host.current().localizedName ?? "Mac"
    }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// The connected account: the device key, the live inbox, alerts, read/seen
/// marks and task actions. Everything the network does after Connect goes
/// through here, on the main actor.
@MainActor
final class BuildFlowSession {
    let model: NotchModel
    let settings: AppSettings
    let keys: DeviceKeyStoring
    private(set) var client: DesktopClient
    private var sync: InboxSync?
    private var tracker = AlertTracker()
    private var buffer = InboxStateBuffer()
    private var bufferTask: Task<Void, Never>?
    private var bannerWork: DispatchWorkItem?
    private let exampleSource: ExampleInboxSource?

    /// A new alert to drop down.
    var onAlert: ((AlertContent) -> Void)?
    /// Runs once, when the app knows what to greet with: not connected, or the first inbox read (or a failed one).
    private var readyWaiters: [() -> Void] = []
    private(set) var isReady = false

    func whenReady(_ run: @escaping () -> Void) {
        if isReady { run() } else { readyWaiters.append(run) }
    }

    private func markReady() {
        guard !isReady else { return }
        isReady = true
        let waiting = readyWaiters
        readyWaiters = []
        waiting.forEach { $0() }
    }
    /// The connection changed (for the status menu, and to put the notch back).
    var onConnectionChange: (() -> Void)?

    var origin: URL { client.origin }

    init(model: NotchModel, settings: AppSettings = AppSettings(), keys: DeviceKeyStoring = KeychainDeviceKeyStore()) {
        self.model = model
        self.settings = settings
        self.keys = keys
        client = DesktopClient(origin: settings.origin, keys: keys, appVersion: AppInfo.version)
        exampleSource = ExampleInboxSource.defaultURL().map { ExampleInboxSource(url: $0, rebaseTo: Date(), calendar: model.calendar) }
        wireClient()
    }

    private func wireClient() {
        client.onUnauthorized = { [weak self] error in
            Task { @MainActor [weak self] in self?.lostKey(error) }
        }
    }

    // MARK: Connecting

    /// At launch: a key in the Keychain means connected; check it with /me.
    /// The Keychain is read off the main thread (it can block), the example shows meanwhile.
    func start() {
        Log.info("server: \(origin.absoluteString)")
        showExample(reason: nil)
        let client = self.client
        Task {
            let hasKey = await Task.detached { client.isConnected }.value
            guard hasKey else {
                Log.info("inbox: not connected; showing the example")
                onConnectionChange?()
                markReady()
                return
            }
            resume()
        }
    }

    private func resume() {
        model.connection = .connecting
        onConnectionChange?()
        Task {
            do {
                let me = try await client.me()
                connected(as: me)
            } catch let error as DesktopError {
                switch error {
                case .unauthorized:
                    markReady()   // lostKey has run
                default:
                    // Offline, or the server is down: keep the key and keep trying.
                    Log.info("connect: couldn't check the key yet (\(error.plainWords))")
                    model.connection = .connected(name: "", workspace: "")
                    model.inboxProblem = error.plainWords
                    startSync()
                    markReady()
                }
            } catch {}
            onConnectionChange?()
        }
    }

    /// The Connect page came back with a code: swap it for this Mac's key.
    func finishConnect(code: String, flow: ConnectFlow) async throws {
        try await client.exchange(code: code, verifier: flow.verifier, deviceName: flow.deviceName, platform: AppInfo.platform)
        Log.info("connect: key kept in the Keychain")
        let me = try await client.me()
        connected(as: me)
        onConnectionChange?()
    }

    func connected(as me: DesktopMe) {
        Log.info("connect: connected as \(me.name) · \(me.workspace)")
        model.connection = .connected(name: me.name, workspace: me.workspace)
        model.inbox = InboxSnapshot(me: Me(firstName: me.firstName, name: me.name, workspace: me.workspace, role: me.role))
        model.inboxProblem = "Loading your inbox…"
        tracker.reset()
        startSync()
    }

    func disconnect() {
        Log.info("connect: disconnecting this Mac")
        stopSync()
        let client = self.client
        Task {
            await client.disconnect()
            self.showExample(reason: nil)
            self.onConnectionChange?()
        }
    }

    /// A 401 anywhere, or `event: revoked`: the key is already deleted.
    private func lostKey(_ error: DesktopError) {
        guard model.connection != .notConnected(reason: error.plainWords) else { return }
        Log.info("connect: the server refused this Mac's key (\(error.code ?? "401")); key deleted")
        stopSync()
        showExample(reason: error.plainWords)
        onConnectionChange?()
    }

    private func showExample(reason: String?) {
        model.connection = .notConnected(reason: reason)
        model.inboxProblem = nil
        model.busyTasks = []
        model.alert = nil
        if let exampleSource, let example = try? exampleSource.load() {
            model.inbox = example
        } else {
            model.inbox = .empty
        }
    }

    // MARK: The live inbox

    private func startSync() {
        stopSync()
        let sync = InboxSync(client: client)
        sync.onInbox = { [weak self] inbox in self?.received(inbox) }
        sync.onProblem = { [weak self] error in
            guard let self else { return }
            if let error { Log.info("inbox: \(error.plainWords)") }
            self.model.inboxProblem = error?.plainWords
            self.markReady()
        }
        sync.onRevoked = { [weak self] error in self?.lostKey(error) }
        sync.onStream = { open in Log.info(open ? "events: connected" : "events: dropped, reconnecting") }
        self.sync = sync
        sync.start()
    }

    private func stopSync() {
        sync?.stop()
        sync = nil
        bufferTask?.cancel()
        bufferTask = nil
    }

    func refresh() {
        guard let sync else { return }
        Task { await sync.refresh() }
    }

    private func received(_ inbox: InboxSnapshot) {
        let wasEmpty = model.inbox.notifications.isEmpty && model.inbox.jobs.isEmpty
        model.inbox = inbox
        defer { markReady() }
        model.inboxProblem = nil
        if case let .connected(name, workspace) = model.connection, name.isEmpty || workspace.isEmpty {
            model.connection = .connected(name: inbox.me.name ?? inbox.me.firstName, workspace: inbox.me.workspace ?? workspace)
            onConnectionChange?()
        }
        Log.info("inbox: \(inbox.notifications.count) notifications (\(inbox.counts?.unseen ?? 0) unseen), \(inbox.jobs.count) jobs, "
            + "\(inbox.meetings.count) meetings, \(inbox.tasks.count) tasks" + (wasEmpty ? " (first read)" : ""))
        let fresh = tracker.take(inbox, at: Date(), quiet: settings.quietHours, calendar: model.calendar)
        guard settings.alertsEnabled else { return }
        for n in fresh {
            Log.info("alert: \(n.kind) \(n.id)")
            onAlert?(InboxPresenter.alert(for: n))
        }
    }

    // MARK: Read and seen

    /// The notifications the open inbox is showing have been seen.
    func markShownSeen() {
        guard model.connection.isConnected else { return }
        let ids = model.inbox.notifications.filter { !$0.seen }.map(\.id)
        guard !ids.isEmpty else { return }
        model.inbox = model.inbox.marking(seen: Set(ids))
        queue(seen: ids)
    }

    func markAllRead() {
        guard model.connection.isConnected else { return }
        model.inbox = model.inbox.marking(allRead: true)
        queue(allRead: true)
    }

    private func queue(seen: [String] = [], read: [String] = [], allRead: Bool = false) {
        buffer.mark(seen: seen, read: read, allRead: allRead)
        flushSoon()
    }

    /// At most one `POST /api/desktop/inbox/state` a second.
    private func flushSoon() {
        guard bufferTask == nil, let due = buffer.dueAt(now: Date()) else { return }
        bufferTask = Task { [weak self] in
            let wait = due.timeIntervalSinceNow
            if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
            guard let self, !Task.isCancelled else { return }
            self.bufferTask = nil
            guard let change = self.buffer.take(now: Date()) else { return }
            do {
                try await self.client.postInboxState(change)
            } catch let error as DesktopError {
                if case .unauthorized = error { return }
                Log.info("inbox: couldn't save read marks (\(error.plainWords)); will retry")
                self.buffer.restore(change)
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            } catch {}
            self.flushSoon()
        }
    }

    // MARK: Opening rows

    func url(for target: RowTarget) -> URL? {
        let raw: String?
        switch target {
        case let .notification(id): raw = model.inbox.notifications.first { $0.id == id }?.url
        case let .job(id): raw = model.inbox.jobs.first { $0.id == id }?.url
        case let .meeting(id): raw = model.inbox.meetings.first { $0.id == id }?.url
        case let .task(id): raw = model.inbox.tasks.first { $0.id == id }?.url
        }
        return raw.flatMap(URL.init(string:)).flatMap { ["http", "https"].contains($0.scheme?.lowercased() ?? "") ? $0 : nil }
    }

    /// The website's home, for a row that has no page of its own yet.
    var website: URL { origin }

    func open(_ target: RowTarget) {
        guard model.connection.isConnected else { return }
        if case let .notification(id) = target, let n = model.inbox.notifications.first(where: { $0.id == id }), !n.read {
            model.inbox = model.inbox.marking(read: [id])
            queue(read: [id])
        }
        NSWorkspace.shared.open(url(for: target) ?? website)
    }

    func jobURL(_ jobId: String) -> URL {
        url(for: .job(jobId)) ?? website
    }

    // MARK: Tasks

    func task(_ taskId: String) -> InboxTask? { model.inbox.tasks.first { $0.id == taskId } }

    /// Sends a task's action. `crewId` fills a "needs": ["crewId"].
    func run(taskId: String, actionId: String, filling: [String: JSONValue] = [:]) {
        guard model.connection.isConnected, let task = task(taskId),
              let action = task.actions.first(where: { $0.id == actionId }), !model.busyTasks.contains(taskId) else { return }
        model.busyTasks.insert(taskId)
        Task {
            defer { model.busyTasks.remove(taskId) }
            do {
                let outcome = try await client.perform(action, filling: filling)
                Log.info("task: \(action.id) on \(taskId) → \(outcome)")
                if outcome == .gone {
                    // Already answered elsewhere: take it off the list now; the re-read below confirms.
                    model.inbox.tasks.removeAll { $0.id == taskId }
                }
                showBanner(outcome.plainWords(label: action.label, title: task.title))
            } catch let error as DesktopError {
                if case .unauthorized = error { return }
                showBanner(error.plainWords)
            } catch {}
            await sync?.refresh()
        }
    }

    func showBanner(_ text: String) {
        bannerWork?.cancel()
        model.banner = text
        let work = DispatchWorkItem { [weak self] in self?.model.banner = nil }
        bannerWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
    }
}
