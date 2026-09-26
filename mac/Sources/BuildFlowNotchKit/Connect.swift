import CryptoKit
import Foundation
import Security

// MARK: - PKCE (RFC 7636)

public enum PKCE {
    /// Unreserved characters only, as §4.1 and the server's shapes require.
    static let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    /// base64url without padding (RFC 4648 §5).
    public static func base64url(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    public static func randomBytes(_ count: Int) -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        if status != errSecSuccess {
            // SecRandomCopyBytes doesn't fail in practice; CryptoKit's generator is the fallback.
            return SymmetricKey(size: SymmetricKeySize(bitCount: count * 8)).withUnsafeBytes { Data($0) }
        }
        return Data(bytes)
    }

    /// 32 random bytes as base64url: 43 characters.
    public static func makeVerifier() -> String { base64url(randomBytes(32)) }

    /// S256: base64url(SHA-256(ASCII(verifier))), 43 characters.
    public static func challenge(for verifier: String) -> String {
        base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    /// The CSRF nonce the Connect page echoes back: 16 random bytes, 22 characters.
    public static func makeState() -> String { base64url(randomBytes(16)) }

    public static func isValidVerifier(_ v: String) -> Bool {
        (43...128).contains(v.count) && v.allSatisfy { unreserved.contains($0) }
    }

    public static func isValidState(_ s: String) -> Bool {
        (8...256).contains(s.count) && s.allSatisfy { unreserved.contains($0) }
    }
}

// MARK: - The Connect hand-off

/// One attempt at connecting this Mac: the secret verifier, and the page to open.
///
///     let flow = ConnectFlow(origin: origin, deviceName: "Liam's MacBook Air")
///     // open flow.url in ASWebAuthenticationSession (callback scheme "buildflow")
///     switch flow.readCallback(callbackURL) { case .code(let code): exchange(code, flow.verifier) … }
public struct ConnectFlow: Equatable {
    public static let redirectURI = "buildflow://connect"
    public static let callbackScheme = "buildflow"

    public let origin: URL
    public let verifier: String
    public let challenge: String
    public let state: String
    public let deviceName: String

    public init(origin: URL, deviceName: String, verifier: String = PKCE.makeVerifier(), state: String = PKCE.makeState()) {
        self.origin = origin
        self.verifier = verifier
        self.challenge = PKCE.challenge(for: verifier)
        self.state = state
        self.deviceName = deviceName
    }

    /// `GET {origin}/desktop/connect?code_challenge=…&code_challenge_method=S256&state=…&redirect_uri=buildflow://connect&device_name=…`
    public var url: URL {
        var c = URLComponents(url: origin.appendingPathComponent("desktop/connect"), resolvingAgainstBaseURL: false)!
        c.queryItems = [
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "redirect_uri", value: Self.redirectURI),
            URLQueryItem(name: "device_name", value: deviceName),
        ]
        // URLComponents leaves "+" alone in a query, and a form decoder reads it as a space.
        c.percentEncodedQuery = c.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return c.url!
    }

    public enum Callback: Equatable {
        case code(String)
        /// The person pressed Cancel on the Connect page.
        case denied
        /// `state` didn't match: not the answer to this request.
        case wrongState
        /// Not a Connect answer at all.
        case malformed
    }

    /// Reads `buildflow://connect?code=…&state=…` or `?error=access_denied&state=…`.
    public func readCallback(_ url: URL) -> Callback {
        guard url.scheme?.lowercased() == Self.callbackScheme, url.host?.lowercased() == "connect",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return .malformed }
        func value(_ name: String) -> String? { items.first(where: { $0.name == name })?.value }
        guard let returned = value("state"), returned == state else { return .wrongState }
        if value("error") != nil { return .denied }
        guard let code = value("code"), !code.isEmpty else { return .malformed }
        return .code(code)
    }
}

// MARK: - Where the server is

public enum ServerOrigin {
    public static let defaultOrigin = URL(string: "https://build-flow.replit.app")!
    /// `defaults write com.buildflow.mac serverOrigin http://127.0.0.1:4417`
    public static let defaultsKey = "serverOrigin"

    /// The origin to talk to: the hidden setting when it's a usable origin, else
    /// the published site. Plain http is accepted only for this Mac itself.
    public static func resolve(_ setting: String?) -> URL {
        guard let setting, let url = normalize(setting) else { return defaultOrigin }
        return url
    }

    public static func normalize(_ s: String) -> URL? {
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var c = URLComponents(string: trimmed), let scheme = c.scheme?.lowercased(),
              let host = c.host?.lowercased(), !host.isEmpty else { return nil }
        let local = ["127.0.0.1", "localhost", "::1"].contains(host) || host.hasSuffix(".localhost")
        guard scheme == "https" || (scheme == "http" && local) else { return nil }
        c.scheme = scheme
        c.path = ""
        c.query = nil
        c.fragment = nil
        c.user = nil
        c.password = nil
        return c.url
    }

    /// The Keychain account a key is filed under: one key per server.
    public static func keychainAccount(_ origin: URL) -> String {
        origin.absoluteString.hasSuffix("/") ? String(origin.absoluteString.dropLast()) : origin.absoluteString
    }
}
