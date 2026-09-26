import Carbon.HIToolbox
import Foundation

/// A system-wide hot key through Carbon's RegisterEventHotKey, which (unlike an
/// event tap) needs no Accessibility permission. Reports both press and release,
/// so ⌥Space can tell a tap from a hold.
final class HotKey {
    static let signature: OSType = 0x4246_4E74 // "BFNt"

    let id: UInt32
    var onPress: (() -> Void)?
    var onRelease: (() -> Void)?

    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?

    /// ⌥Space by default. Returns nil if another app already owns the combination.
    init?(keyCode: UInt32 = UInt32(kVK_Space), modifiers: UInt32 = UInt32(optionKey), id: UInt32 = 1) {
        self.id = id
        var specs = [
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
            EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased)),
        ]
        let me = Unmanaged.passUnretained(self).toOpaque()
        let installed = InstallEventHandler(GetEventDispatcherTarget(), { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var hk = EventHotKeyID()
            let got = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                                        nil, MemoryLayout<EventHotKeyID>.size, nil, &hk)
            let hotKey = Unmanaged<HotKey>.fromOpaque(userData).takeUnretainedValue()
            guard got == noErr, hk.signature == HotKey.signature, hk.id == hotKey.id else { return OSStatus(eventNotHandledErr) }
            switch GetEventKind(event) {
            case UInt32(kEventHotKeyPressed): hotKey.onPress?()
            case UInt32(kEventHotKeyReleased): hotKey.onRelease?()
            default: break
            }
            return noErr
        }, specs.count, &specs, me, &handlerRef)
        guard installed == noErr else {
            Log.info("hot key: couldn't install the handler (\(installed))")
            return nil
        }
        let registered = RegisterEventHotKey(keyCode, modifiers, EventHotKeyID(signature: Self.signature, id: id),
                                             GetEventDispatcherTarget(), 0, &hotKeyRef)
        guard registered == noErr else {
            Log.info("hot key: ⌥Space is taken by another app (\(registered))")
            if let handlerRef { RemoveEventHandler(handlerRef) }
            return nil
        }
    }

    deinit {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let handlerRef { RemoveEventHandler(handlerRef) }
    }
}
