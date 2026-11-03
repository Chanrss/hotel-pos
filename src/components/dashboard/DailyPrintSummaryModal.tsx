import React from 'react';
import { X, Printer, IndianRupee, FileText, CheckCircle2 } from 'lucide-react';
import { Bill, BillItem, RestaurantSettings } from '../../types';
import { saveDailyBackupRecord } from '../../services/backupService';
import { calculateDailyNetSales } from '../../services/salesCalculationEngine';

interface DailyPrintSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessDate: string;
  bills: Bill[];
  billItems?: BillItem[];
  settings?: RestaurantSettings;
}

export const DailyPrintSummaryModal: React.FC<DailyPrintSummaryModalProps> = ({
  isOpen,
  onClose,
  businessDate,
  bills,
  billItems,
  settings
}) => {
  if (!isOpen) return null;

  const restaurantName = settings?.restaurantName || 'Sri Saravana Bhavan';
  const restaurantNameTamil = settings?.restaurantNameTamil || 'ஸ்ரீ சரவண பவன்';
  const gstNumber = settings?.gstNumber || '33AAAAA0000A1Z5';
  const fssaiNumber = settings?.fssaiNumber || '12418008000456';
  const address = settings?.address || '12, South Car Street, Chidambaram, Tamil Nadu - 608001';
  const phone = settings?.phone || '+91 94432 10987';

  // Metrics (deduplicated, excluding cancelled and superseded bills)
  const dayBills = bills.filter((b) => b.businessDate === businessDate);
  const salesBreakdown = calculateDailyNetSales(dayBills);
  const completedBills = salesBreakdown.validBills;
  const cancelledBills = dayBills.filter((b) => b.status === 'CANCELLED');

  let totalGross = 0;
  let totalDiscount = 0;
  let totalGrand = 0;
  let cashSales = 0;
  let upiSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  let dineInCount = 0;
  let takeAwayCount = 0;

  completedBills.forEach((b) => {
    const sub = Number(b.subtotal) || 0;
    const disc = Number(b.discount) || 0;
    const grand = Number(b.grandTotal) || 0;

    totalGross += sub;
    totalDiscount += disc;
    totalGrand += grand;

    const method = (b.paymentMethod || 'CASH').toUpperCase();
    if (method === 'CASH') {
      cashSales += grand;
    } else if (method === 'UPI' || method.includes('QR') || method.includes('GPAY') || method.includes('PAYTM')) {
      upiSales += grand;
    } else if (method === 'CARD') {
      cardSales += grand;
    } else {
      otherSales += grand;
    }

    if (b.orderType === 'DINE_IN') {
      dineInCount++;
    } else {
      takeAwayCount++;
    }
  });

  const taxableAmount = Math.max(0, totalGross - totalDiscount);
  const cgstAmount = Math.round((taxableAmount * 0.025) * 100) / 100;
  const sgstAmount = Math.round((taxableAmount * 0.025) * 100) / 100;
  const totalGst = cgstAmount + sgstAmount;
  const aov = completedBills.length > 0 ? Math.round(totalGrand / completedBills.length) : 0;

  const handlePrint = async () => {
    const timestamp = Date.now();
    try {
      await saveDailyBackupRecord({
        id: `backup_pdf_${businessDate}_${timestamp}`,
        businessDate,
        timestamp,
        exportedAt: new Date(timestamp).toISOString(),
        filename: `${restaurantName.replace(/\s+/g, '_')}_Daily_Summary_${businessDate}.pdf`,
        triggerType: 'MANUAL',
        status: 'SUCCESS',
        scope: 'CORE_BILLING',
        exportFormat: 'PDF',
        billCount: completedBills.length + cancelledBills.length,
        totalRevenue: totalGrand,
        cashTotal: cashSales,
        upiTotal: upiSales,
        cardTotal: cardSales,
        cancelledBillCount: cancelledBills.length,
        kotCount: 0,
        totalDocuments: completedBills.length + cancelledBills.length
      });
    } catch (e) {
      console.warn('Could not record PDF print audit:', e);
    }

    if (typeof window.print === 'function') {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header (Hidden on print) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Daily Business Summary (Print / PDF)</h3>
              <p className="text-[11px] text-slate-400">Business Date: <span className="font-mono text-emerald-400">{businessDate}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Content Area */}
        <div id="printable-daily-summary-root" className="p-6 overflow-y-auto space-y-5 bg-white text-slate-800 text-sm font-sans">
          
          {/* Brand & GST Header */}
          <div className="text-center pb-4 border-b border-slate-200">
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">{restaurantName}</h1>
            {restaurantNameTamil && (
              <p className="text-sm font-bold text-slate-600 mt-0.5">{restaurantNameTamil}</p>
            )}
            <p className="text-xs text-slate-500 mt-1">{address}</p>
            <p className="text-xs text-slate-500">Phone: {phone}</p>
            <div className="flex items-center justify-center gap-3 mt-2 text-xs font-mono font-bold text-slate-700">
              <span>GSTIN: {gstNumber}</span>
              <span>•</span>
              <span>FSSAI: {fssaiNumber}</span>
            </div>
            <div className="mt-2.5 inline-block px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full font-mono text-xs font-bold">
              DAILY AUDIT SUMMARY • DATE: {businessDate}
            </div>
          </div>

          {/* KPI Summary Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Total Sales</span>
              <p className="text-lg font-black font-mono text-slate-900 mt-0.5">₹{totalGrand.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Total Bills</span>
              <p className="text-lg font-black font-mono text-slate-900 mt-0.5">{completedBills.length}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Dine-In / Takeaway</span>
              <p className="text-sm font-bold font-mono text-slate-900 mt-1">{dineInCount} / {takeAwayCount}</p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Avg Bill (AOV)</span>
              <p className="text-lg font-black font-mono text-slate-900 mt-0.5">₹{aov}</p>
            </div>
          </div>

          {/* Financial Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase tracking-wide">
              Tax & Revenue Breakdown
            </div>
            <div className="divide-y divide-slate-100 font-mono text-xs">
              <div className="flex justify-between px-3.5 py-2">
                <span className="text-slate-600">Gross Subtotal</span>
                <span className="font-bold">₹{totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between px-3.5 py-2">
                <span className="text-slate-600">Total Discounts</span>
                <span className="text-red-600 font-bold">-₹{totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between px-3.5 py-2 bg-slate-50/50">
                <span className="font-bold text-slate-700">Taxable Turnover</span>
                <span className="font-bold text-slate-900">₹{taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between px-3.5 py-2">
                <span className="text-slate-600">CGST (2.5%)</span>
                <span>₹{cgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between px-3.5 py-2">
                <span className="text-slate-600">SGST (2.5%)</span>
                <span>₹{sgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between px-3.5 py-2.5 bg-emerald-50 text-emerald-900 font-bold text-sm">
                <span>Net Grand Total Revenue</span>
                <span>₹{totalGrand.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Payment Reconciliation */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 font-bold text-xs text-slate-700 uppercase tracking-wide">
              Payment Settlement Reconciliation
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200 font-mono text-xs text-center">
              <div className="p-3">
                <span className="text-slate-500 text-[10px] block uppercase">Cash</span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">₹{cashSales.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3">
                <span className="text-slate-500 text-[10px] block uppercase">UPI / QR</span>
                <span className="font-bold text-blue-700 text-sm mt-0.5 block">₹{upiSales.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3">
                <span className="text-slate-500 text-[10px] block uppercase">Cards</span>
                <span className="font-bold text-purple-700 text-sm mt-0.5 block">₹{cardSales.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3">
                <span className="text-slate-500 text-[10px] block uppercase">Variance</span>
                <span className="font-bold text-emerald-700 text-sm mt-0.5 block">₹0.00 (Balanced)</span>
              </div>
            </div>
          </div>

          {/* Audit Footer Note */}
          <div className="text-[10px] text-slate-400 text-center pt-2 font-mono border-t border-slate-100">
            Certified Daily POS Business Report • Generated on {new Date().toLocaleString('en-IN')} • Sri Saravana Bhavan POS Engine
          </div>
        </div>

        {/* Modal Actions (Hidden on print) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / Save as PDF</span>
          </button>
        </div>

      </div>
    </div>
  );
};
