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

  const createdDate = new Date(kot.createdAt);
  const dateFormatted = createdDate.toLocaleDateString('en-GB');
  const timeFormatted = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh] border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-850 text-white border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-slate-100">Kitchen Ticket Preview</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 80mm KOT Slip Preview Container */}
        <div className="p-4 overflow-y-auto bg-slate-950 flex justify-center flex-1">
          <div 
            className="w-[270px] bg-white p-4 shadow-xl border border-slate-300 font-mono text-[11.5px] leading-tight text-black select-text"
          >
            {/* KOT Title Header */}
            <div className="text-center font-black text-sm border-2 border-black p-1.5 mb-2 uppercase tracking-wider">
              KITCHEN ORDER TICKET
            </div>

            <div className="flex justify-between text-[11px] font-bold">
              <span>{kot.kotNumber}</span>
              <span>{timeFormatted}</span>
            </div>

            <div className="flex justify-between text-[11px] font-bold mt-0.5">
              <span>Table: {kot.tableNumber || 'Take Away'}</span>
              <span>{dateFormatted}</span>
            </div>

            <div className="flex justify-between text-[10px] text-slate-700 mt-0.5">
              <span>Type: {kot.orderType === 'DINE_IN' ? 'DINE IN' : 'TAKE AWAY'}</span>
              <span>Waiter: {kot.waiterName || 'Staff'}</span>
            </div>

            <div className="border-t border-dashed border-black my-2"></div>

            {/* Items Table */}
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-dashed border-black">
                  <th className="pb-1 font-bold">Item Name</th>
                  <th className="pb-1 text-right font-bold">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-slate-300">
                {items.map((item, idx) => (
                  <React.Fragment key={idx}>
                    <tr>
                      <td className="py-1.5 font-bold">{idx + 1}. {item.itemName}</td>
                      <td className="py-1.5 text-right font-black text-xs">× {item.quantity}</td>
                    </tr>
                    {item.notes && (
                      <tr>
                        <td colSpan={2} className="pb-1.5 text-[10px] italic text-slate-800 pl-3">
                          Note: {item.notes}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-black my-2"></div>

            <div className="text-center font-bold text-[10px] uppercase">
              Status: {kot.status}
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
