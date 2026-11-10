import AVFoundation
import Foundation

/// Plays mono Float32 PCM as it arrives. A seam for tests.
///
/// Each `begin` returns a token and invalidates the previous one. Chunks and
/// waits with a stale token are ignored, so audio from a stopped request
/// never plays late.
protocol HudPCMOutput: AnyObject, Sendable {
    func begin(sampleRate: Double) throws -> UInt64
    /// Queue samples. Returns false when `token` is stale.
    @discardableResult
    func enqueue(_ samples: [Float], token: UInt64) -> Bool
    /// Wait until every queued sample has been played back. Returns false if
    /// playback was stopped first.
    func finish(token: UInt64) async -> Bool
    func stop()
}

/// `AVAudioEngine` sink for streamed local speech.
///
/// Buffers are scheduled with `.dataPlayedBack`, so "finished" means the
/// last sample reached the output, not that it was handed to the engine.
/// On iOS the host owns the `AVAudioSession` category and activation.
final class HudPCMStreamPlayer: HudPCMOutput, @unchecked Sendable {
    private let lock = NSLock()
    private var engine: AVAudioEngine?
    private var node: AVAudioPlayerNode?
    private var format: AVAudioFormat?
    private var token: UInt64 = 0
    private var pending = 0
    private var finishing = false
    private var waiters: [CheckedContinuation<Bool, Never>] = []

    init() {}

    func begin(sampleRate: Double) throws -> UInt64 {
        stop()
        lock.lock()
        defer { lock.unlock() }
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
            throw HudLocalModelFailure(kind: .synthesis, message: "Unsupported sample rate \(sampleRate)")
        }
        if engine == nil || self.format?.sampleRate != sampleRate {
            engine?.stop()
            let engine = AVAudioEngine()
            let node = AVAudioPlayerNode()
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: format)
            engine.prepare()
            self.engine = engine
            self.node = node
            self.format = format
        }
        guard let engine, let node else {
            throw HudLocalModelFailure(kind: .synthesis, message: "Audio engine unavailable")
        }
        if !engine.isRunning {
            try engine.start()
        }
        node.play()
        token &+= 1
        pending = 0
        finishing = false
        return token
    }

    @discardableResult
    func enqueue(_ samples: [Float], token expected: UInt64) -> Bool {
        lock.lock()
        guard expected == token, let node, let format, !samples.isEmpty,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count))
        else {
            lock.unlock()
            return false
        }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { source in
            buffer.floatChannelData![0].update(from: source.baseAddress!, count: samples.count)
        }
        pending += 1
        lock.unlock()
        node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            self?.played(token: expected)
        }
        return true
    }

    func finish(token expected: UInt64) async -> Bool {
        await withCheckedContinuation { continuation in
            lock.lock()
            guard expected == token else {
                lock.unlock()
                continuation.resume(returning: false)
                return
            }
            finishing = true
            if pending == 0 {
                lock.unlock()
                continuation.resume(returning: true)
                return
            }
            waiters.append(continuation)
            lock.unlock()
        }
    }

    func stop() {
        lock.lock()
        token &+= 1
        pending = 0
        finishing = false
        let stale = waiters
        waiters.removeAll()
        let node = self.node
        lock.unlock()
        // Stopping the node drops every scheduled buffer; their completion
        // handlers carry the old token and are ignored.
        node?.stop()
        for waiter in stale { waiter.resume(returning: false) }
    }

    private func played(token expected: UInt64) {
        lock.lock()
        guard expected == token else {
            lock.unlock()
            return
        }
        pending = max(0, pending - 1)
        var ready: [CheckedContinuation<Bool, Never>] = []
        if finishing, pending == 0 {
            ready = waiters
            waiters.removeAll()
        }
        lock.unlock()
        for waiter in ready { waiter.resume(returning: true) }
    }
}
