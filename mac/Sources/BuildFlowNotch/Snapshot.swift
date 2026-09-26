import AppKit
import BuildFlowNotchKit
import ImageIO
import SwiftUI

/// `--snapshot <dir>`: renders each state against the mock-up's dark desktop with
/// SwiftUI's ImageRenderer, at the mock-up's moments of the example day
/// (Sat 26 Sep 2026, New York time) and, for the live states, at 9:00 AM in
/// Chicago against mac/Fixtures/desktop-inbox.json, then exits.
enum Snapshotter {
    enum Data { case example, fixture }

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
    }

    static let proposal = ProposalCard(id: "p1", jobId: "j40", subject: "Oak Ridge · Framing, level 2", verb: "starts", from: "7:30 AM", to: "6:30 AM")

    static let scenes: [Scene] = [
        // The example, not connected (New York time, the mock-up's day).
        Scene(file: "1-resting", state: .resting, time: "08:12"),
        Scene(file: "2-greeting", state: .greeting, time: "08:12", greetingElapsed: 3.0, connected: true),
        Scene(file: "2b-greeting-writing", state: .greeting, time: "08:12", greetingElapsed: 1.15, connected: true),
        Scene(file: "2c-greeting-not-connected", state: .greeting, time: "08:12", greetingElapsed: 3.0),
        Scene(file: "3-live", state: .live, time: "09:25:08"),
        Scene(file: "4-alert", state: .alert, time: "08:40"),
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
    ]

    @MainActor
    static func run(outputDirectory: String, outlineNotch: Bool) -> Int32 {
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
            let calendar = scene.data == .fixture ? chicago : newYork
            guard let inbox = scene.data == .fixture ? fixture : example else {
                Log.info("snapshot: skipped \(scene.file) (mac/Fixtures/desktop-inbox.json not found)")
                continue
            }
            let now = date("2026-09-26 " + scene.time, calendar)
            let model = NotchModel(fixedNow: now, calendar: calendar)
            model.inbox = inbox
            model.connection = scene.connected
                ? .connected(name: inbox.me.name ?? inbox.me.firstName, workspace: inbox.me.workspace ?? "")
                : .notConnected(reason: nil)
            model.notchSize = CGSize(width: 179, height: 32)
            model.state = scene.state
            model.tab = scene.tab
            model.greetingText = GreetingWording.text(part: PartOfDay.at(now, calendar: calendar),
                                                      firstName: scene.connected ? inbox.me.firstName : "Liam")
            model.greetingDayLine = model.greetingDayLine()
            model.greetingElapsedOverride = scene.greetingElapsed
            model.voice = scene.voice ?? .idle
            model.banner = scene.banner
            model.busyTasks = scene.busy
            if let id = scene.alertFrom, let n = inbox.notifications.first(where: { $0.id == id }) {
                model.alert = InboxPresenter.alert(for: n)
            }
            model.showsCameraDot = true
            model.showsNotchOutline = outlineNotch

            let clock = "Sat Sep 26  " + TimeText.clock(now, calendar: calendar, style: .full)
            let label = scene.data == .fixture ? "FIXTURE · SERVER buildDesktopInbox" : scene.connected ? "EXAMPLE DATA" : "EXAMPLE DATA · NOT CONNECTED"
            let renderer = ImageRenderer(content: SnapshotStage(model: model, clock: clock, label: label))
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

/// The mock-up's stage: 960×400 pt of dark desktop with a 37 pt menu bar.
struct SnapshotStage: View {
    @ObservedObject var model: NotchModel
    let clock: String
    var label = "EXAMPLE DATA"

    var body: some View {
        ZStack(alignment: .top) {
            ZStack {
                LinearGradient(stops: [.init(color: Color(hex: 0x151515), location: 0),
                                       .init(color: Color(hex: 0x1B1A1A), location: 0.55),
                                       .init(color: Color(hex: 0x231D19), location: 1)],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Color(hex: 0x3B2718), Color(hex: 0x3B2718, opacity: 0)],
                               center: UnitPoint(x: 0.5, y: 1.15), startRadius: 0, endRadius: 420)
                    .scaleEffect(x: 1.6, y: 1)
                RadialGradient(colors: [Color(hex: 0x1D2430), Color(hex: 0x1D2430, opacity: 0)],
                               center: UnitPoint(x: 0.12, y: 1), startRadius: 0, endRadius: 300)
            }

            HStack {
                HStack(spacing: 17) {
                    Text("Finder").fontWeight(.bold)
                    ForEach(["File", "Edit", "View", "Go", "Window", "Help"], id: \.self) { Text($0) }
                }
                .foregroundColor(Palette.white(0.88))
                Spacer()
                HStack(spacing: 12) {
                    IconView(icon: .mark, size: 16).foregroundColor(Palette.orangeText)
                    Text(clock).monospacedDigit()
                }
                .foregroundColor(Palette.white(0.9))
            }
            .font(.system(size: 13.5))
            .padding(.horizontal, 18)
            .frame(height: 37)
            .background(Color.black.opacity(0.22))

            NotchRootView(model: model)

            VStack {
                Spacer()
                HStack {
                    Text(label).font(.system(size: 10.5, weight: .semibold)).kerning(0.84)
                        .foregroundColor(Palette.white(0.4))
                    Spacer()
                }
            }
            .padding(.leading, 16)
            .padding(.bottom, 14)
        }
        .frame(width: 960, height: 400)
        .clipped()
        .environment(\.colorScheme, .dark)
    }
}
