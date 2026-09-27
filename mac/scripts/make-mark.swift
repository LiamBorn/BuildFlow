// Renders the small BuildFlow mark the notch's black band carries (mac/Resources/BuildFlowMark.png):
// the website's logo, cropped to its artwork and scaled down, with nothing behind it.
//
//   make-mark <logo.png> <out.png> <height px>
//
// Run by make-mark.sh. The band draws it about 16 pt tall, so 96 px covers a 2x screen with room to
// spare, and the logo (601 px of artwork) is only ever scaled down.
import AppKit

let args = CommandLine.arguments
guard args.count == 4, let height = Int(args[3]), height > 0 else {
    FileHandle.standardError.write(Data("usage: make-mark <logo.png> <out.png> <height px>\n".utf8))
    exit(2)
}

guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let logo = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    FileHandle.standardError.write(Data("make-mark: can't read \(args[1])\n".utf8))
    exit(1)
}

/// The smallest rectangle holding every pixel that is more than faintly visible (as make-icon.swift).
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
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

let bounds = opaqueBounds(of: logo)
let artwork = logo.cropping(to: bounds)!
let outHeight = height
let outWidth = Int((CGFloat(height) * bounds.width / bounds.height).rounded())
let ctx = CGContext(data: nil, width: outWidth, height: outHeight, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
ctx.clear(CGRect(x: 0, y: 0, width: outWidth, height: outHeight))
ctx.draw(artwork, in: CGRect(x: 0, y: 0, width: outWidth, height: outHeight))

guard let out = ctx.makeImage(),
      let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, "public.png" as CFString, 1, nil) else {
    FileHandle.standardError.write(Data("make-mark: can't write \(args[2])\n".utf8))
    exit(1)
}
CGImageDestinationAddImage(destination, out, nil)
guard CGImageDestinationFinalize(destination) else { exit(1) }
print("logo artwork \(Int(bounds.width))×\(Int(bounds.height)) px, written \(outWidth)×\(outHeight)")
