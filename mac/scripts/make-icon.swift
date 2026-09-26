// Renders BuildFlow for Mac's 1024 × 1024 app icon master from the website's logo.
//
//   make-icon <logo.png> <out.png>
//
// Run by make-icon.sh, which scales the master to every size an .icns holds. The shape follows the
// macOS app icon grid: an 824 × 824 rounded "squircle" plate centred on the 1024 canvas (100 px of
// room on every side for the shadow), a soft drop shadow under it, and the artwork inside the plate.
// The logo is flat, so the plate carries the depth: the same dark ground and warm glow as the web
// app's icon (client/public/icon-512.png), a faint top light, and a hairline edge so it holds its
// shape on a dark Dock.
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write(Data("usage: make-icon <logo.png> <out.png>\n".utf8))
    exit(2)
}

func loadImage(_ path: String) -> CGImage {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        FileHandle.standardError.write(Data("make-icon: can't read \(path)\n".utf8))
        exit(1)
    }
    return image
}

/// The smallest rectangle holding every pixel that is more than faintly visible, so the logo is
/// centred by its artwork rather than by the PNG's uneven transparent margins.
func opaqueBounds(of image: CGImage) -> CGRect {
    let w = image.width, h = image.height
    var pixels = [UInt8](repeating: 0, count: w * h * 4)
    let context = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    var minX = w, minY = h, maxX = -1, maxY = -1
    for row in 0..<h {
        for x in 0..<w where pixels[(row * w + x) * 4 + 3] > 24 {
            minX = min(minX, x); maxX = max(maxX, x)
            minY = min(minY, row); maxY = max(maxY, row)
        }
    }
    guard maxX >= 0 else { return CGRect(x: 0, y: 0, width: w, height: h) }
    // Memory row 0 is the top of the image; cropping(to:) counts from the top too.
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

/// A superellipse, the continuous-corner shape macOS icons use (a plain rounded rectangle has a
/// visible kink where each corner meets its straight edge).
func squircle(in rect: CGRect, exponent n: CGFloat = 5.0, steps: Int = 720) -> CGPath {
    let path = CGMutablePath()
    let a = rect.width / 2, b = rect.height / 2
    for i in 0...steps {
        let t = CGFloat(i) / CGFloat(steps) * 2 * .pi
        let c = cos(t), s = sin(t)
        let x = pow(abs(c), 2 / n) * a * (c < 0 ? -1 : 1)
        let y = pow(abs(s), 2 / n) * b * (s < 0 ? -1 : 1)
        let p = CGPoint(x: rect.midX + x, y: rect.midY + y)
        if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
    }
    path.closeSubpath()
    return path
}

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}

let size = 1024
let canvas = CGRect(x: 0, y: 0, width: size, height: size)
let plate = CGRect(x: 100, y: 100, width: 824, height: 824)
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
ctx.clear(canvas)
let shape = squircle(in: plate)

// 1. The drop shadow, cast by the plate (y grows upward here, so a negative offset falls below).
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 28, color: rgb(0x000000, 0.34))
ctx.addPath(shape)
ctx.setFillColor(rgb(0x0d1219))
ctx.fillPath()
ctx.restoreGState()

// 2. The plate: the web icon's dark ground, lighter at the top.
ctx.saveGState()
ctx.addPath(shape)
ctx.clip()
let ground = CGGradient(colorsSpace: space, colors: [rgb(0x1c2330), rgb(0x0b0f15)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(ground, start: CGPoint(x: 512, y: plate.maxY), end: CGPoint(x: 512, y: plate.minY), options: [])
// the warm glow from the top right, as on the web icon
let glow = CGGradient(colorsSpace: space, colors: [rgb(0xff8a1f, 0.30), rgb(0xff8a1f, 0)] as CFArray, locations: [0, 1])!
ctx.drawRadialGradient(glow, startCenter: CGPoint(x: plate.maxX - 150, y: plate.maxY - 120), startRadius: 0,
                       endCenter: CGPoint(x: plate.maxX - 150, y: plate.maxY - 120), endRadius: 620, options: [])
// a faint light along the top, the way a lit plate reads
let sheen = CGGradient(colorsSpace: space, colors: [rgb(0xffffff, 0.07), rgb(0xffffff, 0)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(sheen, start: CGPoint(x: 512, y: plate.maxY), end: CGPoint(x: 512, y: plate.midY + 60), options: [])
ctx.restoreGState()

// 3. A hairline edge, inside the plate, so the silhouette survives a dark Dock or a dark desktop.
ctx.saveGState()
ctx.addPath(shape)
ctx.clip()
ctx.addPath(shape)
ctx.setStrokeColor(rgb(0xffffff, 0.10))
ctx.setLineWidth(4) // half of it falls outside the clip: a 2 px line
ctx.strokePath()
ctx.restoreGState()

// 4. The logo, cropped to its artwork and centred on the plate, with a soft shadow of its own to
// lift it off the ground. 560 px tall of a 601 px source: drawn smaller than it is, never enlarged.
let logo = loadImage(args[1])
let bounds = opaqueBounds(of: logo)
let artwork = logo.cropping(to: bounds)!
let targetHeight: CGFloat = 560
let scale = targetHeight / bounds.height
let drawSize = CGSize(width: bounds.width * scale, height: targetHeight)
let drawRect = CGRect(x: plate.midX - drawSize.width / 2, y: plate.midY - drawSize.height / 2,
                      width: drawSize.width, height: drawSize.height)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 30, color: rgb(0x000000, 0.45))
ctx.draw(artwork, in: drawRect)
ctx.restoreGState()

guard let out = ctx.makeImage(),
      let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, "public.png" as CFString, 1, nil) else {
    FileHandle.standardError.write(Data("make-icon: can't write \(args[2])\n".utf8))
    exit(1)
}
CGImageDestinationAddImage(destination, out, nil)
guard CGImageDestinationFinalize(destination) else { exit(1) }
print("logo artwork \(Int(bounds.width))×\(Int(bounds.height)) px, drawn at \(Int(drawSize.width))×\(Int(drawSize.height)) (scale \(String(format: "%.3f", scale)))")
