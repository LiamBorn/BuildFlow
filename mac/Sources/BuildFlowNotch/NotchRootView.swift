import BuildFlowNotchKit
import SwiftUI

/// Motion measured from the NotchView video: the shape springs open in about
/// 0.4 s with a small overshoot; content blurs in about 0.15 s after the shape
/// starts; closing is quicker and doesn't bounce. With Reduce Motion on, the
/// shape eases without overshoot and content only fades (the website's 150 ms).
enum Motion {
    static let open = Animation.spring(response: 0.42, dampingFraction: 0.74, blendDuration: 0)
    static let close = Animation.timingCurve(0.4, 0, 0.2, 1, duration: 0.3)
    static let contentIn = Animation.easeOut(duration: 0.26).delay(0.15)
    static let contentOut = Animation.easeIn(duration: 0.12)
    static let reduced = Animation.easeInOut(duration: 0.15)

    static func shape(opening: Bool, reduceMotion: Bool) -> Animation {
        reduceMotion ? reduced : opening ? open : close
    }
}

struct BlurFade: ViewModifier {
    let amount: Double
    func body(content: Content) -> some View {
        content
            .opacity(1 - amount)
            .blur(radius: 9 * amount)
            .scaleEffect(1 - 0.03 * amount)
    }
}

extension AnyTransition {
    static var notchContent: AnyTransition {
        .asymmetric(
            insertion: .modifier(active: BlurFade(amount: 1), identity: BlurFade(amount: 0)).animation(Motion.contentIn),
            removal: .modifier(active: BlurFade(amount: 1), identity: BlurFade(amount: 0)).animation(Motion.contentOut))
    }

    /// Reduce Motion: content simply appears and goes.
    static var notchContentReduced: AnyTransition { .opacity.animation(Motion.reduced) }

    static func notchContent(reduceMotion: Bool) -> AnyTransition {
        reduceMotion ? .notchContentReduced : .notchContent
    }
}

/// The whole panel: a transparent canvas with the black frame at the top centre, and, in the four
/// states that drop down, the BuildFlow window inside it with the band above.
struct NotchRootView: View {
    @ObservedObject var model: NotchModel

    var body: some View {
        let theme = model.theme
        let spec = model.spec
        let canvas = NotchMetrics.canvas
        let band = NotchMetrics.band(notch: model.notchSize)
        let transition = AnyTransition.notchContent(reduceMotion: model.reduceMotion)
        ZStack(alignment: .top) {
            NotchShape(spec).fill(theme.frame(.frame))
            CardShape(spec, band: band).fill(theme[.ground])
            CardShape(spec, band: band, inset: 0.5).stroke(theme[.lineSoft], lineWidth: 1)

            ZStack(alignment: .top) {
                if NotchMetrics.hasCard(model.state) {
                    BandView(model: model, spec: spec).transition(transition)
                }
                switch model.state {
                case .resting:
                    Color.clear.frame(width: 1, height: 1)
                case .greeting:
                    GreetingContent(model: model, spec: model.spec(for: .greeting)).transition(transition)
                case .live:
                    LiveContent(model: model, spec: model.spec(for: .live)).transition(transition)
                case .alert:
                    AlertView(model: model, content: model.alertContent(), spec: model.spec(for: .alert)).transition(transition)
                case .inbox:
                    InboxContent(model: model, spec: model.spec(for: .inbox)).transition(transition)
                case .voice:
                    VoiceView(model: model, content: model.voice, spec: model.spec(for: .voice)).transition(transition)
                }
            }
            .frame(width: canvas.width, height: canvas.height, alignment: .top)
            .clipShape(NotchShape(spec))
        }
        .frame(width: canvas.width, height: canvas.height, alignment: .top)
        .environment(\.notchTheme, theme)
        .environment(\.notchReduceMotion, model.reduceMotion)
        .environment(\.colorScheme, theme.colorScheme)
        .contentShape(NotchShape(spec))
        // Simultaneous, so it can never take a click away from a button inside;
        // the controller ignores taps in the inbox and voice that miss the notch.
        .simultaneousGesture(SpatialTapGesture(coordinateSpace: .local).onEnded { value in model.onTap?(value.location) })
    }
}
