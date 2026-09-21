import React, { useRef, useState } from 'react';
import { Member, StoreSettings } from '../types';
import { BarcodeDisplay } from './BarcodeDisplay';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface MemberCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  settings: StoreSettings;
}

export const MemberCardModal: React.FC<MemberCardModalProps> = ({
  isOpen,
  onClose,
  member,
  settings
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !member) return null;

  const storeName = settings.name || 'HEXAMART MEMBER';
  const memberBarcode = member.barcode || member.id || `MBR-${Date.now()}`;

  // Helper to safely render card to canvas without modern CSS oklch/oklab color errors from host document
  const generateCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;

    // Create an isolated hidden iframe with NO host document stylesheets
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '350px';
    iframe.style.height = '600px';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) return null;

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              *, *::before, *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body {
                background-color: #ffffff;
                font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                margin: 0;
                padding: 0;
              }
            </style>
          </head>
          <body>
            <div id="card-host" style="width: 280px; height: 444px; display: inline-block; background: #ffffff;"></div>
          </body>
        </html>
      `);
      iframeDoc.close();

      const host = iframeDoc.getElementById('card-host');
      if (!host) return null;

      // Clone cardRef element and strip Tailwind classes so html2canvas doesn't try to resolve class styles
      const clone = cardRef.current.cloneNode(true) as HTMLElement;
      const removeClasses = (el: Element) => {
        el.removeAttribute('class');
        Array.from(el.children).forEach(removeClasses);
      };
      removeClasses(clone);

      host.appendChild(clone);

      // Wait briefly for layout & rendering in iframe
      await new Promise((r) => setTimeout(r, 150));

      // Execute html2canvas inside the clean iframe context
      const canvas = await html2canvas(clone, {
        scale: 3, // High DPI (280px -> 840px width)
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      return canvas;
    } catch (err) {
      console.error('generateCanvas failed:', err);
      throw err;
    } finally {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }
  };

  // Download card as PNG Image
  const handleDownloadPNG = async () => {
    try {
      setIsExporting(true);
      const canvas = await generateCanvas();
      if (!canvas) return;

      const image = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = image;
      const filename = `Kartu_Member_${member.name.replace(/\s+/g, '_')}_${member.id}.png`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('PNG export failed:', err);
      alert('Gagal mendownload gambar PNG: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsExporting(false);
    }
  };

  // Download card as PDF in exact standard ID Card dimension (54mm x 85.6mm portrait)
  const handleDownloadPDF = async () => {
    try {
      setIsExporting(true);
      const canvas = await generateCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL('image/png', 1.0);

      // Exact Standard Vertical ID Card Size: 54mm width x 85.6mm height
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [54, 85.6]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, 54, 85.6);
      const filename = `Kartu_Member_${member.name.replace(/\s+/g, '_')}_${member.id}.pdf`;
      pdf.save(filename);
    } catch (err: any) {
      console.error('PDF export failed:', err);
      alert('Gagal mendownload PDF: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsExporting(false);
    }
  };

  // Print Card in exact standard vertical ID card dimensions (54mm x 85.6mm)
  const handlePrintCard = async () => {
    try {
      setIsExporting(true);
      const canvas = await generateCanvas();
      if (!canvas) return;

      const imgData = canvas.toDataURL('image/png', 1.0);

      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        alert('Gagal membuka jendela cetak. Izinkan popup di browser Anda.');
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cetak Kartu Member - ${member.name}</title>
            <style>
              @page {
                size: 54mm 85.6mm;
                margin: 0;
              }
              *, *::before, *::after {
                box-sizing: border-box;
              }
              html, body {
                width: 54mm;
                height: 85.6mm;
                margin: 0 !important;
                padding: 0 !important;
                background-color: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              img.id-card-print-image {
                width: 54mm !important;
                height: 85.6mm !important;
                object-fit: fill;
                display: block;
                margin: 0;
                padding: 0;
              }
              @media print {
                html, body {
                  background: #ffffff !important;
                  width: 54mm !important;
                  height: 85.6mm !important;
                }
                img.id-card-print-image {
                  width: 54mm !important;
                  height: 85.6mm !important;
                }
              }
            </style>
          </head>
          <body>
            <img src="${imgData}" class="id-card-print-image" alt="Kartu Member" />
            <script>
              window.onload = () => {
                setTimeout(() => {
                  window.print();
                }, 300);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err: any) {
      console.error('Print failed:', err);
      alert('Gagal mencetak kartu: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 relative border border-slate-100 my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold transition-all z-20"
        >
          <i className="fas fa-times text-sm"></i>
        </button>

        <div className="text-center space-y-1 pr-6">
          <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight flex items-center justify-center gap-2">
            <i className="fas fa-id-card text-emerald-600"></i> Kartu Digital Member
          </h3>
          <p className="text-[11px] text-slate-500 font-medium">Ukuran Standar ID Card (5.4 cm x 8.56 cm)</p>
        </div>

        {/* Digital ID Card (Vertical Layout - Standard ID Card Ratio 54mm x 85.6mm) */}
        <div className="flex justify-center my-1 overflow-x-auto">
          <div
            ref={cardRef}
            className="id-card-wrapper w-[280px] h-[444px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col justify-between relative text-slate-800 shrink-0"
            style={{ 
              width: '280px',
              height: '444px',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '16px',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              border: '1px solid #e2e8f0',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
            }}
          >
            {/* Top Header Banner */}
            <div 
              className="relative text-white pt-5 pb-16 px-3 text-center overflow-hidden"
              style={{ 
                position: 'relative',
                backgroundColor: '#065f46', 
                color: '#ffffff',
                paddingTop: '20px',
                paddingBottom: '64px',
                paddingLeft: '12px',
                paddingRight: '12px',
                textAlign: 'center',
                overflow: 'hidden',
                boxSizing: 'border-box'
              }}
            >
              {/* Decorative Overlay */}
              <div 
                className="absolute inset-0 opacity-90 pointer-events-none"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.9, backgroundColor: '#065f46' }}
              ></div>

              {/* Store Name - Explicitly Visible at Top */}
              <div className="relative z-10 space-y-1" style={{ position: 'relative', zIndex: 10 }}>
                <p 
                  className="text-[9px] font-black text-emerald-200 tracking-widest uppercase"
                  style={{ color: '#a7f3d0', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}
                >
                  KARTU MEMBER RESMI
                </p>
                <h4 
                  className="font-black text-sm uppercase tracking-wider leading-tight text-white line-clamp-2 px-1"
                  style={{ color: '#ffffff', fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: '1.25', margin: '4px 0 0 0', padding: '0 4px' }}
                >
                  {storeName}
                </h4>
              </div>
            </div>

            {/* Central Member Photo Container - Square Equal Frame */}
            <div 
              className="relative -mt-14 flex justify-center z-20 px-4"
              style={{ position: 'relative', marginTop: '-56px', display: 'flex', justifyContent: 'center', zIndex: 20, paddingLeft: '16px', paddingRight: '16px' }}
            >
              <div 
                className="w-28 h-28 rounded-2xl bg-white p-1 shadow-xl border-3 border-emerald-500 flex items-center justify-center overflow-hidden"
                style={{ width: '112px', height: '112px', borderRadius: '20px', backgroundColor: '#ffffff', padding: '5px', border: '3px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxSizing: 'border-box', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)' }}
              >
                <div 
                  className="w-full h-full rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center"
                  style={{ width: '100%', height: '100%', borderRadius: '14px', overflow: 'hidden', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {member.image ? (
                    <img 
                      src={member.image} 
                      alt={member.name} 
                      className="w-full h-full object-cover" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div 
                      className="text-slate-400 font-black text-3xl flex items-center justify-center w-full h-full bg-emerald-50 text-emerald-700"
                      style={{ backgroundColor: '#ecfdf5', color: '#047857', fontSize: '28px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Member Details */}
            <div 
              className="px-4 py-2 text-center flex-1 flex flex-col justify-between"
              style={{ paddingLeft: '16px', paddingRight: '16px', paddingTop: '6px', paddingBottom: '8px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '8px', width: '100%' }}>
                <h2 
                  className="text-base font-black text-slate-900 uppercase tracking-tight leading-snug line-clamp-1"
                  style={{ color: '#0f172a', fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.025em', lineHeight: '1.3', margin: '0 0 4px 0', display: 'block' }}
                >
                  {member.name}
                </h2>
                <div 
                  className="inline-block px-3 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[8px] font-black uppercase tracking-wider"
                  style={{ display: 'inline-block', paddingLeft: '12px', paddingRight: '12px', paddingTop: '2px', paddingBottom: '2px', backgroundColor: '#ecfdf5', color: '#065f46', borderRadius: '9999px', fontSize: '8px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  ACTIVE MEMBER
                </div>
              </div>

              {/* Info Table (Email hidden) */}
              <div 
                className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-left text-[11px]"
                style={{ 
                  backgroundColor: '#f8fafc', 
                  padding: '9px 12px', 
                  borderRadius: '12px', 
                  border: '1px solid #e2e8f0', 
                  textAlign: 'left', 
                  boxSizing: 'border-box',
                  marginBottom: '8px',
                  width: '100%'
                }}
              >
                <div 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    borderBottom: '1px solid #e2e8f0', 
                    paddingBottom: '5px',
                    marginBottom: '5px',
                    lineHeight: '1.3'
                  }}
                >
                  <span style={{ color: '#64748b', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-block' }}>ID MEMBER</span>
                  <span style={{ color: '#4338ca', fontFamily: 'monospace', fontWeight: 900, fontSize: '11px', whiteSpace: 'nowrap', display: 'inline-block' }}>{member.id}</span>
                </div>
                <div 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    lineHeight: '1.3'
                  }}
                >
                  <span style={{ color: '#64748b', fontWeight: 700, fontSize: '9px', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-block' }}>WHATSAPP</span>
                  <span style={{ color: '#334155', fontWeight: 600, fontSize: '10px', whiteSpace: 'nowrap', display: 'inline-block' }}>{member.whatsapp || '-'}</span>
                </div>
              </div>

              {/* 1D Barcode Container */}
              <div 
                className="bg-white p-2 rounded-xl border border-slate-200 flex flex-col items-center justify-center space-y-0.5 shadow-xs"
                style={{ 
                  backgroundColor: '#ffffff', 
                  padding: '6px 8px', 
                  borderRadius: '12px', 
                  border: '1px solid #cbd5e1', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  maxWidth: '100%'
                }}
              >
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', paddingTop: '2px', paddingBottom: '2px', overflow: 'hidden' }}>
                  <BarcodeDisplay 
                    value={memberBarcode} 
                    type="barcode" 
                    height={32} 
                    width={memberBarcode.length > 18 ? 1.2 : memberBarcode.length > 14 ? 1.35 : 1.5}
                    margin={2}
                    fontSize={10} 
                    displayValue={false} 
                  />
                </div>
                <p style={{ color: '#1e293b', fontFamily: 'monospace', fontWeight: 900, fontSize: '10px', letterSpacing: '0.05em', margin: '2px 0 0 0', lineHeight: '1.2' }}>
                  ID: {memberBarcode}
                </p>
              </div>
            </div>

            {/* Card Footer Stripe */}
            <div 
              className="bg-emerald-800 h-2 w-full"
              style={{ backgroundColor: '#065f46', height: '8px', width: '100%' }}
            ></div>
          </div>
        </div>

        {/* Action Export Buttons */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleDownloadPNG}
              disabled={isExporting}
              className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <i className="fas fa-file-image text-sm"></i> Download PNG
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="py-3 bg-honey-600 hover:bg-honey-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md shadow-honey-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <i className="fas fa-file-pdf text-sm"></i> Download PDF
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrintCard}
              disabled={isExporting}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <i className="fas fa-print text-sm"></i> Cetak Kartu
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
