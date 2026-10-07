import React, { useState, useRef } from 'react';
import {
  Printer,
  RotateCcw,
  Move,
  CheckCircle2,
  AlertCircle,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Crosshair
} from 'lucide-react';
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
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    initialOffsetX: number;
    initialOffsetY: number;
  } | null>(null);

  const isLogoRemoved = Boolean(settings.logoRemoved) || settings.logoDisplay === 'none';
  const displayLogo = isLogoRemoved
    ? ''
    : (settings.logoUrl?.trim() || settings.logoStorageUrl?.trim() || DEFAULT_RESTAURANT_LOGO);

  const logoOffsetX = Math.max(-85, Math.min(85, Number(settings.logoOffsetX || 0)));
  const logoOffsetY = Math.max(-45, Math.min(45, Number(settings.logoOffsetY || 0)));

  const isCompact = Boolean(settings.compactMode) || settings.receiptFormat === 'compact';
  const is58mm = settings.paperWidth === '58mm';

  const rawFontSize = Math.max(8, Math.min(20, Number(settings.receiptFontSize || 12)));
  const baseFontSize = isCompact ? Math.max(8, rawFontSize - 0.5) : rawFontSize + 1.5;
  const titleFontSize = Math.round(baseFontSize * (isCompact ? 1.18 : 1.3) * 10) / 10;
  const totalFontSize = Math.round(baseFontSize * (isCompact ? 1.18 : 1.25) * 10) / 10;

  // Alignments
  const defaultAlign = settings.receiptAlignment || 'center';
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

  // Layout Visibility Toggles
  const showAddress = settings.receiptShowAddress !== false;
  const showPhone = settings.receiptShowPhone !== false;
  const showItemSl = settings.receiptShowItemSl !== false;
  const showTotalQty = settings.receiptShowTotalQty !== false;

  // Watermark (Watermark Alone - No Top Header Logo)
  const watermarkEnabled = settings.watermarkEnabled !== undefined
    ? Boolean(settings.watermarkEnabled)
    : (settings.logoDisplay === 'watermark' || settings.logoDisplay === 'both' || settings.logoDisplay === undefined);
  const watermarkUseLogo = settings.watermarkUseLogo !== false;
  const watermarkOpacity = settings.watermarkOpacity !== undefined ? Number(settings.watermarkOpacity) : 0.12;
  const watermarkSize = Math.max(90, Math.min(200, Number(settings.receiptLogoMaxWidth || 155)));

  const rawAddress = settings.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213';
  const formatAddressLines = (addr: string): string[] => {
    if (!addr) return [];
    if (addr.includes('\n')) return addr.split('\n').map(s => s.trim()).filter(Boolean);
    if (addr.includes('Anna Nagar')) {
      const parts = addr.split('Anna Nagar');
      return [
        parts[0].replace(/,\s*$/, '').trim(),
        ('Anna Nagar' + parts[1]).trim()
      ];
    }
    const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 2) {
      const mid = Math.ceil(parts.length / 2);
      return [parts.slice(0, mid).join(', '), parts.slice(mid).join(', ')];
    }
    return [addr];
  };
  const addressLines = formatAddressLines(rawAddress);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onUpdateLogoPosition || !watermarkEnabled) return;
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
    const clampedX = Math.max(-85, Math.min(85, Math.round(dragStartRef.current.initialOffsetX + dx)));
    const clampedY = Math.max(-45, Math.min(45, Math.round(dragStartRef.current.initialOffsetY + dy)));
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

  const handleNudge = (dx: number, dy: number) => {
    if (!onUpdateLogoPosition) return;
    const nextX = Math.max(-85, Math.min(85, logoOffsetX + dx));
    const nextY = Math.max(-45, Math.min(45, logoOffsetY + dy));
    onUpdateLogoPosition(nextX, nextY);
  };

  const now = new Date();
  const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const totalQty = PREVIEW_ITEMS.reduce((sum, itm) => sum + itm.qty, 0);
  const grandTotal = PREVIEW_ITEMS.reduce((sum, itm) => sum + itm.total, 0);

  return (
    <div
      data-testid="persistent-receipt-preview-panel"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3"
    >
      {/* Header Toolbar */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Live 3-Inch Receipt Preview
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {is58mm ? '58mm Roll' : '80mm Roll (72mm printable)'} · {isCompact ? 'Compact Layout' : 'Standard Layout'} · Font {rawFontSize}px
          </p>
        </div>

        {(logoOffsetX !== 0 || logoOffsetY !== 0) && onResetLogoPosition && (
          <button
            type="button"
            onClick={onResetLogoPosition}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            title="Reset Watermark Position"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Real-Time Watermark Quick-Position Bar */}
      {watermarkEnabled && onUpdateLogoPosition && (
        <div className="bg-slate-950 border border-slate-800/90 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Move className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold">Watermark Pos:</span>
            <span className="font-mono text-amber-300">
              X:{logoOffsetX}px, Y:{logoOffsetY}px
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleNudge(-5, 0)}
              className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              title="Move Watermark Left"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleNudge(0, -5)}
              className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              title="Move Watermark Up"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleNudge(0, 5)}
              className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              title="Move Watermark Down"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleNudge(5, 0)}
              className="w-6 h-6 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              title="Move Watermark Right"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onUpdateLogoPosition(0, 0)}
              className="px-1.5 h-6 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-amber-300 font-semibold flex items-center gap-0.5 cursor-pointer"
              title="Center Watermark"
            >
              <Crosshair className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Inch Simulated Thermal Paper Stage */}
      <div className="flex justify-center p-3.5 bg-slate-950 rounded-xl border border-slate-800/90 overflow-x-auto">
        <div
          id="live-receipt-paper"
          style={{
            fontSize: `${baseFontSize}px`,
            lineHeight: isCompact ? 1.12 : 1.24
          }}
          className={`relative bg-white text-black ${
            is58mm ? 'w-[235px]' : 'w-[296px]'
          } ${
            isCompact ? 'px-2.5 py-2' : 'px-3 py-3'
          } shadow-2xl border border-slate-300 font-mono select-none overflow-hidden transition-all ${
            isCompact ? 'compact-mode receipt-compact' : ''
          }`}
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
              title="Drag watermark to adjust position in real-time"
            >
              <div
                className={`flex items-center justify-center text-center transition-transform duration-75 ${
                  isDragging ? 'ring-1 ring-dashed ring-amber-500/70 rounded-lg p-1' : ''
                }`}
                style={{
                  width: `${watermarkSize}px`,
                  height: `${watermarkSize}px`,
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
            {/* 1. Shop Name, Compact Address, Phone */}
            <div className={isCompact ? 'mb-0.5' : 'mb-1'}>
              <div
                style={{
                  fontSize: `${titleFontSize}px`,
                  textAlign: shopNameAlign,
                  fontWeight: boldRestaurantName ? 800 : 400
                }}
                className="restaurant-title text-black leading-[1.12] font-sans mb-[1px]"
              >
                {settings.restaurantNameTamil || settings.restaurantName || 'ஸ்ரீ சரவண பவன்'}
              </div>

              {showAddress && (
                <div
                  style={{
                    textAlign: addressAlign,
                    lineHeight: '0.96',
                    marginBottom: '0px'
                  }}
                  className="restaurant-address address-section text-black mb-0"
                >
                  {addressLines.map((line, idx) => (
                    <div key={idx} className="leading-[0.96] m-0 p-0">
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {showPhone && (
                <div
                  style={{
                    textAlign: phoneAlign,
                    lineHeight: '1.02'
                  }}
                  className="phone-section text-black mt-[1px] mb-0"
                >
                  PH: {settings.phone || '7708159933'}
                </div>
              )}
            </div>

            {/* 2. Bill Header Meta (Single-line Bill No + Time & Single-line Order + Captain) */}
            <div
              style={{ textAlign: billHeaderAlign }}
              className={`${
                isCompact ? 'py-1 my-0.5' : 'py-1.5 my-1'
              } border-y border-dashed border-black space-y-0.5`}
            >
              <div
                className={`flex items-center ${
                  billHeaderAlign === 'center'
                    ? 'justify-center gap-4'
                    : billHeaderAlign === 'right'
                    ? 'justify-end gap-4'
                    : 'justify-between'
                }`}
                style={{ fontWeight: boldBillNumber ? 800 : 400 }}
              >
                <span>Bill No: 015</span>
                <span>Time: {formattedTime}</span>
              </div>
              <div
                className={`flex items-center ${
                  billHeaderAlign === 'center'
                    ? 'justify-center gap-4'
                    : billHeaderAlign === 'right'
                    ? 'justify-end gap-4'
                    : 'justify-between'
                }`}
              >
                <span>Order: Dine-In</span>
                <span>Captain: 01</span>
              </div>
            </div>

            {/* 3. Items Table (Tamil Item Names) */}
            <table className="w-full my-1 border-collapse table-fixed">
              <thead>
                <tr
                  style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                  className="border-b border-dashed border-black text-black"
                >
                  {showItemSl && (
                    <th
                      style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                      className={`${isCompact ? 'py-0.5' : 'py-1'} text-left w-[10%]`}
                    >
                      #
                    </th>
                  )}
                  <th
                    style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                    className={`${isCompact ? 'py-0.5' : 'py-1'} text-left ${
                      showItemSl ? 'w-[40%]' : 'w-[46%]'
                    }`}
                  >
                    பொருள்
                  </th>
                  <th
                    style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                    className={`${isCompact ? 'py-0.5' : 'py-1'} text-right w-[14%]`}
                  >
                    Qty
                  </th>
                  <th
                    style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                    className={`${isCompact ? 'py-0.5' : 'py-1'} text-right w-[18%]`}
                  >
                    Price
                  </th>
                  <th
                    style={{ fontWeight: boldItemHeader ? 800 : 400 }}
                    className={`${isCompact ? 'py-0.5' : 'py-1'} text-right w-[18%]`}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {PREVIEW_ITEMS.map((item, idx) => (
                  <tr key={item.id} className="align-top">
                    {showItemSl && (
                      <td className={`${isCompact ? 'py-0.5' : 'py-1'} text-left font-mono`}>
                        {idx + 1}
                      </td>
                    )}
                    <td className={`${isCompact ? 'py-0.5' : 'py-1'} text-left pr-1 break-words font-semibold font-sans`}>
                      {item.name}
                    </td>
                    <td className={`${isCompact ? 'py-0.5' : 'py-1'} text-right font-mono`}>
                      {item.qty}
                    </td>
                    <td className={`${isCompact ? 'py-0.5' : 'py-1'} text-right font-mono`}>
                      {item.price}
                    </td>
                    <td className={`${isCompact ? 'py-0.5' : 'py-1'} text-right font-mono font-semibold`}>
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Optional Net Qty & Subtotal Summary Row */}
            {showTotalQty && (
              <div className="border-t border-dashed border-black pt-1 mt-0.5 flex justify-between items-center text-[0.9em] text-black">
                <span>
                  Total Qty: <b>{totalQty}</b>
                </span>
                <span>
                  Subtotal: <b>₹{grandTotal}</b>
                </span>
              </div>
            )}

            {/* 4. Grand Total */}
            <div className={`${isCompact ? 'py-1 my-0.5' : 'py-1.5 my-1'} border-y border-dashed border-black`}>
              <div
                style={{
                  fontSize: `${totalFontSize}px`,
                  fontWeight: boldGrandTotal ? 900 : 400
                }}
                className="flex justify-between items-center text-black"
              >
                <span>Grand Total:</span>
                <span>₹{grandTotal}</span>
              </div>
            </div>

            {/* 5. Footer */}
            <div
              style={{
                textAlign: footerAlign,
                fontWeight: boldFooter ? 700 : 400
              }}
              className={`${isCompact ? 'mt-1.5' : 'mt-2'} pt-0.5 text-black uppercase tracking-wide`}
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
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
          >
            <Printer
              className={`w-4 h-4 ${
                isPrintingSample || testPrintStatus.state === 'printing' ? 'animate-spin' : ''
              }`}
            />
            <span>
              {isPrintingSample || testPrintStatus.state === 'printing' ? 'Printing...' : 'TEST PRINT'}
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
                  <span>
                    {testPrintStatus.message ||
                      'TEST PRINT FAILED — Receipt could not be sent to the print system.'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
