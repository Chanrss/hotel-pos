import React, { useState, useRef } from 'react';
import { Printer, RotateCcw, Move, CheckCircle2, AlertCircle } from 'lucide-react';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';

export interface LiveReceiptPreviewProps {
  settings: RestaurantSettings;
  onUpdateLogoPosition?: (offsetX: number, offsetY: number) => void;
  onResetLogoPosition?: () => void;
  onTestPrint?: () => void;
  isPrintingSample?: boolean;
  testPrintStatus?: {
    state: 'idle' | 'printing' | 'success' | 'failed';
    message?: string;
  };
}

const PREVIEW_ITEMS = [
  { id: '1', name: 'மசால் தோசை', qty: 2, price: 80, total: 160 },
  { id: '2', name: 'ஃபில்டர் காபி', qty: 1, price: 30, total: 30 }
];

export const LiveReceiptPreview: React.FC<LiveReceiptPreviewProps> = ({
  settings,
  onUpdateLogoPosition,
  onResetLogoPosition,
  onTestPrint,
  isPrintingSample = false,
  testPrintStatus = { state: 'idle', message: undefined }
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialOffsetX: number; initialOffsetY: number } | null>(null);

  const isLogoRemoved = Boolean(settings.logoRemoved) || settings.logoDisplay === 'none';
  const displayLogo = isLogoRemoved
    ? ''
    : (settings.logoUrl?.trim() || settings.logoStorageUrl?.trim() || DEFAULT_RESTAURANT_LOGO);

  const logoOffsetX = Math.max(-85, Math.min(85, Number(settings.logoOffsetX || 0)));
  const logoOffsetY = Math.max(-16, Math.min(36, Number(settings.logoOffsetY || 0)));

  const baseFontSize = Math.max(10, Math.min(14, Number(settings.receiptFontSize || 12))) + 1.5;
  const titleFontSize = Math.round(baseFontSize * 1.3 * 10) / 10;
  const totalFontSize = Math.round(baseFontSize * 1.25 * 10) / 10;

  // Alignments
  const defaultAlign = settings.receiptAlignment || 'center';
  const logoAlign = settings.logoAlignment || defaultAlign;
  const shopNameAlign = settings.shopNameAlignment || defaultAlign;
  const addressAlign = settings.addressAlignment || defaultAlign;
  const phoneAlign = settings.phoneAlignment || defaultAlign;
  const billHeaderAlign = settings.billHeaderAlignment || 'left';
  const footerAlign = settings.footerAlignment || defaultAlign;

  // Bold Toggles
  const boldRestaurantName = settings.boldRestaurantName !== undefined ? settings.boldRestaurantName : true;
  const boldBillNumber = settings.boldBillNumber !== undefined ? settings.boldBillNumber : true;
  const boldItemHeader = settings.boldItemHeader !== undefined ? settings.boldItemHeader : true;
  const boldGrandTotal = settings.boldGrandTotal !== undefined ? settings.boldGrandTotal : true;
  const boldFooter = settings.boldFooter !== undefined ? settings.boldFooter : true;

  // Watermark
  const watermarkEnabled = settings.watermarkEnabled !== undefined
    ? Boolean(settings.watermarkEnabled)
    : (settings.logoDisplay === 'watermark' || settings.logoDisplay === 'both' || settings.logoDisplay === undefined);
  const watermarkUseLogo = settings.watermarkUseLogo !== false;
  const watermarkOpacity = settings.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.12;

  const rawAddress = settings.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213';
  const formatAddressLines = (addr: string): string[] => {
    if (!addr) return [];
    if (addr.includes('\n')) return addr.split('\n').map(s => s.trim()).filter(Boolean);
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 2) {
      const mid = Math.ceil(parts.length / 2);
      return [parts.slice(0, mid).join(', '), parts.slice(mid).join(', ')];
    }
    return [addr];
  };
  const addressLines = formatAddressLines(rawAddress);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onUpdateLogoPosition || isLogoRemoved || !displayLogo) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialOffsetX: logoOffsetX,
      initialOffsetY: logoOffsetY
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !onUpdateLogoPosition) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    // Clamp strictly within the printable receipt area so the logo cannot move outside
    const clampedX = Math.max(-85, Math.min(85, Math.round(dragStartRef.current.initialOffsetX + dx)));
    const clampedY = Math.max(-16, Math.min(36, Math.round(dragStartRef.current.initialOffsetY + dy)));
    onUpdateLogoPosition(clampedX, clampedY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const formattedDate = `${day}-${month}-${year}`;
  const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3.5">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              3-Inch Thermal Receipt Preview
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            80mm Roll (72mm printable width) • Drag logo to position
          </p>
        </div>

        {(logoOffsetX !== 0 || logoOffsetY !== 0) && onResetLogoPosition && (
          <button
            type="button"
            onClick={onResetLogoPosition}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            title="Reset Logo Position"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Logo Position</span>
          </button>
        )}
      </div>

      {/* Main 3-Inch Simulated Thermal Paper Stage */}
      <div className="flex justify-center p-4 bg-slate-950 rounded-xl border border-slate-800/90 overflow-x-auto">
        <div
          id="live-receipt-paper"
          style={{
            fontSize: `${baseFontSize}px`,
            lineHeight: 1.24
          }}
          className="relative bg-white text-black w-[296px] px-3 py-3.5 shadow-2xl border border-slate-300 font-mono select-none overflow-hidden"
        >
          {/* Centered Watermark Behind Receipt Content (Watermark Alone - Draggable) */}
          {watermarkEnabled && (
            <div
              data-testid="receipt-watermark"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="absolute inset-0 flex items-center justify-center select-none z-0 overflow-hidden cursor-grab active:cursor-grabbing"
              title="Drag watermark to adjust position"
            >
              <div
                className="flex items-center justify-center text-center"
                style={{
                  width: '155px',
                  height: '155px',
                  opacity: watermarkOpacity,
                  transform: `translate(${logoOffsetX}px, ${logoOffsetY}px)`
                }}
              >
                {watermarkUseLogo && displayLogo ? (
                  <img
                    src={displayLogo}
                    alt="Receipt Watermark"
                    className="max-w-full max-h-full object-contain grayscale pointer-events-none select-none"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-sm font-black uppercase tracking-widest text-black break-words">
                    {settings.restaurantName || 'SHOP WATERMARK'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Receipt Foreground Content Layer */}
          <div className="relative z-10 pointer-events-none">
            {/* 1. Shop Name, Address, Phone */}
            <div className="mb-1">
              <div
                style={{
                  fontSize: `${titleFontSize}px`,
                  textAlign: shopNameAlign,
                  fontWeight: boldRestaurantName ? 800 : 400
                }}
                className="text-black leading-tight font-sans mb-0.5"
              >
                {settings.restaurantNameTamil || settings.restaurantName || 'ஸ்ரீ சரவண பவன்'}
              </div>

              <div
                style={{ textAlign: addressAlign, lineHeight: '1.02' }}
                className="text-black"
              >
                {addressLines.map((line, idx) => (
                  <div key={idx} className="leading-[1.02] m-0 p-0">{line}</div>
                ))}
              </div>

              <div
                style={{ textAlign: phoneAlign, lineHeight: '1.05' }}
                className="text-black mt-0.5"
              >
                PH: {settings.phone || '7708159933'}
              </div>
            </div>

            {/* 2. Bill Header */}
            <div
              style={{ textAlign: billHeaderAlign }}
              className="py-1.5 my-1 border-y border-dashed border-black space-y-0.5"
            >
              <div className="flex justify-between items-center" style={{ fontWeight: boldBillNumber ? 800 : 400 }}>
                <span>Bill No: 015</span>
                <span>Time: {formattedTime}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Order: Dine-In</span>
                <span>Captain: 01</span>
              </div>
            </div>

            {/* 3. Items Table */}
            <table className="w-full my-1 border-collapse table-fixed">
              <thead>
                <tr
                  style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                  className="border-b border-dashed border-black text-black"
                >
                  <th style={{ fontWeight: boldItemHeader ? 800 : 400 }} className="py-1 text-left w-[44%]">Item</th>
                  <th style={{ fontWeight: boldItemHeader ? 800 : 400 }} className="py-1 text-right w-[14%]">Qty</th>
                  <th style={{ fontWeight: boldItemHeader ? 800 : 400 }} className="py-1 text-right w-[21%]">Price</th>
                  <th style={{ fontWeight: boldItemHeader ? 800 : 400 }} className="py-1 text-right w-[21%]">Total</th>
                </tr>
              </thead>
              <tbody>
                {PREVIEW_ITEMS.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="py-1 text-left pr-1 break-words font-semibold">{item.name}</td>
                    <td className="py-1 text-right font-mono">{item.qty}</td>
                    <td className="py-1 text-right font-mono">{item.price}</td>
                    <td className="py-1 text-right font-mono font-semibold">{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 4. Grand Total */}
            <div className="py-1.5 my-1 border-y border-dashed border-black">
              <div
                style={{
                  fontSize: `${totalFontSize}px`,
                  fontWeight: boldGrandTotal ? 900 : 400
                }}
                className="flex justify-between items-center text-black"
              >
                <span>Grand Total:</span>
                <span>₹190</span>
              </div>
            </div>

            {/* 5. Footer */}
            <div
              style={{
                textAlign: footerAlign,
                fontWeight: boldFooter ? 700 : 400
              }}
              className="mt-2.5 pt-0.5 text-black uppercase tracking-wide"
            >
              {settings.receiptFooter || 'THANK YOU'}
            </div>
          </div>
        </div>
      </div>

      {/* TEST PRINT Button & Status */}
      {onTestPrint && (
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            id="btn-test-print-receipt"
            onClick={onTestPrint}
            disabled={isPrintingSample || testPrintStatus.state === 'printing'}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Printer className={`w-4 h-4 ${(isPrintingSample || testPrintStatus.state === 'printing') ? 'animate-spin' : ''}`} />
            <span>
              {(isPrintingSample || testPrintStatus.state === 'printing') ? 'Printing...' : 'TEST PRINT'}
            </span>
          </button>

          {testPrintStatus.state !== 'idle' && (
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                testPrintStatus.state === 'printing'
                  ? 'bg-amber-950/70 border-amber-500/40 text-amber-200'
                  : testPrintStatus.state === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/80 border-red-500/40 text-red-200'
              }`}
            >
              {testPrintStatus.state === 'printing' && (
                <Printer className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
              )}
              {testPrintStatus.state === 'success' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              {testPrintStatus.state === 'failed' && (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <div className="flex-1">
                {testPrintStatus.state === 'printing' && <span>Printing...</span>}
                {testPrintStatus.state === 'success' && (
                  <span>{testPrintStatus.message || 'TEST PRINT SUCCESSFUL — Print successful'}</span>
                )}
                {testPrintStatus.state === 'failed' && (
                  <span>{testPrintStatus.message || 'TEST PRINT FAILED — Receipt could not be sent to the print system.'}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
