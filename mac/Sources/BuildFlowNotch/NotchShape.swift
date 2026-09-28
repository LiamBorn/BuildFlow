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

/// The black shape's lower rim as an open path: down the left side from under the ear, round the
/// bottom corners and up the right side. The rim light is drawn along it. It is built from the same
/// animated numbers as the shape, so it follows the shape's spring.
struct RimShape: Shape {
    var width: CGFloat
    var height: CGFloat
    var radius: CGFloat
    var ear: CGFloat
    /// Drawn this far inside the shape's edge (half a stroke, to sit on the edge).
    var inset: CGFloat = 0

    init(_ spec: ShapeSpec, inset: CGFloat = 0) {
        width = spec.width
        height = spec.height
        radius = spec.radius
        ear = spec.ear
        self.inset = inset
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
        let left = rect.midX - w / 2 + inset, right = rect.midX + w / 2 - inset
        let top = rect.minY + e, bottom = rect.minY + h - inset
        let ri = max(0, r - inset)
        var p = Path()
        p.move(to: CGPoint(x: left, y: top))
        p.addLine(to: CGPoint(x: left, y: bottom - ri))
        p.addArc(tangent1End: CGPoint(x: left, y: bottom), tangent2End: CGPoint(x: left + ri, y: bottom), radius: ri)
        p.addLine(to: CGPoint(x: right - ri, y: bottom))
        p.addArc(tangent1End: CGPoint(x: right, y: bottom), tangent2End: CGPoint(x: right, y: bottom - ri), radius: ri)
        p.addLine(to: CGPoint(x: right, y: top))
        return p
    }
}
