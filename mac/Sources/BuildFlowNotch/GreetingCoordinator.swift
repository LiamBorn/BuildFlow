import AppKit
import AVFoundation
import BuildFlowNotchKit

/// Listens for launch, lid-open (wake) and unlock, asks the logic target whether
/// to greet, and shows (and optionally speaks) the greeting.
final class GreetingCoordinator: NSObject {
    let store: GreetingStore
    private let controller: NotchController
    private let model: NotchModel
    private let speech = AVSpeechSynthesizer()

    init(controller: NotchController, model: NotchModel, store: GreetingStore = GreetingStore()) {
        self.controller = controller
        self.model = model
        self.store = store
    }

    func start() {
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(self, selector: #selector(wentAway(_:)), name: NSWorkspace.willSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(wentAway(_:)), name: NSWorkspace.screensDidSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(woke(_:)), name: NSWorkspace.didWakeNotification, object: nil)
        ws.addObserver(self, selector: #selector(woke(_:)), name: NSWorkspace.screensDidWakeNotification, object: nil)
        let dnc = DistributedNotificationCenter.default()
        dnc.addObserver(self, selector: #selector(wentAway(_:)), name: Notification.Name("com.apple.screenIsLocked"), object: nil)
        dnc.addObserver(self, selector: #selector(unlocked(_:)), name: Notification.Name("com.apple.screenIsUnlocked"), object: nil)

        // At launch (which includes login), once the panel has settled.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in self?.trigger(.launch) }
    }

    @objc private func wentAway(_ note: Notification) {
        store.memory = GreetingPlanner.wentAway(at: Date(), memory: store.memory)
    }

    @objc private func woke(_ note: Notification) {
        // If the Mac wakes to the lock screen, wait for the unlock instead.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            if SessionState.isScreenLocked {
                Log.info("greeting: woke to the lock screen, waiting for unlock")
                return
            }
            self?.trigger(.wake)
        }
    }

    @objc private func unlocked(_ note: Notification) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.trigger(.unlock) }
    }

    func replay() { trigger(.replay) }

    func trigger(_ trigger: GreetingTrigger) {
        if trigger != .replay && !controller.isResting {
            Log.info("greeting: \(trigger.rawValue) while the notch is busy, not now")
            return
        }
        let fullScreen = trigger == .replay ? false : FullScreenProbe.frontmostIsFullScreen()
        let decision = GreetingPlanner.decide(now: Date(), trigger: trigger, memory: store.memory,
                                              firstName: model.inbox.me.firstName, enabled: store.enabled,
                                              fullScreenFrontmost: fullScreen, calendar: model.calendar)
        store.memory = GreetingPlanner.remember(decision, trigger: trigger, memory: store.memory)
        switch decision {
        case let .skip(reason):
            Log.info("greeting: \(trigger.rawValue) skipped (\(reason.rawValue))")
        case let .show(text, _, welcomeBack, key):
            Log.info("greeting: \(trigger.rawValue) shows \"\(text)\" (\(key)\(welcomeBack ? ", welcome back" : ""))")
            controller.presentGreeting(text: text, dayLine: model.presenter().dayLine())
            if store.speakAloud { speak(text) }
        }
    }

    private func speak(_ text: String) {
        speech.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: text)
        u.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        speech.speak(u)
    }
}
