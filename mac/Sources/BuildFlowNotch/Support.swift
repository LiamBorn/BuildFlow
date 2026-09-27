import AppKit
import BuildFlowNotchKit

enum Log {
    static func info(_ message: String) {
        NSLog("[BuildFlow] %@", message)
    }
}

/// The bundled fonts. Sacramento, the greeting's script, and the website's Inter and Inter Tight ship
/// in Resources/Fonts with their OFL licences and are registered for this process at launch. If
/// Sacramento fails, Snell Roundhand, which macOS ships, stands in; if Inter or Inter Tight fails,
/// the text is set in SF Pro at the same sizes and weights (ThemeFonts, NotchFonts).
enum ScriptFont {
    static let preferred = "Sacramento-Regular"
    static let fallback = "SnellRoundhand"

    private(set) static var name = fallback
    /// Snell Roundhand runs larger than Sacramento: the theme's script sizes are scaled by this.
    private(set) static var scale: CGFloat = 52.0 / 60.0
    /// The chosen face's natural line height (ascender + descender + leading) per point of size.
    private(set) static var lineHeightRatio: CGFloat = 65.0 / 52.0

    static var fontsFolder: URL? { ThemeFonts.folder() }

    static func registerBundledFonts() {
        for r in ThemeFonts.load(from: fontsFolder) {
            if let problem = r.problem {
                Log.info("font: couldn't register \(r.file): \(problem)")
            } else {
                Log.info("font: registered \(r.file)")
            }
        }
        for face in [TypeFace.display, .text] {
            let family = face == .display ? ThemeFonts.displayFamily : ThemeFonts.textFamily
            if ThemeFonts.isAvailable(face) {
                let weights = [400, 500, 600].compactMap { w -> String? in
                    ThemeFonts.font(TypeStyle(face, 13, w)).flatMap(ThemeFonts.drawnWeight).map { String(Int($0)) }
                }
                Log.info("font: \(family) drawn at wght \(weights.joined(separator: " / "))")
            } else {
                Log.info("font: \(family) not available; SF Pro stands in")
            }
        }
        choose()
    }

    static func choose() {
        if let f = NSFont(name: preferred, size: 60) {
            name = preferred
            scale = 1
            lineHeightRatio = ceil(f.ascender - f.descender + f.leading) / 60
        } else if let f = NSFont(name: fallback, size: 52) {
            name = fallback
            scale = 52.0 / 60.0
            lineHeightRatio = ceil(f.ascender - f.descender + f.leading) / 52
        }
        Log.info("font: greeting script is \(name)")
    }

    /// The point size to draw a theme script size at, in the face that was chosen.
    static func fontSize(for themeSize: CGFloat) -> CGFloat { (themeSize * scale).rounded() }

    static func lineHeight(at size: CGFloat) -> CGFloat { ceil(size * lineHeightRatio) }
}

/// Is the login window covering the screen right now?
enum SessionState {
    static var isScreenLocked: Bool {
        guard let dict = CGSessionCopyCurrentDictionary() as? [String: Any] else { return false }
        if let b = dict["CGSSessionScreenIsLocked"] as? Bool { return b }
        if let n = dict["CGSSessionScreenIsLocked"] as? Int { return n != 0 }
        return false
    }
}

/// Reads the on-screen windows (bounds and owners only, which needs no permission)
/// and asks the logic target whether the frontmost app is full screen.
enum FullScreenProbe {
    static func frontmostIsFullScreen() -> Bool {
        let pid = NSWorkspace.shared.frontmostApplication?.processIdentifier
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] else { return false }
        let windows: [WindowFacts] = list.compactMap { d in
            guard let owner = d[kCGWindowOwnerPID as String] as? Int32,
                  let layer = d[kCGWindowLayer as String] as? Int,
                  let b = d[kCGWindowBounds as String] as? NSDictionary,
                  let rect = CGRect(dictionaryRepresentation: b) else { return nil }
            return WindowFacts(ownerPID: owner, layer: layer, bounds: rect)
        }
        let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
        let screens = NSScreen.screens.map { s -> (bounds: CGRect, safeAreaTop: CGFloat) in
            let f = s.frame
            return (CGRect(x: f.minX, y: primaryHeight - f.maxY, width: f.width, height: f.height), s.safeAreaInsets.top)
        }
        return FullScreenCheck.frontmostIsFullScreen(frontmostPID: pid, windows: windows, screens: screens)
    }
}

/// `buildflow://` links. The Connect page answers `buildflow://connect?code=…&state=…`;
/// normally ASWebAuthenticationSession catches it, but one that reaches the app
/// another way (Safari) is handed to the Connect in progress, if there is one.
enum DeepLinks {
    static weak var connector: ConnectCoordinator?

    static func handle(_ urls: [URL]) {
        for url in urls where url.scheme?.lowercased() == "buildflow" {
            // Never log the query: it carries one-time codes.
            Log.info("link: buildflow://\(url.host ?? "")\(url.path)")
            if url.host?.lowercased() == "connect" {
                Task { @MainActor in connector?.handle(url) }
            }
        }
    }
}
