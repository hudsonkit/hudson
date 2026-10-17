import SwiftUI
import HudsonUI

#if os(iOS)
import AVFoundation
import AudioToolbox
import UIKit
#endif

/// Live camera QR scanner. iOS-only — macOS shows an empty-state placeholder.
/// Wrap with `HudPermissionGate(.camera, rationale: ...)` for the permission
/// flow; this primitive assumes camera access is already granted (calling it
/// without permission yields a black preview, never a crash).
///
/// ```swift
/// HudPermissionGate(.camera, rationale: "Scan a pairing QR.") {
///     HudQRScanner { code in
///         pair(with: code)
///     }
/// }
/// ```
public struct HudQRScanner: View {
    private let onScan: (String) -> Void
    private let isActive: Bool
    private let showsViewfinder: Bool

    public init(
        isActive: Bool = true,
        showsViewfinder: Bool = true,
        onScan: @escaping (String) -> Void
    ) {
        self.isActive = isActive
        self.showsViewfinder = showsViewfinder
        self.onScan = onScan
    }

    public var body: some View {
        #if os(iOS)
        ZStack {
            HudQRScannerRepresentable(isActive: isActive, onScan: onScan)
            if showsViewfinder { viewfinder }
        }
        .background(HudPalette.bg)
        .clipShape(RoundedRectangle(cornerRadius: HudRadius.card))
        #else
        HudEmptyState(
            title: "QR scanner unavailable",
            subtitle: "QR scanning is supported on iOS only.",
            icon: "qrcode.viewfinder"
        )
        #endif
    }

    private var viewfinder: some View {
        let side = HudLayout.qrViewfinderSize
        let arm = HudIconSize.large
        return ZStack {
            HudSurface.scrim
                .reverseMask {
                    RoundedRectangle(cornerRadius: HudRadius.card)
                        .frame(width: side, height: side)
                }
            ZStack {
                cornerBracket(arm: arm).position(x: HudSpacing.xs + arm / 2, y: HudSpacing.xs + arm / 2)
                cornerBracket(arm: arm).rotationEffect(.degrees(90)).position(x: side - HudSpacing.xs - arm / 2, y: HudSpacing.xs + arm / 2)
                cornerBracket(arm: arm).rotationEffect(.degrees(180)).position(x: side - HudSpacing.xs - arm / 2, y: side - HudSpacing.xs - arm / 2)
                cornerBracket(arm: arm).rotationEffect(.degrees(270)).position(x: HudSpacing.xs + arm / 2, y: side - HudSpacing.xs - arm / 2)
            }
            .frame(width: side, height: side)
        }
    }

    private func cornerBracket(arm: CGFloat) -> some View {
        Path { path in
            path.move(to: CGPoint(x: 0, y: arm))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: arm, y: 0))
        }
        .stroke(HudPalette.accent, lineWidth: HudStrokeWidth.bold)
        .frame(width: arm, height: arm)
    }
}

private extension View {
    /// Mask using the inverted shape — used to cut a viewfinder hole in a scrim.
    func reverseMask<Mask: View>(@ViewBuilder _ mask: () -> Mask) -> some View {
        self.mask {
            Rectangle()
                .overlay(mask().blendMode(.destinationOut))
        }
    }
}

#if os(iOS)
private struct HudQRScannerRepresentable: UIViewControllerRepresentable {
    let isActive: Bool
    let onScan: (String) -> Void

    func makeUIViewController(context: Context) -> HudQRScannerViewController {
        let vc = HudQRScannerViewController()
        vc.onCodeScanned = onScan
        vc.setActive(isActive)
        return vc
    }

    func updateUIViewController(_ vc: HudQRScannerViewController, context: Context) {
        vc.setActive(isActive)
    }

    static func dismantleUIViewController(_ vc: HudQRScannerViewController, coordinator: ()) {
        vc.setActive(false)
        vc.onCodeScanned = nil
    }
}

private final class HudQRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCodeScanned: ((String) -> Void)?
    private var session: AVCaptureSession?
    private var isActive = false
    private let captureQueue = DispatchQueue(label: "hudson.qr.capture")
    private var preview: AVCaptureVideoPreviewLayer?
    private var lastScanned: String?
    private var lastScanAt: Date = .distantPast

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupCamera()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
        updateOrientation()
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: { _ in
            self.preview?.frame = self.view.bounds
            self.updateOrientation()
        })
    }

    /// Serialized start/stop prevents a delayed start from racing teardown.
    /// Keep desired activity even when SwiftUI updates before viewDidLoad.
    func setActive(_ active: Bool) {
        isActive = active
        guard let session else { return }
        captureQueue.async {
            if active {
                if !session.isRunning { session.startRunning() }
            } else if session.isRunning {
                session.stopRunning()
            }
        }
    }

    private func setupCamera() {
        let session = AVCaptureSession()
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else { return }

        if session.canAddInput(input) { session.addInput(input) }

        let output = AVCaptureMetadataOutput()
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main)
            output.metadataObjectTypes = [.qr]
        }

        let preview = AVCaptureVideoPreviewLayer(session: session)
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)

        self.session = session
        self.preview = preview
        updateOrientation()
        setActive(isActive)
    }

    private func updateOrientation() {
        guard let connection = preview?.connection,
              connection.isVideoOrientationSupported,
              let interfaceOrientation = view.window?.windowScene?.interfaceOrientation else { return }
        switch interfaceOrientation {
        case .portrait:            connection.videoOrientation = .portrait
        case .portraitUpsideDown:  connection.videoOrientation = .portraitUpsideDown
        case .landscapeLeft:       connection.videoOrientation = .landscapeLeft
        case .landscapeRight:      connection.videoOrientation = .landscapeRight
        default:                   break
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard isActive,
              let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let code = object.stringValue else { return }

        // Debounce duplicate scans within 1.5s
        let now = Date()
        if code == lastScanned, now.timeIntervalSince(lastScanAt) < 1.5 { return }
        lastScanned = code
        lastScanAt = now

        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
        onCodeScanned?(code)
    }
}
#endif
