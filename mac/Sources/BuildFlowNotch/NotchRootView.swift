import BuildFlowNotchKit
import SwiftUI

/// Motion measured from the NotchView video: the shape springs open in about
/// 0.4 s with a small overshoot; content blurs in about 0.15 s after the shape
/// starts; closing is quicker and doesn't bounce.
enum Motion {
    static let open = Animation.spring(response: 0.42, dampingFraction: 0.74, blendDuration: 0)
    static let close = Animation.timingCurve(0.4, 0, 0.2, 1, duration: 0.3)
    static let contentIn = Animation.easeOut(duration: 0.26).delay(0.15)
    static let contentOut = Animation.easeIn(duration: 0.12)
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
}

/// The whole panel: a transparent canvas with the black shape at the top centre.
struct NotchRootView: View {
    @ObservedObject var model: NotchModel

    var body: some View {
        let spec = model.spec
        let canvas = NotchMetrics.canvas
        ZStack(alignment: .top) {
            NotchShape(spec).fill(Color.black)

            ZStack(alignment: .top) {
                switch model.state {
                case .resting:
                    Color.clear.frame(width: 1, height: 1)
                case .greeting:
                    GreetingContent(model: model, spec: model.spec(for: .greeting)).transition(.notchContent)
                case .live:
                    LiveContent(model: model, spec: model.spec(for: .live)).transition(.notchContent)
                case .alert:
                    AlertView(content: model.alertContent(), spec: model.spec(for: .alert)).transition(.notchContent)
                case .inbox:
                    InboxContent(model: model, spec: model.spec(for: .inbox)).transition(.notchContent)
                case .voice:
                    VoiceView(model: model, content: .example, spec: model.spec(for: .voice)).transition(.notchContent)
                }
            }
            .frame(width: canvas.width, height: canvas.height, alignment: .top)
            .clipShape(NotchShape(spec))

            if model.showsCameraDot {
                Circle()
                    .fill(RadialGradient(colors: [Color(hex: 0x2B3550), Color(hex: 0x121726), Color(hex: 0x06070B)],
                                         center: UnitPoint(x: 0.35, y: 0.35), startRadius: 0, endRadius: 5))
                    .frame(width: 8, height: 8)
                    .padding(.top, 12)
            }
            if model.showsNotchOutline {
                Rectangle()
                    .strokeBorder(Color.red.opacity(0.8), style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                    .frame(width: model.notchSize.width, height: model.notchSize.height)
            }
        }
        .frame(width: canvas.width, height: canvas.height, alignment: .top)
        .contentShape(NotchShape(spec))
        // Simultaneous, so it can never take a click away from a button inside;
        // the controller ignores taps in the inbox and voice that miss the notch.
        .simultaneousGesture(SpatialTapGesture(coordinateSpace: .local).onEnded { value in model.onTap?(value.location) })
    }
}
