import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  X, 
  ExternalLink, 
  CheckCircle2, 
  Sliders, 
  RefreshCw,
  Info,
  Check,
  Activity,
  Usb,
  Zap,
  AlertCircle
} from 'lucide-react';
import { RestaurantSettings } from '../../types';
import { PrinterService } from '../../services/printerService';
import { PrinterStatusService, PrinterHealthCheck } from '../../services/printerStatusService';
import { PrinterConnectionService } from '../../services/printerConnectionService';

interface PrinterTroubleshootModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: RestaurantSettings;
  onNavigateSettings?: () => void;
}

export const PrinterTroubleshootModal: React.FC<PrinterTroubleshootModalProps> = ({
  isOpen,
  onClose,
  settings,
  onNavigateSettings
}) => {
  const [healthCheck, setHealthCheck] = useState<PrinterHealthCheck>(() => 
    PrinterStatusService.getHealthCheck(settings)
  );
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsubStatus = PrinterStatusService.subscribe((check) => {
      setHealthCheck((prev) => {
        if (
          prev.status === check.status &&
          prev.isReady === check.isReady &&
          prev.label === check.label &&
          prev.connectedInfo?.connected === check.connectedInfo?.connected
        ) {
          return prev;
        }
        return check;
      });
    });
    return () => {
      unsubStatus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isSandboxed = typeof window !== 'undefined' && window.self !== window.top;
  const paperWidth = settings?.paperWidth || '80mm';

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = PrinterService.printDiagnosticTestPage(settings, true);
      if (res.success) {
        PrinterConnectionService.markVerified();
        setTestResult({
          success: true,
          message: 'Test slip dispatched! Your thermal printer should feed out the test slip now.'
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Print request was restricted by the browser frame. Open in full window below.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Failed to dispatch test print.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleOpenNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        id="printer-troubleshoot-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-slate-900"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold leading-tight">Thermal Printer</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 ${
                  healthCheck.status === 'READY' || healthCheck.status === 'CONNECTED'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : healthCheck.status === 'NOT_CONNECTED'
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    : healthCheck.status === 'MOCK'
                    ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    healthCheck.status === 'READY' || healthCheck.status === 'CONNECTED'
                      ? 'bg-emerald-400'
                      : healthCheck.status === 'NOT_CONNECTED'
                      ? 'bg-amber-400'
                      : 'bg-rose-400 animate-pulse'
                  }`} />
                  {healthCheck.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                80mm / 58mm POS Receipt Printer (USB &amp; System)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Live Connection Telemetry Card */}
          <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Software ↔ Printer Link Status</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                healthCheck.status === 'OFFLINE'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : healthCheck.status === 'NOT_CONNECTED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : healthCheck.status === 'MOCK'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {healthCheck.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800/80">
                <div className="text-slate-400">Connection Interface</div>
                <div className="font-bold text-slate-200 mt-0.5 flex items-center gap-1.5">
                  <Usb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="truncate">USB / System Spooler</span>
                </div>
              </div>

              <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800/80">
                <div className="text-slate-400">Paper Width Roll</div>
                <div className="font-bold text-slate-200 mt-0.5 flex items-center gap-1.5">
                  <span className="truncate">{paperWidth} ({paperWidth === '80mm' ? '3-Inch' : '2-Inch'})</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
              <span className="truncate">{healthCheck.summary}</span>
            </div>
          </div>

          {/* Iframe Notice if sandboxed */}
          {isSandboxed && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold">Preview Environment Detected</div>
                <div className="mt-0.5 text-amber-800">
                  Browser preview frames restrict direct printer hardware. Open POS in a full window to connect directly to your thermal printer.
                </div>
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in New Tab for Direct Printing
                </button>
              </div>
            </div>
          )}

          {/* Test Print Section */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Test</div>
                <div className="text-sm font-black text-slate-800">Print Diagnostic Slip</div>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                {paperWidth} Paper
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Click below to send a test receipt to your thermal printer. Verify that the paper rolls out and the alignment is crisp.
            </p>

            <button
              type="button"
              id="modal-test-print-btn"
              onClick={handleTestPrint}
              disabled={isTesting}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sending to Printer...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>🖨️ Print Test Receipt Now</span>
                </>
              )}
            </button>

            {testResult && (
              <div className={`p-3 rounded-lg text-xs border flex items-start gap-2 ${
                testResult.success 
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold">{testResult.success ? 'Success: ' : 'Notice: '}</span>
                  {testResult.message}
                </div>
              </div>
            )}
          </div>

          {/* Simple 3-Step Guide */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Simple 3-Step Setup
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-black flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <div className="font-bold text-slate-800">Plug Printer into Computer</div>
                  <div className="text-slate-600 mt-0.5">
                    Connect your thermal printer (USB cable) to your PC and switch it ON with the 80mm paper roll inside.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-black flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <div className="font-bold text-slate-800">Select Printer Destination in Chrome</div>
                  <div className="text-slate-600 mt-0.5">
                    When the print window opens, select your thermal printer (e.g. <em>Rugtek RP326B</em>, <em>POS-80</em>, <em>TVS RP-3200</em>, <em>Epson TM-T82</em>) under <strong>Destination</strong>.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-black flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <div className="font-bold text-slate-800">Set Margins to None</div>
                  <div className="text-slate-600 mt-0.5">
                    Under More Settings, set <strong>Margins: None</strong> and uncheck <strong>Headers and footers</strong>. Chrome remembers this automatically for all future bills!
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          {onNavigateSettings ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onNavigateSettings();
              }}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>Full Receipt Settings</span>
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
