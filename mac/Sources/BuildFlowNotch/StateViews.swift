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
            ZStack(alignment: .top) {
                if !model.reduceMotion { EdgeLight(spec: spec, elapsed: elapsed) }
                CardContainer(spec: spec, notch: model.notchSize) { size in
                    VStack(spacing: 0) {
                        ScriptLine(text: model.greetingText, token: .scriptGreeting,
                                   reveal: model.reduceMotion ? 1 : GreetingTimeline.reveal(at: elapsed))
                        ChipRow(chips: model.greetingDayLine)
                            .padding(.top, 24)
                    }
                    .padding(.bottom, 4)
                    .frame(width: size.width, height: size.height)
                }
            }
            .frame(width: spec.width, height: spec.height)
        }
    }
}

/// The Sacramento greeting, written by a soft mask sweeping left to right: the ink on the light
/// window; on the dark one, the light ink with a soft glow. Laid out a font-size tall (CSS
/// line-height 1); the descenders reach below that, as the script's do on the website.
struct ScriptLine: View {
    let text: String
    let token: TypeToken
    let reveal: Double
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let size = ScriptFont.fontSize(for: theme.style(token).size)
        let halfLeading = max(0, (ScriptFont.lineHeight(at: size) - size) / 2)
        let room: CGFloat = 16
        Text(text)
            .font(.custom(ScriptFont.name, size: size))
            .foregroundColor(theme[.ink])
            .shadow(color: theme.isDark ? theme[.ink].opacity(0.34) : .clear, radius: theme.isDark ? 9 : 0)
            .shadow(color: theme.isDark ? theme[.ink].opacity(0.22) : .clear, radius: theme.isDark ? 1.5 : 0)
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

/// A thin light running once round the black frame's edge (~2 s), in the frame's own ink.
struct EdgeLight: View {
    let spec: ShapeSpec
    let elapsed: Double
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let t = GreetingTimeline.trace(at: elapsed)
        let body = NotchShape(spec, earless: true)
        let gradient = Gradient(stops: [
            .init(color: .clear, location: 0),
            .init(color: .clear, location: 250.0 / 360),
            .init(color: theme.frame(.ink).opacity(0.5), location: 300.0 / 360),
            .init(color: theme.frame(.ink), location: 318.0 / 360),
            .init(color: .clear, location: 340.0 / 360),
            .init(color: .clear, location: 1),
        ])
        // CSS conic angles start at 12 o'clock; SwiftUI's start at 3 o'clock.
        body.stroke(AngularGradient(gradient: gradient, center: .center, angle: .degrees(t.angle - 90)), lineWidth: 3)
            .clipShape(body)
            .opacity(t.opacity)
            .frame(width: spec.width, height: spec.height)
            .allowsHitTesting(false)
    }
}

// MARK: - Live activity (black, the dark tokens)

struct LiveContent: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec
    @Environment(\.notchTheme) private var theme

    static let discSize: CGFloat = 22
    static let discGap: CGFloat = 8
    static let figureGap: CGFloat = 6

    var body: some View {
        Ticking(fixed: model.fixedNow, schedule: .everySecond) { date in
            let live = model.liveActivity(at: date)
            HStack(spacing: 0) {
                HStack(spacing: Self.discGap) {
                    ToneDisc(icon: live.icon, tone: live.tone, size: Self.discSize, iconSize: 12, onFrame: true)
                    theme.text(live.label, .live).foregroundColor(theme.frame(.ink)).lineLimit(1)
                }
                Spacer(minLength: 0)
                HStack(spacing: Self.figureGap) {
                    theme.text("in", .live).foregroundColor(theme.frame(.inkMuted))
                    theme.text(live.countdown, .liveFigure).foregroundColor(theme.frame(.ok))
                }
            }
            .padding(.leading, 12)
            .padding(.trailing, 16)
            .frame(width: spec.width, height: spec.height)
        }
    }
}

// MARK: - Alert

struct AlertView: View {
    @ObservedObject var model: NotchModel
    let content: AlertContent
    let spec: ShapeSpec
    @Environment(\.notchTheme) private var theme

    var body: some View {
        CardContainer(spec: spec, notch: model.notchSize) { size in
            HStack(alignment: .center, spacing: 14) {
                ToneDisc(icon: content.icon, tone: content.tone)
                VStack(alignment: .leading, spacing: 3) {
                    Eyebrow(content.status, color: theme.tone(content.tone).color)
                    theme.text(content.title, .displayLine).foregroundColor(theme[.ink]).lineLimit(1)
                    theme.text(content.subtitle, .rowSub).foregroundColor(theme[.inkMuted]).lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                HStack(spacing: 8) {
                    ForEach(Array(content.actions.enumerated()), id: \.offset) { _, action in
                        PillButton(title: action.label, kind: action.primary ? .primary : .secondary) {
                            model.onAction?(.alert(action))
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .frame(width: size.width, height: size.height)
        }
    }
}

// MARK: - 3 · Voice

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
        CardContainer(spec: spec, notch: model.notchSize) { size in
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    SoundBars(fixed: model.fixedNow, active: content.listening, level: model.voiceLevel, reduceMotion: model.reduceMotion)
                    Eyebrow(content.status)
                    Spacer(minLength: 8)
                    if let hint = content.hint {
                        StatusPill(text: hint, tone: .warn)
                            .help("BuildFlow's AI isn't set up on the server yet, so answers come from your inbox alone.")
                    }
                }
                .frame(height: 22)

                if !content.question.isEmpty || content.listening {
                    theme.text(content.question.isEmpty ? "…" : "\u{201C}\(content.question)\u{201D}", .quote)
                        .foregroundColor(content.question.isEmpty ? theme[.inkFaint] : theme[.ink])
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !content.answer.isEmpty {
                    theme.text(Self.tail(content.answer, max: content.proposal == nil ? 300 : 200), .body)
                        .foregroundColor(theme[.ink])
                        .lineSpacing(3)
                        .frame(maxWidth: 520, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let card = content.proposal {
                    ProposalCardView(model: model, card: card)
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
            .padding(.top, 16)
            .padding(.horizontal, 20)
            .padding(.bottom, 14)
            .frame(width: size.width, height: size.height, alignment: .topLeading)
        }
    }
}

/// BuildFlow's proposal card: a white card with the change (the old value struck through, the new
/// one bold) and Edit · Reject · Accept. Nothing changes until Accept.
struct ProposalCardView: View {
    @ObservedObject var model: NotchModel
    let card: ProposalCard
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let sub = theme.style(.rowSub)
        let strong = theme.style(.rowTitle)
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
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
                    PillButton(title: "Edit", kind: .secondary, onSurface: true) { model.onAction?(.proposal(.edit)) }
                    PillButton(title: "Reject", kind: .secondary, onSurface: true) { model.onAction?(.proposal(.reject)) }
                    PillButton(title: "Accept", kind: .primary) { model.onAction?(.proposal(.accept)) }
                }
            case .working:
                theme.text("Working…", .meta).foregroundColor(theme[.inkMuted])
            case let .settled(words, ok):
                theme.text(words, .rowSub).foregroundColor(theme.tone(ok ? .ok : .warn).color)
                    .lineLimit(2).frame(maxWidth: 250, alignment: .trailing).multilineTextAlignment(.trailing)
            }
        }
        .padding(.vertical, 10)
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .whiteCard(theme, radius: theme.radii.panel)
    }
}

/// Six ink bars rising and falling out of step (the mock-up's `bar` keyframes);
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
                    Capsule().fill(theme[.ink].opacity(active ? 1 : 0.45)).frame(width: 3, height: 20 * (0.22 + 0.78 * wave * amp))
                }
            }
            .frame(width: 36, height: 20, alignment: .leading)
        }
    }
}
