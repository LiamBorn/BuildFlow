import AppKit
import BuildFlowNotchKit
import SwiftUI

// The Kit's BuildFlowTheme, as SwiftUI colours, fonts and shadows. Views read the theme from the
// environment and name tokens; no view writes a colour, a radius or a face of its own.

extension Color {
    init(_ c: ThemeColor) {
        self.init(.sRGB, red: c.red, green: c.green, blue: c.blue, opacity: c.alpha)
    }
}

/// A set the views draw with. The black shape and everything set straight on it draw with the dark
/// set (`NotchTheme.onFrame`); the cards, menus and the proposal card inside it with the Light or Dark
/// set Appearance chose. The root view puts the right one in the environment for each.
struct NotchTheme {
    let tokens: BuildFlowTheme

    init(_ tokens: BuildFlowTheme) {
        self.tokens = tokens
    }

    /// The black shape's own set.
    static let onFrame = NotchTheme(BuildFlowTheme.frame)

    subscript(_ token: ThemeToken) -> Color { Color(tokens[token]) }

    var radii: ThemeRadii { tokens.radii }
    var isDark: Bool { tokens.isDark }
    var colorScheme: ColorScheme { tokens.isDark ? .dark : .light }

    func style(_ token: TypeToken) -> TypeStyle { tokens[token] }
    func font(_ token: TypeToken) -> Font { NotchFonts.font(tokens[token]) }

    /// A tone's colour and wash.
    func tone(_ tone: NotchTone) -> (color: Color, wash: Color) {
        let pair = BuildFlowTheme.tone(tone)
        return (Color(tokens[pair.color]), Color(tokens[pair.wash]))
    }

    /// A string set in a type token: its face, size, weight, tracking and case.
    func text(_ string: String, _ token: TypeToken) -> Text {
        let s = tokens[token]
        return Text(s.uppercase ? string.uppercased() : string).font(NotchFonts.font(s)).tracking(s.trackingPoints)
    }
}

/// Inter and Inter Tight from the bundled variable fonts, at the style's exact weight; SF Pro at the
/// same size and weight when they couldn't be loaded. The script is Sacramento (ScriptFont).
enum NotchFonts {
    static func font(_ s: TypeStyle) -> Font {
        if s.face == .script { return .custom(ScriptFont.name, size: s.size) }
        if let ct = ThemeFonts.font(s) { return Font(ct) }
        let f = Font.system(size: s.size, weight: weight(s.weight))
        return s.tabular ? f.monospacedDigit() : f
    }

    /// The same face as an NSFont, for measuring before drawing.
    static func nsFont(_ s: TypeStyle) -> NSFont {
        if let ct = ThemeFonts.font(s) { return ct as NSFont }
        let f = NSFont.systemFont(ofSize: s.size, weight: nsWeight(s.weight))
        return s.tabular ? NSFont.monospacedDigitSystemFont(ofSize: s.size, weight: nsWeight(s.weight)) : f
    }

    /// The width of `text` in a style, tracking included.
    static func width(_ text: String, _ s: TypeStyle) -> CGFloat {
        let shown = s.uppercase ? text.uppercased() : text
        return ceil((shown as NSString).size(withAttributes: [.font: nsFont(s), .kern: s.trackingPoints]).width)
    }

    static func weight(_ css: Int) -> Font.Weight {
        switch css {
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        default: return .bold
        }
    }

    static func nsWeight(_ css: Int) -> NSFont.Weight {
        switch css {
        case ..<350: return .light
        case ..<450: return .regular
        case ..<550: return .medium
        case ..<650: return .semibold
        default: return .bold
        }
    }
}

private struct NotchThemeKey: EnvironmentKey {
    static let defaultValue = NotchTheme.onFrame
}

private struct ReduceMotionKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var notchTheme: NotchTheme {
        get { self[NotchThemeKey.self] }
        set { self[NotchThemeKey.self] = newValue }
    }

    /// System Settings › Accessibility › Display › Reduce motion.
    var notchReduceMotion: Bool {
        get { self[ReduceMotionKey.self] }
        set { self[ReduceMotionKey.self] = newValue }
    }
}

/// A CSS box-shadow's layers. CSS blurs by twice what SwiftUI calls a radius.
struct ThemeShadowModifier: ViewModifier {
    let layers: [ThemeShadow]

    func body(content: Content) -> some View {
        layers.reduce(AnyView(content)) { view, layer in
            AnyView(view.shadow(color: Color(layer.color), radius: layer.blur / 2, x: layer.x, y: layer.y))
        }
    }
}

extension View {
    func themeShadow(_ token: ShadowToken, _ theme: NotchTheme) -> some View {
        modifier(ThemeShadowModifier(layers: theme.tokens[token]))
    }
}
