import AppKit
import BuildFlowNotchKit
import ImageIO
import SwiftUI

/// `--snapshot <dir> [--appearance light|dark]`: renders each state against the mock-up's dark
/// desktop with SwiftUI's ImageRenderer, with dark cards (the reference's look, the default) or light
/// ones, at the mock-up's moments of the example day (Sat 26 Sep 2026, New York time) and, for the
/// live states, at 9:00 AM in Chicago against mac/Fixtures/desktop-inbox.json, then exits.
enum Snapshotter {
    enum Data {
        case example, fixture
        /// The fixture's account with nothing in it: the empty states.
        case empty
    }

    struct Scene {
        let file: String
        let state: NotchState
        let time: String
        var tab: InboxTab = .notifications
        var greetingElapsed: Double?
        var data: Data = .example
        /// Connected (the live inbox) or not (the example, with Connect).
        var connected = false
        var voice: VoiceContent?
        var alertFrom: String?
        var banner: String?
        var busy: Set<String> = []
        /// How the dropdown was opened, and how far into its opening it is drawn (settled by default).
        var opening: InboxOpening = .chord
        var inboxElapsed: Double = 10
        /// How long ago an alert or voice opened (the rim's light runs for the first second or so).
        var shownElapsed: Double?
        var problem: String?
        var settingsMenu = false
        /// Outline the hardware notch, to see that nothing sits under the camera.
        var outline = false
    }

    static let proposal = ProposalCard(id: "p1", jobId: "j40", subject: "Oak Ridge · Framing, level 2", verb: "starts", from: "7:30 AM", to: "6:30 AM")

    static let scenes: [Scene] = [
        // The example, not connected (New York time, the mock-up's day).
        Scene(file: "1-resting", state: .resting, time: "08:12"),
        Scene(file: "2-greeting", state: .greeting, time: "08:12", greetingElapsed: 3.0, connected: true),
        Scene(file: "2b-greeting-writing", state: .greeting, time: "08:12", greetingElapsed: 0.95, connected: true),
        Scene(file: "2c-greeting-not-connected", state: .greeting, time: "08:12", greetingElapsed: 3.0),
        Scene(file: "3-live", state: .live, time: "09:25:08"),
        Scene(file: "4-alert", state: .alert, time: "08:40"),
        Scene(file: "4b-alert-arriving", state: .alert, time: "08:40", shownElapsed: 0.85),
        Scene(file: "5-inbox-example", state: .inbox, time: "09:05"),
        Scene(file: "5b-inbox-example-jobs", state: .inbox, time: "09:05", tab: .jobs),
        Scene(file: "5c-inbox-example-meetings", state: .inbox, time: "09:05", tab: .meetings),
        Scene(file: "5d-inbox-example-tasks", state: .inbox, time: "09:05", tab: .tasks),
        Scene(file: "6-voice-example", state: .voice, time: "09:05", voice: .example),
        // The real DesktopInbox (mac/Fixtures, built by the server's buildDesktopInbox), connected, Chicago time.
        Scene(file: "7-real-inbox", state: .inbox, time: "09:00", data: .fixture, connected: true),
        Scene(file: "7b-real-jobs", state: .inbox, time: "09:00", tab: .jobs, data: .fixture, connected: true),
        Scene(file: "7c-real-meetings", state: .inbox, time: "09:00", tab: .meetings, data: .fixture, connected: true),
        Scene(file: "7d-real-tasks", state: .inbox, time: "09:00", tab: .tasks, data: .fixture, connected: true),
        Scene(file: "7e-real-tasks-outcome", state: .inbox, time: "09:00", tab: .tasks, data: .fixture, connected: true,
              banner: "The job moved. Nothing changed; take another look.", busy: ["variance-v7"]),
        Scene(file: "8-real-alert", state: .alert, time: "09:00", data: .fixture, connected: true, alertFrom: "delayIQ-d12"),
        Scene(file: "8b-real-alert-weather", state: .alert, time: "09:00", data: .fixture, connected: true,
              alertFrom: "weather-conflict-wx-j31-2026-09-26"),
        Scene(file: "9-real-live-meeting", state: .live, time: "09:00:00", data: .fixture, connected: true),
        Scene(file: "9b-real-live-job", state: .live, time: "06:40:00", data: .fixture, connected: true),
        Scene(file: "10-voice-listening", state: .voice, time: "09:00", data: .fixture, connected: true,
              voice: VoiceContent(status: "Listening…", question: "Move Oak Ridge framing to six thirty", listening: true)),
        Scene(file: "10b-voice-proposal", state: .voice, time: "09:00", data: .fixture, connected: true,
              voice: VoiceContent(status: "Answering", question: "Move Oak Ridge framing to six thirty",
                                  answer: "Framing, level 2 at Oak Ridge starts at 7:30 today with Crew 4. I can move the start to 6:30; nothing changes until you accept.",
                                  proposal: proposal)),
        Scene(file: "10c-voice-demo", state: .voice, time: "09:00", data: .fixture, connected: true,
              voice: VoiceContent(status: "Answered", question: "What's next?",
                                  answer: "Standup at 9:10 on Google Meet. Then Owner walkthrough at 1:00 PM at Maple St. Plaza.",
                                  hint: "AI not connected")),
        Scene(file: "10d-voice-accepted", state: .voice, time: "09:00", data: .fixture, connected: true,
              voice: VoiceContent(status: "Answered", question: "Move Oak Ridge framing to six thirty",
                                  answer: "Framing, level 2 at Oak Ridge starts at 7:30 today with Crew 4. I can move the start to 6:30; nothing changes until you accept.",
                                  proposal: { var p = proposal; p.phase = .settled(ProposalOutcome.conflict(nil).plainWords, ok: false); return p }())),
        Scene(file: "10e-voice-permission", state: .voice, time: "09:00", data: .fixture, connected: true,
              voice: VoiceContent(status: "Can't listen", answer: VoiceProblem.microphoneDenied.words, button: .openPrivacy("Privacy_Microphone"))),
        // Opened with ⌃⌥: the greeting writes itself while the rim lights, then the shape springs into the dropdown.
        Scene(file: "11-opening-greeting", state: .inbox, time: "09:00", data: .fixture, connected: true, inboxElapsed: 0.6),
        Scene(file: "11b-opening-greeting-written", state: .inbox, time: "09:00", data: .fixture, connected: true, inboxElapsed: 1.2),
        Scene(file: "11c-opening-cascade", state: .inbox, time: "09:00", data: .fixture, connected: true, inboxElapsed: 1.52),
        Scene(file: "11d-opening-settled", state: .inbox, time: "09:00", data: .fixture, connected: true, inboxElapsed: 2.3),
        // Opened by hovering: straight to the dropdown, the rim's light running.
        Scene(file: "11e-hover-open", state: .inbox, time: "09:00", data: .fixture, connected: true, opening: .hover, inboxElapsed: 0.7),
        // Nothing in the lists: the website's empty state.
        Scene(file: "12-empty-notifications", state: .inbox, time: "09:00", data: .empty, connected: true),
        Scene(file: "12b-empty-jobs", state: .inbox, time: "09:00", tab: .jobs, data: .empty, connected: true),
        Scene(file: "12c-empty-meetings", state: .inbox, time: "09:00", tab: .meetings, data: .empty, connected: true),
        Scene(file: "12d-empty-tasks", state: .inbox, time: "09:00", tab: .tasks, data: .empty, connected: true),
        Scene(file: "12e-inbox-loading", state: .inbox, time: "09:00", data: .empty, connected: true, problem: EmptyState.loadingWords),
        Scene(file: "12f-inbox-offline", state: .inbox, time: "09:00", data: .empty, connected: true,
              problem: DesktopError.network("offline").plainWords),
        // The gear's menu: Appearance, and the way to the rest.
        Scene(file: "13-inbox-settings", state: .inbox, time: "09:00", data: .fixture, connected: true, settingsMenu: true),
        // The hardware notch outlined: nothing may sit under the camera.
        Scene(file: "14-outline-inbox", state: .inbox, time: "09:00", data: .fixture, connected: true, outline: true),
        Scene(file: "14b-outline-live", state: .live, time: "09:00:00", data: .fixture, connected: true, outline: true),
        Scene(file: "14c-outline-greeting", state: .greeting, time: "09:00", greetingElapsed: 3.0, data: .fixture, connected: true, outline: true),
        Scene(file: "14d-outline-alert", state: .alert, time: "09:00", data: .fixture, connected: true, alertFrom: "delayIQ-d12", outline: true),
        Scene(file: "14e-outline-voice", state: .voice, time: "09:00", data: .fixture, connected: true,
              voice: VoiceContent(status: "Answered", question: "What's next?", answer: "Standup at 9:10 on Google Meet.", hint: "AI not connected"),
              outline: true),
        Scene(file: "14f-outline-example", state: .inbox, time: "09:05", outline: true),
    ]

    @MainActor
    static func run(outputDirectory: String, appearance: Appearance, outlineNotch: Bool) -> Int32 {
        ScriptFont.registerBundledFonts()
        let dir = URL(fileURLWithPath: outputDirectory, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            Log.info("snapshot: can't create \(dir.path): \(error)")
            return 1
        }
        var newYork = Calendar(identifier: .gregorian)
        newYork.timeZone = TimeZone(identifier: "America/New_York")!
        var chicago = Calendar(identifier: .gregorian)
        chicago.timeZone = TimeZone(identifier: "America/Chicago")!
        guard let url = ExampleInboxSource.defaultURL(),
              let example = try? ExampleInboxSource(url: url, calendar: newYork).load() else {
            Log.info("snapshot: example-inbox.json not found or unreadable")
            return 1
        }
        // The fixture lives in the source tree (mac/Fixtures), not the app bundle.
        let fixtureURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Fixtures/desktop-inbox.json")
        let fixture = (try? Foundation.Data(contentsOf: fixtureURL)).flatMap { try? InboxDecoding.decode($0) }

        var failed = 0
        for scene in scenes {
            let calendar = scene.data == .example ? newYork : chicago
            let inbox: InboxSnapshot?
            switch scene.data {
            case .example: inbox = example
            case .fixture: inbox = fixture
            case .empty: inbox = fixture.map { InboxSnapshot(me: $0.me, today: $0.today) }
            }
            guard let inbox else {
                Log.info("snapshot: skipped \(scene.file) (mac/Fixtures/desktop-inbox.json not found)")
                continue
            }
            let now = date("2026-09-26 " + scene.time, calendar)
            let model = NotchModel(fixedNow: now, calendar: calendar)
            model.appearance = appearance
            model.inbox = inbox
            model.connection = scene.connected
                ? .connected(name: inbox.me.name ?? inbox.me.firstName, workspace: inbox.me.workspace ?? "")
                : .notConnected(reason: nil)
            model.notchSize = CGSize(width: 179, height: 32)
            model.state = scene.state
            model.tab = scene.tab
            let firstName = scene.connected ? inbox.me.firstName : "Liam"
            model.greetingText = GreetingWording.text(part: PartOfDay.at(now, calendar: calendar), firstName: firstName)
            model.greetingDayLine = model.greetingDayLine()
            model.greetingElapsedOverride = scene.greetingElapsed
            model.beginInbox(scene.opening, at: now)
            model.headerGreeting = HeaderGreeting.text(now: now, firstName: firstName, awayBeforeVisit: nil, calendar: calendar)
            model.inboxElapsedOverride = scene.inboxElapsed
            model.inboxGreeting = InboxIntro.showsGreeting(at: scene.inboxElapsed, playing: model.introPlays)
            model.shownElapsedOverride = scene.shownElapsed
            model.settingsMenuOpen = scene.settingsMenu
            model.inboxProblem = scene.problem
            model.voice = scene.voice ?? .idle
            model.banner = scene.banner
            model.busyTasks = scene.busy
            if let id = scene.alertFrom, let n = inbox.notifications.first(where: { $0.id == id }) {
                model.alert = InboxPresenter.alert(for: n)
            }

            let clock = "Sat Sep 26  " + TimeText.clock(now, calendar: calendar, style: .full)
            let source = scene.data == .fixture ? "FIXTURE · SERVER buildDesktopInbox" : scene.data == .empty ? "EMPTY INBOX"
                : scene.connected ? "EXAMPLE DATA" : "EXAMPLE DATA · NOT CONNECTED"
            let label = source + " · " + appearance.label.uppercased()
            let stage = SnapshotStage(model: model, clock: clock, label: label, outline: outlineNotch || scene.outline)
            let renderer = ImageRenderer(content: stage)
            renderer.scale = 2
            renderer.isOpaque = true
            let out = dir.appendingPathComponent(scene.file + ".png")
            if let image = renderer.cgImage, writePNG(image, to: out) {
                print(out.path)
            } else {
                Log.info("snapshot: couldn't render \(scene.file)")
                failed += 1
            }
        }
        return failed == 0 ? 0 : 1
    }

    static func date(_ s: String, _ calendar: Calendar) -> Date {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = s.count > 16 ? "yyyy-MM-dd HH:mm:ss" : "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }

    static func writePNG(_ image: CGImage, to url: URL) -> Bool {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else { return false }
        CGImageDestinationAddImage(dest, image, nil)
        return CGImageDestinationFinalize(dest)
    }
}

/// The mock-up's stage: 960×500 pt of dark desktop with a 37 pt menu bar, the camera drawn where
/// the real one is. It is a picture of macOS around the notch, not part of BuildFlow's look, so its
/// colours are its own.
struct SnapshotStage: View {
    @ObservedObject var model: NotchModel
    let clock: String
    var label = "EXAMPLE DATA"
    var outline = false

    static func rgb(_ hex: UInt32, _ opacity: Double = 1) -> Color { Color(ThemeColor(hex, alpha: opacity)) }

    var body: some View {
        ZStack(alignment: .top) {
            ZStack {
                LinearGradient(stops: [.init(color: Self.rgb(0x151515), location: 0),
                                       .init(color: Self.rgb(0x1B1A1A), location: 0.55),
                                       .init(color: Self.rgb(0x231D19), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Self.rgb(0x3B2718), Self.rgb(0x3B2718, 0)],
                               center: UnitPoint(x: 0.5, y: 1.15), startRadius: 0, endRadius: 420)
                    .scaleEffect(x: 1.6, y: 1)
                RadialGradient(colors: [Self.rgb(0x1D2430), Self.rgb(0x1D2430, 0)],
                               center: UnitPoint(x: 0.12, y: 1), startRadius: 0, endRadius: 300)
            }

            HStack {
                HStack(spacing: 17) {
                    Text("Finder").fontWeight(.bold)
                    ForEach(["File", "Edit", "View", "Go", "Window", "Help"], id: \.self) { Text($0) }
                }
                .foregroundColor(.white.opacity(0.88))
                Spacer()
                HStack(spacing: 12) {
                    IconView(icon: .mark, size: 16).foregroundColor(.white.opacity(0.9))
                    Text(clock).monospacedDigit()
                }
                .foregroundColor(.white.opacity(0.9))
            }
            .font(.system(size: 13.5))
            .padding(.horizontal, 18)
            .frame(height: 37)
            .background(Color.black.opacity(0.22))

            NotchRootView(model: model)

            // The camera, as the mock-up draws it; on the Mac the real one is there.
            Circle()
                .fill(RadialGradient(colors: [Self.rgb(0x2B3550), Self.rgb(0x121726), Self.rgb(0x06070B)],
                                     center: UnitPoint(x: 0.35, y: 0.35), startRadius: 0, endRadius: 5))
                .frame(width: 8, height: 8)
                .padding(.top, 12)
            if outline {
                Rectangle()
                    .strokeBorder(Color.red.opacity(0.85), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                    .frame(width: model.notchSize.width, height: model.notchSize.height)
            }

            VStack {
                Spacer()
                HStack {
                    Text(label).font(.system(size: 10.5, weight: .semibold)).kerning(0.84)
                        .foregroundColor(.white.opacity(0.4))
                    Spacer()
                }
            }
            .padding(.leading, 16)
            .padding(.bottom, 14)
        }
        .frame(width: 960, height: 500)
        .clipped()
        .environment(\.colorScheme, .dark)
    }
}
