import BuildFlowNotchKit
import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// The mock-up's notch colours (always dark, like the hardware).
enum Palette {
    static let orange = Color(hex: 0xF47B20)
    static let orangeText = Color(hex: 0xF79A55)
    static let green = Color(hex: 0x6FE3A0)
    static let amber = Color(hex: 0xF2B544)
    static let scriptInk = Color(hex: 0xFFF3E8)
    static let ink = Color(hex: 0x1C1C1C)

    static let card = Color(hex: 0x141414)
    static let cardBorder = Color(hex: 0x202020)
    static let rowRule = Color(hex: 0x222222)
    static let tabs = Color(hex: 0x161616)
    static let tabsBorder = Color(hex: 0x242424)
    static let tabSelected = Color(hex: 0x2C2C2C)
    static let round = Color(hex: 0x1C1C1C)
    static let pill = Color(hex: 0x2A2A2A)
    static let proposal = Color(hex: 0x161616)
    static let proposalBorder = Color(hex: 0x5A3A1E)
    static let proposalButton = Color(hex: 0x262626)

    static func white(_ o: Double) -> Color { Color.white.opacity(o) }

    /// Icon tile background and foreground for a tone.
    static func tile(_ tone: NotchTone) -> (bg: Color, fg: Color) {
        switch tone {
        case .warn: return (Color(hex: 0x3B2A0E), Color(hex: 0xF2B544))
        case .ok: return (Color(hex: 0x16331F), Color(hex: 0x6FE3A0))
        case .bad: return (Color(hex: 0x3A1512), Color(hex: 0xFF8A80))
        case .info: return (Color(hex: 0x33203A), Color(hex: 0xD9A2EA))
        case .brand: return (Color(hex: 0x3A200C), Color(hex: 0xF79A55))
        case .muted: return (Color(hex: 0x232323), Color.white.opacity(0.75))
        }
    }
}

/// SF Pro at the mock-up's CSS pixel sizes.
enum NotchFont {
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}
