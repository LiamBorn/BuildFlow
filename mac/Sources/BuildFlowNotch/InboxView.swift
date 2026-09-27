import BuildFlowNotchKit
import SwiftUI

// MARK: - 2 · The dropdown

/// The dropdown's measurements, inside its BuildFlow window.
enum InboxLayout {
    static let padding: CGFloat = 18
    static let top: CGFloat = 14
    static let bottom: CGFloat = 16
    /// The greeting and its chips.
    static let header: CGFloat = 86
    static let gap: CGFloat = 12
    static let tabs: CGFloat = 34
    static let cardGap: CGFloat = 12
    static let rowHeight: CGFloat = 48
    /// The Today card's share of the width beside the list.
    static let todayShare: CGFloat = 0.42

    static func bodyHeight(card: CGSize) -> CGFloat {
        card.height - top - header - gap - tabs - gap - bottom
    }
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

/// The dropdown: the greeting at the top (written as it opens), its day in chips, the tab track,
/// and the list beside the Today card.
struct InboxContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec

    var body: some View {
        // The words once a second; the opening's frames only move what is already there.
        Ticking(fixed: model.fixedNow, schedule: .everySecond) { date in
            let frame = InboxFrame(model: model, at: date)
            let playing = model.introPlays
            let settled = date.timeIntervalSince(model.inboxOpenedAt) > InboxIntro.settled + 0.2
            IntroClock(fixedElapsed: model.fixedNow == nil ? nil : model.inboxElapsedOverride ?? .infinity,
                       openedAt: model.inboxOpenedAt, running: playing && !settled) { elapsed in
                CardContainer(spec: spec, notch: model.notchSize) { size in
                    InboxWindow(model: model, frame: frame, size: size, elapsed: elapsed, playing: playing)
                }
            }
        }
    }
}

/// The time since the dropdown opened: every frame while its opening plays, and still once it has
/// settled (the same view either way, so nothing inside it is rebuilt when the frames stop).
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

/// A part of the dropdown coming in beneath the greeting: it rises, sharpens and appears.
struct IntroEntrance: ViewModifier {
    let progress: Double

    func body(content: Content) -> some View {
        content
            .opacity(progress)
            .offset(y: (1 - progress) * InboxIntro.rise)
            .blur(radius: (1 - progress) * 6)
    }
}

struct InboxWindow: View {
    @ObservedObject var model: NotchModel
    let frame: InboxFrame
    let size: CGSize
    let elapsed: Double
    let playing: Bool
    @Environment(\.notchTheme) private var theme
    @Environment(\.notchReduceMotion) private var reduceMotion

    func progress(_ part: InboxIntro.Part) -> Double { InboxIntro.progress(part, at: elapsed, playing: playing) }

    var body: some View {
        let inner = size.width - 2 * InboxLayout.padding
        let bodyHeight = InboxLayout.bodyHeight(card: size)
        let todayWidth = ((inner - InboxLayout.cardGap) * InboxLayout.todayShare).rounded()
        let listWidth = inner - InboxLayout.cardGap - todayWidth
        let card = frame.card
        let waiting = frame.waiting
        ZStack(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 0) {
                header(waiting: waiting)
                    .frame(height: InboxLayout.header, alignment: .top)
                tabsRow(card: card, waiting: waiting)
                    .frame(height: InboxLayout.tabs)
                    .modifier(IntroEntrance(progress: progress(.tabs)))
                    .padding(.top, InboxLayout.gap)
                HStack(alignment: .top, spacing: InboxLayout.cardGap) {
                    listCard(card, height: bodyHeight)
                        .frame(width: listWidth, height: bodyHeight)
                        .whiteCard(theme)
                        .modifier(IntroEntrance(progress: progress(.list)))
                    todayCard(height: bodyHeight, waiting: waiting)
                        .frame(width: todayWidth, height: bodyHeight)
                        .whiteCard(theme)
                        .modifier(IntroEntrance(progress: progress(.today)))
                }
                .padding(.top, InboxLayout.gap)
            }
            .padding(.top, InboxLayout.top)
            .padding(.horizontal, InboxLayout.padding)
            .frame(width: size.width, height: size.height, alignment: .topLeading)

            if model.settingsMenuOpen {
                // A click anywhere else in the window puts the menu away (and does nothing else).
                Color.clear
                    .contentShape(Rectangle())
                    .frame(width: size.width, height: size.height)
                    .onTapGesture { model.onAction?(.toggleSettingsMenu) }
                SettingsMenu(model: model)
                    .padding(.top, InboxLayout.top + 36 + 8)
                    .padding(.trailing, InboxLayout.padding)
                    .frame(width: size.width, height: size.height, alignment: .topTrailing)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.96, anchor: .topTrailing)))
            }

            if let banner = model.banner {
                theme.text(banner, .toast)
                    .foregroundColor(theme[.surface])
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: theme.radii.card).fill(theme[.ink]).themeShadow(.raised, theme))
                    .frame(maxWidth: size.width - 120)
                    .padding(.bottom, 14)
                    .frame(width: size.width, height: size.height, alignment: .bottom)
                    .transition(.opacity)
                    .allowsHitTesting(false)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }

    // The greeting, its chips, and the buttons.
    func header(waiting: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                ScriptLine(text: model.headerGreeting, token: .scriptHeader,
                           reveal: InboxIntro.reveal(at: elapsed, playing: playing))
                    .padding(.top, 4)
                ChipRow(chips: waiting ? [] : frame.chips)
                    .padding(.top, 14)
                    .modifier(IntroEntrance(progress: progress(.chips)))
            }
            Spacer(minLength: 12)
            HStack(spacing: 8) {
                if model.isExample {
                    PillButton(title: model.connection == .connecting ? "Connecting…" : "Connect", kind: .primary) {
                        model.onAction?(.connect)
                    }
                    .help("Connect this Mac to your BuildFlow account")
                }
                IconDiscButton(icon: .mic, style: .ink, help: "Ask BuildFlow (hold ⌃ ⌥)") { model.onAction?(.startVoice) }
                IconDiscButton(icon: .settings, style: .white, pressed: model.settingsMenuOpen, help: "Settings") {
                    model.onAction?(.toggleSettingsMenu)
                }
            }
        }
    }

    // The tab track, and the list's note or action at the right.
    func tabsRow(card: CardContent, waiting: Bool) -> some View {
        HStack(spacing: 12) {
            TabTrack(model: model, counts: frame.counts)
            Spacer(minLength: 8)
            if model.tab == .notifications && frame.unread > 0 && !model.isExample {
                PillButton(title: card.note, kind: .secondary, size: .small) { model.onAction?(.markAllRead) }
            } else if !card.note.isEmpty && !card.rows.isEmpty && !waiting {
                theme.text(card.note, .meta).foregroundColor(theme[.inkFaint]).lineLimit(1)
            }
        }
    }

    @ViewBuilder
    func listCard(_ card: CardContent, height: CGFloat) -> some View {
        if card.rows.isEmpty {
            let empty = model.isExample ? card.empty : (model.inboxProblem.map(EmptyState.problem) ?? card.empty)
            EmptyStateView(state: empty) { action in model.onAction?(.empty(action)) }
        } else if model.fixedNow != nil {
            // Snapshots: ImageRenderer draws no scroll views, so show what fits.
            rows(card.rows, limit: max(1, Int((height - 8) / InboxLayout.rowHeight)))
                .padding(.vertical, 4)
                .frame(maxHeight: .infinity, alignment: .top)
        } else {
            ScrollView(.vertical, showsIndicators: false) {
                rows(card.rows, limit: card.rows.count).padding(.vertical, 4)
            }
        }
    }

    func todayCard(height: CGFloat, waiting: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Eyebrow("Today · \(frame.todayHeader)")
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 4)
            if waiting {
                theme.text("Your day shows here once the inbox is read.", .emptyDetail)
                    .foregroundColor(theme[.inkMuted])
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 14)
                    .padding(.top, 6)
            } else {
                rows(frame.today, limit: max(1, Int((height - 36) / InboxLayout.rowHeight)))
            }
            Spacer(minLength: 0)
        }
    }

    func rows(_ rows: [InboxRow], limit: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.prefix(limit).enumerated()), id: \.element.id) { i, row in
                RowView(model: model, row: row)
                    .overlay(alignment: .top) {
                        if i > 0 { Hairline().padding(.horizontal, 14) }
                    }
            }
        }
    }
}

/// "Notifications 6 · Jobs · Meetings · Tasks 2": a pill track, the chosen tab an ink pill with
/// its count on it, the others muted with theirs.
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

    var body: some View {
        HStack(spacing: 2) {
            ForEach(InboxTab.allCases, id: \.self) { tab in
                TabButton(model: model, tab: tab, count: counts[tab], pill: pill)
            }
        }
        .padding(3)
        .background(Capsule().fill(theme[.surface]).themeShadow(.card, theme))
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
        Button {
            // The website's pill travel: 0.47 s on its fitted curve (motion/tokens.ts DUR.pill, EASE.pill).
            withAnimation(reduceMotion ? nil : .timingCurve(0.3, 1, 0.6, 0.85, duration: 0.47)) { model.tab = tab }
            model.onAction?(.tabShown(tab))
        } label: {
            HStack(spacing: 6) {
                theme.text(TabTrack.label(tab), .tab)
                    .foregroundColor(selected ? theme[.surface] : hovering ? theme[.ink] : theme[.inkMuted])
                if let count {
                    theme.text("\(count)", .count)
                        .foregroundColor(selected ? theme[.surface] : theme[.inkMuted])
                        .padding(.horizontal, 6)
                        .frame(minWidth: 18)
                        .frame(height: 17)
                        .background(Capsule().fill(selected ? theme[.surface].opacity(0.16) : theme[.hover]))
                }
            }
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 12)
            .frame(height: 28)
            .background {
                if selected {
                    Capsule().fill(theme[.ink]).matchedGeometryEffect(id: "pill", in: pill)
                } else if hovering {
                    Capsule().fill(theme[.hover])
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(TabTrack.label(tab))
    }
}

/// A BuildFlow row: the tone disc, the title and its line, the time or the row's buttons at the
/// end, the unread dot, and a chevron on hover when the row opens something.
struct RowView: View {
    @ObservedObject var model: NotchModel
    let row: InboxRow
    @State private var hovering = false
    @Environment(\.notchTheme) private var theme

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
        HStack(spacing: 12) {
            ToneDisc(icon: row.icon, tone: row.tone)
            VStack(alignment: .leading, spacing: 2) {
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
        .padding(.horizontal, 14)
        .frame(height: InboxLayout.rowHeight)
        .background(theme[.hover].opacity(hovering && opensSomething ? 1 : 0))
        // The chevron shows on hover, in the row's own margin, so it never takes room from the words.
        .overlay(alignment: .trailing) {
            if showsChevron {
                IconView(icon: .chevronRight, size: 14)
                    .foregroundColor(theme[.ink])
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
            HStack(spacing: 8) {
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
            PillButton(title: "Join", kind: .primary, size: .small) {
                if let url = url.flatMap(URL.init(string:)) { model.onAction?(.join(url)) }
            }
        case let .buttons(buttons):
            if model.busyTasks.contains(row.id) {
                theme.text("Working…", .meta).foregroundColor(theme[.inkMuted]).fixedSize()
            } else {
                HStack(spacing: 6) {
                    ForEach(buttons) { b in
                        PillButton(title: b.label, kind: b.primary ? .primary : .secondary, size: .small, onSurface: true) {
                            if !model.isExample { model.onAction?(.task(taskId: row.id, actionId: b.id)) }
                        }
                    }
                }
                .fixedSize()
            }
        }
    }
}

// MARK: - The gear's menu

/// A small BuildFlow menu under the gear: Appearance (Light · Dark · Match macOS) and the way to the
/// rest of the settings in the menu bar.
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
            MenuRow(title: "More settings…", icon: .settings) { model.onAction?(.openSettings) }
        }
        .padding(6)
        .fixedSize()
        .background(
            RoundedRectangle(cornerRadius: theme.radii.panel)
                .fill(theme[.surfaceRaised])
                .overlay(RoundedRectangle(cornerRadius: theme.radii.panel).strokeBorder(theme[.lineSoft], lineWidth: 1))
                .themeShadow(.float, theme))
    }
}

/// The Preferences panel's segmented control: a pill track, the chosen one in ink.
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
                        .frame(height: 28)
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
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                IconView(icon: icon, size: 15).foregroundColor(theme[.inkMuted])
                theme.text(title, .menuItem).foregroundColor(theme[.ink])
                Spacer(minLength: 0)
                IconView(icon: .chevronRight, size: 13).foregroundColor(theme[.inkFaint])
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(RoundedRectangle(cornerRadius: theme.radii.control).fill(hovering ? theme[.hover] : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}
