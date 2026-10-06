import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, CheckCircle2, Scissors, Zap, X } from 'lucide-react';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { getTamilItemName } from '../../services/tamilTranslation';

interface PrintEventDetail {
  bill?: Bill;
  items?: BillItem[];
  settings?: RestaurantSettings;
}

export interface PrintingReceiptAnimationProps {
  bill?: Bill | null;
  items?: BillItem[];
  settings?: RestaurantSettings;
  isActive?: boolean;
  onComplete?: () => void;
  mode?: 'modal-overlay' | 'toast-widget' | 'inline-header';
  autoDismissMs?: number;
}

export const PrintingReceiptAnimation: React.FC<PrintingReceiptAnimationProps> = ({
  bill: initialBill,
  items: initialItems,
  settings: initialSettings,
  isActive: externalIsActive,
  onComplete,
  mode = 'toast-widget',
  autoDismissMs = 2800
}) => {
  const [activeJob, setActiveJob] = useState<{
    bill: Bill | null;
    items: BillItem[];
    settings?: RestaurantSettings;
  } | null>(initialBill ? { bill: initialBill, items: initialItems || [], settings: initialSettings } : null);

  const [printStage, setPrintStage] = useState<'feeding' | 'cutting' | 'completed'>('feeding');
  const [progress, setProgress] = useState(0);

  // Sync with external isActive if provided
  useEffect(() => {
    if (externalIsActive !== undefined) {
      if (externalIsActive && initialBill) {
        setActiveJob({
          bill: initialBill,
          items: initialItems || [],
          settings: initialSettings
        });
        setPrintStage('feeding');
        setProgress(0);
      } else if (!externalIsActive) {
        setActiveJob(null);
      }
    }
  }, [externalIsActive, initialBill, initialItems, initialSettings]);

  // Global print event listener (only when mode is toast-widget)
  useEffect(() => {
    if (mode !== 'toast-widget') return;

    const handlePrintStart = (e: CustomEvent<PrintEventDetail>) => {
      const { bill, items, settings } = e.detail || {};
      if (bill) {
        setActiveJob({
          bill,
          items: items || [],
          settings
        });
        setPrintStage('feeding');
        setProgress(0);
      }
    };

    window.addEventListener('pos-bill-printing' as any, handlePrintStart);
    return () => {
      window.removeEventListener('pos-bill-printing' as any, handlePrintStart);
    };
  }, [mode]);

  // Animation sequence driver
  useEffect(() => {
    if (!activeJob) return;

    setPrintStage('feeding');
    setProgress(15);

    const p1 = setTimeout(() => setProgress(50), 300);
    const p2 = setTimeout(() => setProgress(85), 700);
    const p3 = setTimeout(() => setProgress(100), 1200);

    // Transition to cutting stage
    const cutTimer = setTimeout(() => {
      setPrintStage('cutting');
    }, 1500);

    // Transition to completed stage
    const completeTimer = setTimeout(() => {
      setPrintStage('completed');
    }, 2000);

    // Auto dismiss
    const dismissTimer = setTimeout(() => {
      setActiveJob(null);
      if (onComplete) onComplete();
    }, autoDismissMs);

    return () => {
      clearTimeout(p1);
      clearTimeout(p2);
      clearTimeout(p3);
      clearTimeout(cutTimer);
      clearTimeout(completeTimer);
      clearTimeout(dismissTimer);
    };
  }, [activeJob?.bill?.id, activeJob?.bill?.billNumber, autoDismissMs, onComplete]);

  if (!activeJob || !activeJob.bill) return null;

  const currentBill = activeJob.bill;
  const currentItems = activeJob.items || [];
  const currentSettings = activeJob.settings;

  const hotelNameTamil = currentSettings?.restaurantNameTamil?.trim() || 'ஸ்ரீ சரவண பவன்';
  const billNumber = (currentBill.billNumber || '1').replace(/^BN-|^#/, '');
  const grandTotal = Number(currentBill.grandTotal || 0).toFixed(2);
  const totalQty = currentItems.reduce((acc, itm) => acc + (itm.quantity || 1), 0);
  const is58mm = currentSettings?.paperWidth === '58mm' || currentSettings?.printerType === 'THERMAL_58MM';

  // Mode 1: Modal Full Overlay Animation (Inside Receipt Modal)
  if (mode === 'modal-overlay') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-40 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 select-none"
      >
        <motion.div
          initial={{ scale: 0.9, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col items-center"
        >
          {/* Thermal Printer Head Hardware Chassis */}
          <div className="w-full bg-linear-to-b from-slate-800 to-slate-900 border-b border-slate-700 p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Printer className="w-5 h-5 text-amber-400" />
                <motion.span
                  animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/50"
                />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Thermal Receipt Printer</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {is58mm ? '58mm' : '80mm'}
                  </span>
                </div>
                <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{printStage === 'feeding' ? 'Feeding & Printing...' : printStage === 'cutting' ? 'Auto-Cutting Paper...' : 'Printed & Ready'}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="font-mono text-xs font-bold text-amber-300">
                #{billNumber}
              </span>
              <div className="text-[10px] text-slate-400 font-mono">₹{grandTotal}</div>
            </div>
          </div>

          {/* Paper Exit Slot (Dark Bevel) */}
          <div className="w-full bg-slate-950 py-1 px-6 flex justify-center relative shadow-inner">
            <div className="w-48 h-1.5 bg-black/80 rounded-full border border-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)]" />
            
            {/* Animated Laser / Thermal Head Sweep Line */}
            {printStage === 'feeding' && (
              <motion.div
                animate={{ x: [-80, 80, -80] }}
                transition={{ repeat: Infinity, duration: 0.7, ease: 'easeInOut' }}
                className="absolute top-1 w-12 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_rgba(52,211,153,0.9)]"
              />
            )}
          </div>

          {/* Paper Extrusion Simulation */}
          <div className="w-full bg-slate-950/40 p-4 flex flex-col items-center justify-center min-h-[190px] overflow-hidden relative">
            
            {/* Paper Strip Rolling Out */}
            <motion.div
              initial={{ y: -70, opacity: 0.2 }}
              animate={{ 
                y: printStage === 'completed' ? 0 : [0, -1, 1, 0],
                opacity: 1
              }}
              transition={{
                y: printStage === 'feeding' ? { repeat: Infinity, duration: 0.15 } : { duration: 0.4 }
              }}
              className="w-56 bg-white rounded-b-md shadow-2xl p-3 text-black font-mono text-[10px] border border-slate-300 select-none relative overflow-hidden"
            >
              {/* Paper Feed Edge Marker */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 border-b border-dashed border-slate-300" />

              {/* Cutter blade flash */}
              {printStage === 'cutting' && (
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 0.45, ease: 'easeInOut' }}
                  className="absolute top-0 left-0 right-0 h-1 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,1)] z-20 flex items-center justify-end pr-2"
                >
                  <Scissors className="w-3.5 h-3.5 text-amber-950 -mt-2" />
                </motion.div>
              )}

              {/* Mini Receipt Print Feed Header */}
              <div className="text-center pb-1 mb-1 border-b border-dashed border-black">
                <div className="font-extrabold text-xs font-sans text-black leading-tight">
                  {hotelNameTamil}
                </div>
                <div className="text-[8.5px] text-slate-700">Thermal Receipt Slip</div>
              </div>

              <div className="flex justify-between font-bold text-[9px] text-black">
                <span>Bill No: BN-{billNumber}</span>
                <span>Time: {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </div>
              <div className="flex justify-between font-bold text-[8.5px] text-slate-700">
                <span>Order: {currentBill?.orderType === 'TAKE_AWAY' ? 'Takeaway' : 'Dine-In'}</span>
                <span>Captain: {currentBill?.waiterCode || currentBill?.captainCode || '01'}</span>
              </div>

              {/* Items Feed Animation */}
              <div className="my-1.5 space-y-1 border-t border-b border-slate-200 py-1">
                {currentItems.slice(0, 3).map((itm, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + idx * 0.18 }}
                    className="flex justify-between items-center text-[9px]"
                  >
                    <span className="font-bold truncate max-w-[130px]">
                      {getTamilItemName(itm.itemName, itm.itemNameTamil) || itm.itemName}
                    </span>
                    <span className="font-bold">×{itm.quantity}</span>
                  </motion.div>
                ))}
                {currentItems.length > 3 && (
                  <div className="text-[8px] text-slate-500 italic text-center">
                    +{currentItems.length - 3} more items...
                  </div>
                )}
              </div>

              {/* Total Qty & Grand Total */}
              <div className="pt-0.5">
                <div className="flex justify-between items-center text-[9px] font-bold">
                  <span>Total Qty: {totalQty}</span>
                  <span>TOTAL: ₹{grandTotal}</span>
                </div>
                <div className="font-black text-center text-[10px] mt-1 text-black bg-slate-100 py-0.5 rounded">
                  *** THANK YOU ***
                </div>
              </div>

              {/* Serrated Bottom Edge */}
              <div className="absolute bottom-0 left-0 right-0 h-1 flex justify-between overflow-hidden opacity-30">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 bg-slate-950 transform rotate-45 -mb-1" />
                ))}
              </div>
            </motion.div>

          </div>

          {/* Progress Bar & Status Footer */}
          <div className="w-full bg-slate-900 border-t border-slate-800 p-3">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
              <motion.div
                className={`h-full ${printStage === 'completed' ? 'bg-emerald-500' : 'bg-amber-400'}`}
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut', duration: 0.3 }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-1.5">
                {printStage === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full"
                  />
                )}
                <span className="font-semibold text-xs">
                  {printStage === 'feeding' && 'Printing bill onto thermal paper...'}
                  {printStage === 'cutting' && 'Executing auto-paper cut...'}
                  {printStage === 'completed' && 'Thermal bill printed successfully!'}
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{progress}%</span>
            </div>
          </div>

        </motion.div>
      </motion.div>
    );
  }

  // Mode 2: Global Floating Toast Notification Animation (For Direct Billing & Table Order Printing)
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        className="fixed bottom-16 right-4 sm:bottom-6 sm:right-6 z-50 w-80 sm:w-88 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden font-sans text-white select-none pointer-events-auto"
      >
        {/* Hardware Header Bar */}
        <div className="bg-linear-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Printer className="w-4 h-4" />
              <motion.span 
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-emerald-500"
              />
            </div>
            <div>
              <div className="font-bold text-xs leading-none text-white flex items-center gap-1.5">
                <span>Printing Receipt</span>
                <span className="font-mono text-[10px] bg-slate-800 text-amber-300 px-1 py-0.2 rounded border border-slate-700">
                  BN-{billNumber}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                {is58mm ? '58mm Thermal' : '80mm Thermal'} • ₹{grandTotal}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveJob(null)}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Paper Ejection Animation Slot */}
        <div className="bg-slate-950 p-3 relative overflow-hidden flex flex-col items-center">
          
          {/* Printer Output Slot */}
          <div className="w-40 h-1 bg-black rounded-full border border-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)] mb-1" />

          {/* Animated Thermal Sweep Bar */}
          {printStage === 'feeding' && (
            <motion.div
              animate={{ x: [-60, 60, -60] }}
              transition={{ repeat: Infinity, duration: 0.6, ease: 'easeInOut' }}
              className="absolute top-3 w-16 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_rgba(52,211,153,1)]"
            />
          )}

          {/* Physical Receipt Slip Feed */}
          <motion.div
            initial={{ y: -35, opacity: 0.4 }}
            animate={{ 
              y: 0, 
              opacity: 1 
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 220 }}
            className="w-52 bg-white text-black font-mono text-[9px] p-2.5 rounded-b-md shadow-xl border border-slate-300 relative overflow-hidden"
          >
            {/* Cut line flash */}
            {printStage === 'cutting' && (
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.35 }}
                className="absolute top-0 left-0 right-0 h-1 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,1)] z-10"
              />
            )}

            <div className="text-center font-extrabold text-[10px] font-sans leading-tight text-black pb-1 border-b border-black">
              {hotelNameTamil}
            </div>

            <div className="flex justify-between py-1 text-[8.5px] border-b border-dotted border-slate-300 font-bold">
              <span>BN-{billNumber}</span>
              <span>Qty: {totalQty}</span>
              <span>₹{grandTotal}</span>
            </div>

            <div className="text-[8px] text-center text-slate-600 pt-0.5 font-bold">
              {printStage === 'completed' ? '✓ PAPER CUT READY' : 'FEEDING THERMAL ROLL...'}
            </div>
          </motion.div>
        </div>

        {/* Bottom Status Feed */}
        <div className="px-3.5 py-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            {printStage === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />
            )}
            <span className="text-[11px] font-medium text-slate-300">
              {printStage === 'feeding' && 'Printing bill slip...'}
              {printStage === 'cutting' && 'Cutting receipt paper...'}
              {printStage === 'completed' && 'Print completed!'}
            </span>
          </div>

          <span className="text-[10px] font-mono text-emerald-400 font-bold">
            {printStage === 'completed' ? '100%' : `${progress}%`}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
