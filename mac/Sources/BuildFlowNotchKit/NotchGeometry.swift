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
    /// The mock-up's sizes, in points (1 CSS px = 1 pt on the MacBook Air).
    public static func spec(for state: NotchState, notch: CGSize, liveWidth: CGFloat? = nil) -> ShapeSpec {
        switch state {
        case .resting: return ShapeSpec(width: notch.width, height: notch.height, radius: 10, ear: 6)
        case .greeting: return ShapeSpec(width: 580, height: 190, radius: 36, ear: 14)
        case .live: return ShapeSpec(width: liveWidth ?? liveMinimumWidth, height: notch.height, radius: 12, ear: 7)
        case .alert: return ShapeSpec(width: 450, height: 108, radius: 28, ear: 12)
        case .inbox: return ShapeSpec(width: 690, height: 306, radius: 36, ear: 14)
        case .voice: return ShapeSpec(width: 570, height: 250, radius: 34, ear: 14)
        }
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
    /// spring's overshoot; everything outside the shape passes clicks through.
    public static let canvas = CGSize(width: 780, height: 340)
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

// MARK: - ⌥Space: tap or hold

/// Tells a tap from a hold on the hot key. A tap toggles the inbox; holding past
/// the threshold starts voice, and letting go ends it.
public struct HoldTapRecognizer {
    public enum Event: Equatable { case tap, holdBegan, holdEnded }

    public let holdThreshold: TimeInterval
    public private(set) var pressedAt: Date?
    public private(set) var holding = false

    public init(holdThreshold: TimeInterval = 0.3) {
        self.holdThreshold = holdThreshold
    }

    /// Key down. Repeats while already down are ignored.
    public mutating func press(at t: Date) {
        guard pressedAt == nil else { return }
        pressedAt = t
        holding = false
    }

    /// Call from a timer while the key is down.
    public mutating func tick(at t: Date) -> Event? {
        guard let p = pressedAt, !holding, t.timeIntervalSince(p) >= holdThreshold else { return nil }
        holding = true
        return .holdBegan
    }

    /// Key up.
    public mutating func release(at t: Date) -> Event? {
        defer { pressedAt = nil; holding = false }
        guard let p = pressedAt else { return nil }
        if holding { return .holdEnded }
        return t.timeIntervalSince(p) < holdThreshold ? .tap : .holdEnded
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
