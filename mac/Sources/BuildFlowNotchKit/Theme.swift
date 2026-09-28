import CoreGraphics
import Foundation

// The notch's look, after the NotchView reference: a pure black shape, near-black cards with a
// hairline edge, white and grey type, and colour only where the reference has it (the tone icons,
// the status words, the rim light). The colour tokens, the shadows, the radius ladder and the type,
// in a Dark set (the default: the reference) and a Light one (the same black frame with light cards
// inside). Every colour, radius and face the notch draws comes from here; the views name tokens and
// never write a value of their own.

// MARK: - Colour

/// An sRGB colour as the website writes it: `#rrggbb`, with an alpha when it has one.
public struct ThemeColor: Hashable, CustomStringConvertible {
    public let hex: UInt32
    public let alpha: Double

    public init(_ hex: UInt32, alpha: Double = 1) {
        self.hex = hex & 0xFFFFFF
        self.alpha = min(max(alpha, 0), 1)
    }

    public var red: Double { Double((hex >> 16) & 0xFF) / 255 }
    public var green: Double { Double((hex >> 8) & 0xFF) / 255 }
    public var blue: Double { Double(hex & 0xFF) / 255 }

    public var description: String {
        alpha < 1 ? String(format: "#%06x @ %.2f", hex, alpha) : String(format: "#%06x", hex)
    }

    public func opacity(_ a: Double) -> ThemeColor { ThemeColor(hex, alpha: alpha * a) }

    /// What this colour looks like laid over an opaque `background`.
    public func over(_ background: ThemeColor) -> ThemeColor {
        func mix(_ a: Double, _ b: Double) -> UInt32 { UInt32(min(max((a * alpha + b * (1 - alpha)) * 255, 0), 255).rounded()) }
        return ThemeColor(mix(red, background.red) << 16 | mix(green, background.green) << 8 | mix(blue, background.blue))
    }

    /// WCAG 2 relative luminance.
    public var luminance: Double {
        func channel(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }

    /// WCAG 2 contrast ratio (1…21) of this colour as text on `background`; a translucent colour is laid over it first.
    public func contrast(on background: ThemeColor) -> Double {
        let text = alpha < 1 ? over(background) : self
        let a = text.luminance, b = background.luminance
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }
}

/// The colour tokens. The frame, the track and the rim are the black shape's own and read the same
/// in both sets; the rest are what the cards, menus and pills inside it are drawn with.
public enum ThemeToken: String, CaseIterable {
    // The black the notch is made of, and the tab track set into it.
    case frame = "--notch-frame"
    case track = "--notch-track"
    // Surfaces: a card, a raised card (a menu), a row under the pointer.
    case surface = "--notch-surface"
    case surfaceRaised = "--notch-surface-raised"
    case hover = "--notch-hover"
    // A control's grey (a dark grey pill such as Join, a quiet disc), and the chosen tab's lighter pill.
    case control = "--notch-control"
    case selection = "--notch-selection"
    // Text: white titles, the grey-white of an answer, grey values, and the faint grey of a time.
    case ink = "--notch-ink"
    case inkSoft = "--notch-ink-soft"
    case inkMuted = "--notch-ink-muted"
    case inkFaint = "--notch-ink-faint"
    // Lines: a card's hairline edge, and the rule between rows.
    case lineSolid = "--notch-line"
    case lineSoft = "--notch-line-soft"
    // The accent, BuildFlow orange: the unread dot, a tab's badge, the sound bars.
    case accent = "--notch-accent"
    case accentFill = "--notch-accent-fill"
    case onAccent = "--notch-on-accent"
    case accentWash = "--notch-accent-wash"
    // The four tones that carry meaning and BuildFlow's orange (a job), each a colour and the wash of
    // the disc it sits on.
    case ok = "--notch-ok"
    case okWash = "--notch-ok-wash"
    case warn = "--notch-warn"
    case warnWash = "--notch-warn-wash"
    case bad = "--notch-bad"
    case badWash = "--notch-bad-wash"
    case info = "--notch-info"
    case infoWash = "--notch-info-wash"
    case orange = "--notch-orange"
    case orangeWash = "--notch-orange-wash"
    // The rim light's cool white-blue (the greeting, the dropdown, voice); an alert's rim takes its tone.
    case rim = "--notch-rim"

    /// The surfaces text is set on inside the cards and menus (on the black it reads the dark set's
    /// text on `.frame`).
    public static let surfaces: [ThemeToken] = [.surface, .surfaceRaised, .hover]
    /// The text colours.
    public static let text: [ThemeToken] = [.ink, .inkSoft, .inkMuted, .inkFaint]
    /// Each colour with the wash it is set on (a tone disc, the "AI not connected" pill).
    public static let tonePairs: [(color: ThemeToken, wash: ThemeToken)] = [
        (.ok, .okWash), (.warn, .warnWash), (.bad, .badWash), (.info, .infoWash), (.orange, .orangeWash), (.accent, .accentWash),
    ]
}

// MARK: - Shadows, radii, type

/// One layer of a CSS `box-shadow`.
public struct ThemeShadow: Equatable {
    public let color: ThemeColor
    public let x: CGFloat
    public let y: CGFloat
    /// The CSS blur radius.
    public let blur: CGFloat

    public init(_ color: ThemeColor, x: CGFloat = 0, y: CGFloat, blur: CGFloat) {
        self.color = color
        self.x = x
        self.y = y
        self.blur = blur
    }
}

public enum ShadowToken: String, CaseIterable {
    /// The softest: a light card's lift (on the black it all but disappears, as the reference's cards
    /// are set apart by their surface and hairline instead).
    case card = "--notch-shadow-card"
    /// A control lifted under the pointer.
    case raised = "--notch-shadow-raised"
    /// A menu floating over the cards.
    case float = "--notch-shadow-float"
}

/// The radius ladder, measured off the reference: the black shape's corners (32), a card's (16, so
/// its corners sit concentric with the shape's at 16 pt in), a menu or the proposal card (12), a row
/// in a menu (10), an alert's icon tile (7), and pills fully round.
public struct ThemeRadii: Equatable {
    public let stage: CGFloat
    public let card: CGFloat
    public let panel: CGFloat
    public let control: CGFloat
    public let chip: CGFloat
    public let pill: CGFloat

    public init(stage: CGFloat, card: CGFloat, panel: CGFloat, control: CGFloat, chip: CGFloat, pill: CGFloat) {
        self.stage = stage
        self.card = card
        self.panel = panel
        self.control = control
        self.chip = chip
        self.pill = pill
    }

    public static let notch = ThemeRadii(stage: 32, card: 16, panel: 12, control: 10, chip: 7, pill: 999)
}

/// Which face a style is set in: Inter Tight for titles and figures, Inter for the rest, and the
/// greeting's Sacramento script.
public enum TypeFace: String {
    case display, text, script
}

public struct TypeStyle: Equatable {
    public let face: TypeFace
    public let size: CGFloat
    /// The CSS weight (400 regular, 500 medium, 600 semibold, 700 bold): a point on the variable fonts' `wght` axis.
    public let weight: Int
    /// Letter-spacing in em.
    public let tracking: CGFloat
    public let uppercase: Bool
    /// Tabular figures, so a clock or a count doesn't twitch as it changes.
    public let tabular: Bool

    public init(_ face: TypeFace, _ size: CGFloat, _ weight: Int, tracking: CGFloat = 0, uppercase: Bool = false, tabular: Bool = false) {
        self.face = face
        self.size = size
        self.weight = weight
        self.tracking = tracking
        self.uppercase = uppercase
        self.tabular = tabular
    }

    /// The tracking in points.
    public var trackingPoints: CGFloat { tracking * size }
}

/// The type ramp, in the reference's weights: bold, tight titles; semibold white labels; medium grey
/// values; the figures of a countdown big and tabular.
public enum TypeToken: String, CaseIterable {
    /// An alert's title: 17 / 700, tight.
    case title
    /// An empty list's title.
    case displayLine
    /// What you asked, as a bold white line.
    case quote
    /// The greeting when the lid opens.
    case scriptGreeting
    /// The greeting the dropdown opens with.
    case scriptHeader
    /// A row's title, and the same title once read.
    case rowTitle
    case rowTitleRead
    /// A row's second line.
    case rowSub
    /// A Today row's label and value, a size up, as the reference's right card sets them.
    case todayLabel
    case todayValue
    /// A time or a day at the end of a row.
    case meta
    /// A card's header ("Notifications", "Today") and a menu's section label.
    case eyebrow
    /// A segment of the Appearance switch.
    case tab
    /// The count on a tab's badge.
    case count
    /// Pills (30 pt), and the small ones (24 pt) in rows.
    case pill
    case pillStrong
    case pillSmall
    case pillSmallStrong
    /// A chip in the greeting's day line.
    case chip
    /// A status pill on a tone's wash ("AI not connected").
    case statusPill
    /// The voice answer.
    case body
    /// The status beside the camera ("Connected", an alert's kind, "Listening…").
    case band
    /// The live activity's label and its countdown.
    case live
    case liveFigure
    /// The empty state's sentence.
    case emptyDetail
    /// A row in a menu.
    case menuItem
    /// A task's outcome, shown for a moment.
    case toast
}

// MARK: - The two sets

public struct BuildFlowTheme: Equatable {
    public enum Scheme: String {
        case light, dark
    }

    public let scheme: Scheme
    public let colors: [ThemeToken: ThemeColor]
    public let shadows: [ShadowToken: [ThemeShadow]]
    public let type: [TypeToken: TypeStyle]
    public let radii: ThemeRadii

    public init(scheme: Scheme, colors: [ThemeToken: ThemeColor], shadows: [ShadowToken: [ThemeShadow]],
                type: [TypeToken: TypeStyle], radii: ThemeRadii) {
        self.scheme = scheme
        self.colors = colors
        self.shadows = shadows
        self.type = type
        self.radii = radii
    }

    /// Loud on purpose: a token a set forgot shows as magenta (and the checks fail first).
    public static let missing = ThemeColor(0xFF00FF)

    public subscript(_ token: ThemeToken) -> ThemeColor { colors[token] ?? Self.missing }
    public subscript(_ token: ShadowToken) -> [ThemeShadow] { shadows[token] ?? [] }
    public subscript(_ token: TypeToken) -> TypeStyle { type[token] ?? TypeStyle(.text, 13, 400) }

    public var isDark: Bool { scheme == .dark }

    /// A tone's colour and wash (the disc behind a row's icon, a status pill). A quiet row's disc is
    /// the control grey, as the reference's CPU and Memory rows are.
    public static func tone(_ tone: NotchTone) -> (color: ThemeToken, wash: ThemeToken) {
        switch tone {
        case .ok: return (.ok, .okWash)
        case .warn: return (.warn, .warnWash)
        case .bad: return (.bad, .badWash)
        case .info: return (.info, .infoWash)
        case .brand: return (.orange, .orangeWash)
        case .muted: return (.inkMuted, .control)
        }
    }

    /// Soft shadows in a neutral ink, for the light cards and the menu; on the black they vanish.
    static let shadowSet: [ShadowToken: [ThemeShadow]] = [
        .card: [ThemeShadow(ThemeColor(0x000000, alpha: 0.05), y: 1, blur: 2)],
        .raised: [ThemeShadow(ThemeColor(0x000000, alpha: 0.08), y: 2, blur: 4),
                  ThemeShadow(ThemeColor(0x000000, alpha: 0.10), y: 6, blur: 14)],
        .float: [ThemeShadow(ThemeColor(0x000000, alpha: 0.18), y: 8, blur: 20),
                 ThemeShadow(ThemeColor(0x000000, alpha: 0.28), y: 24, blur: 48)],
    ]

    static let typeRamp: [TypeToken: TypeStyle] = [
        .title: TypeStyle(.display, 17, 700, tracking: -0.02),
        .displayLine: TypeStyle(.display, 14.5, 650, tracking: -0.015),
        .quote: TypeStyle(.display, 16, 700, tracking: -0.015),
        .scriptGreeting: TypeStyle(.script, 58, 400),
        .scriptHeader: TypeStyle(.script, 54, 400),
        .rowTitle: TypeStyle(.text, 13, 600, tracking: -0.006),
        .rowTitleRead: TypeStyle(.text, 13, 500, tracking: -0.006),
        .rowSub: TypeStyle(.text, 11.5, 500),
        .todayLabel: TypeStyle(.text, 14, 600, tracking: -0.01),
        .todayValue: TypeStyle(.text, 12.5, 500),
        .meta: TypeStyle(.text, 11, 500, tabular: true),
        .eyebrow: TypeStyle(.text, 12, 600, tracking: -0.005),
        .tab: TypeStyle(.text, 12, 500),
        .count: TypeStyle(.text, 9.5, 700, tabular: true),
        .pill: TypeStyle(.text, 12.5, 600),
        .pillStrong: TypeStyle(.text, 12.5, 650),
        .pillSmall: TypeStyle(.text, 11.5, 600),
        .pillSmallStrong: TypeStyle(.text, 11.5, 650),
        .chip: TypeStyle(.text, 12, 500),
        .statusPill: TypeStyle(.text, 11, 600, tracking: -0.01),
        .body: TypeStyle(.text, 13.5, 450),
        .band: TypeStyle(.text, 13, 500),
        .live: TypeStyle(.text, 13, 600, tracking: -0.006),
        .liveFigure: TypeStyle(.display, 17, 700, tabular: true),
        .emptyDetail: TypeStyle(.text, 12, 450),
        .menuItem: TypeStyle(.text, 12.5, 500),
        .toast: TypeStyle(.text, 12, 600),
    ]

    /// The reference: near-black cards (#1e1e20) on the pure black, white titles and grey values.
    public static let dark = BuildFlowTheme(scheme: .dark, colors: [
        .frame: ThemeColor(0x000000),
        .track: ThemeColor(0x141416),
        .surface: ThemeColor(0x1E1E20),
        .surfaceRaised: ThemeColor(0x2A2A2D),
        .hover: ThemeColor(0x29292C),
        .control: ThemeColor(0x3A3A3D),
        .selection: ThemeColor(0x4A4A4E),
        .ink: ThemeColor(0xF5F5F7),
        .inkSoft: ThemeColor(0xD2D2D7),
        .inkMuted: ThemeColor(0xA1A1A6),
        // The faintest grey that still clears 4.5:1 on the raised surface and the hover grey.
        .inkFaint: ThemeColor(0x959599),
        .lineSolid: ThemeColor(0x2D2D30),
        .lineSoft: ThemeColor(0x2B2B2E),
        .accent: ThemeColor(0xF47B20),
        .accentFill: ThemeColor(0xF47B20),
        .onAccent: ThemeColor(0x111111),
        .accentWash: ThemeColor(0x402D20),
        // The reference's accents: green, amber, a pinkish red, purple; each wash is its colour laid
        // thinly over the card, as the reference's tinted discs are.
        .ok: ThemeColor(0x30D158),
        .okWash: ThemeColor(0x22422B),
        .warn: ThemeColor(0xFF9F0A),
        .warnWash: ThemeColor(0x4B381C),
        .bad: ThemeColor(0xFF6B85),
        .badWash: ThemeColor(0x462C32),
        .info: ThemeColor(0xBF8CFF),
        .infoWash: ThemeColor(0x3E344D),
        .orange: ThemeColor(0xF47B20),
        .orangeWash: ThemeColor(0x402D20),
        .rim: ThemeColor(0xC8D6FF),
    ], shadows: shadowSet, type: typeRamp, radii: .notch)

    /// The same black frame with light cards inside: #f2f2f7 surfaces and dark text. The tones are
    /// darkened until they read as text on the light surfaces.
    public static let light = BuildFlowTheme(scheme: .light, colors: [
        .frame: ThemeColor(0x000000),
        .track: ThemeColor(0x141416),
        .surface: ThemeColor(0xF2F2F7),
        .surfaceRaised: ThemeColor(0xFFFFFF),
        .hover: ThemeColor(0xE6E6EB),
        .control: ThemeColor(0xDCDCE1),
        .selection: ThemeColor(0xC7C7CC),
        .ink: ThemeColor(0x1C1C1E),
        .inkSoft: ThemeColor(0x3A3A3C),
        .inkMuted: ThemeColor(0x545458),
        .inkFaint: ThemeColor(0x636367),
        .lineSolid: ThemeColor(0xD6D6DB),
        .lineSoft: ThemeColor(0xE0E0E5),
        .accent: ThemeColor(0xB04F08),
        .accentFill: ThemeColor(0xE8701A),
        .onAccent: ThemeColor(0x111111),
        .accentWash: ThemeColor(0xFDEEE3),
        .ok: ThemeColor(0x1B7A3C),
        .okWash: ThemeColor(0xE1F3E6),
        .warn: ThemeColor(0x975A00),
        .warnWash: ThemeColor(0xFCEFD9),
        .bad: ThemeColor(0xC0223F),
        .badWash: ThemeColor(0xFCE4E8),
        .info: ThemeColor(0x7A3FC0),
        .infoWash: ThemeColor(0xF0E6FB),
        .orange: ThemeColor(0xB04F08),
        .orangeWash: ThemeColor(0xFDEEE3),
        .rim: ThemeColor(0xC8D6FF),
    ], shadows: shadowSet, type: typeRamp, radii: .notch)

    /// The black shape and everything set straight on it (the tabs, the status, the greeting, an
    /// alert, a countdown, voice) are always read in the dark set, whatever the cards inside show.
    public static var frame: BuildFlowTheme { .dark }
}

// MARK: - Appearance

/// The status menu's and the dropdown's "Appearance" choice.
public enum Appearance: String, CaseIterable {
    case light, dark, system

    public var label: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .system: return "Match macOS"
        }
    }

    public func theme(systemIsDark: Bool) -> BuildFlowTheme {
        switch self {
        case .light: return .light
        case .dark: return .dark
        case .system: return systemIsDark ? .dark : .light
        }
    }
}

/// Where the choice is kept (UserDefaults). Dark unless chosen otherwise: the reference's look.
public final class AppearanceStore {
    public static let key = "appearance"
    /// What the notch shows until someone chooses.
    public static let fallback = Appearance.dark
    public let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var appearance: Appearance {
        get { defaults.string(forKey: Self.key).flatMap(Appearance.init(rawValue:)) ?? Self.fallback }
        set { defaults.set(newValue.rawValue, forKey: Self.key) }
    }
}
