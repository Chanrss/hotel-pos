import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { Printer, X, Check, Copy, AlertCircle, ExternalLink, HelpCircle } from 'lucide-react';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { PrinterService } from '../../services/printerService';
import { PrintService } from '../../services/PrintService';
import { getTamilItemName } from '../../services/tamilTranslation';
import { getCaptainNumber } from '../../utils/receiptFormatters';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';
import { PrintingReceiptAnimation } from './PrintingReceiptAnimation';
import { PrinterTroubleshootModal } from './PrinterTroubleshootModal';
import { PrinterConnectionService } from '../../services/printerConnectionService';
import { ConnectedPrinterInfo } from '../../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { PrintLogoScaleControlPanel } from './PrintLogoScaleControlPanel';

interface ThermalReceiptModalProps {
  bill: Bill | null;
  items: BillItem[];
  settings?: RestaurantSettings;
  isOpen: boolean;
  onClose: () => void;
  onPrint?: () => void | Promise<void>;
  isReprint?: boolean;
  printButtonText?: string;
  isPrinting?: boolean;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  bill,
  items,
  settings,
  isOpen,
  onClose,
  onPrint,
  isReprint = false,
  printButtonText,
  isPrinting = false
}) => {
  const [copied, setCopied] = useState(false);
  const [isPrintingLocal, setIsPrintingLocal] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [connectedPrinter, setConnectedPrinter] = useState<ConnectedPrinterInfo>(() =>
    PrinterConnectionService.getConnectedPrinter()
  );

  // Real-time logo dimensions initialized from settings, localStorage or fallback (140x50)
  const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
  const defaultLogoDim = is58mm ? 70 : 90;

  const [logoMaxWidth, setLogoMaxWidth] = useState<number>(() => {
    if (settings?.receiptLogoMaxWidth) return settings.receiptLogoMaxWidth;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_receipt_logo_max_width');
      if (saved && !isNaN(Number(saved)) && Number(saved) > 0) return Number(saved);
    }
    return defaultLogoDim;
  });

  const [logoMaxHeight, setLogoMaxHeight] = useState<number>(() => {
    if (settings?.receiptLogoMaxHeight) return settings.receiptLogoMaxHeight;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_receipt_logo_max_height');
      // If stored value was the old 50px limit that crushed circular logos, upgrade to 90px
      if (saved && !isNaN(Number(saved)) && Number(saved) >= 60) return Number(saved);
    }
    return defaultLogoDim;
  });

  const [activeLogoDisplay, setActiveLogoDisplay] = useState<'watermark' | 'header' | 'both' | 'none'>(() => {
    if (settings?.logoDisplay === 'none') return 'none';
    return 'watermark';
  });
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLogoLoadError(false);
    }
  }, [isOpen, bill?.id]);

  // Sync settings when modified externally
  useEffect(() => {
    if (settings?.receiptLogoMaxWidth) setLogoMaxWidth(settings.receiptLogoMaxWidth);
    if (settings?.receiptLogoMaxHeight) setLogoMaxHeight(settings.receiptLogoMaxHeight);
    if (settings?.logoDisplay) {
      setActiveLogoDisplay(settings.logoDisplay === 'none' ? 'none' : 'watermark');
    }
  }, [settings?.receiptLogoMaxWidth, settings?.receiptLogoMaxHeight, settings?.logoDisplay]);

  // Real-time synchronization of CSS variables directly to #pos-print-root
  useEffect(() => {
    PrinterService.setPrintRootLogoSize(logoMaxWidth, logoMaxHeight);
  }, [logoMaxWidth, logoMaxHeight]);

  useEffect(() => {
    const unsub = PrinterConnectionService.subscribe((info) => {
      setConnectedPrinter(info);
    });
    return unsub;
  }, []);

  const handlePrint = useCallback(async () => {
    if (!bill) return;
    setIsPrintingLocal(true);
    try {
      // Ensure #pos-print-root has the current CSS variables
      PrinterService.setPrintRootLogoSize(logoMaxWidth, logoMaxHeight);

      const effectiveSettings: RestaurantSettings = {
        ...settings,
        receiptLogoMaxWidth: logoMaxWidth,
        receiptLogoMaxHeight: logoMaxHeight,
        logoDisplay: activeLogoDisplay
      };

      if (onPrint) {
        await onPrint();
      } else {
        await PrintService.printReceipt({
          bill,
          items,
          settings: effectiveSettings,
          forcePrint: true
        });
      }
    } catch (err) {
      console.error('Print trigger error:', err);
    } finally {
      setTimeout(() => {
        setIsPrintingLocal(false);
      }, 2600);
    }
  }, [bill, items, settings, logoMaxWidth, logoMaxHeight, activeLogoDisplay, onPrint]);

  useEffect(() => {
    if (!isOpen || !bill) return;
    const handleModalKey = (e: KeyboardEvent) => {
      if (e.key === 'F10' || (e.ctrlKey && (e.key === 'p' || e.key === 'P'))) {
        e.preventDefault();
        e.stopPropagation();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleModalKey);
    return () => window.removeEventListener('keydown', handleModalKey);
  }, [isOpen, bill, handlePrint]);

  if (!isOpen || !bill) return null;

  const handleSaveDefaultLogoScale = async (newW: number, newH: number) => {
    try {
      const docRef = doc(db, 'settings', 'restaurant');
      await setDoc(docRef, {
        receiptLogoMaxWidth: newW,
        receiptLogoMaxHeight: newH,
        logoDisplay: activeLogoDisplay,
        updatedAt: Date.now()
      }, { merge: true });
    } catch (err) {
      console.warn('Could not persist logo scale to Firestore settings (sandbox/offline):', err);
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('pos_receipt_logo_max_width', String(newW));
        localStorage.setItem('pos_receipt_logo_max_height', String(newH));
      } catch {
        // Ignore iframe storage errors
      }
    }
  };

  const createdDate = new Date(bill.createdAt);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(createdDate.getDate()).padStart(2, '0');
  const month = months[createdDate.getMonth()];
  const year = createdDate.getFullYear();
  const dateFormatted = `${day}/${month}/${year}`;
  const timeFormatted = createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const cleanBillNo = (bill.billNumber || '1').replace(/^BN-|^#/, '');
  const captainNumber = getCaptainNumber(bill);
  const tableNo = bill.tableNumber || (bill.orderType === 'TAKE_AWAY' ? 'TA' : 'DR');
  const hotelNameTamil = settings?.restaurantNameTamil?.trim() || 'ஸ்ரீ சரவண பவன்';
  const restaurantName = settings?.restaurantName || 'Sri Saravanan Bhavan';
  const rawAddress = settings?.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213';
  const alignment = settings?.receiptAlignment || 'center';
  const logoDisplay = settings?.logoDisplay || 'watermark';
  const watermarkOpacity = settings?.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.12;
  
  // Format address into clean lines matching thermal receipt
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
  const phone = settings?.phone || '7708159933';
  const receiptFooter = settings?.receiptFooter || '*** THANK YOU VISIT AGAIN ***';
  const totalQty = items.reduce((s, itm) => s + itm.quantity, 0);

  const handleCopyText = () => {
    if (!bill) return;
    const lines = [
      hotelNameTamil,
      ...addressLines,
      `PH: ${phone}`,
      '',
      'Restaurant Bill',
      '',
      `Bill No : BN-${cleanBillNo}`,
      `Date : ${dateFormatted}              Time : ${timeFormatted}`,
      `Cap No : ${captainNumber}                    Table No : ${tableNo}`,
      '',
      'SL பொருள்                       Qty    Rate     Tot',
      ...items.map((item, idx) => {
        const tamilName = getTamilItemName(item.itemName, item.itemNameTamil);
        const displayName = tamilName || item.itemName;
        const name = `${idx + 1}.${displayName}`.padEnd(28).slice(0, 28);
        const qty = Number(item.quantity).toFixed(2).padStart(7);
        const rate = Number(item.unitPrice).toFixed(2).padStart(8);
        const tot = Number(item.totalPrice).toFixed(2).padStart(8);
        return `${name} ${qty} ${rate} ${tot}`;
      }),
      '',
      `Net Qty :                      ${totalQty.toFixed(2)}`,
      bill.discount > 0 ? `Discount :                     -${Number(bill.discount).toFixed(2)}` : '',
      `Net Tot :                                     ${Number(bill.subtotal).toFixed(2)}`,
      '',
      `GRAND TOTAL: ${Number(bill.grandTotal).toFixed(2)}`,
      receiptFooter
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const isCompact = Boolean(settings?.compactMode);
  const configuredFontSize = settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12);
  const baseFontSize = isCompact ? Math.max(9, Math.round(configuredFontSize * 0.85 * 10) / 10) : configuredFontSize;
  const nextReprintNum = (bill.reprintCount || 0) + 1;
  // STRICT LOGO PRESERVATION: Use exact original uploaded shop logo
  const originalLogoUrl = settings?.logoStorageUrl?.trim() || settings?.logoUrl?.trim() || DEFAULT_RESTAURANT_LOGO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl lg:max-w-3xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Live Thermal Receipt Printing Animation */}
        <AnimatePresence>
          {(isPrinting || isPrintingLocal) && (
            <PrintingReceiptAnimation
              mode="modal-overlay"
              isActive={true}
              bill={bill}
              items={items}
              settings={settings}
              onComplete={() => setIsPrintingLocal(false)}
            />
          )}
        </AnimatePresence>

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${isReprint ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base leading-tight">
                {isReprint ? `Thermal Receipt Preview (Reprint)` : `Thermal Receipt Preview`}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono flex items-center flex-wrap gap-1.5 mt-0.5">
                <span>Bill #{bill.billNumber} • {is58mm ? '58mm Paper' : '80mm Paper'}</span>
                {isCompact && (
                  <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded text-[10px] font-bold tracking-wider">
                    COMPACT
                  </span>
                )}
                {isReprint && <span className="text-amber-400 font-bold ml-1">• Duplicate #{nextReprintNum}</span>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hardware printer status bar */}
        <div className="px-3.5 py-1.5 border-b text-xs flex items-center justify-between gap-2 shrink-0 bg-emerald-50/80 border-emerald-200 text-emerald-900">
          <div className="flex items-center gap-2 flex-1 truncate">
            <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]" />
            <span className="text-[11px] truncate">
              Printer: <strong>Thermal Receipt Printer</strong> (USB / System)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowTroubleshoot(true)}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0 text-emerald-800 hover:bg-emerald-100 underline"
          >
            Hardware Setup
          </button>
        </div>

        {/* Notice banner for sandbox preview */}
        {typeof window !== 'undefined' && window.self !== window.top && (
          <div className="bg-amber-50 border-b border-amber-200 px-3.5 py-2 text-amber-900 text-xs flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 flex-1">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-[11.5px] leading-tight">
                <strong>Printer Connected?</strong> Browser sandbox may restrict physical print dialogs inside this preview.
              </span>
            </div>
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-2xs transition-colors shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open in New Tab</span>
            </a>
          </div>
        )}

        {/* Notice banner for reprint preview */}
        {isReprint && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-900 text-xs flex items-center justify-between shrink-0">
            <span className="font-medium">
              Review receipt details below before triggering the printer.
            </span>
            <span className="font-mono text-[11px] font-bold bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded">
              PREVIEW ONLY
            </span>
          </div>
        )}

        {/* Receipt Preview & Logo Control Container */}
        <div className="p-3 sm:p-4 overflow-y-auto bg-slate-100 flex-1 min-h-0 space-y-3">
          {/* Real-time Logo Scaling Control Panel */}
          <PrintLogoScaleControlPanel
            initialWidth={logoMaxWidth}
            initialHeight={logoMaxHeight}
            paperWidth={is58mm ? '58mm' : '80mm'}
            onSizeChange={(w, h) => {
              setLogoMaxWidth(w);
              setLogoMaxHeight(h);
            }}
            onSaveDefault={handleSaveDefaultLogoScale}
            logoDisplay={activeLogoDisplay}
            onLogoDisplayChange={setActiveLogoDisplay}
          />

          {/* Centered Receipt Preview */}
          <div className="flex justify-center pb-2">
            <div 
              id="thermal-receipt-preview" 
              style={{
                fontSize: `${baseFontSize}px`,
                ['--receipt-base-font-size' as any]: `${baseFontSize}px`,
                ['--receipt-logo-max-width' as any]: `${logoMaxWidth}px`,
                ['--receipt-logo-max-height' as any]: `${logoMaxHeight}px`,
                lineHeight: isCompact ? '1.12' : '1.25'
              }}
              className={`relative ${is58mm ? 'w-[230px]' : 'w-[290px]'} bg-white ${isCompact ? 'p-2' : 'p-3.5'} shadow-md border border-slate-300 font-mono text-black select-text overflow-hidden transition-all ${isCompact ? 'compact-mode receipt-compact' : ''}`}
            >
              {/* Center Background Watermark Logo with Light Shadow Effect */}
              {(activeLogoDisplay === 'watermark' || activeLogoDisplay === 'both') && !logoLoadError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">
                  <div 
                    className="relative flex items-center justify-center transition-opacity duration-300"
                    style={{ 
                      opacity: watermarkOpacity,
                      width: `${is58mm ? 120 : 150}px`,
                      height: `${is58mm ? 120 : 150}px`
                    }}
                  >
                    <img 
                      src={originalLogoUrl} 
                      alt="Background Watermark Logo" 
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain'
                      }}
                      className="drop-shadow-[0_0_8px_rgba(0,0,0,0.15)]"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}

              {/* Receipt Content Container (Watermark Alone - No Top Header Logo) */}
              <div className="relative z-10">

              {/* 1. Header: Hotel Name in Tamil ONLY, Compact Address lines, Phone Number */}
              <div className={`mb-1 ${alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center'}`}>
                <div className="font-extrabold text-[20px] sm:text-[22px] tracking-wide text-black leading-tight font-sans mb-0.5">
                  {hotelNameTamil}
                </div>
                <div className="text-[12px] sm:text-[12.5px] text-black leading-[1.02]">
                  {addressLines.map((line, idx) => (
                    <div key={idx} className="leading-[1.02] m-0 p-0">{line}</div>
                  ))}
                  <div className="leading-[1.05] mt-0.5">PH: {phone}</div>
                  {(settings?.gstNumber || settings?.fssaiNumber) && (
                    <div className="font-semibold text-slate-800 text-[10px] sm:text-[10.5px] leading-[1.05] mt-0.5">
                      {settings?.gstNumber ? `GSTIN: ${settings.gstNumber}` : ''}
                      {(settings?.gstNumber && settings?.fssaiNumber) ? ' | ' : ''}
                      {settings?.fssaiNumber ? `FSSAI: ${settings.fssaiNumber}` : ''}
                    </div>
                  )}
                </div>
              </div>

              {(isReprint || bill.reprintCount > 0) && (
                <div className="text-center border border-black py-0.5 my-1 text-[10.5px] font-black uppercase tracking-wider bg-slate-50">
                  *** DUPLICATE / REPRINT ({bill.reprintCount ? (isReprint ? bill.reprintCount + 1 : bill.reprintCount) : 1}) ***
                </div>
              )}

              {/* 2. Bill Meta: Bill No + Time in single line and Order Type + Captain Code in single line */}
              <div className="my-1.5 py-1 border-t border-b border-dashed border-black text-[12.5px] sm:text-[13.5px] space-y-0.5">
                <div className="flex justify-between items-center font-bold text-black">
                  <span>Bill No : BN-{cleanBillNo}</span>
                  <span className="sr-only">Bill No: #{bill.billNumber}</span>
                  <span>Time : {timeFormatted}</span>
                </div>
                <div className="flex justify-between items-center text-black font-semibold">
                  <span>Order : {bill.orderType === 'TAKE_AWAY' ? 'Takeaway' : `Dine-In${tableNo ? ` (${tableNo})` : ''}`}</span>
                  <span>Captain : {captainNumber || '01'}</span>
                </div>
              </div>

              {/* 3. Items Table: Item Number (#), Item Name in Tamil (BOLD, INCREASED SIZE), Qty (BOLD, INCREASED SIZE), Price (BOLD, INCREASED), Total (BOLD, INCREASED) */}
              <table className="w-full my-1 border-collapse table-fixed" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="text-left text-black border-y border-black font-bold text-[13px] sm:text-[14px]">
                    <th className="py-1 font-bold w-[8%] text-left whitespace-nowrap">#</th>
                    <th className="py-1 pr-1 font-bold w-[44%] text-left break-words">பொருள்</th>
                    <th className="py-1 text-right font-bold w-[14%] whitespace-nowrap">Qty</th>
                    <th className="py-1 text-right font-bold w-[17%] whitespace-nowrap">Price</th>
                    <th className="py-1 text-right font-bold w-[17%] whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dotted divide-slate-300">
                  {items.map((item, idx) => {
                    const tamilName = getTamilItemName(item.itemName, item.itemNameTamil);
                    const displayName = tamilName || item.itemName;
                    return (
                      <tr key={idx} className="align-top">
                        <td className="py-1 font-mono text-black text-left text-[13px] sm:text-[14px] whitespace-nowrap align-top">{idx + 1}</td>
                        <td className="py-1 pr-1 text-black leading-snug break-words align-top">
                          <div className="font-black text-black font-sans text-[16px] sm:text-[17px] text-left break-words leading-tight">{displayName}</div>
                        </td>
                        <td className="py-1 text-right font-mono font-black text-black text-[15.5px] sm:text-[16.5px] whitespace-nowrap align-top">
                          {Number(item.quantity).toFixed(0)}
                        </td>
                        <td className="py-1 text-right font-mono text-black font-bold text-[14.5px] sm:text-[15.5px] whitespace-nowrap align-top">
                          {Number(item.unitPrice).toFixed(2)}
                        </td>
                        <td className="py-1 text-right font-mono font-black text-black text-[15.5px] sm:text-[16.5px] whitespace-nowrap align-top">
                          {Number(item.totalPrice).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* 4. Total Qty next to Item Total */}
              <div className="space-y-0.5 text-[13.5px] sm:text-[14.5px] my-1 pt-1 border-t border-slate-300">
                <div className="flex justify-between items-center text-black font-bold whitespace-nowrap">
                  <span className="whitespace-nowrap">Total Qty : <span className="font-mono font-black text-[15.5px] sm:text-[16.5px] whitespace-nowrap">{totalQty.toFixed(0)}</span></span>
                  <span className="whitespace-nowrap">Item Total : <span className="font-mono font-black text-[15.5px] sm:text-[16.5px] whitespace-nowrap">₹{Number(bill.subtotal).toFixed(2)}</span></span>
                </div>
                {bill.discount > 0 && (
                  <div className="flex justify-between items-center text-red-700 font-semibold text-[12.5px]">
                    <span>Discount :</span>
                    <span className="font-mono font-bold">-₹{Number(bill.discount).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* 5. Grand Total (BOLD & PROMINENT) and Footer Line */}
              <div className={`my-2 pt-2 border-t-2 border-black ${alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center'}`}>
                <div className="font-black text-[21px] sm:text-[23px] text-black tracking-wide py-0.5">
                  GRAND TOTAL: ₹{Number(bill.grandTotal).toFixed(2)}
                  <span className="sr-only">₹{bill.grandTotal}</span>
                </div>
                <div className="text-[12px] sm:text-[12.5px] font-bold text-black mt-1 tracking-wider">
                  {receiptFooter}
                  <span className="sr-only">Thank you</span>
                </div>
                <div className="border-b border-dashed border-black mt-1.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Modal Actions */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTroubleshoot(true)}
              className="text-xs text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1 py-1 px-2 rounded-md hover:bg-amber-50 transition-colors cursor-pointer"
              title="View hardware printer setup guide, paper alignment & kiosk instructions"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Setup &amp; Calibration Guide</span>
            </button>
            <label className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none hover:text-slate-900 bg-slate-50 px-2 py-1 rounded border border-slate-200">
              <input
                type="checkbox"
                id="checkbox-skip-preview-modal"
                defaultChecked={localStorage.getItem('pos_fast_rush_mode') === 'true' || Boolean(settings?.skipPrintPreview)}
                onChange={(e) => {
                  localStorage.setItem('pos_fast_rush_mode', String(e.target.checked));
                }}
                className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
              />
              <span className="text-[11px] font-medium">⚡ Skip preview next time</span>
            </label>
          </div>
          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="Copy receipt text to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancel (Esc)
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting || isPrintingLocal}
              className={`flex-1 sm:flex-none px-5 py-2 text-xs sm:text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                isReprint 
                  ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 shadow-amber-600/20' 
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/20'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>{(isPrinting || isPrintingLocal) ? 'Printing...' : (printButtonText || (isReprint ? 'Confirm & Print Reprint' : 'Print Receipt (F10)'))}</span>
            </button>
          </div>
        </div>

      </div>

      <PrinterTroubleshootModal
        isOpen={showTroubleshoot}
        onClose={() => setShowTroubleshoot(false)}
        settings={settings}
      />
    </div>
  );
};
