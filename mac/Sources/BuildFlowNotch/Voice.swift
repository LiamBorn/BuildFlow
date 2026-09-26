import AppKit
import AVFoundation
import BuildFlowNotchKit
import Speech

/// Push-to-talk. Hold left ⌃ + left ⌥ (or click the mic) and speak; the words become
/// text on this Mac (on-device speech, with the inbox's names as hints); let
/// go and the question goes to `POST /api/desktop/ask`. The answer is shown as
/// it streams and spoken sentence by sentence. A suggested change comes back
/// as BuildFlow's proposal card, and nothing changes until Accept.
@MainActor
final class VoiceController: NSObject, AVSpeechSynthesizerDelegate {
    private let model: NotchModel
    private let session: BuildFlowSession
    /// Asks the controller to put the notch away (the answer is finished).
    var onDone: (() -> Void)?
    var onConnect: (() -> Void)?

    private let synth = AVSpeechSynthesizer()
    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognition: SFSpeechRecognitionTask?
    private var transcript = ""
    private var finalHeard = false
    private var askTask: Task<Void, Never>?
    private var history = ConversationHistory()
    private var splitter = SentenceSplitter()
    private var proposal: Proposal?
    private var streamDone = false
    private var holding = false
    private var captureWanted = false
    private var silenceWork: DispatchWorkItem?
    /// ⌃⌥ pressed while speaking: the rest of this answer is shown, not spoken.
    private var muted = false
    /// Which press this is. Work that outlives its press (a permission prompt, the
    /// wait for the last words) checks it, so it can't act on a newer one.
    private var talkId = 0
    private var closeWork: DispatchWorkItem?

    init(model: NotchModel, session: BuildFlowSession) {
        self.model = model
        self.session = session
        super.init()
        synth.delegate = self
    }

    /// Listening or answering: "you talking" in the notch's order of things.
    var isActive: Bool { captureWanted || askTask != nil || synth.isSpeaking }

    var isSpeaking: Bool { synth.isSpeaking }

    // MARK: Listening

    /// ⌃⌥ held (`hold`), or the mic clicked.
    func begin(hold: Bool) {
        stopSpeaking()
        muted = false
        closeWork?.cancel()
        // A new question replaces an answer still streaming in.
        askTask?.cancel()
        askTask = nil
        talkId += 1
        let id = talkId
        holding = hold
        captureWanted = true
        transcript = ""
        finalHeard = false
        proposal = nil
        model.voice = VoiceContent(status: "Listening…", question: "", answer: hold ? "Let go of ⌃ ⌥ to ask." : "Speak now; it sends when you pause.",
                                   listening: true, button: hold ? nil : .send)
        Task {
            let allowed = await permitted()
            guard id == talkId else { return }            // a newer press, or a cancel, took over
            guard allowed else { captureWanted = false; return }
            // The keys may have been let go while macOS asked for permission.
            guard captureWanted else {
                model.voice = .idle
                return
            }
            do {
                try startCapture()
                model.voice.answer = ""
                if !hold { armSilenceTimer(first: true) }
            } catch let problem as VoiceProblem {
                captureWanted = false
                model.voice = VoiceContent(status: "Can't listen", answer: problem.words, button: problem.button)
            } catch {
                captureWanted = false
                model.voice = VoiceContent(status: "Can't listen", answer: "The microphone didn't start: \(error.localizedDescription)")
            }
        }
    }

    /// ⌃⌥ let go, or Send: stop listening and ask.
    func end() {
        guard captureWanted else { return }
        captureWanted = false
        holding = false
        silenceWork?.cancel()
        stopCapture(final: true)
        model.voice.listening = false
        model.voice.button = nil
        model.voice.status = "Thinking"
        let id = talkId
        // Give the recogniser a moment to settle its last words.
        Task {
            let deadline = Date().addingTimeInterval(1.2)
            while !finalHeard, Date() < deadline, id == talkId { try? await Task.sleep(nanoseconds: 50_000_000) }
            guard id == talkId else { return }
            recognition?.cancel()
            recognition = nil
            request = nil
            send(transcript.trimmingCharacters(in: .whitespacesAndNewlines))
        }
    }

    /// ⌃⌥ pressed again: stop talking at once, and don't speak the rest of this answer.
    func stopSpeaking() {
        if synth.isSpeaking {
            muted = true
            synth.stopSpeaking(at: .immediate)
        }
    }

    /// Another key or a click joined the chord: stop listening, throw the audio and
    /// the words away, and send nothing.
    func cancelTalk() {
        guard captureWanted || engine != nil else { return }
        Log.info("voice: cancelled (another key or a click joined ⌃⌥); nothing sent")
        talkId += 1
        silenceWork?.cancel()
        captureWanted = false
        holding = false
        stopCapture(final: false)
        recognition?.cancel()
        recognition = nil
        request = nil
        transcript = ""
        model.voice = .idle
    }

    /// The notch was put away: stop listening, talking and streaming.
    func dismiss() {
        talkId += 1
        closeWork?.cancel()
        silenceWork?.cancel()
        captureWanted = false
        holding = false
        stopCapture(final: false)
        recognition?.cancel()
        recognition = nil
        request = nil
        stopSpeaking()
        askTask?.cancel()
        askTask = nil
        model.voiceLevel = 0
        if model.voice.listening { model.voice.listening = false }
    }

    // MARK: Permission

    private func permitted() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            break
        case .notDetermined:
            model.voice = VoiceContent(status: "Microphone", answer: "BuildFlow listens only while you hold ⌃ ⌥ (left Control and left Option). Allow the microphone in the box macOS shows.")
            guard await AVCaptureDevice.requestAccess(for: .audio) else { return refuse(.microphoneDenied) }
        default:
            return refuse(.microphoneDenied)
        }
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return true
        case .notDetermined:
            model.voice = VoiceContent(status: "Speech", answer: "Your words are turned into text on this Mac, so your voice never leaves it. Allow Speech Recognition in the box macOS shows.")
            let status = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
                SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
            }
            return status == .authorized ? true : refuse(.speechDenied)
        default:
            return refuse(.speechDenied)
        }
    }

    private func refuse(_ problem: VoiceProblem) -> Bool {
        model.voice = VoiceContent(status: "Can't listen", answer: problem.words, button: problem.button)
        return false
    }

    // MARK: Capture

    private func startCapture() throws {
        let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
        guard let recognizer, recognizer.isAvailable else { throw VoiceProblem.unavailable }
        // The promise in Info.plist: your voice never leaves this Mac.
        guard recognizer.supportsOnDeviceRecognition else { throw VoiceProblem.noOnDevice(recognizer.locale) }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = true
        request.taskHint = .search
        request.contextualStrings = model.inbox.vocabulary
        self.request = request

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else { throw VoiceProblem.noMicrophone }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self, weak request] buffer, _ in
            request?.append(buffer)
            let level = Self.level(buffer)
            DispatchQueue.main.async { self?.model.voiceLevel = level }
        }
        engine.prepare()
        try engine.start()
        self.engine = engine

        recognition = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let isFinal = result?.isFinal ?? false
            DispatchQueue.main.async {
                guard let self else { return }
                if let text, !text.isEmpty {
                    self.transcript = text
                    self.model.voice.question = text
                    if self.captureWanted && !self.holding { self.armSilenceTimer(first: false) }
                }
                if isFinal || error != nil { self.finalHeard = true }
            }
        }
        Log.info("voice: listening (on-device, \(request.contextualStrings.count) hints)")
    }

    private func stopCapture(final: Bool) {
        guard let engine else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        self.engine = nil
        if final { request?.endAudio() }
        model.voiceLevel = 0
    }

    /// Clicked mic: send after a pause once something was said (or give up after 8 s of silence).
    private func armSilenceTimer(first: Bool) {
        silenceWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.captureWanted, !self.holding else { return }
            self.end()
        }
        silenceWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + (first ? 8 : 1.6), execute: work)
    }

    nonisolated static func level(_ buffer: AVAudioPCMBuffer) -> Double {
        guard let data = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += data[i] * data[i] }
        let rms = sqrt(sum / Float(buffer.frameLength))
        return Double(min(1, max(0, (20 * log10(max(rms, 1e-6)) + 50) / 40)))
    }

    // MARK: Asking

    private func send(_ question: String) {
        guard !question.isEmpty else {
            // Nothing was said: fold away quietly.
            model.voice = .idle
            onDone?()
            return
        }
        model.voice.question = question
        guard session.model.connection.isConnected else {
            model.voice = VoiceContent(status: "Not connected", question: question,
                                       answer: "Connect this Mac to BuildFlow and it can answer questions about your schedule.", button: .connect)
            return
        }
        model.voice.status = "Thinking"
        model.voice.answer = ""
        splitter = SentenceSplitter()
        streamDone = false
        let started = Date()
        let turns = history.forQuestion(at: started)
        let stream = session.client.ask(text: question, history: turns, timeZone: TimeZone.current.identifier)
        Log.info("voice: asking (\(question.count) characters, \(turns.count) earlier turns)")
        askTask = Task { [weak self] in
            var answer = ""
            var firstWords: Date?
            do {
                for try await event in stream {
                    guard let self else { return }
                    switch event {
                    case let .text(delta):
                        if firstWords == nil {
                            firstWords = Date()
                            Log.info(String(format: "voice: first words after %.2f s", firstWords!.timeIntervalSince(started)))
                        }
                        answer += delta
                        self.model.voice.status = "Answering"
                        self.model.voice.answer = answer
                        for sentence in self.splitter.feed(delta) where !self.muted { self.speak(sentence) }
                    case let .proposal(p):
                        self.proposal = p
                        self.model.voice.proposal = ProposalCard(p, calendar: self.model.calendar)
                    case let .done(mode):
                        if mode == "demo" { self.model.voice.hint = "AI not connected" }
                        self.model.voice.status = "Answered"
                    case let .failed(code, message):
                        // `refused` or `ai_unavailable` can come after some text: stop saying it.
                        self.muted = true
                        self.synth.stopSpeaking(at: .immediate)
                        let words = AskEvent.plainWords(code: code, message: message)
                        self.model.voice.status = "Couldn't answer"
                        self.model.voice.answer = answer.isEmpty ? words : answer + "\n" + words
                    }
                }
            } catch is CancellationError {
                return
            } catch let error as DesktopError {
                guard let self else { return }
                self.model.voice.status = "Couldn't answer"
                self.model.voice.answer = error.plainWords
                if case .unauthorized = error { self.model.voice.button = .connect }
            } catch {
                self?.model.voice.status = "Couldn't answer"
                self?.model.voice.answer = DesktopError.network(error.localizedDescription).plainWords
            }
            guard let self, !Task.isCancelled else { return }
            if let rest = self.splitter.flush(), !self.muted { self.speak(rest) }
            self.history.record(question: question, answer: answer, at: Date())
            self.streamDone = true
            self.askTask = nil
            self.finishIfQuiet()
        }
    }

    private func speak(_ sentence: String) {
        let u = AVSpeechUtterance(string: sentence)
        u.rate = AVSpeechUtteranceDefaultSpeechRate
        u.postUtteranceDelay = 0.05
        synth.speak(u)
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in self?.finishIfQuiet() }
    }

    /// The answer is written and spoken: fold away after a while, unless a proposal waits.
    private func finishIfQuiet() {
        guard streamDone, !synth.isSpeaking, askTask == nil, !captureWanted else { return }
        if let card = model.voice.proposal, card.phase == .open || card.phase == .working {
            closeLater(90)
        } else {
            closeLater(8)
        }
    }

    private func closeLater(_ seconds: Double) {
        closeWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.isActive else { return }
            self.onDone?()
        }
        closeWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    // MARK: The proposal card

    func proposal(_ choice: ProposalChoice) {
        guard let card = model.voice.proposal else { return }
        closeWork?.cancel()
        switch choice {
        case .edit:
            NSWorkspace.shared.open(session.jobURL(card.jobId))
            return
        case .accept, .reject:
            guard card.phase == .open, card.id != "example" else { return }
            model.voice.proposal?.phase = .working
            let client = session.client
            Task {
                let outcome: ProposalOutcome
                do {
                    outcome = choice == .accept ? try await client.acceptProposal(id: card.id) : try await client.rejectProposal(id: card.id)
                } catch let error as DesktopError {
                    outcome = .failed(error.plainWords)
                } catch {
                    outcome = .failed(error.localizedDescription)
                }
                Log.info("voice: proposal \(choice == .accept ? "accept" : "reject") → \(outcome)")
                model.voice.proposal?.phase = .settled(outcome.plainWords, ok: outcome == .accepted || outcome == .rejected)
                session.refresh()
                closeLater(6)
            }
        }
    }

    func button(_ b: VoiceButton) {
        switch b {
        case .connect:
            onConnect?()
        case let .openPrivacy(anchor):
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?\(anchor)") { NSWorkspace.shared.open(url) }
        case .send:
            end()
        }
    }
}

enum VoiceProblem: Error {
    case microphoneDenied
    case speechDenied
    case unavailable
    case noOnDevice(Locale)
    case noMicrophone

    var words: String {
        switch self {
        case .microphoneDenied:
            return "BuildFlow can't use the microphone. Turn it on in System Settings › Privacy & Security › Microphone."
        case .speechDenied:
            return "BuildFlow can't use Speech Recognition. Turn it on in System Settings › Privacy & Security › Speech Recognition."
        case .unavailable:
            return "Speech recognition isn't available right now. Try again in a moment."
        case let .noOnDevice(locale):
            let name = Locale.current.localizedString(forIdentifier: locale.identifier) ?? locale.identifier
            return "This Mac can't turn \(name) speech into text on its own yet, and BuildFlow won't send your voice away. Turn on Dictation in System Settings › Keyboard to add it."
        case .noMicrophone:
            return "No microphone is connected."
        }
    }

    var button: VoiceButton? {
        switch self {
        case .microphoneDenied: return .openPrivacy("Privacy_Microphone")
        case .speechDenied: return .openPrivacy("Privacy_SpeechRecognition")
        default: return nil
        }
    }
}
