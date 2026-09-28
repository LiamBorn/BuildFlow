import AppKit
import BuildFlowNotchKit
import SwiftUI

// The notch's parts, in the reference's language: the tinted icon disc, an alert's coloured tile,
// plain icon buttons, pills (light for the one that matters, dark grey for the rest), the day chips,
// the unread dot, the card and the empty state. Every colour, radius and face comes from the theme
// in the environment: the black shape's own set on the black, the Appearance set inside the cards.

/// A tone's icon on a round disc of its wash: a row's mark, as the reference's Keep Awake and Up next are.
struct ToneDisc: View {
    let icon: NotchIcon
    let tone: NotchTone
    var size: CGFloat = 28
    var iconSize: CGFloat = 14
    @Environment(\.notchTheme) private var theme

    var body: some View {
        let c = theme.tone(tone)
        ZStack {
            Circle().fill(c.wash)
            IconView(icon: icon, size: iconSize, lineWidth: 2).foregroundColor(c.color)
        }
        .frame(width: size, height: size)
    }
}

/// An alert's mark: the icon in white on a rounded tile of its tone (the reference's f12).
struct ToneTile: View {
    let icon: NotchIcon
    let tone: NotchTone
    var size: CGFloat = 26
    @Environment(\.notchTheme) private var theme

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: theme.radii.chip, style: .continuous).fill(theme.tone(tone).color)
            IconView(icon: icon, size: size * 0.56, lineWidth: 2.2).foregroundColor(theme[.ink])
        }
        .frame(width: size, height: size)
    }
}

/// A plain icon button, as the reference's gear is; `disc` sets it on a subtle grey disc (the mic).
struct NotchIconButton: View {
    let icon: NotchIcon
    var disc = false
    var pressed = false
    let help: String
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            IconView(icon: icon, size: disc ? 14 : 17, lineWidth: 2)
                .foregroundColor(pressed || hovering || disc ? theme[.ink] : theme[.inkMuted])
                .frame(width: 26, height: 26)
                .background(Circle().fill(disc ? (hovering ? theme[.control] : theme[.surfaceRaised]) : pressed || hovering ? theme[.surface] : .clear))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .onHover { h in withAnimation(.easeOut(duration: 0.12)) { hovering = h } }
        .help(help)
        .accessibilityLabel(help)
    }
}

/// A pill: light (the ink, with the surface's colour on it) for the one that matters, dark grey (the
/// control grey) for the rest, as the reference's Join is. 30 pt, or 24 pt inside a row.
struct PillButton: View {
    enum Kind { case primary, secondary }
    enum Size { case regular, small }

    let title: String
    var kind: Kind = .secondary
    var size: Size = .regular
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
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
                .frame(height: size == .regular ? 30 : 24)
                .background(Capsule().fill(primary ? theme[.ink] : hovering ? theme[.selection] : theme[.control]))
                .opacity(primary && hovering ? 0.88 : 1)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .onHover { h in withAnimation(.easeOut(duration: 0.12)) { hovering = h } }
    }
}

/// Small grey words that act, turning to the ink under the pointer ("Mark all read").
struct TextButton: View {
    let title: String
    let action: () -> Void
    @Environment(\.notchTheme) private var theme
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            theme.text(title, .eyebrow)
                .foregroundColor(hovering ? theme[.ink] : theme[.inkMuted])
                .lineLimit(1)
                .fixedSize()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

/// One chip of the greeting's day line: a small dark grey pill with grey words, or the words in a
/// tone when they are news (the weather).
struct DayChipView: View {
    let chip: DayChip
    @Environment(\.notchTheme) private var theme

    var body: some View {
        theme.text(chip.text, .chip)
            .foregroundColor(chip.tone.map { theme.tone($0).color } ?? theme[.inkMuted])
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, 10)
            .frame(height: 22)
            .background(Capsule().fill(theme[.surface]))
    }
}

struct ChipRow: View {
    let chips: [DayChip]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in DayChipView(chip: chip) }
        }
        .fixedSize()
    }
}

/// A small grey label: a card's header, a menu's section.
struct Eyebrow: View {
    let text: String
    var color: Color?
    @Environment(\.notchTheme) private var theme

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View {
        theme.text(text, .eyebrow).foregroundColor(color ?? theme[.inkMuted]).lineLimit(1)
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

/// Unread: a small dot in the accent.
struct UnreadDot: View {
    @Environment(\.notchTheme) private var theme

    var body: some View {
        Circle()
            .fill(theme[.accentFill])
            .frame(width: 6, height: 6)
            .accessibilityLabel("Unread")
    }
}

/// A hairline between rows.
struct Hairline: View {
    @Environment(\.notchTheme) private var theme

    var body: some View {
        Rectangle().fill(theme[.lineSoft]).frame(height: 1)
    }
}

extension View {
    /// A card on the black: the surface with a hairline edge (the reference's two cards).
    func notchCard(_ theme: NotchTheme, radius: CGFloat? = nil) -> some View {
        let r = radius ?? theme.radii.card
        return clipShape(RoundedRectangle(cornerRadius: r, style: .continuous))
            .background(RoundedRectangle(cornerRadius: r, style: .continuous).fill(theme[.surface]))
            .overlay(RoundedRectangle(cornerRadius: r, style: .continuous).strokeBorder(theme[.lineSolid], lineWidth: 1))
    }
}

/// What a list shows when it has nothing: a quiet disc, a title, a sentence, and a pill when there
/// is somewhere to go.
struct EmptyStateView: View {
    let state: EmptyState
    var onAction: ((EmptyAction) -> Void)?
    @Environment(\.notchTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(theme[.control])
                IconView(icon: state.icon, size: 16, lineWidth: 2).foregroundColor(theme[.inkMuted])
            }
            .frame(width: 34, height: 34)
            theme.text(state.title, .displayLine)
                .foregroundColor(theme[.ink])
                .lineLimit(1)
                .padding(.top, 9)
            theme.text(state.detail, .emptyDetail)
                .foregroundColor(theme[.inkMuted])
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .frame(maxWidth: 270)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3)
            if let action = state.action, let onAction {
                PillButton(title: action.label, kind: .secondary, size: .small) { onAction(action) }
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Puts `content` in one of the band's two places beside the camera, centred on the camera's line.
struct InBand<Content: View>: View {
    enum Side { case left, right }

    let side: Side
    let spec: ShapeSpec
    let notch: CGSize
    @ViewBuilder let content: () -> Content

    var body: some View {
        let slots = NotchMetrics.bandSlots(in: spec, notch: notch)
        let r = side == .left ? slots.left : slots.right
        content()
            .frame(width: r.width, height: r.height, alignment: side == .left ? .leading : .trailing)
            .padding(.leading, r.minX)
            .padding(.top, r.minY)
            .frame(width: spec.width, height: spec.height, alignment: .topLeading)
    }
}

/// Lays a state's content out below the band, `contentInset` in from the shape's sides and foot.
struct ContentBox<Content: View>: View {
    let spec: ShapeSpec
    let notch: CGSize
    @ViewBuilder let content: (CGSize) -> Content

    var body: some View {
        let box = NotchMetrics.content(in: spec, notch: notch)
        content(box.size)
            .frame(width: box.width, height: box.height, alignment: .topLeading)
            .padding(.leading, box.minX)
            .padding(.top, box.minY)
            .frame(width: spec.width, height: spec.height, alignment: .topLeading)
    }
}
