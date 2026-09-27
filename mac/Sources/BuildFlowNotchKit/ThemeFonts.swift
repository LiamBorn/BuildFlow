import CoreGraphics
import CoreText
import Foundation

/// The website's two faces, Inter (text) and Inter Tight (headings and figures), from the variable
/// fonts in mac/Resources/Fonts, with their OFL licences beside them.
///
/// Both files are variable fonts. A face is built at the style's exact weight on the `wght` axis (and
/// Inter at 14 on its `opsz` axis, the cut the website's Google Fonts request serves), from a font
/// descriptor with a variation attribute, rather than asking SwiftUI for a weight by name, so a 600
/// title really is 600 on macOS 13. When a file is missing or can't be read, `font(_:)` answers nil
/// and the app sets the style in SF Pro at the same size, weight and tracking.
public enum ThemeFonts {
    /// OpenType axis tags, as CoreText numbers them.
    public static let weightAxis = 0x7767_6874      // 'wght'
    public static let opticalSizeAxis = 0x6F70_737A // 'opsz'
    public static let displayFamily = "Inter Tight"
    public static let textFamily = "Inter"
    /// Inter's optical size: the website's fonts are the 14 cut.
    public static let textOpticalSize = 14

    private static let lock = NSLock()
    private static var bases: [TypeFace: CTFontDescriptor] = [:]
    private static var cache: [String: CTFont] = [:]
    private static var registered: Set<String> = []

    /// The app bundle's Resources/Fonts, or, for a bare binary, the source tree's.
    public static func folder(bundle: Bundle = .main) -> URL? {
        if let res = bundle.resourceURL?.appendingPathComponent("Fonts"),
           FileManager.default.fileExists(atPath: res.path) { return res }
        let tree = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // BuildFlowNotchKit
            .deletingLastPathComponent()   // Sources
            .deletingLastPathComponent()   // mac
            .appendingPathComponent("Resources/Fonts")
        return FileManager.default.fileExists(atPath: tree.path) ? tree : nil
    }

    public struct Registration: Equatable {
        public var file: String
        /// nil when it registered (or already was); otherwise why not.
        public var problem: String?
    }

    /// Registers every font file in `folder` for this process (once each) and remembers Inter and
    /// Inter Tight. Returns what happened to each file, for the log.
    @discardableResult
    public static func load(from folder: URL?) -> [Registration] {
        guard let folder,
              let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return [] }
        var out: [Registration] = []
        for url in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
        where ["ttf", "otf"].contains(url.pathExtension.lowercased()) {
            lock.lock()
            let already = registered.contains(url.path)
            lock.unlock()
            if !already {
                var error: Unmanaged<CFError>?
                let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
                let cfError = error?.takeRetainedValue()
                // Registered by an earlier call in this process: as good as registered now.
                let alreadyThere = cfError.map { CFErrorGetCode($0) == CTFontManagerError.alreadyRegistered.rawValue } ?? false
                if ok || alreadyThere {
                    lock.lock(); registered.insert(url.path); lock.unlock()
                    out.append(Registration(file: url.lastPathComponent, problem: nil))
                } else {
                    out.append(Registration(file: url.lastPathComponent,
                                            problem: cfError.map { CFErrorCopyDescription($0) as String } ?? "unknown error"))
                }
            }
            remember(url)
        }
        return out
    }

    /// Keeps the file's descriptor when it is one of the two families.
    private static func remember(_ url: URL) {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor] else { return }
        for d in descriptors {
            guard let family = CTFontDescriptorCopyAttribute(d, kCTFontFamilyNameAttribute) as? String else { continue }
            let face: TypeFace? = family == displayFamily ? .display : family == textFamily ? .text : nil
            guard let face else { continue }
            // Any instance will do: the variation attribute sets every axis the font uses.
            lock.lock()
            if bases[face] == nil { bases[face] = d; cache = [:] }
            lock.unlock()
        }
    }

    public static func isAvailable(_ face: TypeFace) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return bases[face] != nil
    }

    /// The face for `style` at its size and weight, or nil when it isn't available (the script, or a
    /// family whose file is missing).
    public static func font(_ style: TypeStyle) -> CTFont? {
        guard style.face != .script else { return nil }
        let key = "\(style.face.rawValue)|\(style.size)|\(style.weight)|\(style.tabular)"
        lock.lock()
        if let cached = cache[key] { lock.unlock(); return cached }
        let base = bases[style.face]
        lock.unlock()
        guard let base else { return nil }

        var variation: [NSNumber: NSNumber] = [NSNumber(value: weightAxis): NSNumber(value: style.weight)]
        if style.face == .text { variation[NSNumber(value: opticalSizeAxis)] = NSNumber(value: textOpticalSize) }
        var attributes: [CFString: Any] = [kCTFontVariationAttribute: variation]
        if style.tabular {
            let tabularFigures: [CFString: Any] = [kCTFontOpenTypeFeatureTag: "tnum", kCTFontOpenTypeFeatureValue: 1]
            attributes[kCTFontFeatureSettingsAttribute] = [tabularFigures]
        }
        let descriptor = CTFontDescriptorCreateCopyWithAttributes(base, attributes as CFDictionary)
        let font = CTFontCreateWithFontDescriptor(descriptor, style.size, nil)
        lock.lock(); cache[key] = font; lock.unlock()
        return font
    }

    /// The weight a font is actually drawn at, read back from the font (nil for a font with no
    /// `wght` axis). CoreText leaves an axis at its default out of the variation, so that is the answer then.
    public static func drawnWeight(_ font: CTFont) -> Double? {
        let axes = CTFontCopyVariationAxes(font) as? [[String: Any]] ?? []
        guard let axis = axes.first(where: {
            ($0[kCTFontVariationAxisIdentifierKey as String] as? NSNumber)?.intValue == weightAxis
        }) else { return nil }
        if let v = CTFontCopyVariation(font) as? [NSNumber: NSNumber], let w = v[NSNumber(value: weightAxis)] {
            return w.doubleValue
        }
        return (axis[kCTFontVariationAxisDefaultValueKey as String] as? NSNumber)?.doubleValue
    }

    /// The width of `text` set in `font`, with `tracking` points between letters.
    public static func width(of text: String, font: CTFont, tracking: CGFloat = 0) -> CGFloat {
        let attributed = NSAttributedString(string: text, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTKernAttributeName as String): tracking,
        ])
        let line = CTLineCreateWithAttributedString(attributed)
        return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    }
}
