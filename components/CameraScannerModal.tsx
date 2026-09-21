import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title?: string;
  description?: string;
  autoCloseOnScan?: boolean;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Barcode / QR Code',
  description = 'Arahkan kamera ke barcode produk atau QR Code member',
  autoCloseOnScan = true
}) => {
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [autoClose, setAutoClose] = useState<boolean>(autoCloseOnScan);
  const [scanFeedback, setScanFeedback] = useState<string>('');
  const [hasFocusControl, setHasFocusControl] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [focusMsg, setFocusMsg] = useState<string>('Auto-Focus Bawaan Aktif');

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');
  const regionId = 'html5-qrcode-reader-container';

  // Synchronize autoClose state when prop changes
  useEffect(() => {
    setAutoClose(autoCloseOnScan);
  }, [autoCloseOnScan]);

  // Get active video stream track from HTML video element
  const getVideoTrack = (): MediaStreamTrack | null => {
    const videoEl = document.querySelector(`#${regionId} video`) as HTMLVideoElement | null;
    if (videoEl && videoEl.srcObject) {
      const stream = videoEl.srcObject as MediaStream;
      const tracks = stream.getVideoTracks();
      return tracks.length > 0 ? tracks[0] : null;
    }
    return null;
  };

  // Configure camera focus & torch capabilities
  const applyAutoFocusAndControls = async () => {
    const track = getVideoTrack();
    if (!track) return;

    try {
      const capabilities: any = (track.getCapabilities && track.getCapabilities()) || {};

      // Check Torch (Senter)
      if (capabilities.torch) {
        setHasTorch(true);
      } else {
        setHasTorch(false);
      }

      // Check & Apply Focus Mode
      if (capabilities.focusMode) {
        setHasFocusControl(true);
        if (capabilities.focusMode.includes('continuous')) {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as any]
          });
          setFocusMsg('Auto-Focus Aktif (Kontinu)');
        } else if (capabilities.focusMode.includes('single-shot')) {
          await track.applyConstraints({
            advanced: [{ focusMode: 'single-shot' } as any]
          });
          setFocusMsg('Auto-Focus Aktif (Single)');
        }
      } else {
        setFocusMsg('Auto-Focus Bawaan Aktif');
      }
    } catch (e) {
      console.warn('Could not set camera focus constraints:', e);
    }
  };

  // Manual Trigger Refokus
  const triggerManualFocus = async () => {
    const track = getVideoTrack();
    if (!track) return;

    try {
      const capabilities: any = (track.getCapabilities && track.getCapabilities()) || {};
      if (capabilities.focusMode) {
        const mode = capabilities.focusMode.includes('continuous') ? 'continuous' : 'single-shot';
        await track.applyConstraints({
          advanced: [{ focusMode: mode } as any]
        });
      }
      setFocusMsg('✓ Refokus Kamera Selesai');
      setTimeout(() => setFocusMsg('Auto-Focus Aktif'), 2000);
    } catch (err) {
      console.warn('Refokus error:', err);
    }
  };

  // Toggle Torch Light
  const toggleTorch = async () => {
    const track = getVideoTrack();
    if (!track) return;

    try {
      const nextState = !isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextState } as any]
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  };

  // Play audio beep sound feedback on successful scan
  const playBeepSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1000; // 1kHz tone
      gain.gain.value = 0.1;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        audioCtx.close();
      }, 150);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    // Get available cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if available
          const backCam = devices.find(
            (d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('belakang') ||
              d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        } else {
          setErrorMsg('Kamera tidak ditemukan pada perangkat ini.');
        }
      })
      .catch((err) => {
        console.error('Camera permission error:', err);
        setErrorMsg('Izin penggunaan kamera ditolak atau kamera tidak tersedia.');
      });

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && selectedCameraId) {
      startScanner(selectedCameraId);
    }
  }, [selectedCameraId, isOpen]);

  const startScanner = async (cameraId: string) => {
    await stopScanner();
    setErrorMsg('');

    try {
      const html5Qrcode = new Html5Qrcode(regionId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });
      html5QrcodeRef.current = html5Qrcode;

      await html5Qrcode.start(
        cameraId,
        {
          fps: 20,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minDim = Math.min(viewfinderWidth || 280, viewfinderHeight || 280);
            const size = Math.floor(minDim * 0.75);
            return {
              width: Math.max(180, size),
              height: Math.max(180, size)
            };
          },
          aspectRatio: 1.0
        },
        (decodedText) => {
          const now = Date.now();
          // Throttle duplicate scan triggers within 1800ms
          if (now - lastScanTimeRef.current < 1800) {
            return;
          }
          lastScanTimeRef.current = now;
          lastScannedCodeRef.current = decodedText;

          playBeepSound();
          setScanFeedback(`✓ Barcode Ter-scan: ${decodedText}`);
          onScan(decodedText);

          if (autoClose) {
            stopScanner();
            onClose();
          } else {
            setTimeout(() => setScanFeedback(''), 2500);
          }
        },
        (_errorMessage) => {
          // ignore scan errors per frame
        }
      );
      setIsScanning(true);

      // Attempt to configure native hardware focus and controls
      setTimeout(() => {
        applyAutoFocusAndControls();
      }, 300);
    } catch (err: any) {
      console.error('Start scanner error:', err);
      setErrorMsg(err?.message || 'Gagal membuka kamera. Pastikan izin kamera telah diberikan.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
      try {
        await html5QrcodeRef.current.stop();
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
    html5QrcodeRef.current = null;
    setIsScanning(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-100 relative max-h-[92vh] overflow-y-auto custom-scrollbar">
        {/* Close Button */}
        <button
          onClick={() => {
            stopScanner();
            onClose();
          }}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold transition-all"
        >
          <i className="fas fa-times text-sm"></i>
        </button>

        <div className="text-center space-y-1 pr-6">
          <div className="inline-flex p-3 bg-honey-50 text-honey-600 rounded-2xl mb-1">
            <i className="fas fa-qrcode text-2xl"></i>
          </div>
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 font-medium">{description}</p>
        </div>

        {/* Mode Selector Toggle */}
        <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAutoClose(true)}
            className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              autoClose ? 'bg-honey-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className="fas fa-shopping-cart"></i>
            <span>Auto Keranjang</span>
          </button>
          <button
            type="button"
            onClick={() => setAutoClose(false)}
            className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
              !autoClose ? 'bg-honey-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <i className="fas fa-sync"></i>
            <span>Scan Beruntun</span>
          </button>
        </div>

        {/* Camera selection dropdown if multiple cameras exist */}
        {cameras.length > 1 && (
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
              Pilih Kamera Device:
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="w-full text-xs font-bold p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none"
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Kamera ${cam.id}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scanner Video Viewport Container */}
        <div 
          onClick={triggerManualFocus}
          title="Ketuk layar kamera untuk memfokuskan ulang"
          className="relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-slate-900 aspect-square flex items-center justify-center cursor-pointer group"
        >
          <div id={regionId} className="w-full h-full"></div>

          {/* Camera Controls Overlay (Top Buttons) */}
          {isScanning && !errorMsg && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerManualFocus();
                }}
                className="px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl text-[10px] font-bold backdrop-blur-md border border-white/20 flex items-center gap-1.5 shadow-md transition-all active:scale-95"
              >
                <i className="fas fa-bullseye text-honey-400"></i>
                <span>Fokus</span>
              </button>

              {hasTorch && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTorch();
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold backdrop-blur-md border flex items-center gap-1.5 shadow-md transition-all active:scale-95 ${
                    isTorchOn 
                      ? 'bg-amber-500 text-white border-amber-300' 
                      : 'bg-slate-900/80 text-white border-white/20 hover:bg-slate-900'
                  }`}
                >
                  <i className={`fas ${isTorchOn ? 'fa-bolt text-yellow-200' : 'fa-lightbulb'}`}></i>
                  <span>{isTorchOn ? 'Senter ON' : 'Senter'}</span>
                </button>
              )}
            </div>
          )}

          {/* Tap-to-focus prompt badge at bottom left of camera */}
          {isScanning && !errorMsg && (
            <div className="absolute bottom-3 left-3 z-20 bg-slate-900/70 backdrop-blur-sm text-white/90 text-[9px] font-bold px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
              <i className="fas fa-hand-pointer text-honey-400"></i>
              <span>Ketuk layar untuk fokus</span>
            </div>
          )}

          {/* Feedback Overlay Banner */}
          {scanFeedback && (
            <div className="absolute top-3 inset-x-3 bg-emerald-600 text-white p-2.5 rounded-xl text-xs font-black text-center shadow-lg animate-bounce z-30 flex items-center justify-center gap-2">
              <i className="fas fa-check-circle text-base"></i>
              <span>{scanFeedback}</span>
            </div>
          )}

          {errorMsg ? (
            <div className="p-4 text-center text-rose-500 text-xs font-bold space-y-2 z-10">
              <i className="fas fa-exclamation-triangle text-2xl"></i>
              <p>{errorMsg}</p>
            </div>
          ) : !isScanning ? (
            <div className="text-center text-slate-400 text-xs font-medium space-y-2 z-10">
              <i className="fas fa-spinner fa-spin text-2xl text-honey-500"></i>
              <p>Membuka kamera HP/Device...</p>
            </div>
          ) : null}
        </div>

        {/* Status Bar */}
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            <span>{focusMsg}</span>
          </span>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="text-xs font-black text-honey-600 hover:text-honey-700 uppercase tracking-wider"
          >
            Selesai / Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
