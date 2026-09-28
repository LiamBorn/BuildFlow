import BuildFlowNotchKit
import SwiftUI

// MARK: - 2 · The dropdown (the reference's f05)

/// The dropdown's measurements.
enum InboxLayout {
    /// Black between the two cards.
    static let cardGap: CGFloat = 10
    /// The list's share of the two cards' width: the reference's split, the wider card holding the list.
    static let listShare: CGFloat = 0.53
    /// A card's header ("Notifications", "Today").
    static let header: CGFloat = 34
    static let rowHeight: CGFloat = 44
    /// The Today rows share the card's height, up to this.
    static let todayRowMax: CGFloat = 60
    /// A tab in the track.
    static let tab = CGSize(width: 38, height: 26)
    /// Where the gear's menu hangs, under the band.
    static let menuTop: CGFloat = 6
}

/// What the dropdown shows at one moment: read from the inbox once a second, not every frame of
/// its opening.
struct InboxFrame {
    let card: CardContent
    let today: [InboxRow]
    let todayHeader: String
    let chips: [DayChip]
    let counts: [InboxTab: Int]
    let unread: Int
    /// Nothing read yet (loading, or BuildFlow can't be reached): say nothing about the day rather than "no jobs".
    let waiting: Bool

    @MainActor
    init(model: NotchModel, at date: Date) {
        let p = model.presenter(at: date)
        card = p.card(for: model.tab)
        today = p.todayRows()
        todayHeader = p.todayHeader
        chips = model.greetingDayLine(at: date)
        var counts: [InboxTab: Int] = [:]
        for tab in InboxTab.allCases { counts[tab] = p.count(for: tab) }
        self.counts = counts
        unread = p.unreadCount
        waiting = model.inboxProblem != nil && model.inbox.isBlank
    }
}

/// The dropdown. Opened by ⌃⌥ or a click it opens as the greeting first (the script writing itself,
/// the day line under it), then springs into the tabs and the two cards; opened by hovering it is
/// simply there.
struct InboxContent: View {
    @ObservedObject var model: NotchModel
    @Environment(\.notchReduceMotion) private var reduceMotion

    var body: some View {
        // The words once a second; the opening's frames only move what is already there.
        Ticking(fixed: model.fixedNow, schedule: .everySecond) { date in
            let frame = InboxFrame(model: model, at: date)
            let playing = model.introPlays
            let settled = date.timeIntervalSince(model.inboxOpenedAt) > InboxIntro.settled + 0.2
            IntroClock(fixedElapsed: model.fixedNow == nil ? nil : model.inboxElapsedOverride ?? .infinity,
                       openedAt: model.inboxOpenedAt, running: playing && !settled) { elapsed in
                ZStack(alignment: .top) {
                    if model.inboxGreeting {
                        GreetingStage(text: model.headerGreeting, chips: frame.waiting ? [] : frame.chips, token: .scriptHeader,
                                      reveal: InboxIntro.reveal(at: elapsed, playing: playing),
                                      chipsIn: InboxIntro.progress(.chips, at: elapsed, playing: playing),
                                      spec: model.spec(for: .greeting), notch: model.notchSize)
                            .transition(.notchContent(reduceMotion: reduceMotion))
                    } else {
                        // Its parts cascade in themselves.
                        InboxDropdown(model: model, frame: frame, spec: model.dropdownSpec, elapsed: elapsed, playing: playing)
                            .transition(.identity)
                    }
                }
            }
        }
    }
}

/// The time since the dropdown was asked for: every frame while its opening plays, and still once it
/// has settled (the same view either way, so nothing inside it is rebuilt when the frames stop).
struct IntroClock<Content: View>: View {
    let fixedElapsed: Double?
    let openedAt: Date
    let running: Bool
    @ViewBuilder let content: (Double) -> Content

    var body: some View {
        if let fixedElapsed {
            content(fixedElapsed)
        } else {
            TimelineView(.animation(minimumInterval: nil, paused: !running)) { ctx in
                content(running ? ctx.date.timeIntervalSince(openedAt) : .infinity)
            }
        }
    }
}

/// The black panel: the icon tabs top-left and the status, mic and gear top-right, beside the camera;
/// below, the list and the Today card side by side.
struct InboxDropdown: View {
    @ObservedObject var model: NotchModel
    let frame: InboxFrame
    let spec: ShapeSpec
    let elapsed: Double
    let playing: Bool
    @Environment(\.notchTheme) private var theme
    @Environment(\.notchReduceMotion) private var reduceMotion

    func progress(_ part: InboxIntro.Part) -> Double { InboxIntro.progress(part, at: elapsed, playing: playing) }

    var body: some View {
        let notch = model.notchSize
        let box = NotchMetrics.content(in: spec, notch: notch)
        let listWidth = ((box.width - InboxLayout.cardGap) * InboxLayout.listShare).rounded()
        let todayWidth = box.width - InboxLayout.cardGap - listWidth
        let cards = model.theme
        ZStack(alignment: .topLeading) {
            InBand(side: .left, spec: spec, notch: notch) {
                TabTrack(model: model, counts: frame.counts)
            }
            .modifier(IntroEntrance(progress: progress(.tabs)))
            InBand(side: .right, spec: spec, notch: notch) {
                BandControls(model: model)
            }
            .modifier(IntroEntrance(progress: progress(.tabs)))

            HStack(alignment: .top, spacing: InboxLayout.cardGap) {
                ListCard(model: model, card: frame.card, unread: frame.unread, waiting: frame.waiting, height: box.height)
                    .frame(width: listWidth, height: box.height)
                    .notchCard(cards)
                    .modifier(IntroEntrance(progress: progress(.list)))
                TodayCard(model: model, frame: frame, height: box.height)
                    .frame(width: todayWidth, height: box.height)
                    .notchCard(cards)
                    .modifier(IntroEntrance(progress: progress(.today)))
            }
            .environment(\.notchTheme, cards)
            .environment(\.colorScheme, cards.colorScheme)
            .padding(.leading, box.minX)
            .padding(.top, box.minY)

            if model.settingsMenuOpen {
                // A click anywhere else in the dropdown puts the menu away (and does nothing else).
                Color.clear
                    .contentShape(Rectangle())
                    .frame(width: spec.width, height: spec.height)
                    .onTapGesture { model.onAction?(.toggleSettingsMenu) }
                SettingsMenu(model: model)
                    .environment(\.notchTheme, cards)
                    .environment(\.colorScheme, cards.colorScheme)
                    .padding(.top, notch.height + InboxLayout.menuTop)
                    .padding(.trailing, NotchMetrics.bandPadding)
                    .frame(width: spec.width, height: spec.height, alignment: .topTrailing)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.96, anchor: .topTrailing)))
            }

            if let banner = model.banner {
                theme.text(banner, .toast)
                    .foregroundColor(cards[.surface])
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(cards[.ink]).themeShadow(.raised, cards))
                    .frame(maxWidth: spec.width - 140)
                    .padding(.bottom, NotchMetrics.contentInset + 12)
                    .frame(width: spec.width, height: spec.height, alignment: .bottom)
                    .transition(.opacity)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: spec.width, height: spec.height, alignment: .topLeading)
    }
}

/// Right of the camera: the connection's status in grey (the reference's "Connected"), Connect while
/// this Mac isn't, the mic on a subtle disc, and the plain gear.
struct BandControls: View {
    @ObservedObject var model: NotchModel
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let status = model.bandStatus
        HStack(spacing: 10) {
            theme.text(status.label, .band)
                .foregroundColor(status == .example ? theme.tone(status.tone).color : theme[.inkMuted])
                .lineLimit(1)
                .fixedSize()
            if model.isExample {
                PillButton(title: model.connection == .connecting ? "Connecting…" : "Connect", kind: .primary, size: .small) {
                    model.onAction?(.connect)
                }
                .help("Connect this Mac to your BuildFlow account")
            }
            HStack(spacing: 4) {
                NotchIconButton(icon: .mic, disc: true, help: "Ask BuildFlow (hold ⌃ ⌥)") { model.onAction?(.startVoice) }
                NotchIconButton(icon: .settings, pressed: model.settingsMenuOpen, help: "Settings") {
                    model.onAction?(.toggleSettingsMenu)
                }
            }
        }
    }
}

/// The four tabs as icons in a dark pill track, the chosen one on a lighter pill; a count shows as a
/// small badge on its icon (the reference's dot), in the accent when it is unread news.
struct TabTrack: View {
    @ObservedObject var model: NotchModel
    let counts: [InboxTab: Int]
    @Namespace private var pill
    @Environment(\.notchTheme) private var theme

    static func label(_ tab: InboxTab) -> String {
        switch tab {
        case .notifications: return "Notifications"
        case .jobs: return "Jobs"
        case .meetings: return "Meetings"
        case .tasks: return "Tasks"
        }
    }

    static func icon(_ tab: InboxTab) -> NotchIcon {
        switch tab {
        case .notifications: return .bell
        case .jobs: return .hardHat
        case .meetings: return .video
        case .tasks: return .listChecks
        }
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(InboxTab.allCases, id: \.self) { tab in
                TabButton(model: model, tab: tab, count: counts[tab], pill: pill)
            }
        }
        .padding(2)
        .background(Capsule().fill(theme[.track]).overlay(Capsule().strokeBorder(theme[.lineSolid], lineWidth: 1)))
        .fixedSize()
    }
}

struct TabButton: View {
    @ObservedObject var model: NotchModel
    let tab: InboxTab
    let count: Int?
    let pill: Namespace.ID
    @Environment(\.notchTheme) private var theme
    @Environment(\.notchReduceMotion) private var reduceMotion
    @State private var hovering = false

    var body: some View {
        let selected = model.tab == tab
        let name = TabTrack.label(tab)
        Button {
            // The website's pill travel: 0.47 s on its fitted curve (motion/tokens.ts DUR.pill, EASE.pill).
            withAnimation(reduceMotion ? nil : .timingCurve(0.3, 1, 0.6, 0.85, duration: 0.47)) { model.tab = tab }
            model.onAction?(.tabShown(tab))
        } label: {
            IconView(icon: TabTrack.icon(tab), size: 16, lineWidth: 2.1)
                .foregroundColor(selected || hovering ? theme[.ink] : theme[.inkMuted])
                .frame(width: InboxLayout.tab.width, height: InboxLayout.tab.height)
                .background {
                    if selected {
                        Capsule().fill(theme[.selection]).matchedGeometryEffect(id: "pill", in: pill)
                    } else if hovering {
                        Capsule().fill(theme[.hover])
                    }
                }
                .overlay(alignment: .topTrailing) {
                    if let count {
                        CountBadge(count: count, strong: tab == .notifications).offset(x: 1, y: -4)
                    }
                }
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(count.map { "\(name) · \($0)" } ?? name)
        .accessibilityLabel(count.map { "\(name), \($0)" } ?? name)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A tab's count: a small badge ringed in the black, in the accent for unread notifications.
struct CountBadge: View {
    let count: Int
    let strong: Bool
    @Environment(\.notchTheme) private var theme

    var body: some View {
        theme.text(count > 99 ? "99+" : "\(count)", .count)
            .foregroundColor(strong ? theme[.onAccent] : theme[.ink])
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 3.5)
            .frame(minWidth: 14, minHeight: 14, maxHeight: 14)
            .background(Capsule().fill(strong ? theme[.accentFill] : theme[.control]))
            .padding(1.5)
            .background(Capsule().fill(theme[.frame]))
            .accessibilityHidden(true)
    }
}

/// A card's header: its name in small grey words, and a note or an action at the right.
struct CardHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder let trailing: () -> Trailing
    @Environment(\.notchTheme) private var theme

    var body: some View {
        HStack(spacing: 8) {
            theme.text(title, .eyebrow).foregroundColor(theme[.inkMuted]).lineLimit(1)
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 14)
        .frame(height: InboxLayout.header)
    }
}

/// The left card: the chosen tab's list.
struct ListCard: View {
    @ObservedObject var model: NotchModel
    let card: CardContent
    let unread: Int
    let waiting: Bool
    let height: CGFloat
    @Environment(\.notchTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            CardHeader(title: card.title) {
                if model.tab == .notifications && unread > 0 && !model.isExample {
                    TextButton(title: card.note) { model.onAction?(.markAllRead) }
                } else if !card.note.isEmpty && !card.rows.isEmpty && !waiting {
                    theme.text(card.note, .eyebrow).foregroundColor(theme[.inkFaint]).lineLimit(1)
                }
            }
            list(height: height - InboxLayout.header)
        }
    }

    @ViewBuilder
    func list(height: CGFloat) -> some View {
        if card.rows.isEmpty {
            let empty = model.isExample ? card.empty : (model.inboxProblem.map(EmptyState.problem) ?? card.empty)
            EmptyStateView(state: empty) { action in model.onAction?(.empty(action)) }
                .padding(.bottom, 10)
        } else if model.fixedNow != nil {
            // Snapshots: ImageRenderer draws no scroll views, so show what fits.
            rows(limit: max(1, Int((height - 4) / InboxLayout.rowHeight)))
                .frame(maxHeight: .infinity, alignment: .top)
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                rows(limit: card.rows.count).padding(.bottom, 4)
            }
        }
    }

    func rows(limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(card.rows.prefix(limit).enumerated()), id: \.element.id) { i, row in
                RowView(model: model, row: row)
                    .overlay(alignment: .top) {
                        if i > 0 { Hairline().padding(.leading, RowView.textInset).padding(.trailing, 12) }
                    }
            }
        }
    }
}

/// The right card, as the reference's right card: a tinted icon, a white label, a grey value, and a
/// control at the end (Join, a crew, "Hold").
struct TodayCard: View {
    @ObservedObject var model: NotchModel
    let frame: InboxFrame
    let height: CGFloat
    @Environment(\.notchTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardHeader(title: "Today") {
                theme.text(frame.todayHeader, .eyebrow).foregroundColor(theme[.inkFaint]).lineLimit(1)
            }
            if frame.waiting {
                theme.text("Your day shows here once the inbox is read.", .emptyDetail)
                    .foregroundColor(theme[.inkMuted])
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.top, 6)
            } else {
                let rows = frame.today
                let rowHeight = min(InboxLayout.todayRowMax, ((height - InboxLayout.header - 6) / CGFloat(max(3, rows.count))).rounded(.down))
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                    TodayRow(model: model, row: row, height: rowHeight)
                        .overlay(alignment: .top) {
                            if i > 0 { Hairline().padding(.leading, RowView.textInset).padding(.trailing, 12) }
                        }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

/// A list row: the tinted disc, the white title over its grey line, the time (or the row's buttons)
/// at the end, the unread dot, and a chevron on hover when the row opens something.
struct RowView: View {
    @ObservedObject var model: NotchModel
    let row: InboxRow
    @State private var hovering = false
    @Environment(\.notchTheme) private var theme

    /// Where a row's words start: the hairlines between rows start there too, as the reference's do.
    static let textInset: CGFloat = 12 + 28 + 10

    var opensSomething: Bool { row.target != nil && !model.isExample }

    /// A notification already read is quieter, as on the website; other rows have no read state.
    var isRead: Bool {
        if case .notification = row.target { return !row.unread }
        return false
    }

    var showsChevron: Bool {
        guard opensSomething else { return false }
        switch row.trailing {
        case .join, .buttons: return false
        default: return true
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            ToneDisc(icon: row.icon, tone: row.tone)
            VStack(alignment: .leading, spacing: 1) {
                theme.text(row.title, isRead ? .rowTitleRead : .rowTitle)
                    .foregroundColor(isRead ? theme[.inkMuted] : theme[.ink])
                    .lineLimit(1)
                theme.text(row.subtitle, .rowSub)
                    .foregroundColor(theme[.inkMuted])
                    .lineLimit(1)
            }
            Spacer(minLength: 6)
            trailing
        }
        .padding(.horizontal, 12)
        .frame(height: InboxLayout.rowHeight)
        .background(theme[.hover].opacity(hovering && opensSomething ? 1 : 0))
        // The chevron shows on hover, in the row's own margin, so it never takes room from the words.
        .overlay(alignment: .trailing) {
            if showsChevron {
                IconView(icon: .chevronRight, size: 12, lineWidth: 2)
                    .foregroundColor(theme[.ink])
                    .padding(.trailing, 1)
                    .opacity(hovering ? 1 : 0)
            }
        }
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture {
            if opensSomething, let target = row.target { model.onAction?(.open(target)) }
        }
        .help(opensSomething ? "Open in BuildFlow" : "")
    }

    @ViewBuilder var trailing: some View {
        switch row.trailing {
        case .none:
            if row.unread { UnreadDot() }
        case let .text(s):
            HStack(spacing: 7) {
                theme.text(s, .meta).foregroundColor(theme[.inkFaint]).lineLimit(1).fixedSize()
                if row.unread { UnreadDot() }
            }
        case let .twoLine(a, b):
            VStack(alignment: .trailing, spacing: 1) {
                theme.text(a, .meta)
                theme.text(b, .meta)
            }
            .foregroundColor(theme[.inkFaint])
            .fixedSize()
        case let .join(url):
            PillButton(title: "Join", kind: .secondary, size: .small) {
                if let url = url.flatMap(URL.init(string:)) { model.onAction?(.join(url)) }
            }
        case let .buttons(buttons):
            if model.busyTasks.contains(row.id) {
                theme.text("Working…", .meta).foregroundColor(theme[.inkMuted]).fixedSize()
            } else {
                HStack(spacing: 5) {
                    ForEach(buttons) { b in
                        PillButton(title: b.label, kind: b.primary ? .primary : .secondary, size: .small) {
                            if !model.isExample { model.onAction?(.task(taskId: row.id, actionId: b.id)) }
                        }
                    }
                }
                .fixedSize()
            }
        }
    }
}

/// A Today row, in one line as the reference's are: the label in white, the value in grey at the end,
/// and the control after it.
struct TodayRow: View {
    @ObservedObject var model: NotchModel
    let row: InboxRow
    let height: CGFloat
    @State private var hovering = false
    @Environment(\.notchTheme) private var theme

    var opensSomething: Bool { row.target != nil && !model.isExample }

    var body: some View {
        HStack(spacing: 0) {
            ToneDisc(icon: row.icon, tone: row.tone)
            theme.text(row.title, .todayLabel)
                .foregroundColor(theme[.ink])
                .lineLimit(1)
                .fixedSize()
                .padding(.leading, 10)
            Spacer(minLength: 10)
            value
            trailing
        }
        .padding(.horizontal, 12)
        .frame(height: height)
        .background(theme[.hover].opacity(hovering && opensSomething ? 1 : 0))
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
        .onTapGesture {
            if opensSomething, let target = row.target { model.onAction?(.open(target)) }
        }
        .help(opensSomething ? "Open in BuildFlow" : "")
    }

    /// The value in one line when it fits; else its parts ("Rain from 2 PM · Maple St. Plaza") one
    /// under the other.
    var value: some View {
        let parts = row.subtitle.components(separatedBy: " · ")
        return ViewThatFits(in: .horizontal) {
            theme.text(row.subtitle, .todayValue).lineLimit(1).fixedSize()
            VStack(alignment: .trailing, spacing: 1) {
                ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                    theme.text(part, .todayValue).lineLimit(1)
                }
            }
        }
        .foregroundColor(theme[.inkMuted])
        .multilineTextAlignment(.trailing)
    }

    @ViewBuilder var trailing: some View {
        switch row.trailing {
        case let .join(url):
            PillButton(title: "Join", kind: .secondary, size: .small) {
                if let url = url.flatMap(URL.init(string:)) { model.onAction?(.join(url)) }
            }
            .padding(.leading, 10)
        case let .text(s):
            theme.text(s, .todayValue).foregroundColor(theme[.inkMuted]).lineLimit(1).fixedSize()
                .frame(minWidth: 38, alignment: .trailing)
                .padding(.leading, 10)
        case let .twoLine(a, b):
            VStack(alignment: .trailing, spacing: 1) {
                theme.text(a, .meta)
                theme.text(b, .meta)
            }
            .foregroundColor(theme[.inkFaint])
            .fixedSize()
            .padding(.leading, 10)
        case .none, .buttons:
            EmptyView()
        }
    }
}

// MARK: - The gear's menu

/// A small menu under the gear: Appearance (Light · Dark · Match macOS), Check for Updates… (the
/// menu-bar icon can sit behind the notch, so this is the way to Sparkle), and the rest of the
/// settings in the menu bar.
struct SettingsMenu: View {
    @ObservedObject var model: NotchModel
    @Environment(\.notchTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("Appearance")
                .padding(.horizontal, 10)
                .padding(.top, 8)
                .padding(.bottom, 8)
            AppearanceSegments(model: model)
                .padding(.horizontal, 4)
            Hairline()
                .padding(.vertical, 8)
            MenuRow(title: model.updateMenuTitle, icon: .download, enabled: model.canCheckForUpdates) { model.onAction?(.checkForUpdates) }
            MenuRow(title: "More settings…", icon: .settings) { model.onAction?(.openSettings) }
        }
        .padding(6)
        .fixedSize()
        .background(
            RoundedRectangle(cornerRadius: theme.radii.panel, style: .continuous)
                .fill(theme[.surfaceRaised])
                .overlay(RoundedRectangle(cornerRadius: theme.radii.panel, style: .continuous).strokeBorder(theme[.lineSolid], lineWidth: 1))
                .themeShadow(.float, theme))
    }
}

/// The Preferences panel's segmented control: a pill track, the chosen one in the ink.
struct AppearanceSegments: View {
    @ObservedObject var model: NotchModel
    @Environment(\.notchTheme) private var theme
    @Environment(\.notchReduceMotion) private var reduceMotion
    @Namespace private var pill

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Appearance.allCases, id: \.self) { a in
                let chosen = model.appearance == a
                Button {
                    withAnimation(reduceMotion ? nil : .timingCurve(0.3, 1, 0.6, 0.85, duration: 0.47)) {
                        model.onAction?(.setAppearance(a))
                    }
                } label: {
                    theme.text(a.label, .tab)
                        .foregroundColor(chosen ? theme[.surface] : theme[.inkMuted])
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, 12)
                        .frame(height: 26)
                        .background {
                            if chosen { Capsule().fill(theme[.ink]).matchedGeometryEffect(id: "appearance", in: pill) }
                        }
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Capsule().fill(theme[.hover]))
        .fixedSize()
    }
}

struct MenuRow: View {
    let title: String
    let icon: NotchIcon
    var enabled = true
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                IconView(icon: icon, size: 15, lineWidth: 2).foregroundColor(theme[.inkMuted])
                theme.text(title, .menuItem).foregroundColor(theme[.ink])
                Spacer(minLength: 0)
                IconView(icon: .chevronRight, size: 12, lineWidth: 2).foregroundColor(theme[.inkFaint])
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(RoundedRectangle(cornerRadius: theme.radii.control, style: .continuous).fill(hovering && enabled ? theme[.hover] : .clear))
            .opacity(enabled ? 1 : 0.45)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .onHover { hovering = $0 }
    }
}
