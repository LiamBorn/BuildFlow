import AppKit
import BuildFlowNotchKit
import CoreText

enum Log {
    static func info(_ message: String) {
        NSLog("[BuildFlow] %@", message)
    }
}

/// The greeting's script. Sacramento ships in the bundle (Resources/Fonts, with
/// its OFL licence) and is registered for this process at launch; if that ever
/// fails, Snell Roundhand, which macOS ships, stands in.
enum ScriptFont {
    static let preferred = "Sacramento-Regular"
    static let fallback = "SnellRoundhand"

    private(set) static var name = fallback
    private(set) static var size: CGFloat = 52
    /// The font's natural line height at `size` (ascender + descender + leading).
    private(set) static var lineHeight: CGFloat = 65

    static var fontsFolder: URL? {
        if let res = Bundle.main.resourceURL?.appendingPathComponent("Fonts"),
           FileManager.default.fileExists(atPath: res.path) { return res }
        // `swift run` / a bare binary: the source tree's copy.
        let tree = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/Fonts")
        return FileManager.default.fileExists(atPath: tree.path) ? tree : nil
    }

    static func registerBundledFonts() {
        if let folder = fontsFolder,
           let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) {
            for url in files where ["ttf", "otf"].contains(url.pathExtension.lowercased()) {
                var error: Unmanaged<CFError>?
                if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                    Log.info("font: registered \(url.lastPathComponent)")
                } else {
                    let why = error?.takeRetainedValue().localizedDescription ?? "unknown error"
                    Log.info("font: couldn't register \(url.lastPathComponent): \(why)")
                }
            }
        }
        choose()
    }

    static func choose() {
        if let f = NSFont(name: preferred, size: 60) {
            name = preferred
            size = 60
            lineHeight = ceil(f.ascender - f.descender + f.leading)
        } else if let f = NSFont(name: fallback, size: 52) {
            name = fallback
            size = 52
            lineHeight = ceil(f.ascender - f.descender + f.leading)
        }
        Log.info("font: greeting script is \(name) \(Int(size)) pt")
    }
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

/// `buildflow://` links. Step 2's sign-in hand-off lands here: the Connect page
/// redirects to `buildflow://connect?code=…&state=…`, and this is where the app
/// checks `state`, swaps the code (with its PKCE verifier) for a device key at
/// `POST /api/desktop/token`, and keeps the key in the Keychain.
enum DeepLinks {
    static func handle(_ urls: [URL]) {
        for url in urls where url.scheme == "buildflow" {
            // Never log the query: it will carry one-time codes.
            Log.info("link: buildflow://\(url.host ?? "")\(url.path) (not handled until step 2)")
        }
    }
}
