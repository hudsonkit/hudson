import Foundation

/// 16-bit PCM WAV encoding for generation-only local speech.
public enum HudSpeechWAV {
    /// Encode mono Float32 samples (-1...1) as a 16-bit little-endian WAV.
    public static func encode(_ samples: [Float], sampleRate: Double) -> Data {
        let rate = UInt32(sampleRate.rounded())
        let dataBytes = UInt32(samples.count * 2)
        var data = Data(capacity: 44 + Int(dataBytes))
        func append(_ string: String) { data.append(contentsOf: Array(string.utf8)) }
        func append32(_ value: UInt32) { withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) } }
        func append16(_ value: UInt16) { withUnsafeBytes(of: value.littleEndian) { data.append(contentsOf: $0) } }

        append("RIFF")
        append32(36 + dataBytes)
        append("WAVE")
        append("fmt ")
        append32(16)
        append16(1)          // PCM
        append16(1)          // mono
        append32(rate)
        append32(rate * 2)   // byte rate
        append16(2)          // block align
        append16(16)         // bits per sample
        append("data")
        append32(dataBytes)
        var pcm = [Int16](repeating: 0, count: samples.count)
        for (index, sample) in samples.enumerated() {
            let clamped = max(-1, min(1, sample))
            pcm[index] = Int16((clamped * 32767).rounded()).littleEndian
        }
        pcm.withUnsafeBytes { data.append(contentsOf: $0) }
        return data
    }

    /// Duration in seconds of a WAV produced by `encode`.
    public static func duration(of data: Data) -> Double? {
        guard data.count >= 44 else { return nil }
        let rate = data.subdata(in: 24..<28).withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }.littleEndian
        let bytes = data.subdata(in: 40..<44).withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }.littleEndian
        guard rate > 0 else { return nil }
        return Double(bytes) / 2 / Double(rate)
    }
}
