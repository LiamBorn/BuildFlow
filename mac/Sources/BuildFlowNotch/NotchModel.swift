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
}

enum ProposalChoice { case edit, reject, accept }

/// Everything the SwiftUI views read. The controller changes `state` inside
/// `withAnimation`, and the shape and content follow.
final class NotchModel: ObservableObject {
    @Published var state: NotchState = .resting
    @Published var tab: InboxTab = .notifications
    @Published var inbox: InboxSnapshot = .empty
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

    func presenter(at date: Date? = nil) -> InboxPresenter {
        InboxPresenter(inbox: inbox, now: date ?? now(), calendar: calendar)
    }

    var spec: ShapeSpec { spec(for: state) }

    func spec(for s: NotchState) -> ShapeSpec {
        NotchMetrics.spec(for: s, notch: notchSize, liveWidth: s == .live ? liveWidth(for: liveActivity()) : nil)
    }

    func liveActivity(at date: Date? = nil) -> LiveActivity {
        presenter(at: date).previewLiveActivity()
    }

    func alertContent() -> AlertContent {
        presenter().weatherHoldAlert()
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

    func markAllRead() {
        inbox.notifications = inbox.notifications.map { var n = $0; n.read = true; return n }
    }
}
