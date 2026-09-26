import Foundation
import Security

/// Where this Mac's device key (`bfd_…`) lives. The key is filed per server
/// origin, so a debug server never sees the published site's key.
///
/// The key is never written to UserDefaults, a file or a log line.
public protocol DeviceKeyStoring: AnyObject {
    func key(for origin: URL) -> String?
    func save(_ key: String, for origin: URL) throws
    func delete(for origin: URL)
}

/// The login Keychain, as a generic password (service `com.buildflow.mac.device-key`,
/// account = the server origin), readable only after the Mac is first unlocked.
///
/// The Keychain is asked once per origin and the answer kept in memory: a
/// Keychain call can block (the first read of an item, a locked keychain, a
/// "BuildFlow wants to use…" prompt after an unsigned rebuild), so it mustn't
/// happen on every request. The app makes its first read off the main thread.
public final class KeychainDeviceKeyStore: DeviceKeyStoring {
    public static let defaultService = "com.buildflow.mac.device-key"

    public let service: String
    private let lock = NSLock()
    /// origin → key, or "" for "the Keychain has none".
    private var cache: [String: String] = [:]

    public init(service: String = KeychainDeviceKeyStore.defaultService) {
        self.service = service
    }

    private func cached(_ origin: URL) -> String? {
        lock.lock(); defer { lock.unlock() }
        return cache[ServerOrigin.keychainAccount(origin)]
    }

    private func remember(_ key: String?, _ origin: URL) {
        lock.lock(); defer { lock.unlock() }
        cache[ServerOrigin.keychainAccount(origin)] = key ?? ""
    }

    public struct KeychainError: Error, CustomStringConvertible {
        public let status: OSStatus
        public var description: String {
            let text = SecCopyErrorMessageString(status, nil) as String? ?? "unknown"
            return "Keychain error \(status): \(text)"
        }
    }

    private func query(_ origin: URL) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: ServerOrigin.keychainAccount(origin),
        ]
    }

    public func key(for origin: URL) -> String? {
        if let known = cached(origin) { return known.isEmpty ? nil : known }
        let key = readKeychain(origin)
        remember(key, origin)
        return key
    }

    private func readKeychain(_ origin: URL) -> String? {
        var q = query(origin)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data,
              let key = String(data: data, encoding: .utf8), !key.isEmpty else { return nil }
        return key
    }

    public func save(_ key: String, for origin: URL) throws {
        let data = Data(key.utf8)
        let update = SecItemUpdate(query(origin) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if update == errSecSuccess { remember(key, origin); return }
        guard update == errSecItemNotFound else { throw KeychainError(status: update) }
        var add = query(origin)
        add[kSecValueData as String] = data
        add[kSecAttrLabel as String] = "BuildFlow for Mac (\(origin.host ?? "server"))"
        add[kSecAttrDescription as String] = "BuildFlow device key"
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
        remember(key, origin)
    }

    public func delete(for origin: URL) {
        remember(nil, origin)
        SecItemDelete(query(origin) as CFDictionary)
    }
}

/// For the checks, and for snapshots: nothing leaves the process.
public final class MemoryDeviceKeyStore: DeviceKeyStoring {
    public private(set) var keys: [String: String] = [:]
    public private(set) var deletions = 0

    public init(keys: [String: String] = [:]) {
        self.keys = keys
    }

    public func key(for origin: URL) -> String? { keys[ServerOrigin.keychainAccount(origin)] }

    public func save(_ key: String, for origin: URL) throws { keys[ServerOrigin.keychainAccount(origin)] = key }

    public func delete(for origin: URL) {
        if keys.removeValue(forKey: ServerOrigin.keychainAccount(origin)) != nil { deletions += 1 }
    }
}
