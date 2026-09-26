import AppKit
import BuildFlowNotchKit
import ImageIO
import SwiftUI

/// `--snapshot <dir>`: renders each state against the mock-up's dark desktop with
/// SwiftUI's ImageRenderer, at the mock-up's moments of the example day
/// (Sat 26 Sep 2026, New York time), then exits.
enum Snapshotter {
    struct Scene {
        let file: String
        let state: NotchState
        let time: String
        var tab: InboxTab = .notifications
        var greetingElapsed: Double?
    }

    static let scenes: [Scene] = [
        Scene(file: "1-resting", state: .resting, time: "08:12"),
        Scene(file: "2-greeting", state: .greeting, time: "08:12", greetingElapsed: 3.0),
        Scene(file: "2b-greeting-writing", state: .greeting, time: "08:12", greetingElapsed: 1.15),
        Scene(file: "3-live", state: .live, time: "09:25:08"),
        Scene(file: "4-alert", state: .alert, time: "08:40"),
        Scene(file: "5-inbox", state: .inbox, time: "09:05"),
        Scene(file: "5b-inbox-jobs", state: .inbox, time: "09:05", tab: .jobs),
        Scene(file: "5c-inbox-meetings", state: .inbox, time: "09:05", tab: .meetings),
        Scene(file: "5d-inbox-tasks", state: .inbox, time: "09:05", tab: .tasks),
        Scene(file: "6-voice", state: .voice, time: "09:05"),
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
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        guard let url = ExampleInboxSource.defaultURL(),
              let inbox = try? ExampleInboxSource(url: url, calendar: calendar).load() else {
            Log.info("snapshot: example-inbox.json not found or unreadable")
            return 1
        }

        var failed = 0
        for scene in scenes {
            let now = date("2026-09-26 " + scene.time, calendar)
            let model = NotchModel(fixedNow: now, calendar: calendar)
            model.inbox = inbox
            model.notchSize = CGSize(width: 179, height: 32)
            model.state = scene.state
            model.tab = scene.tab
            model.greetingText = GreetingWording.text(part: PartOfDay.at(now, calendar: calendar), firstName: inbox.me.firstName)
            model.greetingDayLine = model.presenter().dayLine()
            model.greetingElapsedOverride = scene.greetingElapsed
            model.showsCameraDot = true
            model.showsNotchOutline = outlineNotch

            let clock = "Sat Sep 26  " + TimeText.clock(now, calendar: calendar, style: .full)
            let renderer = ImageRenderer(content: SnapshotStage(model: model, clock: clock))
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
                    Text("EXAMPLE DATA").font(.system(size: 10.5, weight: .semibold)).kerning(0.84)
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
