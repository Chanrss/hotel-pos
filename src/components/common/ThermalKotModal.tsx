import React, { useState } from 'react';
import { Printer, X, ChefHat, Radio, CheckCircle2 } from 'lucide-react';
import { Kot, KotItem, RestaurantSettings } from '../../types';
import { PrintService } from '../../services/PrintService';
import { RemotePrintQueueService } from '../../services/remotePrintQueueService';

interface ThermalKotModalProps {
  kot: Kot | null;
  items: KotItem[];
  settings?: RestaurantSettings;
  isOpen: boolean;
  onClose: () => void;
}

export const ThermalKotModal: React.FC<ThermalKotModalProps> = ({
  kot,
  items,
  settings,
  isOpen,
  onClose
}) => {
  const [remoteStatus, setRemoteStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  if (!isOpen || !kot) return null;

  const handlePrint = () => {
    void PrintService.printKot(kot, items, settings);
  };

  const handlePrintAtCounter = async () => {
    setRemoteStatus('sending');
    const res = await RemotePrintQueueService.queueRemoteKotPrint(kot, items, {
      settings,
      tableNumber: kot.tableNumber
    });
    if (res.success) {
      setRemoteStatus('sent');
      setTimeout(() => setRemoteStatus('idle'), 4000);
    } else {
      setRemoteStatus('idle');
    }
  };

  const rawKotNo = String(kot.kotNumber || '1').trim();
  const kotDisplay = rawKotNo.toUpperCase().startsWith('KOT') ? rawKotNo : `KOT-${rawKotNo}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh] border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-850 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-slate-100">3-Inch Compact KOT Preview</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ultra-Compact 3-Inch (72mm printable) KOT Slip Preview Container */}
        <div className="p-3 overflow-y-auto bg-slate-950 flex justify-center items-start">
          <div
            className="w-[250px] h-auto bg-white px-2 py-1 shadow-xl border border-slate-300 font-mono text-[11px] font-bold leading-[1.08] text-black select-text"
          >
            {/* KOT Number at Top */}
            <div className="font-extrabold text-[12px] leading-[1.08] whitespace-nowrap">
              KOT: {kotDisplay}
            </div>

            {/* Short Separator Line */}
            <div className="text-[10px] leading-none my-[1px] whitespace-nowrap">
              ------------------------
            </div>

            {/* Fixed-Width 2-Column Table: QTY and ITEM */}
            <table className="w-full table-fixed border-collapse text-left text-[11px] font-bold leading-[1.08]">
              <thead>
                <tr>
                  <th className="w-[16%] py-[0.5px] pr-1 align-top font-extrabold whitespace-nowrap">QTY</th>
                  <th className="w-[84%] py-[0.5px] align-top font-extrabold">ITEM</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="w-[16%] py-[0.5px] pr-1 align-top font-bold whitespace-nowrap">
                      {item.quantity}
                    </td>
                    <td className="w-[84%] py-[0.5px] align-top font-bold break-words whitespace-normal">
                      {item.itemName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Short Separator Line */}
            <div className="text-[10px] leading-none mt-[1px] whitespace-nowrap">
              ------------------------
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row justify-between gap-2">
          <button
            onClick={onClose}
            className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
          
          <button
            onClick={handlePrintAtCounter}
            disabled={remoteStatus !== 'idle'}
            className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-75 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            title="Trigger automatic print on Primary Counter Terminal via Firestore queue"
          >
            {remoteStatus === 'sent' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                <span>Sent to Counter!</span>
              </>
            ) : remoteStatus === 'sending' ? (
              <>
                <Radio className="w-3.5 h-3.5 animate-spin" />
                <span>Queueing...</span>
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5 text-emerald-200" />
                <span>Print at Counter POS</span>
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            className="py-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Local</span>
          </button>
        </div>

      </div>
    </div>
  );
};
