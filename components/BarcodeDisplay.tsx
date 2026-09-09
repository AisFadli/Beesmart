import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

interface BarcodeDisplayProps {
  value: string;
  type?: 'barcode' | 'qrcode' | 'both';
  width?: number;
  height?: number;
  fontSize?: number;
  className?: string;
  displayValue?: boolean;
  background?: string;
  lineColor?: string;
  margin?: number;
}

export const BarcodeDisplay: React.FC<BarcodeDisplayProps> = ({
  value,
  type = 'barcode',
  width = 2,
  height = 50,
  fontSize = 12,
  className = '',
  displayValue = true,
  background = '#ffffff',
  lineColor = '#000000',
  margin = 8
}) => {
  const barcodeRef = useRef<SVGSVGElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!value) return;

    if (type === 'barcode' || type === 'both') {
      if (barcodeRef.current) {
        try {
          JsBarcode(barcodeRef.current, value, {
            format: 'CODE128',
            width: width,
            height: height,
            displayValue: displayValue,
            fontSize: fontSize,
            margin: margin,
            background: background,
            lineColor: lineColor,
            flat: true
          });
        } catch (e) {
          console.warn('Failed to render barcode:', e);
        }
      }
    }

    if (type === 'qrcode' || type === 'both') {
      if (qrCanvasRef.current) {
        QRCode.toCanvas(qrCanvasRef.current, value, {
          width: height + 30,
          margin: 1,
          color: {
            dark: lineColor || '#0f172a',
            light: background === 'transparent' ? '#ffffff00' : (background || '#ffffff')
          }
        }, (error) => {
          if (error) console.warn('Failed to render QR Code:', error);
        });
      }
    }
  }, [value, type, width, height, fontSize, displayValue, background, lineColor, margin]);

  if (!value) return null;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {type === 'both' ? (
        <div className="flex flex-col md:flex-row items-center gap-4">
          <svg ref={barcodeRef} className="max-w-full rounded-lg shadow-sm"></svg>
          <canvas ref={qrCanvasRef} className="max-w-full rounded-lg shadow-sm"></canvas>
        </div>
      ) : type === 'qrcode' ? (
        <canvas ref={qrCanvasRef} className="max-w-full rounded-lg shadow-sm" style={{ maxWidth: '100%', height: 'auto', display: 'block' }}></canvas>
      ) : (
        <svg ref={barcodeRef} className="max-w-full rounded-lg shadow-sm" style={{ maxWidth: '100%', height: 'auto', display: 'block' }}></svg>
      )}
    </div>
  );
};

