// Checks a Sparkle EdDSA (ed25519) signature against a public key, the way the app will.
//
//   verify-update-signature <file> <edSignature, base64> <SUPublicEDKey, base64>
//
// release.sh runs it on every DMG with the SUPublicEDKey read out of the built app's own Info.plist.
// sign_update --verify checks against the key in the Keychain; this checks against the key the app
// actually ships with, so a Keychain key that no longer matches the app fails the release here
// instead of failing every update on every Mac. It reads nothing from the Keychain.
import CryptoKit
import Foundation

let args = CommandLine.arguments
guard args.count == 4 else {
    FileHandle.standardError.write(Data("usage: verify-update-signature <file> <signature> <public key>\n".utf8))
    exit(2)
}
guard let data = FileManager.default.contents(atPath: args[1]) else {
    FileHandle.standardError.write(Data("verify-update-signature: can't read \(args[1])\n".utf8))
    exit(2)
}
guard let signature = Data(base64Encoded: args[2]), let keyData = Data(base64Encoded: args[3]),
      let key = try? Curve25519.Signing.PublicKey(rawRepresentation: keyData) else {
    FileHandle.standardError.write(Data("verify-update-signature: the signature or the key isn't valid base64 ed25519\n".utf8))
    exit(2)
}
if key.isValidSignature(signature, for: data) {
    print("EdDSA signature matches SUPublicEDKey (\(data.count) bytes)")
    exit(0)
}
FileHandle.standardError.write(Data("verify-update-signature: the signature does NOT match SUPublicEDKey\n".utf8))
exit(1)
