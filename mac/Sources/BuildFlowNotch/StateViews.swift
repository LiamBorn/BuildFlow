import BuildFlowNotchKit
import SwiftUI

/// Runs `content` against the live clock, or once against the frozen snapshot clock.
struct Ticking<Content: View>: View {
    let fixed: Date?
    let schedule: Schedule
    @ViewBuilder let content: (Date) -> Content

    enum Schedule { case animation, everySecond }

    var body: some View {
        if let fixed {
            content(fixed)
        } else {
            switch schedule {
            case .animation:
                TimelineView(.animation) { ctx in content(ctx.date) }
            case .everySecond:
                TimelineView(.periodic(from: Date(), by: 1)) { ctx in content(ctx.date) }
            }
        }
    }
}

// MARK: - 1 · Greeting

struct GreetingContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec

    var body: some View {
        Ticking(fixed: model.fixedNow, schedule: .animation) { date in
            let elapsed = model.greetingElapsedOverride ?? date.timeIntervalSince(model.greetingStartedAt)
            ZStack(alignment: .top) {
                EdgeLight(spec: spec, elapsed: elapsed)
                VStack(spacing: 4) {
                    ScriptText(text: model.greetingText, reveal: GreetingTimeline.reveal(at: elapsed))
                    DayLineView(parts: model.greetingDayLine)
                }
                .padding(.top, 30)
                .frame(width: spec.width, height: spec.height)
            }
            .frame(width: spec.width, height: spec.height)
        }
    }
}

/// The script, revealed by a soft mask sweeping left to right.
struct ScriptText: View {
    let text: String
    let reveal: Double

    var body: some View {
        let glow: CGFloat = 16
        // The font's line is taller than the mock-up's CSS line (line-height: 1),
        // so trim the difference and keep the letters where the mock-up has them.
        let halfLeading = max(0, (ScriptFont.lineHeight - ScriptFont.size) / 2)
        Text(text)
            .font(.custom(ScriptFont.name, size: ScriptFont.size))
            .foregroundColor(Palette.scriptInk)
            .shadow(color: Palette.orange.opacity(0.55), radius: 8)
            .shadow(color: Color.white.opacity(0.8), radius: 1)
            .fixedSize()
            .padding(.horizontal, 22)
            .padding(.vertical, glow)
            .mask(RevealMask(position: reveal))
            .padding(.top, 6 - halfLeading - glow)
            .padding(.bottom, 12 - halfLeading - glow)
    }
}

struct RevealMask: View {
    /// Where the mask's soft edge is, -0.08…1 (the mock-up's `--p`).
    let position: Double

    var body: some View {
        if position >= 1 {
            Color.black
        } else if position + 0.07 <= 0 {
            Color.clear
        } else {
            let a = min(max(position, 0), 1)
            let b = min(max(position + 0.07, a + 0.0001), 1)
            LinearGradient(stops: [.init(color: .black, location: a), .init(color: .clear, location: b)],
                           startPoint: .leading, endPoint: .trailing)
        }
    }
}

struct DayLineView: View {
    let parts: [String]

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                if i > 0 { Text("·").foregroundColor(Palette.white(0.35)) }
                Text(part)
            }
        }
        .font(.system(size: 13.5).monospacedDigit())
        .foregroundColor(Palette.white(0.68))
        .lineLimit(1)
    }
}

/// A thin orange-to-white light running once round the panel's edge (~2 s).
struct EdgeLight: View {
    let spec: ShapeSpec
    let elapsed: Double

    static let gradient = Gradient(stops: [
        .init(color: .clear, location: 0),
        .init(color: .clear, location: 250.0 / 360),
        .init(color: Palette.orange.opacity(0.9), location: 300.0 / 360),
        .init(color: .white, location: 318.0 / 360),
        .init(color: .clear, location: 340.0 / 360),
        .init(color: .clear, location: 1),
    ])

    var body: some View {
        let t = GreetingTimeline.trace(at: elapsed)
        let body = NotchShape(spec, earless: true)
        // CSS conic angles start at 12 o'clock; SwiftUI's start at 3 o'clock.
        body.stroke(AngularGradient(gradient: Self.gradient, center: .center, angle: .degrees(t.angle - 90)), lineWidth: 3)
            .clipShape(body)
            .opacity(t.opacity)
            .frame(width: spec.width, height: spec.height)
            .allowsHitTesting(false)
    }
}

// MARK: - Live activity

struct LiveContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec

    var body: some View {
        Ticking(fixed: model.fixedNow, schedule: .everySecond) { date in
            let live = model.liveActivity(at: date)
            HStack(spacing: 0) {
                HStack(spacing: 8) {
                    IconTile(icon: live.icon, tone: live.tone, small: true)
                    Text(live.label).foregroundColor(Palette.white(0.56)).lineLimit(1)
                }
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Text("in").fontWeight(.medium).foregroundColor(Palette.white(0.56))
                    Text(live.countdown).font(.system(size: 13, weight: .semibold).monospacedDigit()).foregroundColor(Palette.green)
                }
            }
            .font(.system(size: 13))
            .padding(.leading, 12)
            .padding(.trailing, 16)
            .frame(width: spec.width, height: spec.height)
        }
    }
}

// MARK: - Alert

struct AlertView: View {
    let content: AlertContent
    let spec: ShapeSpec

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                IconTile(icon: content.icon, tone: content.tone, small: true)
                Spacer()
                Text(content.status).font(.system(size: 13.5, weight: .semibold)).foregroundColor(Palette.tile(content.tone).fg)
            }
            .frame(height: 26)
            Text(content.title).font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                .padding(.top, 10).lineLimit(1)
            Text(content.subtitle).font(.system(size: 13)).foregroundColor(Palette.white(0.62))
                .padding(.top, 2).lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.top, 7)
        .padding(.horizontal, 22)
        .frame(width: spec.width, height: spec.height)
    }
}

// MARK: - 2 · Inbox

struct InboxContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec

    static let padding: CGFloat = 20

    var body: some View {
        Ticking(fixed: model.fixedNow, schedule: .everySecond) { date in
            let p = model.presenter(at: date)
            // Each side of the top row stops short of the hardware notch.
            let side = (spec.width - model.notchSize.width) / 2 - Self.padding - NotchMetrics.notchGap
            let inner = spec.width - 2 * Self.padding - 12
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    ViewThatFits(in: .horizontal) {
                        TabsBar(model: model, presenter: p, labels: .selected)
                        TabsBar(model: model, presenter: p, labels: .none)
                    }
                    .frame(width: side, alignment: .leading)
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        RoundButton(icon: .mic, prominent: true, help: "Ask BuildFlow (hold ⌥ Space)") { model.onAction?(.startVoice) }
                        RoundButton(icon: .settings, prominent: false, help: "Settings") { model.onAction?(.openSettings) }
                    }
                    .frame(width: side, alignment: .trailing)
                }
                .frame(height: 42)
                .padding(.top, 2)

                HStack(alignment: .top, spacing: 12) {
                    CardView(model: model, card: p.card(for: model.tab), noteIsAction: model.tab == .notifications && p.unreadCount > 0)
                        .frame(width: inner * 1.25 / 2.25)
                    CardView(model: model, card: CardContent(title: "Today", note: p.todayHeader, rows: p.todayRows()), noteIsAction: false)
                        .frame(width: inner * 1 / 2.25)
                }
                .padding(.bottom, 18)
                .frame(maxHeight: .infinity)
            }
            .padding(.horizontal, Self.padding)
            .frame(width: spec.width, height: spec.height)
        }
    }
}

struct TabsBar: View {
    enum Labels { case selected, none }

    @ObservedObject var model: NotchModel
    let presenter: InboxPresenter
    let labels: Labels

    static func icon(_ tab: InboxTab) -> NotchIcon {
        switch tab {
        case .notifications: return .bell
        case .jobs: return .hardHat
        case .meetings: return .calendar
        case .tasks: return .listChecks
        }
    }

    /// Notifications stays icon-only, as in the mock-up; the others name themselves when chosen.
    static func label(_ tab: InboxTab) -> String? {
        switch tab {
        case .notifications: return nil
        case .jobs: return "Jobs"
        case .meetings: return "Meetings"
        case .tasks: return "Tasks"
        }
    }

    static func help(_ tab: InboxTab) -> String {
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
                let selected = model.tab == tab
                Button {
                    withAnimation(.easeOut(duration: 0.18)) { model.tab = tab }
                } label: {
                    HStack(spacing: 6) {
                        IconView(icon: Self.icon(tab), size: 15)
                        if labels == .selected, selected, let text = Self.label(tab) {
                            Text(text).fixedSize()
                        }
                        if let count = presenter.count(for: tab) {
                            Text("\(count)").font(.system(size: 11, weight: .semibold).monospacedDigit())
                                .foregroundColor(Palette.orangeText)
                        }
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(selected ? .white : Palette.white(0.62))
                    .padding(.horizontal, 8)
                    .frame(height: 26)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(selected ? Palette.tabSelected : .clear))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help(Self.help(tab))
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Palette.tabs))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(Palette.tabsBorder, lineWidth: 1))
        .fixedSize()
    }
}

struct RoundButton: View {
    let icon: NotchIcon
    let prominent: Bool
    let help: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            IconView(icon: icon, size: 15, lineWidth: prominent ? 2.2 : 2)
                .foregroundColor(prominent ? Palette.ink : Palette.white(0.75))
                .frame(width: 28, height: 28)
                .background(Circle().fill(prominent ? Palette.orange : Palette.round))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

struct CardView: View {
    @ObservedObject var model: NotchModel
    let card: CardContent
    let noteIsAction: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(card.title)
                Spacer(minLength: 8)
                if noteIsAction {
                    Button(card.note) { model.onAction?(.markAllRead) }.buttonStyle(.plain)
                } else {
                    Text(card.note)
                }
            }
            .font(.system(size: 12))
            .foregroundColor(Palette.white(0.5))
            .lineLimit(1)
            .padding(.bottom, 6)

            ForEach(Array(card.rows.enumerated()), id: \.element.id) { i, row in
                RowView(model: model, row: row)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(Palette.rowRule).frame(height: 1) }
                    }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Palette.card))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Palette.cardBorder, lineWidth: 1))
    }
}

struct RowView: View {
    @ObservedObject var model: NotchModel
    let row: InboxRow

    var body: some View {
        HStack(spacing: 10) {
            IconTile(icon: row.icon, tone: row.tone)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(row.title).font(.system(size: 12.5, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                    if row.unread { Circle().fill(Palette.orange).frame(width: 6, height: 6) }
                }
                Text(row.subtitle).font(.system(size: 11.5)).foregroundColor(Palette.white(0.5)).lineLimit(1)
            }
            .frame(minHeight: 32.5)
            Spacer(minLength: 6)
            trailing
        }
        .padding(.vertical, 7)
    }

    @ViewBuilder var trailing: some View {
        switch row.trailing {
        case .none:
            EmptyView()
        case let .text(s):
            Text(s).font(.system(size: 11.5).monospacedDigit()).foregroundColor(Palette.white(0.55)).lineLimit(1)
        case let .twoLine(a, b):
            VStack(alignment: .trailing, spacing: 0) {
                Text(a)
                Text(b)
            }
            .font(.system(size: 11.5).monospacedDigit())
            .foregroundColor(Palette.white(0.55))
        case let .join(url):
            PillButton(title: "Join", style: .plain) {
                if let url = url.flatMap(URL.init(string:)) { model.onAction?(.join(url)) }
            }
        }
    }
}

struct PillButton: View {
    enum Style { case plain, dark, accent }
    let title: String
    let style: Style
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundColor(style == .accent ? Palette.ink : .white)
                .padding(.horizontal, style == .plain ? 12 : 11)
                .padding(.vertical, 5)
                .background(Capsule().fill(style == .accent ? Palette.orange : style == .plain ? Palette.pill : Palette.proposalButton))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 3 · Voice

struct VoiceView: View {
    @ObservedObject var model: NotchModel
    let content: VoiceContent
    let spec: ShapeSpec

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                SoundBars(fixed: model.fixedNow)
                Spacer()
                Text(content.status).font(.system(size: 13, weight: .semibold)).foregroundColor(Palette.orangeText)
            }
            .frame(height: 26)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("YOU").font(.system(size: 11, weight: .semibold)).kerning(0.66).foregroundColor(Palette.white(0.42))
                Text(content.question).font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
            }
            .padding(.top, 8)

            Text(content.answer)
                .font(.system(size: 13.5))
                .lineSpacing(3.5)
                .foregroundColor(Palette.white(0.8))
                .frame(maxWidth: 480, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 12) {
                (Text(content.proposalSubject).fontWeight(.bold).foregroundColor(.white)
                    + Text(" starts ").foregroundColor(.white)
                    + Text(content.proposalFrom).strikethrough().foregroundColor(Palette.white(0.45))
                    + Text(" ")
                    + Text(content.proposalTo).fontWeight(.semibold).foregroundColor(Palette.orangeText))
                    .font(.system(size: 12.5))
                    .lineLimit(1)
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    PillButton(title: "Edit", style: .dark) { model.onAction?(.proposal(.edit)) }
                    PillButton(title: "Reject", style: .dark) { model.onAction?(.proposal(.reject)) }
                    PillButton(title: "Accept", style: .accent) { model.onAction?(.proposal(.accept)) }
                }
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Palette.proposal))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Palette.proposalBorder, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))

            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .padding(.horizontal, 22)
        .frame(width: spec.width, height: spec.height)
    }
}

/// Six orange bars rising and falling out of step (the mock-up's `bar` keyframes).
struct SoundBars: View {
    let fixed: Date?
    static let delays: [Double] = [0, -0.2, -0.45, -0.1, -0.6, -0.33]

    var body: some View {
        Ticking(fixed: fixed, schedule: .animation) { date in
            let t = fixed != nil ? 0.35 : date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 3) {
                ForEach(0..<6, id: \.self) { i in
                    let phase = (t - Self.delays[i]) / 0.9
                    let wave = (1 - cos(2 * .pi * phase)) / 2
                    Capsule().fill(Palette.orange).frame(width: 3, height: 22 * (0.22 + 0.78 * wave))
                }
            }
            .frame(width: 40, height: 22, alignment: .leading)
        }
    }
}
