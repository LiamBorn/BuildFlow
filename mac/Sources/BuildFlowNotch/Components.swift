import AppKit
import BuildFlowNotchKit
import SwiftUI

// BuildFlow's parts, as the website draws them (skin §9 buttons, §35 the notifications drawer):
// the tone disc, the icon discs, the pills, the chips, the eyebrow, the unread dot, the white card
// and the empty state. Every colour, radius and face comes from the theme.

/// A tone's wash behind its icon on a round disc: a row's mark (36 pt), the live activity's (22 pt).
struct ToneDisc: View {
    let icon: NotchIcon
    let tone: NotchTone
    var size: CGFloat = 36
    var iconSize: CGFloat = 17
    /// In the black band or the live activity: the dark set's pair.
    var onFrame = false
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let c = theme.tone(tone, frame: onFrame)
        ZStack {
            Circle().fill(c.wash)
            IconView(icon: icon, size: iconSize).foregroundColor(c.color)
        }
        .frame(width: size, height: size)
    }
}

/// A 36 pt round button: the ink disc for the one action that matters (the mic), or the white disc
/// with the card shadow, which turns ink while its menu is open.
struct IconDiscButton: View {
    enum Style { case ink, white }

    let icon: NotchIcon
    let style: Style
    var pressed = false
    let help: String
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
    @Environment(\.notchReduceMotion) private var reduceMotion
    @State private var hovering = false

    var body: some View {
        let ink = style == .ink || pressed
        Button(action: action) {
            IconView(icon: icon, size: 17)
                .foregroundColor(ink ? theme[.surface] : hovering ? theme[.ink] : theme[.inkMuted])
                .frame(width: 36, height: 36)
                .background(Circle().fill(ink ? theme[.ink] : theme[.surface]).themeShadow(hovering ? .raised : .card, theme))
                .contentShape(Circle())
                .offset(y: hovering && !reduceMotion ? -1 : 0)
        }
        .buttonStyle(.plain)
        .onHover { h in withAnimation(.easeOut(duration: 0.12)) { hovering = h } }
        .help(help)
    }
}

/// BuildFlow's pill: ink with the surface's colour on it (primary), or white with the card shadow
/// (secondary). 32 pt, or 26 pt inside a row.
struct PillButton: View {
    enum Kind { case primary, secondary }
    enum Size { case regular, small }

    let title: String
    var kind: Kind = .secondary
    var size: Size = .regular
    /// On a white card a white pill also takes a hairline, or only its shadow would say it's there.
    var onSurface = false
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
    @Environment(\.notchReduceMotion) private var reduceMotion
    @State private var hovering = false

    var body: some View {
        let primary = kind == .primary
        let token: TypeToken = size == .regular ? (primary ? .pillStrong : .pill) : (primary ? .pillSmallStrong : .pillSmall)
        Button(action: action) {
            theme.text(title, token)
                .foregroundColor(primary ? theme[.surface] : theme[.ink])
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, size == .regular ? 14 : 10)
                .frame(height: size == .regular ? 32 : 26)
                .background(
                    Capsule().fill(primary ? theme[.ink] : theme[.surface])
                        .overlay(Capsule().strokeBorder(theme[.lineSolid], lineWidth: onSurface && !primary ? 1 : 0))
                        .themeShadow(hovering ? .raised : .card, theme))
                .contentShape(Capsule())
                .offset(y: hovering && !reduceMotion ? -1 : 0)
        }
        .buttonStyle(.plain)
        .onHover { h in withAnimation(.easeOut(duration: 0.12)) { hovering = h } }
    }
}

/// One chip of the greeting's day line: a white pill on the window's ground, or a tone's wash when
/// it is news.
struct DayChipView: View {
    let chip: DayChip
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let toned = chip.tone.map { theme.tone($0) }
        theme.text(chip.text, .chip)
            .foregroundColor(toned?.color ?? theme[.ink])
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 10)
            .frame(height: 24)
            .background(Capsule().fill(toned?.wash ?? theme[.surface]).themeShadow(.card, theme))
    }
}

struct ChipRow: View {
    let chips: [DayChip]
    var alignment: HorizontalAlignment = .leading

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in DayChipView(chip: chip) }
        }
        .fixedSize()
    }
}

/// An eyebrow label: 11 pt, upper case, spaced out, in the faint ink (or a tone).
struct Eyebrow: View {
    let text: String
    var color: Color?
    @Environment(\.notchTheme) private var theme

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View {
        theme.text(text, .eyebrow).foregroundColor(color ?? theme[.inkFaint]).lineLimit(1)
    }
}

/// A status pill on a tone's wash: "AI not connected".
struct StatusPill: View {
    let text: String
    let tone: NotchTone
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let c = theme.tone(tone)
        theme.text(text, .statusPill)
            .foregroundColor(c.color)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 8)
            .frame(height: 20)
            .background(Capsule().fill(c.wash))
    }
}

/// Unread: the accent fill with an ink ring.
struct UnreadDot: View {
    @Environment(\.notchTheme) private var theme

    var body: some View {
        Circle()
            .fill(theme[.accentFill])
            .overlay(Circle().stroke(theme[.ink], lineWidth: 1))
            .frame(width: 7, height: 7)
            .accessibilityLabel("Unread")
    }
}

/// A hairline between rows.
struct Hairline: View {
    @Environment(\.notchTheme) private var theme

    var body: some View {
        Rectangle().fill(theme[.lineSolid]).frame(height: 1)
    }
}

extension View {
    /// A white card on the ground: the website's 20 pt card with the softest shadow.
    func whiteCard(_ theme: NotchTheme, radius: CGFloat? = nil) -> some View {
        let r = radius ?? theme.radii.card
        return clipShape(RoundedRectangle(cornerRadius: r))
            .background(RoundedRectangle(cornerRadius: r).fill(theme[.surface]).themeShadow(.card, theme))
    }
}

/// What a list shows when it has nothing (the drawer's empty state): a disc, a display line, a
/// sentence, and a white pill when there is somewhere to go.
struct EmptyStateView: View {
    let state: EmptyState
    var onAction: ((EmptyAction) -> Void)?
    @Environment(\.notchTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(theme[.hover])
                IconView(icon: state.icon, size: 20).foregroundColor(theme[.ink])
            }
            .frame(width: 44, height: 44)
            theme.text(state.title, .displayLine)
                .foregroundColor(theme[.ink])
                .lineLimit(1)
                .padding(.top, 10)
            theme.text(state.detail, .emptyDetail)
                .foregroundColor(theme[.inkMuted])
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .frame(maxWidth: 290)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)
            if let action = state.action, let onAction {
                PillButton(title: action.label, kind: .secondary, onSurface: true) { onAction(action) }
                    .padding(.top, 12)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The small BuildFlow mark in the black band: the app icon's logo (Resources/BuildFlowMark.png,
/// made by scripts/make-mark.sh).
struct BrandMark: View {
    var height: CGFloat = 16
    @Environment(\.notchTheme) private var theme

    static let image: NSImage? = {
        if let url = Bundle.main.url(forResource: "BuildFlowMark", withExtension: "png"), let i = NSImage(contentsOf: url) { return i }
        // A bare binary (snapshots from .build): the source tree's copy.
        let tree = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Resources/BuildFlowMark.png")
        return NSImage(contentsOf: tree)
    }()

    var body: some View {
        if let image = Self.image {
            Image(nsImage: image)
                .resizable()
                .interpolation(.high)
                .aspectRatio(contentMode: .fit)
                .frame(height: height)
                .accessibilityLabel("BuildFlow")
        } else {
            IconView(icon: .mark, size: height).foregroundColor(theme.frame(.ink))
        }
    }
}

/// The band beside the camera, in BuildFlow's dark tokens: the mark on the left, the connection's
/// status on the right, each in its slot clear of the camera housing.
struct BandView: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let slots = NotchMetrics.bandSlots(in: spec, notch: model.notchSize)
        let status = model.bandStatus
        ZStack(alignment: .topLeading) {
            BrandMark(height: 16)
                .frame(width: slots.left.width, height: slots.left.height, alignment: .leading)
                .offset(x: slots.left.minX)
            HStack(spacing: 6) {
                Circle().fill(theme.tone(status.tone, frame: true).color).frame(width: 6, height: 6)
                theme.text(status.label, .band).foregroundColor(theme.frame(.inkMuted)).lineLimit(1)
            }
            .frame(width: slots.right.width, height: slots.right.height, alignment: .trailing)
            .offset(x: slots.right.minX)
        }
        .frame(width: spec.width, height: spec.height, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

/// Lays a state's content out in its BuildFlow window (the card below the band, inside the black
/// frame) and clips it to the window's corners.
struct CardContainer<Content: View>: View {
    let spec: ShapeSpec
    let notch: CGSize
    @ViewBuilder let content: (CGSize) -> Content

    var body: some View {
        let card = NotchMetrics.card(in: spec, notch: notch)
        content(card.size)
            .frame(width: card.width, height: card.height, alignment: .topLeading)
            .clipShape(RoundedRectangle(cornerRadius: NotchMetrics.cardRadius(in: spec)))
            .padding(.leading, card.minX)
            .padding(.top, card.minY)
            .frame(width: spec.width, height: spec.height, alignment: .topLeading)
    }
}
