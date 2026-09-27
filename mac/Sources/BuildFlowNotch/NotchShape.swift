import BuildFlowNotchKit
import SwiftUI

/// The black shape: a body with rounded bottom corners, plus concave ears that
/// flare into the screen's top edge, centred at the top of its frame. Every
/// dimension animates, so one spring carries it between the six states.
struct NotchShape: Shape {
    var width: CGFloat
    var height: CGFloat
    var radius: CGFloat
    var ear: CGFloat

    init(_ spec: ShapeSpec, earless: Bool = false) {
        width = spec.width
        height = spec.height
        radius = spec.radius
        ear = earless ? 0 : spec.ear
    }

    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(AnimatablePair(width, height), AnimatablePair(radius, ear)) }
        set {
            width = newValue.first.first
            height = newValue.first.second
            radius = newValue.second.first
            ear = newValue.second.second
        }
    }

    func path(in rect: CGRect) -> Path {
        let w = max(0, width), h = max(0, height)
        let e = max(0, min(ear, h))
        let r = max(0, min(radius, h - e, w / 2))
        let left = rect.midX - w / 2, right = rect.midX + w / 2
        let top = rect.minY, bottom = rect.minY + h

        var p = Path()
        p.move(to: CGPoint(x: left - e, y: top))
        p.addLine(to: CGPoint(x: right + e, y: top))
        if e > 0 {
            // Concave ear: the arc tangent to the top edge and the body's side.
            p.addArc(tangent1End: CGPoint(x: right, y: top), tangent2End: CGPoint(x: right, y: top + e), radius: e)
        }
        p.addLine(to: CGPoint(x: right, y: bottom - r))
        p.addArc(tangent1End: CGPoint(x: right, y: bottom), tangent2End: CGPoint(x: right - r, y: bottom), radius: r)
        p.addLine(to: CGPoint(x: left + r, y: bottom))
        p.addArc(tangent1End: CGPoint(x: left, y: bottom), tangent2End: CGPoint(x: left, y: bottom - r), radius: r)
        p.addLine(to: CGPoint(x: left, y: top + e))
        if e > 0 {
            p.addArc(tangent1End: CGPoint(x: left, y: top), tangent2End: CGPoint(x: left - e, y: top), radius: e)
        }
        p.closeSubpath()
        return p
    }
}

/// The BuildFlow window inside the black frame: `NotchMetrics.cardInset` in from the frame's sides
/// and foot, below the band, with corners concentric with the frame's. It is drawn from the same
/// animated numbers as the frame, so it grows and shrinks with the frame's spring, and it vanishes
/// in the states too small to hold it (at rest, the live activity).
struct CardShape: Shape {
    var width: CGFloat
    var height: CGFloat
    var radius: CGFloat
    let band: CGFloat
    /// Drawn this far inside the window (for a hairline along its edge).
    var inset: CGFloat = 0

    init(_ spec: ShapeSpec, band: CGFloat, inset: CGFloat = 0) {
        width = spec.width
        height = spec.height
        radius = spec.radius
        self.band = band
        self.inset = inset
    }

    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, CGFloat> {
        get { AnimatablePair(AnimatablePair(width, height), radius) }
        set {
            width = newValue.first.first
            height = newValue.first.second
            radius = newValue.second
        }
    }

    func path(in rect: CGRect) -> Path {
        let i = NotchMetrics.cardInset
        let w = width - 2 * i, h = height - band - i
        guard w > 2, h > 2 else { return Path() }
        let box = CGRect(x: rect.midX - w / 2, y: rect.minY + band, width: w, height: h).insetBy(dx: inset, dy: inset)
        let r = max(0, min(radius - i - inset, box.height / 2, box.width / 2))
        return Path(roundedRect: box, cornerRadius: r)
    }
}
