import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { Printer, X, Check, Copy, AlertCircle, ExternalLink, HelpCircle, Download } from 'lucide-react';
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
import { ReceiptTemplate } from './ReceiptTemplate';

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
  const isSandboxed = typeof window !== 'undefined' && window.self !== window.top;

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
        const isSandboxedCurrent = typeof window !== 'undefined' && window.self !== window.top;
        if (isSandboxedCurrent && typeof PrinterService.openPrintableReceipt === 'function') {
          const htmlReceipt = PrinterService.generateThermalReceiptHTML(bill, items, effectiveSettings);
          const opened = PrinterService.openPrintableReceipt(htmlReceipt);
          if (!opened) {
            await PrintService.printReceipt({
              bill,
              items,
              settings: effectiveSettings,
              forcePrint: true
            });
          }
        } else {
          await PrintService.printReceipt({
            bill,
            items,
            settings: effectiveSettings,
            forcePrint: true
          });
        }
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
      'SL Item                    Qty   Rate    Tot',
      ...items.map((item, idx) => {
        const tamilName = getTamilItemName(item.itemName, item.itemNameTamil);
        const displayName = tamilName || item.itemName;
        const name = `${idx + 1}.${displayName}`.padEnd(24).slice(0, 24);
        const qty = Number(item.quantity).toFixed(2).padStart(6);
        const rate = Number(item.unitPrice).toFixed(2).padStart(7);
        const tot = Number(item.totalPrice).toFixed(2).padStart(7);
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

  const handleDownloadPrintFile = () => {
    const effectiveSettings: RestaurantSettings = {
      ...(settings || {}),
      receiptLogoMaxWidth: logoMaxWidth,
      receiptLogoMaxHeight: logoMaxHeight,
      logoDisplay: activeLogoDisplay
    };
    const htmlReceipt = PrinterService.generateThermalReceiptHTML(bill, items, effectiveSettings);
    PrinterService.downloadPrintableReceiptFile(htmlReceipt, `receipt-BN-${cleanBillNo}.html`);
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
              isActive={Boolean(isPrinting || isPrintingLocal)}
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
        <div className={`px-3.5 py-1.5 border-b text-xs flex items-center justify-between gap-2 shrink-0 ${
          PrinterConnectionService.isDirectHardwareReady()
            ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
            : connectedPrinter.interfaceType === 'SYSTEM_SPOOLER'
            ? 'bg-sky-50/90 border-sky-200 text-sky-900'
            : 'bg-amber-50/90 border-amber-200 text-amber-900'
        }`}>
          <div className="flex items-center gap-2 flex-1 truncate">
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              PrinterConnectionService.isDirectHardwareReady()
                ? 'bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]'
                : connectedPrinter.interfaceType === 'SYSTEM_SPOOLER'
                ? 'bg-sky-500'
                : 'bg-amber-500 animate-pulse'
            }`} />
            <span className="text-[11px] truncate">
              {PrinterConnectionService.isDirectHardwareReady() ? (
                <>Printer: <strong>{connectedPrinter.deviceName || 'Thermal Printer'}</strong> (Direct Hardware ESC/POS)</>
              ) : connectedPrinter.interfaceType === 'SYSTEM_SPOOLER' ? (
                <>Printer: <strong>System Thermal Spooler</strong> (Browser / OS Default)</>
              ) : (
                <>Printer: <strong>No Hardware Paired</strong> (Click Hardware Setup)</>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowTroubleshoot(true)}
            className="px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0 underline hover:opacity-80"
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
              className="shadow-md border border-slate-300 bg-white"
              style={{
                width: is58mm ? '58mm' : '76mm',
                maxWidth: is58mm ? '58mm' : '76mm',
                boxSizing: 'border-box',
                overflowX: 'hidden'
              }}
            >
              <ReceiptTemplate
                bill={bill}
                items={items}
                settings={{
                  ...settings,
                  receiptLogoMaxWidth: logoMaxWidth,
                  receiptLogoMaxHeight: logoMaxHeight,
                  logoDisplay: activeLogoDisplay
                }}
                isReprint={isReprint}
              />
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
              onClick={handleDownloadPrintFile}
              className="px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              title="Download standalone receipt file to trigger your computer's thermal printer directly"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden xs:inline">Download (.html)</span>
              <span className="xs:hidden">HTML</span>
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
              <span>
                {isPrinting || isPrintingLocal
                  ? 'Printing...'
                  : printButtonText ||
                    (isReprint
                      ? 'Confirm & Print Reprint'
                      : isSandboxed
                      ? 'Print Receipt (New Window)'
                      : 'Print Receipt (F10)')}
              </span>
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
