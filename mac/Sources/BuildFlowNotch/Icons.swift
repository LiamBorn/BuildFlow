import AppKit
import BuildFlowNotchKit
import SwiftUI

/// The mock-up's Lucide icons (24-unit boxes, 2-unit strokes), as path data.
enum IconPaths {
    static func paths(_ icon: NotchIcon) -> [String] {
        switch icon {
        case .bell:
            return ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"]
        case .hardHat:
            return ["M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z",
                    "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5", "M4 15v-3a6 6 0 0 1 6-6", "M14 6a6 6 0 0 1 6 6v3"]
        case .hardHatSmall:
            return ["M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z",
                    "M4 15v-3a6 6 0 0 1 6-6", "M14 6a6 6 0 0 1 6 6v3"]
        case .calendar:
            return [rect(3, 4, 18, 18, 2), "M16 2v4", "M8 2v4", "M3 10h18"]
        case .calendarPlain:
            return [rect(3, 4, 18, 18, 2), "M3 10h18"]
        case .listChecks:
            return ["m3 17 2 2 4-4", "m3 7 2 2 4-4", "M13 6h8", "M13 12h8", "M13 18h8"]
        case .listSmall:
            return ["m3 7 2 2 4-4", "M13 7h8", "M13 13h8"]
        case .mic:
            return ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 19v3"]
        case .settings:
            return [circle(12, 12, 3), "M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"]
        case .triangleAlert:
            return ["M12 9v4", "M12 17h.01", "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"]
        case .activity:
            return ["M21 12h-4l-3 9L9 3l-3 9H2"]
        case .checkSquare:
            return ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"]
        case .cloudRain:
            return ["M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2", "M16 14v6", "M8 14v6", "M12 16v6"]
        case .cloudRainSmall:
            return ["M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2", "M12 16v6"]
        case .clock:
            return [circle(12, 12, 9), "M12 7v5l3 2"]
        case .video:
            return ["m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 10.5", rect(2, 6, 14, 12, 2)]
        case .mark:
            return ["M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z", "M12 12 20.5 7.3M12 12 3.5 7.3M12 12v9.5"]
        }
    }

    static func rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double, _ r: Double) -> String {
        "M\(x + r) \(y)h\(w - 2 * r)a\(r) \(r) 0 0 1 \(r) \(r)v\(h - 2 * r)a\(r) \(r) 0 0 1 -\(r) \(r)"
            + "h-\(w - 2 * r)a\(r) \(r) 0 0 1 -\(r) -\(r)v-\(h - 2 * r)a\(r) \(r) 0 0 1 \(r) -\(r)z"
    }

    static func circle(_ cx: Double, _ cy: Double, _ r: Double) -> String {
        "M\(cx + r) \(cy)a\(r) \(r) 0 1 1 -\(2 * r) 0a\(r) \(r) 0 1 1 \(2 * r) 0z"
    }

    private static var cache: [NotchIcon: CGPath] = [:]

    /// All of an icon's paths in one CGPath, in its 24-unit box.
    static func cgPath(_ icon: NotchIcon) -> CGPath {
        if let p = cache[icon] { return p }
        let merged = CGMutablePath()
        for d in paths(icon) { merged.addPath(SVGPath.cgPath(d)) }
        cache[icon] = merged
        return merged
    }
}

struct IconShape: Shape {
    let icon: NotchIcon

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        var t = CGAffineTransform(translationX: rect.midX - 12 * s, y: rect.midY - 12 * s).scaledBy(x: s, y: s)
        guard let p = IconPaths.cgPath(icon).copy(using: &t) else { return Path() }
        return Path(p)
    }
}

/// A stroked icon, `size` points square, with the mock-up's 2-unit line.
struct IconView: View {
    let icon: NotchIcon
    var size: CGFloat = 14
    var lineWidth: CGFloat = 2

    var body: some View {
        IconShape(icon: icon)
            .stroke(style: StrokeStyle(lineWidth: lineWidth * size / 24, lineCap: .round, lineJoin: .round))
            .frame(width: size, height: size)
    }
}

/// The coloured square behind an icon (26 pt, or 22 pt small).
struct IconTile: View {
    let icon: NotchIcon
    let tone: NotchTone
    var small = false

    var body: some View {
        let c = Palette.tile(tone)
        ZStack {
            RoundedRectangle(cornerRadius: small ? 6 : 8, style: .continuous).fill(c.bg)
            IconView(icon: icon, size: small ? 13 : 14).foregroundColor(c.fg)
        }
        .frame(width: small ? 22 : 26, height: small ? 22 : 26)
    }
}

/// The BuildFlow mark for the menu bar, as a template image.
enum MenuBarIcon {
    static func image() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size, flipped: true) { rect in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
            let s = rect.width / 24
            ctx.scaleBy(x: s, y: s)
            ctx.addPath(IconPaths.cgPath(.mark))
            ctx.setLineWidth(1.9)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            ctx.setStrokeColor(NSColor.black.cgColor)
            ctx.strokePath()
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "BuildFlow"
        return image
    }
}
