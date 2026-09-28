import BuildFlowNotchKit
import SwiftUI

// The reference's signature: a thin glowing edge along the black shape's lower rim and corners, a
// soft glow outside it, and, as the shape opens, a light that runs once along the rim (f01). At rest
// only a faint light shows under the notch (f00). Its colour follows the state: the cool white-blue
// for the greeting, the dropdown and voice, an alert's tone for an alert.

/// How the rim shows in a state: its colour, the thin edge's strength and the glow's.
struct RimStyle {
    var color: Color
    /// The thin glowing edge along the rim, 0…1.
    var edge: Double
    /// The soft glow outside the shape, 0…1.
    var glow: Double
    /// Where the light starts up the sides, and where it is full, as shares of the shape's height:
    /// the whole rim for a shape that has dropped down (f01 lights the side to the top), only the
    /// foot at rest (a faint light under the notch).
    var fade: (start: Double, full: Double) = (0.04, 0.4)

    @MainActor
    static func of(_ model: NotchModel) -> RimStyle {
        let set = NotchTheme.onFrame
        switch model.state {
        case .resting: return RimStyle(color: set[.rim], edge: 0, glow: 0.2, fade: (0.1, 0.68))
        case .live: return RimStyle(color: set[.rim], edge: 0, glow: 0)
        case .alert: return RimStyle(color: set.tone(model.alertContent().tone).color, edge: 0.6, glow: 0.5)
        case .greeting, .inbox, .voice: return RimStyle(color: set[.rim], edge: 0.4, glow: 0.36)
        }
    }
}

/// Strongest along the foot, fading up the sides to nothing under the ears. Sized to the shape, so
/// it follows the shape's spring.
struct RimFade: View {
    let spec: ShapeSpec
    let style: RimStyle

    var body: some View {
        let room: CGFloat = 30
        let h = spec.height + room
        let start = style.fade.start * spec.height / h, full = style.fade.full * spec.height / h
        LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .clear, location: start),
                               .init(color: .black, location: full), .init(color: .black, location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: h)
    }
}

/// The soft glow: the rim, blurred, drawn behind the black shape so only the outside of it shows.
struct RimGlow: View {
    let spec: ShapeSpec
    let style: RimStyle

    var body: some View {
        RimShape(spec)
            .stroke(style.color, style: StrokeStyle(lineWidth: 5, lineCap: .round))
            .blur(radius: 10)
            .opacity(style.glow)
            .mask(alignment: .top) { RimFade(spec: spec, style: style) }
            .allowsHitTesting(false)
    }
}

/// The thin glowing edge, on the shape's edge.
struct RimEdge: View {
    let spec: ShapeSpec
    let style: RimStyle

    var body: some View {
        ZStack {
            RimShape(spec, inset: 0.5).stroke(style.color, lineWidth: 1)
            RimShape(spec, inset: 0.5).stroke(style.color, lineWidth: 2.5).blur(radius: 2).opacity(0.55)
        }
        .opacity(style.edge)
        .mask(alignment: .top) { RimFade(spec: spec, style: style) }
        .allowsHitTesting(false)
    }
}

/// One run of the light: a bright head with a tapering tail, and its glow.
struct RimTraceLight: View {
    let spec: ShapeSpec
    let color: Color
    let trace: RimTrace
    @Environment(\.notchTheme) private var theme

    /// The tail's length, as a share of the rim.
    static let tail: CGFloat = 0.3

    /// The stretch of the rim from `a` behind the head to `b` behind it.
    private func part(_ a: CGFloat, _ b: CGFloat) -> some Shape {
        let lead = CGFloat(trace.head) * (1 + Self.tail)
        return RimShape(spec, inset: 0.5).trim(from: min(max(lead - a, 0), 1), to: min(max(lead - b, 0), 1))
    }

    var body: some View {
        let t = Self.tail
        ZStack {
            part(t, 0).stroke(color, style: StrokeStyle(lineWidth: 16, lineCap: .round)).blur(radius: 18).opacity(0.75)
            part(t * 0.6, 0).stroke(color, style: StrokeStyle(lineWidth: 6, lineCap: .round)).blur(radius: 5).opacity(0.8)
            part(t, t * 0.55).stroke(color.opacity(0.35), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
            part(t * 0.55, t * 0.2).stroke(color.opacity(0.75), style: StrokeStyle(lineWidth: 2, lineCap: .round))
            part(t * 0.2, 0).stroke(color, style: StrokeStyle(lineWidth: 2.6, lineCap: .round))
            part(t * 0.08, 0).stroke(theme[.ink], style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
        }
        .opacity(trace.opacity)
        .allowsHitTesting(false)
    }
}

/// When the light runs in a state: from when the state opened, for how long, and where it is.
struct RimRun {
    let start: Date
    /// Snapshots: how long ago the state opened.
    let elapsedOverride: Double?
    let end: Double
    let trace: (Double) -> RimTrace

    @MainActor
    static func of(_ model: NotchModel) -> RimRun? {
        switch model.state {
        case .greeting:
            return RimRun(start: model.greetingStartedAt, elapsedOverride: model.greetingElapsedOverride,
                          end: GreetingTimeline.traceDelay + GreetingTimeline.traceDuration, trace: GreetingTimeline.trace(at:))
        case .inbox:
            let playing = model.introPlays
            return RimRun(start: model.inboxOpenedAt, elapsedOverride: model.inboxElapsedOverride,
                          end: playing ? InboxIntro.traceDelay + InboxIntro.traceDuration : RimTrace.openDelay + RimTrace.openDuration,
                          trace: { InboxIntro.trace(at: $0, playing: playing) })
        case .alert, .voice:
            return RimRun(start: model.shownAt, elapsedOverride: model.shownElapsedOverride,
                          end: RimTrace.openDelay + RimTrace.openDuration, trace: RimTrace.opening(at:))
        case .resting, .live:
            return nil
        }
    }
}

/// The run as the shape opens: every frame while it runs (checked once a second, so the clock stops
/// when it is over), once for a snapshot, and never with Reduce Motion.
struct RimTraceLayer: View {
    @ObservedObject var model: NotchModel
    let spec: ShapeSpec
    let color: Color

    var body: some View {
        if !model.reduceMotion, let run = RimRun.of(model) {
            if model.fixedNow != nil {
                RimTraceLight(spec: spec, color: color, trace: run.trace(run.elapsedOverride ?? .infinity))
            } else {
                TimelineView(.periodic(from: run.start, by: 1)) { outer in
                    let over = outer.date.timeIntervalSince(run.start) > run.end + 0.1
                    TimelineView(.animation(minimumInterval: nil, paused: over)) { ctx in
                        RimTraceLight(spec: spec, color: color, trace: over ? .off : run.trace(ctx.date.timeIntervalSince(run.start)))
                    }
                }
            }
        }
    }
}
