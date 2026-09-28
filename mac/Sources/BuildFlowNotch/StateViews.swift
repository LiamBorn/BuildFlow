import BuildFlowNotchKit
import SwiftUI

/// Runs `content` against the live clock, or once against the frozen snapshot clock.
struct Ticking<Content: View>: View {
    let fixed: Date?
    let schedule: Schedule
    @ViewBuilder let content: (Date) -> Content

    enum Schedule {
        case animation
        case everySecond
    }

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

// MARK: - 1 · Greeting (the lid opening, or unlocking)

struct GreetingContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec

    var body: some View {
        Ticking(fixed: model.fixedNow, schedule: model.reduceMotion ? .everySecond : .animation) { date in
            let elapsed = model.greetingElapsedOverride ?? date.timeIntervalSince(model.greetingStartedAt)
            GreetingStage(text: model.greetingText, chips: model.greetingDayLine, token: .scriptGreeting,
                          reveal: model.reduceMotion ? 1 : GreetingTimeline.reveal(at: elapsed), chipsIn: 1,
                          spec: spec, notch: model.notchSize)
        }
    }
}

/// The greeting, as the reference's f01 draws it: the script writing itself in white with a soft
/// glow, centred in the black, and the day line under it in small dark grey pills. The lid greeting
/// and the dropdown's opening both show it.
struct GreetingStage: View {
    let text: String
    let chips: [DayChip]
    let token: TypeToken
    let reveal: Double
    /// How far the day line has come in, 0…1.
    let chipsIn: Double
    let spec: ShapeSpec
    let notch: CGSize

    var body: some View {
        ContentBox(spec: spec, notch: notch) { size in
            VStack(spacing: 0) {
                ScriptLine(text: text, token: token, reveal: reveal)
                if !chips.isEmpty {
                    ChipRow(chips: chips)
                        .padding(.top, 20)
                        .modifier(IntroEntrance(progress: chipsIn))
                }
            }
            .padding(.bottom, 6)
            .frame(width: size.width, height: size.height)
        }
    }
}

/// The Sacramento greeting in white, written by a soft mask sweeping left to right, with the soft
/// white-blue glow of the reference. Laid out a font-size tall (CSS line-height 1); the descenders
/// reach below that, as the script's do.
struct ScriptLine: View {
    let text: String
    let token: TypeToken
    let reveal: Double
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let size = ScriptFont.fontSize(for: theme.style(token).size)
        let halfLeading = max(0, (ScriptFont.lineHeight(at: size) - size) / 2)
        let room: CGFloat = 18
        Text(text)
            .font(.custom(ScriptFont.name, size: size))
            .foregroundColor(theme[.ink])
            .shadow(color: theme[.rim].opacity(0.55), radius: 9)
            .shadow(color: theme[.ink].opacity(0.35), radius: 1.5)
            .fixedSize()
            .padding(room)
            .mask(RevealMask(position: reveal))
            .padding(.horizontal, -room)
            .padding(.top, -halfLeading - room)
            .padding(.bottom, -halfLeading - room)
            .accessibilityLabel(text)
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

/// A part coming in: it rises, sharpens and appears.
struct IntroEntrance: ViewModifier {
    let progress: Double

    func body(content: Content) -> some View {
        content
            .opacity(progress)
            .offset(y: (1 - progress) * InboxIntro.rise)
            .blur(radius: (1 - progress) * 6)
    }
}

// MARK: - Live activity (f10, f11)

/// The tone's icon and what is coming on the left of the camera; on the right, a thin ring of the
/// time left and the countdown in big white figures.
struct LiveContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec
    @Environment(\.notchTheme) private var theme

    static let iconSize: CGFloat = 16
    static let iconGap: CGFloat = 8
    static let ringSize: CGFloat = 15
    static let ringGap: CGFloat = 8
    static let leading: CGFloat = 14
    static let trailing: CGFloat = 16

    var body: some View {
        Ticking(fixed: model.fixedNow, schedule: .everySecond) { date in
            let live = model.liveActivity(at: date)
            HStack(spacing: 0) {
                HStack(spacing: Self.iconGap) {
                    IconView(icon: live.icon, size: Self.iconSize, lineWidth: 2.2).foregroundColor(theme.tone(live.tone).color)
                    theme.text(live.label, .live).foregroundColor(theme[.inkSoft]).lineLimit(1)
                }
                Spacer(minLength: 0)
                HStack(spacing: Self.ringGap) {
                    CountdownRing(fraction: live.fractionLeft, tone: live.tone, size: Self.ringSize)
                    theme.text(live.countdown, .liveFigure).foregroundColor(theme[.ink])
                }
            }
            .padding(.leading, Self.leading)
            .padding(.trailing, Self.trailing)
            .frame(width: spec.width, height: spec.height)
            .accessibilityElement(children: .combine)
        }
    }
}

/// A thin ring of the time left: full when the countdown begins, empty when it's time.
struct CountdownRing: View {
    let fraction: Double
    let tone: NotchTone
    var size: CGFloat = 15
    @Environment(\.notchTheme) private var theme

    var body: some View {
        ZStack {
            Circle().stroke(theme[.control], lineWidth: 2.4)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(theme.tone(tone).color, style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: - Alert (f12, f09)

/// The tone's tile top-left and the kind top-right in the tone beside the camera; under them a bold
/// white title, a grey line, and Later (dark grey) and Open (light).
struct AlertView: View {
    @ObservedObject var model: NotchModel
    let content: AlertContent
    let spec: ShapeSpec
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let notch = model.notchSize
        ZStack(alignment: .topLeading) {
            InBand(side: .left, spec: spec, notch: notch) {
                ToneTile(icon: content.icon, tone: content.tone)
            }
            InBand(side: .right, spec: spec, notch: notch) {
                theme.text(content.status, .band).foregroundColor(theme.tone(content.tone).color).lineLimit(1)
            }
            ContentBox(spec: spec, notch: notch) { size in
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 3) {
                        theme.text(content.title, .title).foregroundColor(theme[.ink]).lineLimit(1)
                        theme.text(content.subtitle, .todayValue).foregroundColor(theme[.inkMuted]).lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        // The one that matters on the right.
                        ForEach(Array(content.actions.reversed().enumerated()), id: \.offset) { _, action in
                            PillButton(title: action.label, kind: action.primary ? .primary : .secondary) {
                                model.onAction?(.alert(action))
                            }
                        }
                    }
                }
                .frame(width: size.width, height: size.height)
            }
        }
        .frame(width: spec.width, height: spec.height, alignment: .topLeading)
    }
}

// MARK: - 3 · Voice

/// Black: the sound bars and the status beside the camera, your words as a bold white line, the
/// answer in grey-white, and BuildFlow's proposal as a card.
struct VoiceView: View {
    @ObservedObject var model: NotchModel
    let content: VoiceContent
    let spec: ShapeSpec
    @Environment(\.notchTheme) private var theme

    /// The newest part of a long answer, so the words arriving are the ones in view.
    static func tail(_ s: String, max: Int = 260) -> String {
        guard s.count > max else { return s }
        let cut = s.suffix(max)
        let start = cut.firstIndex(of: " ").map { cut.index(after: $0) } ?? cut.startIndex
        return "…" + cut[start...]
    }

    var body: some View {
        let notch = model.notchSize
        ZStack(alignment: .topLeading) {
            InBand(side: .left, spec: spec, notch: notch) {
                HStack(spacing: 10) {
                    SoundBars(fixed: model.fixedNow, active: content.listening, level: model.voiceLevel, reduceMotion: model.reduceMotion)
                    theme.text(content.status, .band).foregroundColor(theme[.inkMuted]).lineLimit(1)
                }
            }
            if let hint = content.hint {
                InBand(side: .right, spec: spec, notch: notch) {
                    StatusPill(text: hint, tone: .warn)
                        .help("BuildFlow's AI isn't set up on the server yet, so answers come from your inbox alone.")
                }
            }
            ContentBox(spec: spec, notch: notch) { size in
                VStack(alignment: .leading, spacing: 8) {
                    if !content.question.isEmpty || content.listening {
                        theme.text(content.question.isEmpty ? "…" : content.question, .quote)
                            .foregroundColor(content.question.isEmpty ? theme[.inkFaint] : theme[.ink])
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if !content.answer.isEmpty {
                        theme.text(Self.tail(content.answer, max: content.proposal == nil ? 300 : 200), .body)
                            .foregroundColor(theme[.inkSoft])
                            .lineSpacing(3)
                            .frame(maxWidth: 530, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if let card = content.proposal {
                        ProposalCardView(model: model, card: card)
                            .padding(.top, 4)
                            .environment(\.notchTheme, model.theme)
                    }

                    if let button = content.button {
                        HStack {
                            Spacer()
                            switch button {
                            case .connect:
                                PillButton(title: "Connect this Mac…", kind: .primary) { model.onAction?(.voiceButton(.connect)) }
                            case .openPrivacy:
                                PillButton(title: "Open System Settings", kind: .primary) { model.onAction?(.voiceButton(button)) }
                            case .send:
                                PillButton(title: "Send", kind: .primary) { model.onAction?(.voiceButton(.send)) }
                            }
                        }
                    }

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4)
                .frame(width: size.width, height: size.height, alignment: .topLeading)
            }
        }
        .frame(width: spec.width, height: spec.height, alignment: .topLeading)
    }
}

/// BuildFlow's proposal, as a card: what changes (the old value struck through, the new one bold)
/// and Edit · Reject (dark grey) · Accept (light). Nothing changes until Accept.
struct ProposalCardView: View {
    @ObservedObject var model: NotchModel
    let card: ProposalCard
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let sub = theme.style(.rowSub)
        let strong = theme.style(.rowTitle)
        HStack(spacing: 12) {
            ToneDisc(icon: .hardHatSmall, tone: .brand)
            VStack(alignment: .leading, spacing: 2) {
                theme.text(card.subject, .rowTitle).foregroundColor(theme[.ink]).lineLimit(1)
                (theme.text(card.verb.prefix(1).uppercased() + card.verb.dropFirst() + " ", .rowSub).foregroundColor(theme[.inkMuted])
                    + Text(card.from).font(NotchFonts.font(sub)).strikethrough(color: theme[.inkFaint]).foregroundColor(theme[.inkFaint])
                    + Text("  ")
                    + Text(card.to).font(NotchFonts.font(strong)).foregroundColor(theme[.ink]))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            switch card.phase {
            case .open:
                HStack(spacing: 6) {
                    PillButton(title: "Edit", kind: .secondary, size: .small) { model.onAction?(.proposal(.edit)) }
                    PillButton(title: "Reject", kind: .secondary, size: .small) { model.onAction?(.proposal(.reject)) }
                    PillButton(title: "Accept", kind: .primary, size: .small) { model.onAction?(.proposal(.accept)) }
                }
            case .working:
                theme.text("Working…", .meta).foregroundColor(theme[.inkMuted])
            case let .settled(words, ok):
                theme.text(words, .rowSub).foregroundColor(theme.tone(ok ? .ok : .warn).color)
                    .lineLimit(2).frame(maxWidth: 250, alignment: .trailing).multilineTextAlignment(.trailing)
            }
        }
        .padding(.vertical, 10)
        .padding(.leading, 10)
        .padding(.trailing, 10)
        .notchCard(theme, radius: theme.radii.panel)
    }
}

/// Six bars rising and falling out of step (the mock-up's `bar` keyframes), in BuildFlow's orange;
/// while the microphone is open they follow your voice. Reduce Motion stills the idle ripple.
struct SoundBars: View {
    let fixed: Date?
    var active = true
    var level: Double = 0
    var reduceMotion = false
    static let delays: [Double] = [0, -0.2, -0.45, -0.1, -0.6, -0.33]
    @Environment(\.notchTheme) private var theme

    var body: some View {
        Ticking(fixed: fixed ?? (reduceMotion && !active ? Date(timeIntervalSinceReferenceDate: 0) : nil), schedule: .animation) { date in
            let t = fixed != nil ? 0.35 : date.timeIntervalSinceReferenceDate
            // Idle: a low, slow ripple. Listening: the wave, scaled by the voice.
            let amp = active ? (fixed != nil ? 1 : 0.35 + 0.65 * level) : 0.25
            HStack(alignment: .center, spacing: 3) {
                ForEach(0..<6, id: \.self) { i in
                    let phase = (t - Self.delays[i]) / (active ? 0.9 : 1.8)
                    let wave = (1 - cos(2 * .pi * phase)) / 2
                    Capsule().fill(theme[.accent].opacity(active ? 1 : 0.5)).frame(width: 3, height: 18 * (0.22 + 0.78 * wave * amp))
                }
            }
            .frame(width: 33, height: 18, alignment: .leading)
        }
    }
}
