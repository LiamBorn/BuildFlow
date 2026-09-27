import CoreGraphics
import Foundation

// BuildFlow's own look, as the website draws it (client/src/app-shell-client-desk.css §1 and §47,
// client/src/app-shell-daylight.css §29b): the colour tokens, the shadows, the radius ladder and the
// type, in a Light and a Dark set. Every colour, radius and face the notch draws comes from here;
// the views name tokens and never write a value of their own.

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

/// The colour tokens, named after the website's custom properties so each value can be found in
/// the stylesheets. The last one is the notch's own: the hardware black the BuildFlow window sits in.
public enum ThemeToken: String, CaseIterable {
    // Surfaces: the page's ground (the panel), a card, a raised card, and the hover / second surface.
    case ground = "--bf-ground"
    case surface = "--bf-surface"
    case surfaceRaised = "--bf-surface-raised"
    case hover = "--bf-hover"
    // Text.
    case ink = "--bf-ink"
    case inkMuted = "--bf-ink-muted"
    case inkFaint = "--bf-ink-faint"
    // Lines.
    case lineSolid = "--bf-line-solid"
    case lineSoft = "--bf-line-soft"
    // The accent. In the Default colour set, BuildFlow's default look, it is the ink itself.
    case accent = "--bf-color-accent"
    case accentFill = "--bf-color-accent-fill"
    case onAccent = "--bf-color-on-accent"
    case accentWash = "--bf-color-accent-wash"
    // The four tones that carry meaning, each a colour and a wash.
    case ok = "--bf-color-ok"
    case okWash = "--bf-color-ok-wash"
    case warn = "--bf-color-warn"
    case warnWash = "--bf-color-warn-wash"
    case bad = "--bf-color-bad"
    case badWash = "--bf-color-bad-wash"
    case info = "--bf-color-info"
    case infoWash = "--bf-color-info-wash"
    // The hint that used to be orange; the Default set makes it a grey.
    case orange = "--bf-color-orange"
    case orangeWash = "--bf-color-orange-wash"
    // The notch's frame: the black that grows out of the camera housing.
    case frame = "--notch-frame"

    /// The surfaces text is set on.
    public static let surfaces: [ThemeToken] = [.ground, .surface, .surfaceRaised, .hover]
    /// The text colours.
    public static let text: [ThemeToken] = [.ink, .inkMuted, .inkFaint]
    /// Each colour with the wash it is set on (a tone disc, a status chip, the "AI not connected" chip).
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
    /// The softest: every white card and white pill.
    case card = "--bf-shadow-card"
    /// A control lifted on hover, a menu.
    case raised = "--bf-shadow-raised"
    /// The drawer, a floating card.
    case float = "--bf-shadow-float"
}

/// The radius ladder: xs 6 · sm 10 · md 14 · lg 20 · xl 28, and pills fully round.
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

    public static let buildFlow = ThemeRadii(stage: 28, card: 20, panel: 14, control: 10, chip: 6, pill: 999)
}

/// Which face a style is set in: Inter Tight for headings and figures, Inter for the rest, and the
/// greeting's Sacramento script.
public enum TypeFace: String {
    case display, text, script
}

public struct TypeStyle: Equatable {
    public let face: TypeFace
    public let size: CGFloat
    /// The CSS weight (400 regular, 500 medium, 600 semibold, 700 bold): a point on the variable fonts' `wght` axis.
    public let weight: Int
    /// Letter-spacing in em, as the stylesheet writes it.
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

/// The type ramp. Sizes, weights and tracking are the website's (the notifications drawer, §9's
/// buttons, the eyebrows, the Dashboard's greeting); a few are a point smaller to fit the notch.
public enum TypeToken: String, CaseIterable {
    /// The drawer's title: 22 / 600 / -0.03em.
    case title
    /// A display line: the empty state's, an alert's title. 15 / 600 / -0.022em.
    case displayLine
    /// What you asked, as a quoted display line.
    case quote
    /// The greeting when the lid opens.
    case scriptGreeting
    /// The greeting at the top of the dropdown.
    case scriptHeader
    /// A row's title, and the same title once read.
    case rowTitle
    case rowTitleRead
    /// A row's second line.
    case rowSub
    /// A time or a day at the end of a row.
    case meta
    /// An eyebrow label: 11 / 600 / +0.14em, upper case.
    case eyebrow
    case tab
    case count
    /// Pills (40 px on the website), and the tiny ones (30 px) in rows.
    case pill
    case pillStrong
    case pillSmall
    case pillSmallStrong
    /// A chip in the greeting's day line.
    case chip
    /// A status pill on a tone's wash ("AI not connected"): the website's `.ui-pill`, 11 / 600 / -0.01em.
    case statusPill
    /// The voice answer.
    case body
    /// The status beside the camera.
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

    /// A tone's colour and wash (the disc behind a row's icon, a status chip).
    public static func tone(_ tone: NotchTone) -> (color: ThemeToken, wash: ThemeToken) {
        switch tone {
        case .ok: return (.ok, .okWash)
        case .warn: return (.warn, .warnWash)
        case .bad: return (.bad, .badWash)
        case .info: return (.info, .infoWash)
        case .brand: return (.orange, .orangeWash)
        case .muted: return (.inkMuted, .hover)
        }
    }

    /// The website's shadows, drawn in its warm ink (rgb 23 21 15). On the dark ground they all but
    /// disappear, as on the website, where dark mode separates cards by their surface instead.
    static let shadowSet: [ShadowToken: [ThemeShadow]] = [
        .card: [ThemeShadow(ThemeColor(0x17150F, alpha: 0.05), y: 1, blur: 2)],
        .raised: [ThemeShadow(ThemeColor(0x17150F, alpha: 0.04), y: 2, blur: 4),
                  ThemeShadow(ThemeColor(0x17150F, alpha: 0.05), y: 6, blur: 14)],
        .float: [ThemeShadow(ThemeColor(0x17150F, alpha: 0.07), y: 8, blur: 20),
                 ThemeShadow(ThemeColor(0x17150F, alpha: 0.10), y: 30, blur: 60)],
    ]

    static let typeRamp: [TypeToken: TypeStyle] = [
        .title: TypeStyle(.display, 22, 600, tracking: -0.03),
        .displayLine: TypeStyle(.display, 15, 600, tracking: -0.022),
        .quote: TypeStyle(.display, 15, 600, tracking: -0.022),
        .scriptGreeting: TypeStyle(.script, 60, 400),
        .scriptHeader: TypeStyle(.script, 42, 400),
        .rowTitle: TypeStyle(.text, 13, 600),
        .rowTitleRead: TypeStyle(.text, 13, 500),
        .rowSub: TypeStyle(.text, 12, 500),
        .meta: TypeStyle(.text, 11.5, 500, tabular: true),
        .eyebrow: TypeStyle(.text, 11, 600, tracking: 0.14, uppercase: true),
        .tab: TypeStyle(.text, 12.5, 500),
        .count: TypeStyle(.text, 11, 600, tabular: true),
        .pill: TypeStyle(.text, 12.5, 500),
        .pillStrong: TypeStyle(.text, 12.5, 600),
        .pillSmall: TypeStyle(.text, 11.5, 500),
        .pillSmallStrong: TypeStyle(.text, 11.5, 600),
        .chip: TypeStyle(.text, 12, 500),
        .statusPill: TypeStyle(.text, 11, 600, tracking: -0.01),
        .body: TypeStyle(.text, 13.5, 400),
        .band: TypeStyle(.text, 11.5, 500),
        .live: TypeStyle(.text, 13, 500),
        .liveFigure: TypeStyle(.display, 13, 600, tabular: true),
        .emptyDetail: TypeStyle(.text, 12, 500),
        .menuItem: TypeStyle(.text, 12.5, 500),
        .toast: TypeStyle(.text, 12, 500),
    ]

    /// BuildFlow's default look: the Default colour set on the light shell.
    public static let light = BuildFlowTheme(scheme: .light, colors: [
        .ground: ThemeColor(0xF4F4F4),
        .surface: ThemeColor(0xFFFFFF),
        .surfaceRaised: ThemeColor(0xFFFFFF),
        .hover: ThemeColor(0xF1F1F1),
        .ink: ThemeColor(0x1C1C1C),
        .inkMuted: ThemeColor(0x626262),
        // The website's faint is #9b9b9b, which is 2.8:1 on white: too light for text. This is the
        // lightest grey that clears 4.5:1 on every light surface (4.51 on the hover grey).
        .inkFaint: ThemeColor(0x6E6E6E),
        .lineSolid: ThemeColor(0xE4E4E4),
        .lineSoft: ThemeColor(0xEDEDED),
        .accent: ThemeColor(0x1C1C1C),
        .accentFill: ThemeColor(0x1C1C1C),
        .onAccent: ThemeColor(0xFFFFFF),
        .accentWash: ThemeColor(0xECECEC),
        .ok: ThemeColor(0x1A7F43),
        .okWash: ThemeColor(0xEAF6EE),
        .warn: ThemeColor(0x8A5709),
        .warnWash: ThemeColor(0xFDF4E6),
        .bad: ThemeColor(0x9E1F18),
        .badWash: ThemeColor(0xFCEAE8),
        .info: ThemeColor(0x5C357A),
        .infoWash: ThemeColor(0xF3EBF7),
        .orange: ThemeColor(0x4A4A4A),
        .orangeWash: ThemeColor(0xECECEC),
        .frame: ThemeColor(0x000000),
    ], shadows: shadowSet, type: typeRamp, radii: .buildFlow)

    /// The same set on BuildFlow's dark shell.
    public static let dark = BuildFlowTheme(scheme: .dark, colors: [
        .ground: ThemeColor(0x121211),
        .surface: ThemeColor(0x1B1B19),
        .surfaceRaised: ThemeColor(0x232320),
        .hover: ThemeColor(0x262623),
        .ink: ThemeColor(0xF4F3F0),
        .inkMuted: ThemeColor(0xB5B2AB),
        // The website's #8a877e is 4.2:1 on the hover surface; five steps lighter, same warm grey,
        // it clears 4.5:1 on every dark surface.
        .inkFaint: ThemeColor(0x8F8C83),
        .lineSolid: ThemeColor(0x33332F),
        .lineSoft: ThemeColor(0x2A2A27),
        .accent: ThemeColor(0xF4F4F4),
        .accentFill: ThemeColor(0xF4F4F4),
        .onAccent: ThemeColor(0x1C1C1C),
        .accentWash: ThemeColor(0x2A2A2A),
        .ok: ThemeColor(0x80D19B),
        .okWash: ThemeColor(0x1C2C21),
        .warn: ThemeColor(0xE0A64A),
        .warnWash: ThemeColor(0x2A2318),
        .bad: ThemeColor(0xEB8178),
        .badWash: ThemeColor(0x2D1D1C),
        .info: ThemeColor(0xAB7FC2),
        .infoWash: ThemeColor(0x241C2A),
        .orange: ThemeColor(0xD0D0D0),
        .orangeWash: ThemeColor(0x2A2A2A),
        .frame: ThemeColor(0x000000),
    ], shadows: shadowSet, type: typeRamp, radii: .buildFlow)

    /// The black frame and the band beside the camera are always read in the dark set: they are the
    /// hardware's black, whatever the window inside it shows.
    public static var frame: BuildFlowTheme { .dark }

    /// The website's own faint greys, kept for reference (see `.inkFaint`).
    public static let websiteInkFaint: (light: ThemeColor, dark: ThemeColor) = (ThemeColor(0x9B9B9B), ThemeColor(0x8A877E))
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

/// Where the choice is kept (UserDefaults). Light unless chosen otherwise: the website's default.
public final class AppearanceStore {
    public static let key = "appearance"
    public let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var appearance: Appearance {
        get { defaults.string(forKey: Self.key).flatMap(Appearance.init(rawValue:)) ?? .light }
        set { defaults.set(newValue.rawValue, forKey: Self.key) }
    }
}
