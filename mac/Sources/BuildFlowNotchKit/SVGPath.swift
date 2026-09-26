import CoreGraphics
import Foundation

/// A small SVG path-data reader (M L H V C S Q T A Z, absolute and relative), enough
/// to draw the mock-up's Lucide icons exactly as the website does.
public enum SVGPath {
    public static func cgPath(_ d: String) -> CGPath {
        let path = CGMutablePath()
        var s = Scanner(Array(d.utf8))
        var cmd: UInt8 = 0
        var cur = CGPoint.zero, start = CGPoint.zero
        var lastCubic: CGPoint?, lastQuad: CGPoint?

        while true {
            if let c = s.command() {
                cmd = c
            } else if !s.hasNumber() {
                break
            }
            let rel = cmd >= 97 // lowercase
            func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y) }

            switch cmd | 0x20 { // lowercased
            case UInt8(ascii: "m"):
                guard let x = s.number(), let y = s.number() else { return path }
                cur = pt(x, y); start = cur
                path.move(to: cur)
                cmd = rel ? UInt8(ascii: "l") : UInt8(ascii: "L") // later pairs are line-tos
                lastCubic = nil; lastQuad = nil
            case UInt8(ascii: "l"):
                guard let x = s.number(), let y = s.number() else { return path }
                cur = pt(x, y); path.addLine(to: cur)
                lastCubic = nil; lastQuad = nil
            case UInt8(ascii: "h"):
                guard let x = s.number() else { return path }
                cur = CGPoint(x: rel ? cur.x + x : x, y: cur.y); path.addLine(to: cur)
                lastCubic = nil; lastQuad = nil
            case UInt8(ascii: "v"):
                guard let y = s.number() else { return path }
                cur = CGPoint(x: cur.x, y: rel ? cur.y + y : y); path.addLine(to: cur)
                lastCubic = nil; lastQuad = nil
            case UInt8(ascii: "c"):
                guard let x1 = s.number(), let y1 = s.number(), let x2 = s.number(), let y2 = s.number(),
                      let x = s.number(), let y = s.number() else { return path }
                let c1 = pt(x1, y1), c2 = pt(x2, y2), e = pt(x, y)
                path.addCurve(to: e, control1: c1, control2: c2)
                lastCubic = c2; lastQuad = nil; cur = e
            case UInt8(ascii: "s"):
                guard let x2 = s.number(), let y2 = s.number(), let x = s.number(), let y = s.number() else { return path }
                let c1 = lastCubic.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let c2 = pt(x2, y2), e = pt(x, y)
                path.addCurve(to: e, control1: c1, control2: c2)
                lastCubic = c2; lastQuad = nil; cur = e
            case UInt8(ascii: "q"):
                guard let x1 = s.number(), let y1 = s.number(), let x = s.number(), let y = s.number() else { return path }
                let c = pt(x1, y1), e = pt(x, y)
                path.addQuadCurve(to: e, control: c)
                lastQuad = c; lastCubic = nil; cur = e
            case UInt8(ascii: "t"):
                guard let x = s.number(), let y = s.number() else { return path }
                let c = lastQuad.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let e = pt(x, y)
                path.addQuadCurve(to: e, control: c)
                lastQuad = c; lastCubic = nil; cur = e
            case UInt8(ascii: "a"):
                guard let rx = s.number(), let ry = s.number(), let rot = s.number(),
                      let large = s.flag(), let sweep = s.flag(), let x = s.number(), let y = s.number() else { return path }
                let e = pt(x, y)
                addArc(path, from: cur, to: e, rx: rx, ry: ry, rotation: rot, largeArc: large, sweep: sweep)
                cur = e; lastCubic = nil; lastQuad = nil
            case UInt8(ascii: "z"):
                path.closeSubpath()
                cur = start; lastCubic = nil; lastQuad = nil
                // Numbers straight after Z would be an error; stop rather than loop.
                if !s.nextIsCommand() && s.hasNumber() { return path }
                continue
            default:
                return path
            }
        }
        return path
    }

    /// SVG's endpoint arc (spec F.6.5), drawn as up-to-90° cubic pieces.
    static func addArc(_ path: CGMutablePath, from p0: CGPoint, to p: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat,
                       rotation: CGFloat, largeArc: Bool, sweep: Bool) {
        if p0 == p { return }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { path.addLine(to: p); return }
        let phi = rotation * .pi / 180
        let cosP = cos(phi), sinP = sin(phi)
        let dx2 = (p0.x - p.x) / 2, dy2 = (p0.y - p.y) / 2
        let x1p = cosP * dx2 + sinP * dy2
        let y1p = -sinP * dx2 + cosP * dy2
        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 { rx *= sqrt(lambda); ry *= sqrt(lambda) }
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        var coef = den == 0 ? 0 : sqrt(max(0, num / den))
        if largeArc == sweep { coef = -coef }
        let cxp = coef * rx * y1p / ry
        let cyp = -coef * ry * x1p / rx
        let cx = cosP * cxp - sinP * cyp + (p0.x + p.x) / 2
        let cy = sinP * cxp + cosP * cyp + (p0.y + p.y) / 2

        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        }
        let ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry
        let vx = (-x1p - cxp) / rx, vy = (-y1p - cyp) / ry
        let theta1 = angle(1, 0, ux, uy)
        var dTheta = angle(ux, uy, vx, vy)
        if !sweep && dTheta > 0 { dTheta -= 2 * .pi }
        if sweep && dTheta < 0 { dTheta += 2 * .pi }

        let segments = max(1, Int(ceil(abs(dTheta) / (.pi / 2) - 1e-9)))
        let delta = dTheta / CGFloat(segments)
        let k = 4 / 3 * tan(delta / 4)
        func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: cx + rx * cosP * x - ry * sinP * y, y: cy + rx * sinP * x + ry * cosP * y)
        }
        for i in 0..<segments {
            let a1 = theta1 + CGFloat(i) * delta, a2 = a1 + delta
            let (c1, s1, c2, s2) = (cos(a1), sin(a1), cos(a2), sin(a2))
            let end = i == segments - 1 ? p : map(c2, s2)
            path.addCurve(to: end, control1: map(c1 - k * s1, s1 + k * c1), control2: map(c2 + k * s2, s2 - k * c2))
        }
    }

    struct Scanner {
        let b: [UInt8]
        var i = 0
        init(_ b: [UInt8]) { self.b = b }

        mutating func skip() {
            while i < b.count, b[i] == 32 || b[i] == 44 || b[i] == 9 || b[i] == 10 || b[i] == 13 { i += 1 }
        }

        static func isCommand(_ c: UInt8) -> Bool {
            switch c | 0x20 {
            case UInt8(ascii: "m"), UInt8(ascii: "l"), UInt8(ascii: "h"), UInt8(ascii: "v"), UInt8(ascii: "c"),
                 UInt8(ascii: "s"), UInt8(ascii: "q"), UInt8(ascii: "t"), UInt8(ascii: "a"), UInt8(ascii: "z"):
                return true
            default:
                return false
            }
        }

        mutating func nextIsCommand() -> Bool {
            skip()
            return i < b.count && Self.isCommand(b[i])
        }

        mutating func command() -> UInt8? {
            skip()
            guard i < b.count, Self.isCommand(b[i]) else { return nil }
            defer { i += 1 }
            return b[i]
        }

        mutating func hasNumber() -> Bool {
            skip()
            guard i < b.count else { return false }
            let c = b[i]
            return (c >= 48 && c <= 57) || c == 46 || c == 45 || c == 43
        }

        mutating func number() -> CGFloat? {
            skip()
            let startIndex = i
            if i < b.count, b[i] == 45 || b[i] == 43 { i += 1 }
            var digits = false
            while i < b.count, b[i] >= 48 && b[i] <= 57 { i += 1; digits = true }
            if i < b.count, b[i] == 46 {
                i += 1
                while i < b.count, b[i] >= 48 && b[i] <= 57 { i += 1; digits = true }
            }
            if digits, i < b.count, b[i] == 101 || b[i] == 69 {
                var j = i + 1
                if j < b.count, b[j] == 45 || b[j] == 43 { j += 1 }
                if j < b.count, b[j] >= 48 && b[j] <= 57 {
                    i = j
                    while i < b.count, b[i] >= 48 && b[i] <= 57 { i += 1 }
                }
            }
            guard digits, let v = Double(String(decoding: b[startIndex..<i], as: UTF8.self)) else {
                i = startIndex
                return nil
            }
            return CGFloat(v)
        }

        mutating func flag() -> Bool? {
            skip()
            guard i < b.count else { return nil }
            if b[i] == 48 { i += 1; return false }
            if b[i] == 49 { i += 1; return true }
            return nil
        }
    }
}
