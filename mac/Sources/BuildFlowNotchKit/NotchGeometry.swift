import CoreGraphics
import Foundation

// MARK: - The six states and their shapes

public enum NotchState: String, CaseIterable {
    case resting, greeting, live, alert, inbox, voice

    public var title: String {
        switch self {
        case .resting: return "Resting"
        case .greeting: return "Greeting"
        case .live: return "Live activity"
        case .alert: return "Alert"
        case .inbox: return "Inbox"
        case .voice: return "Voice"
        }
    }
}

/// The black shape: a body `width` × `height` with bottom corners of `radius`,
/// plus concave "ears" of `ear` flaring into the screen's top edge on each side.
public struct ShapeSpec: Equatable {
    public var width: CGFloat
    public var height: CGFloat
    public var radius: CGFloat
    public var ear: CGFloat

    public init(width: CGFloat, height: CGFloat, radius: CGFloat, ear: CGFloat) {
        self.width = width
        self.height = height
        self.radius = radius
        self.ear = ear
    }

    /// Width including both ears.
    public var outerWidth: CGFloat { width + 2 * ear }
}

public enum NotchMetrics {
    /// The sizes of the six states, in points (1 CSS px = 1 pt on the MacBook Air). The four that drop
    /// down are one black shape, as the reference's are: a band beside the camera (the tabs, the
    /// status, an alert's tile), `bandGap` of black, the content, and `contentInset` of black at the
    /// content's sides and foot.
    public static func spec(for state: NotchState, notch: CGSize, liveWidth: CGFloat? = nil) -> ShapeSpec {
        switch state {
        case .resting: return ShapeSpec(width: notch.width, height: notch.height, radius: 10, ear: 6)
        case .live: return ShapeSpec(width: liveWidth ?? liveMinimumWidth, height: notch.height, radius: 12, ear: 7)
        case .greeting, .alert, .inbox, .voice:
            let content = contentSize(for: state)
            return ShapeSpec(width: content.width + 2 * contentInset, height: band(notch: notch) + content.height + contentInset,
                             radius: frameRadius, ear: state == .alert ? 12 : 14)
        }
    }

    /// The content's size in each state that drops down: the greeting's script and day line, an
    /// alert's words and buttons, the dropdown's two cards, and voice.
    public static func contentSize(for state: NotchState) -> CGSize {
        switch state {
        case .greeting: return CGSize(width: 528, height: 118)
        case .alert: return CGSize(width: 508, height: 60)
        case .inbox: return CGSize(width: 668, height: 220)
        case .voice: return CGSize(width: 568, height: 176)
        case .resting, .live: return .zero
        }
    }

    /// Whether a state drops down below the camera (the resting notch and the live activity don't).
    public static func dropsDown(_ state: NotchState) -> Bool { contentSize(for: state) != .zero }

    /// Black between the content and the shape's edge, at the sides and the foot (the reference's 16 pt).
    public static let contentInset: CGFloat = 16
    /// Black between the band beside the camera and the content's top.
    public static let bandGap: CGFloat = 10
    /// The corner radius of every state that drops down. A card inside it is `contentInset` less, 16,
    /// so the two corners are concentric.
    public static let frameRadius: CGFloat = 32

    /// The black band across the top: the camera housing's height, plus the gap above the content.
    public static func band(notch: CGSize) -> CGFloat { notch.height + bandGap }

    /// The content in a shape's own coordinates (x from the body's left edge, y down from the screen's top).
    public static func content(in spec: ShapeSpec, notch: CGSize) -> CGRect {
        let top = band(notch: notch)
        return CGRect(x: contentInset, y: top, width: max(0, spec.width - 2 * contentInset),
                      height: max(0, spec.height - top - contentInset))
    }

    /// The corner radius of a card that fills the content's corners.
    public static func innerRadius(in spec: ShapeSpec) -> CGFloat { max(0, spec.radius - contentInset) }

    /// The hardware notch in a shape's own coordinates.
    public static func notchZone(in spec: ShapeSpec, notch: CGSize) -> CGRect {
        CGRect(x: (spec.width - notch.width) / 2, y: 0, width: notch.width, height: notch.height)
    }

    /// The band's two places beside the camera, a camera housing tall, in a shape's own coordinates:
    /// the tabs (or an alert's tile) on the left, the status and the buttons on the right. Each starts
    /// at the content's edge and stops `notchGap` short of the camera housing.
    public static let bandPadding: CGFloat = contentInset
    public static func bandSlots(in spec: ShapeSpec, notch: CGSize) -> (left: CGRect, right: CGRect) {
        let side = max(0, (spec.width - notch.width) / 2 - notchGap - bandPadding)
        return (CGRect(x: bandPadding, y: 0, width: side, height: notch.height),
                CGRect(x: spec.width - bandPadding - side, y: 0, width: side, height: notch.height))
    }

    public static let liveMinimumWidth: CGFloat = 356
    public static let liveMaximumWidth: CGFloat = 520
    /// Space kept between content and the hardware notch on either side.
    public static let notchGap: CGFloat = 8

    /// The live activity only widens, with its label left of the camera and the
    /// countdown right of it. It is 356 pt unless a side needs more room, so a
    /// label never slides under the hardware notch.
    public static func liveWidth(leftContent: CGFloat, rightContent: CGFloat, notchWidth: CGFloat,
                                 leftInset: CGFloat = 12, rightInset: CGFloat = 16) -> CGFloat {
        let side = max(leftInset + leftContent, rightInset + rightContent) + notchGap
        let needed = notchWidth + 2 * side
        return min(max(liveMinimumWidth, needed.rounded(.up)), liveMaximumWidth)
    }

    /// The panel is one fixed canvas, big enough for the largest state plus the
    /// spring's overshoot and the rim light's glow; everything outside the shape
    /// passes clicks through.
    public static let canvas = CGSize(width: 780, height: 460)
}

// MARK: - Where the notch is

/// What the app reads from an `NSScreen`, kept as plain values so it can be checked.
public struct ScreenFacts: Equatable {
    public var frame: CGRect
    public var visibleFrame: CGRect
    public var safeAreaTop: CGFloat
    public var auxiliaryTopLeft: CGRect?
    public var auxiliaryTopRight: CGRect?

    public init(frame: CGRect, visibleFrame: CGRect, safeAreaTop: CGFloat,
                auxiliaryTopLeft: CGRect?, auxiliaryTopRight: CGRect?) {
        self.frame = frame
        self.visibleFrame = visibleFrame
        self.safeAreaTop = safeAreaTop
        self.auxiliaryTopLeft = auxiliaryTopLeft
        self.auxiliaryTopRight = auxiliaryTopRight
    }
}

/// All rects are in AppKit screen coordinates (origin bottom-left, y up).
public struct NotchGeometry: Equatable {
    public var screenFrame: CGRect
    /// The hardware notch, or the drawn stand-in on a screen without one.
    public var notchRect: CGRect
    public var hasNotch: Bool
    public var menuBarHeight: CGFloat

    public static let fallbackNotchWidth: CGFloat = 179

    public static func compute(_ s: ScreenFacts) -> NotchGeometry {
        let menuBar = max(0, s.frame.maxY - s.visibleFrame.maxY)
        if s.safeAreaTop > 0, let l = s.auxiliaryTopLeft, let r = s.auxiliaryTopRight, r.minX > l.maxX {
            let h = s.safeAreaTop
            let rect = CGRect(x: l.maxX, y: s.frame.maxY - h, width: r.minX - l.maxX, height: h)
            return NotchGeometry(screenFrame: s.frame, notchRect: rect, hasNotch: true, menuBarHeight: menuBar)
        }
        // No notch: a notch-sized shape centred at the top, no taller than the menu bar.
        let h = min(32, menuBar > 0 ? menuBar : 24)
        let w = fallbackNotchWidth
        let rect = CGRect(x: (s.frame.midX - w / 2).rounded(), y: s.frame.maxY - h, width: w, height: h)
        return NotchGeometry(screenFrame: s.frame, notchRect: rect, hasNotch: false, menuBarHeight: menuBar)
    }

    public var notchSize: CGSize { notchRect.size }

    /// The panel's frame: the canvas, centred on the notch, top edge on the screen's top edge.
    public func panelFrame(canvas: CGSize = NotchMetrics.canvas) -> CGRect {
        CGRect(x: notchRect.midX - canvas.width / 2, y: screenFrame.maxY - canvas.height,
               width: canvas.width, height: canvas.height)
    }

    /// The part of the screen a shape covers (body only; the ears are a few points
    /// of flare at the very top and don't take clicks).
    public func shapeRect(_ spec: ShapeSpec) -> CGRect {
        CGRect(x: notchRect.midX - spec.width / 2, y: screenFrame.maxY - spec.height,
               width: spec.width, height: spec.height)
    }
}

// MARK: - Is a full-screen app in front?

public struct WindowFacts: Equatable {
    public var ownerPID: Int32
    public var layer: Int
    /// Quartz coordinates (origin top-left).
    public var bounds: CGRect

    public init(ownerPID: Int32, layer: Int, bounds: CGRect) {
        self.ownerPID = ownerPID
        self.layer = layer
        self.bounds = bounds
    }
}

public enum FullScreenCheck {
    /// True when the frontmost app has a normal-level window covering a whole
    /// screen. On a notched screen macOS puts full-screen windows below the camera
    /// housing, so the window may start `safeAreaTop` points down. A zoomed window
    /// starts below the menu bar and doesn't count.
    public static func frontmostIsFullScreen(frontmostPID: Int32?, windows: [WindowFacts],
                                             screens: [(bounds: CGRect, safeAreaTop: CGFloat)]) -> Bool {
        guard let pid = frontmostPID else { return false }
        return windows.contains { w in
            guard w.ownerPID == pid, w.layer == 0 else { return false }
            return screens.contains { s in
                w.bounds.minX <= s.bounds.minX + 1 && w.bounds.maxX >= s.bounds.maxX - 1 &&
                w.bounds.maxY >= s.bounds.maxY - 1 && w.bounds.minY <= s.bounds.minY + s.safeAreaTop + 1
            }
        }
    }
}
