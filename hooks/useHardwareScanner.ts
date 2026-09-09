import { useEffect, useRef, useState } from 'react';

interface UseHardwareScannerProps {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

export const useHardwareScanner = ({ onScan, enabled = true }: UseHardwareScannerProps) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [lastScanTimestamp, setLastScanTimestamp] = useState<number | null>(null);
  const [isHardwareActive, setIsHardwareActive] = useState<boolean>(true);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }

      const activeElem = document.activeElement;
      const isInput =
        activeElem &&
        (activeElem.tagName === 'INPUT' ||
          activeElem.tagName === 'TEXTAREA' ||
          (activeElem as HTMLElement).isContentEditable);

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // If time between keystrokes is long (> 100ms), reset buffer
      if (timeDiff > 100) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter') {
        const scannedCode = bufferRef.current.trim();
        if (scannedCode.length >= 2) {
          if (isInput && activeElem?.getAttribute('data-barcode-input')) {
            e.preventDefault();
          }
          setLastScannedCode(scannedCode);
          setLastScanTimestamp(currentTime);
          setIsHardwareActive(true);
          onScan(scannedCode);
          bufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        if (isInput) {
          if (activeElem?.getAttribute('data-barcode-input')) {
            bufferRef.current += e.key;
          } else if (timeDiff < 50) {
            // Hardware barcode scanner typing at super fast speed
            bufferRef.current += e.key;
          }
        } else {
          bufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, enabled]);

  return {
    isHardwareActive,
    lastScannedCode,
    lastScanTimestamp
  };
};
