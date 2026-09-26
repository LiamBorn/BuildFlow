import AppKit
import AuthenticationServices
import BuildFlowNotchKit

/// "Connect this Mac…": opens BuildFlow's Connect page in an
/// ASWebAuthenticationSession (it shares Safari's sign-in, so a person already
/// signed in is one click away), checks the answer's `state`, and swaps the
/// code and the PKCE verifier for this Mac's key.
///
/// The verifier lives only in memory, for this one attempt, and nothing about
/// the answer (code, state, key) is ever logged.
final class ConnectCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let session: BuildFlowSession
    private var flow: ConnectFlow?
    private var authSession: ASWebAuthenticationSession?
    private var anchor: NSWindow?

    @MainActor
    init(session: BuildFlowSession) {
        self.session = session
    }

    var isRunning: Bool { flow != nil }

    @MainActor
    func connect() {
        if let authSession, flow != nil {
            // Already open: bring it forward rather than start a second one.
            anchor?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            _ = authSession
            return
        }
        let flow = ConnectFlow(origin: session.origin, deviceName: AppInfo.deviceName)
        self.flow = flow
        session.model.connection = .connecting
        Log.info("connect: opening \(session.origin.host ?? "BuildFlow")'s Connect page")

        let auth = ASWebAuthenticationSession(url: flow.url, callbackURLScheme: ConnectFlow.callbackScheme) { [weak self] url, error in
            Task { @MainActor [weak self] in self?.finished(url: url, error: error) }
        }
        // Share Safari's cookies: someone signed in to BuildFlow there only has to press Connect.
        auth.prefersEphemeralWebBrowserSession = false
        auth.presentationContextProvider = self
        authSession = auth
        NSApp.activate(ignoringOtherApps: true)
        _ = makeAnchor()
        if !auth.start() {
            finish(problem: "BuildFlow couldn't open the sign-in window. Try Connect this Mac… again.")
        }
    }

    /// A `buildflow://connect` link that reached the app another way (e.g. from Safari).
    @MainActor
    func handle(_ url: URL) {
        guard flow != nil else {
            Log.info("link: buildflow://connect arrived with no Connect in progress; ignored")
            return
        }
        authSession?.cancel()
        finished(url: url, error: nil)
    }

    @MainActor
    private func finished(url: URL?, error: Error?) {
        guard let flow else { return }
        if let error {
            let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
            Log.info("connect: sign-in window closed (\(cancelled ? "cancelled" : error.localizedDescription))")
            // A brand-new account goes through onboarding and never comes back here; let them try again.
            finish(problem: cancelled
                ? "Connecting didn't finish. If you just created your BuildFlow account, choose Connect this Mac… again."
                : "BuildFlow couldn't finish connecting: \(error.localizedDescription)")
            return
        }
        guard let url else { finish(problem: "BuildFlow didn't answer. Try Connect this Mac… again."); return }
        switch flow.readCallback(url) {
        case let .code(code):
            Task {
                do {
                    try await session.finishConnect(code: code, flow: flow)
                    finish(problem: nil)
                } catch let e as DesktopError {
                    Log.info("connect: token exchange refused (\(e.code ?? String(e.status ?? 0)))")
                    finish(problem: e.connectWords)
                } catch {
                    finish(problem: error.localizedDescription)
                }
            }
        case .denied:
            finish(problem: nil, cancelled: true)
        case .wrongState:
            finish(problem: "That answer wasn't for this Mac's request, so it was ignored. Try Connect this Mac… again.")
        case .malformed:
            finish(problem: "BuildFlow's answer was incomplete. Try Connect this Mac… again.")
        }
    }

    @MainActor
    private func finish(problem: String?, cancelled: Bool = false) {
        flow = nil
        authSession = nil
        anchor?.orderOut(nil)
        anchor = nil
        if !session.model.connection.isConnected {
            session.model.connection = .notConnected(reason: problem ?? (cancelled ? "Nothing was connected." : nil))
        }
        session.onConnectionChange?()
        if let problem {
            let alert = NSAlert()
            alert.messageText = "This Mac isn't connected"
            alert.informativeText = problem
            alert.addButton(withTitle: "OK")
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
        }
    }

    // MARK: ASWebAuthenticationPresentationContextProviding

    /// The sheet needs a window to hang from; the notch panel can't be key, so a small one is made
    /// before the session starts (this is called on the main thread).
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor ?? NSApp.keyWindow ?? NSWindow()
    }

    private func makeAnchor() -> NSWindow {
        if let anchor { return anchor }
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 120), styleMask: [.titled, .closable],
                         backing: .buffered, defer: false)
        w.title = "Connect BuildFlow"
        w.isReleasedWhenClosed = false
        let label = NSTextField(wrappingLabelWithString: "Sign in to BuildFlow in the window that opened, then choose Connect this Mac.")
        label.frame = NSRect(x: 20, y: 30, width: 380, height: 60)
        w.contentView?.addSubview(label)
        w.center()
        w.makeKeyAndOrderFront(nil)
        anchor = w
        return w
    }
}
