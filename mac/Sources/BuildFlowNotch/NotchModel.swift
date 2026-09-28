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
    /// The gear in the dropdown: open or close its little menu.
    case toggleSettingsMenu
    /// Appearance, chosen in that menu.
    case setAppearance(Appearance)
    /// An empty list's way out.
    case empty(EmptyAction)
    /// An alert's button.
    case alert(AlertAction)
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
    @Published var greetingDayLine: [DayChip] = []
    @Published var greetingStartedAt = Date.distantPast
    @Published var notchSize = CGSize(width: 179, height: 32)
    @Published var hasNotch = true

    /// Light, Dark or Match macOS (the status menu and the dropdown's gear), and what macOS is showing.
    @Published var appearance: Appearance = AppearanceStore.fallback
    @Published var systemIsDark = false
    /// System Settings › Accessibility › Display › Reduce motion: nothing springs, writes or slides.
    @Published var reduceMotion = false
    /// The gear's menu in the dropdown.
    @Published var settingsMenuOpen = false

    /// When the current state opened (the rim's light runs from then).
    @Published var shownAt = Date.distantPast

    /// How the dropdown was last opened, when, and the greeting it opens with.
    @Published var inboxOpening: InboxOpening = .hover
    @Published var inboxOpenedAt = Date.distantPast
    @Published var headerGreeting = ""
    /// The dropdown is still its greeting: the shape is the greeting's size until it springs open.
    @Published var inboxGreeting = false
    /// How long the Mac had been away when this visit began ("Welcome back" after 3 h or more).
    var visitAwayBefore: TimeInterval?

    /// Snapshot mode freezes the clock and the greeting's animation time.
    let fixedNow: Date?
    var greetingElapsedOverride: Double?
    /// Snapshots: how far into its opening the dropdown is drawn, and how long ago an alert or voice opened.
    var inboxElapsedOverride: Double?
    var shownElapsedOverride: Double?
    let calendar: Calendar

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

    func greetingDayLine(at date: Date? = nil) -> [DayChip] {
        if isExample { return [DayChip("Connect BuildFlow to see your day")] }
        // Nothing read yet: say nothing about the day rather than "No jobs today".
        if inboxProblem != nil && inbox.isBlank { return [] }
        return presenter(at: date).dayChips()
    }

    /// The set the views draw with.
    var theme: NotchTheme { NotchTheme(appearance.theme(systemIsDark: systemIsDark)) }

    /// The status right of the camera.
    var bandStatus: BandStatus {
        switch connection {
        case .connected: return .connected
        case .connecting: return .connecting
        case .notConnected: return .example
        }
    }

    /// Whether the dropdown's opening plays (⌃⌥ or a click) or everything is simply there (hover, Reduce Motion).
    var introPlays: Bool { InboxIntro.plays(inboxOpening, reduceMotion: reduceMotion) }

    /// The dropdown is opening: remember how, and write its greeting for this moment. Opened by ⌃⌥
    /// or a click, it opens as the greeting first.
    func beginInbox(_ opening: InboxOpening, at date: Date) {
        inboxOpening = opening
        inboxOpenedAt = date
        settingsMenuOpen = false
        inboxGreeting = InboxIntro.plays(opening, reduceMotion: reduceMotion)
        headerGreeting = HeaderGreeting.text(now: date, firstName: greetingFirstName, awayBeforeVisit: visitAwayBefore, calendar: calendar)
    }

    var spec: ShapeSpec { spec(for: state) }

    /// A state's shape; the dropdown is the greeting's size while it greets.
    func spec(for s: NotchState) -> ShapeSpec {
        if s == .inbox && inboxGreeting { return NotchMetrics.spec(for: .greeting, notch: notchSize) }
        return NotchMetrics.spec(for: s, notch: notchSize, liveWidth: s == .live ? liveWidth(for: liveActivity()) : nil)
    }

    /// The dropdown's own shape, once it has sprung open.
    var dropdownSpec: ShapeSpec { NotchMetrics.spec(for: .inbox, notch: notchSize) }

    func liveActivity(at date: Date? = nil) -> LiveActivity {
        presenter(at: date).previewLiveActivity()
    }

    func alertContent() -> AlertContent {
        alert ?? presenter().previewAlert()
            ?? AlertContent(icon: .bell, tone: .muted, status: "Nothing new", title: "All caught up", subtitle: "New items that need you drop down here.")
    }

    /// The live activity's width for its label, so the label clears the camera. Measured in the
    /// faces it is drawn in (LiveContent).
    func liveWidth(for live: LiveActivity) -> CGFloat {
        let set = BuildFlowTheme.frame
        let label = NotchFonts.width(live.label, set[.live])
        // Measure the countdown with zeros so the width doesn't twitch every second.
        let digits = String(live.countdown.map { $0.isNumber ? "0" : $0 })
        let count = NotchFonts.width(digits, set[.liveFigure])
        return NotchMetrics.liveWidth(leftContent: LiveContent.iconSize + LiveContent.iconGap + label,
                                      rightContent: LiveContent.ringSize + LiveContent.ringGap + count,
                                      notchWidth: notchSize.width,
                                      leftInset: LiveContent.leading, rightInset: LiveContent.trailing)
    }

    /// The hardware notch in the canvas's coordinates (top-left origin).
    var notchZone: CGRect {
        let c = NotchMetrics.canvas
        return CGRect(x: c.width / 2 - notchSize.width / 2, y: 0, width: notchSize.width, height: notchSize.height)
    }
}
