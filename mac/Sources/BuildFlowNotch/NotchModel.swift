import AppKit
import BuildFlowNotchKit
import SwiftUI

/// Things the notch's buttons ask the app to do.
enum NotchAction {
    case join(URL)
    case openSettings
    case startVoice
    case markAllRead
    case proposal(ProposalChoice)
    /// Open a row's record in BuildFlow (and mark a notification read).
    case open(RowTarget)
    /// A task's button: `actionId` of `taskId`.
    case task(taskId: String, actionId: String)
    case connect
    case voiceButton(VoiceButton)
    /// A tab was chosen (showing Notifications marks them seen).
    case tabShown(InboxTab)
}

enum ProposalChoice { case edit, reject, accept }

/// Is this Mac connected to a BuildFlow account?
enum ConnectionState: Equatable {
    /// Not connected: the inbox shows the example. `reason` says why, when it was taken away.
    case notConnected(reason: String?)
    case connecting
    case connected(name: String, workspace: String)

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }
}

/// Everything the SwiftUI views read. The controller changes `state` inside
/// `withAnimation`, and the shape and content follow.
final class NotchModel: ObservableObject {
    @Published var state: NotchState = .resting
    @Published var tab: InboxTab = .notifications
    @Published var inbox: InboxSnapshot = .empty
    @Published var connection: ConnectionState = .notConnected(reason: nil)
    /// Why the live inbox can't be read right now, in plain words.
    @Published var inboxProblem: String?
    /// A task's outcome, shown for a few seconds at the bottom of the inbox.
    @Published var banner: String?
    @Published var busyTasks: Set<String> = []
    /// The alert on screen (or next up).
    @Published var alert: AlertContent?
    @Published var voice: VoiceContent = .idle
    /// Microphone level, 0…1, for the sound bars.
    @Published var voiceLevel: Double = 0
    @Published var greetingText = ""
    @Published var greetingDayLine: [String] = []
    @Published var greetingStartedAt = Date.distantPast
    @Published var notchSize = CGSize(width: 179, height: 32)
    @Published var hasNotch = true

    /// Snapshot mode freezes the clock and the greeting's animation time.
    let fixedNow: Date?
    var greetingElapsedOverride: Double?
    let calendar: Calendar
    /// Drawn only in snapshots, like the mock-up; on the Mac the real camera is there.
    var showsCameraDot = false
    /// Snapshots only: outline the hardware notch to check nothing sits under it.
    var showsNotchOutline = false

    var onTap: ((CGPoint) -> Void)?
    var onAction: ((NotchAction) -> Void)?

    init(fixedNow: Date? = nil, calendar: Calendar = .autoupdatingCurrent) {
        self.fixedNow = fixedNow
        self.calendar = calendar
    }

    func now() -> Date { fixedNow ?? Date() }

    /// While not connected, the inbox is the bundled example.
    var isExample: Bool { !connection.isConnected }

    func presenter(at date: Date? = nil) -> InboxPresenter {
        InboxPresenter(inbox: inbox, now: date ?? now(), calendar: calendar)
    }

    /// The name the greeting uses: the account's, or this Mac's owner's until it's connected.
    var greetingFirstName: String {
        if connection.isConnected, !inbox.me.firstName.isEmpty { return inbox.me.firstName }
        if case let .connected(name, _) = connection, let first = name.split(separator: " ").first { return String(first).capitalized }
        return Self.macFirstName
    }

    static var macFirstName: String {
        let full = NSFullUserName().trimmingCharacters(in: .whitespaces)
        return full.split(separator: " ").first.map(String.init) ?? NSUserName()
    }

    func greetingDayLine(at date: Date? = nil) -> [String] {
        isExample ? ["Connect BuildFlow to see your day"] : presenter(at: date).dayLine()
    }

    var spec: ShapeSpec { spec(for: state) }

    func spec(for s: NotchState) -> ShapeSpec {
        NotchMetrics.spec(for: s, notch: notchSize, liveWidth: s == .live ? liveWidth(for: liveActivity()) : nil)
    }

    func liveActivity(at date: Date? = nil) -> LiveActivity {
        presenter(at: date).previewLiveActivity()
    }

    func alertContent() -> AlertContent {
        alert ?? presenter().previewAlert()
            ?? AlertContent(icon: .bell, tone: .muted, status: "Nothing new", title: "All caught up", subtitle: "New items that need you drop down here.")
    }

    /// The live activity's width for its label, so the label clears the camera.
    func liveWidth(for live: LiveActivity) -> CGFloat {
        let label = (live.label as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 13)]).width
        let inWidth = ("in" as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 13, weight: .medium)]).width
        // Measure the countdown with zeros so the width doesn't twitch every second.
        let digits = String(live.countdown.map { $0.isNumber ? "0" : $0 })
        let countFont = NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
        let count = (digits as NSString).size(withAttributes: [.font: countFont]).width
        return NotchMetrics.liveWidth(leftContent: 22 + 8 + ceil(label), rightContent: ceil(inWidth) + 6 + ceil(count),
                                      notchWidth: notchSize.width)
    }

    /// The hardware notch in the canvas's coordinates (top-left origin).
    var notchZone: CGRect {
        let c = NotchMetrics.canvas
        return CGRect(x: c.width / 2 - notchSize.width / 2, y: 0, width: notchSize.width, height: notchSize.height)
    }
}
