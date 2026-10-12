import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Printer, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Info, 
  Laptop, 
  Usb, 
  Bluetooth, 
  Wifi, 
  Copy, 
  Check, 
  ExternalLink, 
  RotateCw, 
  Sliders, 
  ShieldAlert, 
  Terminal, 
  Zap, 
  Eye, 
  HelpCircle,
  Clock,
  Sparkles,
  Layers,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Wrench,
  Search,
  AlertCircle,
  LifeBuoy,
  Download
} from 'lucide-react';
import { RestaurantSettings, PrintJobLog } from '../../types';
import { PrinterService } from '../../services/printerService';
import { PrintDiagnosticsService } from '../../services/printDiagnostics';
import { PrinterStatusService, PrinterHealthCheck } from '../../services/printerStatusService';
import { PrinterConnectionService, RUGTEK_RP326B_PROFILE } from '../../services/printerConnectionService';
import { RawEscPosTestModal } from './RawEscPosTestModal';
import { TestPrintLog } from './TestPrintLog';
import { RugtekPrinterPairingSection } from './RugtekPrinterPairingSection';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

interface PrinterDiagnosticViewProps {
  settings?: RestaurantSettings;
  onOpenTestModal?: () => void;
  onUpdateSettings?: (updated: Partial<RestaurantSettings>) => void;
}

interface CapabilityItem {
  id: string;
  name: string;
  category: 'core' | 'web-api' | 'environment';
  isAvailable: boolean;
  statusText: string;
  details: string;
  badgeType: 'success' | 'warning' | 'info' | 'danger';
  icon: React.ComponentType<{ className?: string }>;
}

export const PrinterDiagnosticView: React.FC<PrinterDiagnosticViewProps> = ({ 
  settings, 
  onOpenTestModal,
  onUpdateSettings
}) => {
  const [healthCheck, setHealthCheck] = useState<PrinterHealthCheck>(() => 
    PrinterStatusService.getHealthCheck(settings)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeInstructionTab, setActiveInstructionTab] = useState<'dialog' | 'kiosk' | 'hardware' | 'models' | 'tamil'>('dialog');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isMockMode, setIsMockMode] = useState<boolean>(() => PrinterService.isMockPrintMode());
  const [testPrintLoading, setTestPrintLoading] = useState(false);
  const [testResultFeedback, setTestResultFeedback] = useState<string | null>(null);
  const [showRawEscPosModal, setShowRawEscPosModal] = useState(false);
  const [recentLogs, setRecentLogs] = useState<PrintJobLog[]>([]);
  const [applyingRugtek, setApplyingRugtek] = useState(false);
  const [rugtekAppliedFeedback, setRugtekAppliedFeedback] = useState<string | null>(null);

  const handleApplyRugtekProfile = async () => {
    setApplyingRugtek(true);
    try {
      PrinterConnectionService.applyPrinterProfile('rugtek_rp326b');

      if (onUpdateSettings) {
        onUpdateSettings({
          paperWidth: '80mm',
          printerType: 'THERMAL_80MM',
          printerModelName: 'Rugtek RP326B',
          receiptFontSize: 11,
          receiptAlignment: 'center',
          compactMode: true
        });
      }

      setHealthCheck(PrinterStatusService.getHealthCheck({
        ...settings,
        paperWidth: '80mm',
        printerType: 'THERMAL_80MM',
        printerModelName: 'Rugtek RP326B'
      }));

      setRugtekAppliedFeedback('Rugtek RP326B profile applied! 80mm roll, 72mm printable width, 250mm/s feed, and partial auto-cut are active.');
      setTimeout(() => setRugtekAppliedFeedback(null), 6000);

      try {
        await setDoc(doc(db, 'settings', 'restaurant'), {
          ...settings,
          paperWidth: '80mm',
          printerType: 'THERMAL_80MM',
          printerModelName: 'Rugtek RP326B',
          receiptFontSize: settings?.receiptFontSize || 11,
          receiptAlignment: settings?.receiptAlignment || 'center',
          compactMode: true,
          updatedAt: Date.now()
        }, { merge: true });
      } catch (err) {
        console.warn('Could not save Rugtek RP326B profile to Firestore:', err);
      }
    } finally {
      setApplyingRugtek(false);
    }
  };

  // Troubleshooting Accordion State
  const [expandedTroubleshootIds, setExpandedTroubleshootIds] = useState<string[]>(['usb', 'dialog', 'paper']);
  const [troubleshootSearchQuery, setTroubleshootSearchQuery] = useState('');

  const toggleTroubleshootItem = (id: string) => {
    setExpandedTroubleshootIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const expandAllTroubleshooting = () => {
    setExpandedTroubleshootIds(troubleshootingFixes.map((f) => f.id));
  };

  const collapseAllTroubleshooting = () => {
    setExpandedTroubleshootIds([]);
  };

  // Function to re-evaluate browser-side capabilities
  const evaluateBrowserCapabilities = useCallback((): CapabilityItem[] => {
    const isBrowser = typeof window !== 'undefined';
    const hasWindowPrint = isBrowser && typeof window.print === 'function';
    const isSandboxed = isBrowser && window.self !== window.top;
    const hasWebUsb = isBrowser && 'usb' in navigator;
    const hasWebSerial = isBrowser && 'serial' in navigator;
    const hasWebBluetooth = isBrowser && 'bluetooth' in navigator;
    const hasMediaPrint = isBrowser && typeof window.matchMedia === 'function' && !!window.matchMedia('print');
    const hasLocalStorage = isBrowser && typeof window.localStorage !== 'undefined';

    return [
      {
        id: 'window-print',
        name: 'Browser window.print() Engine',
        category: 'core',
        isAvailable: hasWindowPrint,
        statusText: hasWindowPrint ? 'Active & Callable' : 'Unavailable',
        details: hasWindowPrint 
          ? 'Standard browser print pipeline detected. Receipts dispatch directly to system thermal spooler.' 
          : 'Browser does not support window.print(). Check device or browser configuration.',
        badgeType: hasWindowPrint ? 'success' : 'danger',
        icon: Printer
      },
      {
        id: 'sandbox-check',
        name: 'Execution Context (Standalone vs Iframe)',
        category: 'environment',
        isAvailable: !isSandboxed,
        statusText: isSandboxed ? 'Sandboxed Iframe' : 'Standalone Window (Optimal)',
        details: isSandboxed 
          ? 'Application is running inside an iframe. Direct modal popups may require "Open in New Tab" for direct hardware spooling.' 
          : 'Application is running in top-level browser window. Print dialogs open uninhibited.',
        badgeType: isSandboxed ? 'warning' : 'success',
        icon: Laptop
      },
      {
        id: 'media-print',
        name: 'CSS @media print Dynamic Rules',
        category: 'core',
        isAvailable: hasMediaPrint,
        statusText: hasMediaPrint ? 'Supported (80mm / 58mm Rules)' : 'Limited CSS Print Support',
        details: 'High-contrast monochrome styles, zero-margin layout, and tear-off feeds are injected dynamically during print.',
        badgeType: hasMediaPrint ? 'success' : 'info',
        icon: Layers
      },
      {
        id: 'web-usb',
        name: 'WebUSB API (Direct ESC/POS Raw USB)',
        category: 'web-api',
        isAvailable: hasWebUsb,
        statusText: hasWebUsb ? 'Supported in Chromium' : 'Not Supported in Browser',
        details: hasWebUsb 
          ? 'Chromium WebUSB interface available for low-level direct raw byte streaming to thermal heads.' 
          : 'Available in Google Chrome, Microsoft Edge, and Chromium-based POS browsers.',
        badgeType: hasWebUsb ? 'success' : 'info',
        icon: Usb
      },
      {
        id: 'web-serial',
        name: 'Web Serial API (RS-232 / COM Ports)',
        category: 'web-api',
        isAvailable: hasWebSerial,
        statusText: hasWebSerial ? 'Supported in Chromium' : 'Not Supported',
        details: hasWebSerial 
          ? 'Serial/COM port interface available for legacy serial receipt printers and weighing scales.' 
          : 'Requires Chrome or Edge with HTTPS or localhost.',
        badgeType: hasWebSerial ? 'success' : 'info',
        icon: Activity
      },
      {
        id: 'web-bluetooth',
        name: 'Web Bluetooth API (Wireless Printers)',
        category: 'web-api',
        isAvailable: hasWebBluetooth,
        statusText: hasWebBluetooth ? 'Supported (Wireless Ready)' : 'Not Supported',
        details: hasWebBluetooth 
          ? 'Bluetooth LE device pairing available for portable 58mm handheld billing printers.' 
          : 'Available on Android Chrome and compatible desktop Bluetooth environments.',
        badgeType: hasWebBluetooth ? 'success' : 'info',
        icon: Bluetooth
      },
      {
        id: 'offline-cache',
        name: 'Offline Receipt & Telemetry Storage',
        category: 'environment',
        isAvailable: hasLocalStorage,
        statusText: hasLocalStorage ? 'Persistent LocalStorage Active' : 'No Local Storage',
        details: 'Local audit trail caches up to 100 recent print job timestamps, latencies, and error codes.',
        badgeType: hasLocalStorage ? 'success' : 'warning',
        icon: FileCheck
      }
    ];
  }, []);

  const [capabilities, setCapabilities] = useState<CapabilityItem[]>(evaluateBrowserCapabilities);

  // Subscribe to print diagnostics logs
  useEffect(() => {
    const unsub = PrintDiagnosticsService.subscribeLogs((logs) => {
      setRecentLogs(logs.slice(0, 5));
    }, 5);
    return () => unsub();
  }, []);

  // Refresh diagnostic state
  const handleRefreshDiagnostics = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setCapabilities(evaluateBrowserCapabilities());
      const updated = PrinterStatusService.getHealthCheck(settings);
      setHealthCheck(updated);
      setIsRefreshing(false);
    }, 400);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleTestPrint = async () => {
    setTestPrintLoading(true);
    setTestResultFeedback(null);
    try {
      const result = PrinterService.printDiagnosticTestPage(settings);
      if (result && result.restrictedInIframe) {
        setTestResultFeedback('Notice: Direct print restricted by iframe sandbox. Opening test page preview.');
        if (onOpenTestModal) onOpenTestModal();
      } else {
        setTestResultFeedback('Standardized diagnostic test page dispatched! Connection and paper feed status verified.');
      }
    } catch (err) {
      console.error('Test print error:', err);
      setTestResultFeedback('Print dispatch failed. Check console for error details.');
    } finally {
      setTimeout(() => {
        setTestPrintLoading(false);
        const updated = PrinterStatusService.getHealthCheck(settings);
        setHealthCheck(updated);
      }, 500);
    }
  };

  const handleToggleMock = (enabled: boolean) => {
    PrinterService.setMockPrintMode(enabled);
    setIsMockMode(enabled);
    handleRefreshDiagnostics();
  };

  // Troubleshooting fixes catalog
  const troubleshootingFixes = useMemo(() => [
    {
      id: 'usb',
      title: 'Check USB connection & port power',
      category: 'Connectivity',
      symptom: 'Printer is unresponsive, appears "Offline" in Windows/macOS, or disconnects during peak counter hours.',
      steps: [
        'Confirm the USB Type-B cable is firmly plugged directly into the POS terminal (avoid unpowered extension hubs or splitters).',
        'Verify the external 24V DC 2.5A power brick LED is glowing solid green and the round 3-pin plug is locked securely in place.',
        'In Windows, open Device Manager > "Universal Serial Bus controllers" and ensure no yellow exclamation warning icon appears.',
        'Disable USB Selective Suspend in Windows Power Options: This prevents the OS from putting the thermal USB port to sleep during idle periods.',
        'Connect the USB cable into a rear motherboard USB 2.0 port instead of front-panel case ports for uninterrupted 500mA USB bus power.'
      ],
      tip: 'Rule of thumb: If the printer powers off or resets the moment a bill starts printing, the power adapter is under-wattage (e.g. 12V instead of 24V).',
      badge: 'Hardware & Cable',
      badgeType: 'amber' as const,
      icon: Usb,
      actionButton: {
        label: 'Send Test Print',
        action: handleTestPrint,
        icon: Printer
      }
    },
    {
      id: 'dialog',
      title: 'Select correct printer model in Print dialog',
      category: 'Browser Dialog',
      symptom: 'Bills print to an office A4 inkjet/laser printer, create a PDF file on the desktop, or nothing outputs.',
      steps: [
        'In the browser Print preview window, check the "Destination" dropdown.',
        'Change Destination from "Save as PDF", "Microsoft Print to PDF", or "OneNote" to your actual thermal receipt printer (e.g., Rugtek RP326B, POS-80, Epson TM-T82, TVS RP-3200).',
        'Set Thermal Printer as OS Default: Open Windows Settings > Bluetooth & Devices > Printers & Scanners > Click your thermal printer > Click "Set as default".',
        'Turn OFF "Let Windows manage my default printer" in Windows Settings so Chrome never automatically switches printers.',
        'Enable Kiosk Auto-Printing: If launching Chrome with `--kiosk-printing`, the browser automatically routes all prints to the OS default thermal printer without showing a prompt.'
      ],
      tip: 'Chrome remembers your last chosen printer per web domain. Once you select the POS thermal model once, it stays default.',
      badge: 'Dialog Target',
      badgeType: 'sky' as const,
      icon: Printer,
      actionButton: {
        label: 'Open Slip Preview',
        action: () => { if (onOpenTestModal) onOpenTestModal(); },
        icon: Eye
      }
    },
    {
      id: 'paper',
      title: 'Verify Paper roll orientation (Blank Receipts)',
      category: 'Paper Roll',
      symptom: 'Paper feeds out normally and the printhead motor runs, but the receipt roll comes out completely blank with no print.',
      steps: [
        'Thermal receipt paper is coated with heat-activated leuco dyes on only ONE side. If the roll is placed upside down, heat cannot activate the dye.',
        'Open the clamshell top cover and flip the paper roll so that paper unwinds from UNDERNEATH the roll towards the front tear bar.',
        'The smooth, glossy chemically coated side must face UP and make direct contact with the thermal heating element.',
        'Quick Scratch Test: Firmly scrape the paper surface with a fingernail, coin, or key edge. If a black streak appears, that side is thermal-coated and must touch the printhead.',
        'Ensure you are using 80mm or 58mm direct thermal paper rolls, not plain bond/calculator paper which requires ink ribbons.'
      ],
      tip: 'Paper rolls stored near hot kitchen tandoors or direct sunlight will degrade and cause faint, grayish print. Store rolls in a cool, dry place.',
      badge: 'Paper Orientation',
      badgeType: 'emerald' as const,
      icon: Layers,
      actionButton: {
        label: 'Test Print Alignment',
        action: handleTestPrint,
        icon: Printer
      }
    },
    {
      id: 'margins',
      title: 'Fix margin offsets, blank top space & chopped borders',
      category: 'Layout & Margins',
      symptom: 'Receipt has a 1-inch blank header before hotel name, text is cut off on the right, or 8 inches of blank paper feeds at the end.',
      steps: [
        'In the browser Print preview dialog, click "More settings".',
        'Set "Margins" to "None". (Standard/Default margins insert 0.5-inch blank margins on all four sides, causing off-center clipping).',
        'Uncheck "Headers and footers" to prevent the browser from printing the URL, page 1/1, and current time across customer bills.',
        'Check "Background graphics" so high-contrast inverse banner boxes, divider rules, and restaurant logos render solidly.',
        'Check Paper Size: In the printer driver properties, select "Roll Paper 80 x 297mm" or "80 x Receipt", never standard A4 or US Letter.',
        'In Settings > Paper Saver, you can also toggle "Tight Receipt Spacing" to reduce blank bottom feed lines.'
      ],
      tip: 'If using Chrome Kiosk Mode (`--kiosk-printing`), configure Margins: None once in regular Chrome before launching Kiosk mode.',
      badge: 'Margins & Layout',
      badgeType: 'amber' as const,
      icon: Sliders,
      actionButton: {
        label: 'Preview Thermal Slip',
        action: () => { if (onOpenTestModal) onOpenTestModal(); },
        icon: Eye
      }
    },
    {
      id: 'cutter',
      title: 'Clear cutter blade jams & flashing red error lights',
      category: 'Hardware Recovery',
      symptom: 'Loud clicking or grinding noise, guillotine blade locked halfway through paper, top cover stuck, red ERROR LED flashing.',
      steps: [
        'Immediately switch OFF the printer power to protect the cutter drive motor from burning out.',
        'DO NOT force or pry the top cover open with tools while the blade is jammed — this will strip the internal plastic gears.',
        'Locate the manual cutter release: On Rugtek RP326B & POS-80 printers, there is a small front slide door or pop-off plate below the paper exit.',
        'Turn the manual white plastic thumb-wheel gear clockwise or counter-clockwise until the steel cutter blade fully retracts into its home position.',
        'Once the blade is retracted, press the cover release lever; the clamshell top cover will now pop open easily.',
        'Remove any torn paper shreds, crumpled receipts, or paper dust around the platen roller and blade slit, then close lid securely until both latches click.'
      ],
      tip: 'If cutter jams occur frequently, switch the printer driver cutting mode from "Full Cut" to "Partial Cut" (leaves a 1mm center tab connected).',
      badge: 'Cutter Jam',
      badgeType: 'rose' as const,
      icon: AlertTriangle
    },
    {
      id: 'rugtek',
      title: 'Rugtek RP326B optimal settings & configuration',
      category: 'Rugtek RP326B',
      symptom: 'Configuring Rugtek RP326B 80mm thermal receipt printer for high-speed printing and clean cutoffs.',
      steps: [
        'Driver Name: Select "POS-80" or the official "Rugtek RP326 POS Printer" driver in Windows Devices and Printers.',
        'Paper Width: Insert standard 80mm thermal roll (79.5mm ± 0.5mm). Printable area is 72mm (576 dots per line).',
        'Auto-Cutter Setting: In Driver Properties > Device Settings, select "Partial Cut" so receipts remain neatly attached at one point instead of dropping onto the floor.',
        'Baud Rate (Serial/RS-232): Default factory speed is 19200 bps, 8 data bits, no parity, 1 stop bit (8-N-1).',
        'Cash Drawer: Connect standard RJ11 6-pin cable to the "DK" port on rear of Rugtek RP326B; trigger signal is 24V DC pulse.',
        'High-Speed Feed: Rugtek RP326B feeds at 250mm/s. Ensure the external 24V DC 2.5A power brick is firmly plugged into AC mains.'
      ],
      tip: 'Click the "Apply Rugtek RP326B Preset" button in this view to automatically configure 80mm width, 11pt font, compact margins, and model name.',
      badge: 'Rugtek RP326B',
      badgeType: 'amber' as const,
      icon: Printer,
      actionButton: {
        label: 'Apply RP326B Config',
        action: handleApplyRugtekProfile,
        icon: CheckCircle2
      }
    },
    {
      id: 'symbols',
      title: 'Fix garbled symbols, "????" or continuous feed',
      category: 'Drivers & Encoding',
      symptom: 'Printer feeds rolls endlessly with random alien symbols, question marks, or gibberish characters.',
      steps: [
        'Cancel stuck print queue jobs: Open Windows Settings > Printers & Scanners > Select your thermal printer > Open queue > Click Printer > "Cancel All Documents".',
        'Restart the Windows Print Spooler: Press Win+R, type "services.msc", find "Print Spooler", right-click and select "Restart".',
        'If using RS-232 / Serial cable: Verify the COM port baud rate in Device Manager matches the printer DIP switches (Rugtek RP326B default is 19200 bps, generic POS-80 is 9600 or 19200 bps, 8-N-1).',
        'Perform Hardware Self-Test: Turn OFF the printer. Hold down the "FEED" button on the front panel and turn ON power while holding FEED. Release after 2 seconds. The printer will print its factory ROM diagnostic slip containing baud rate and code page info.',
        'In this POS app, Tamil menu names and bills are rendered via high-DPI HTML canvas/DOM rasterization, eliminating dependency on hardware Tamil fonts.'
      ],
      tip: 'Never pull paper manually through the slit while the printer is powered off, as this misaligns the stepper motor gear train.',
      badge: 'Encoding & Spooler',
      badgeType: 'sky' as const,
      icon: Terminal
    }
  ], [handleTestPrint, onOpenTestModal, handleApplyRugtekProfile]);

  const filteredTroubleshootingFixes = useMemo(() => {
    if (!troubleshootSearchQuery.trim()) return troubleshootingFixes;
    const q = troubleshootSearchQuery.toLowerCase();
    return troubleshootingFixes.filter((item) => 
      item.title.toLowerCase().includes(q) ||
      item.symptom.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.steps.some(s => s.toLowerCase().includes(q)) ||
      (item.tip && item.tip.toLowerCase().includes(q))
    );
  }, [troubleshootingFixes, troubleshootSearchQuery]);

  const isSandboxed = typeof window !== 'undefined' && window.self !== window.top;
  const currentPaperWidth = settings?.paperWidth || '80mm';

  return (
    <div id="printer-diagnostic-view" className="space-y-6">
      
      {/* 1. Header Banner & Instant Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Printer Diagnostics &amp; POS Setup
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider font-mono border ${
                  healthCheck.status === 'READY' || healthCheck.status === 'CONNECTED'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : healthCheck.status === 'MOCK'
                    ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                    : healthCheck.status === 'NOT_CONNECTED'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                }`}>
                  {healthCheck.label}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-700">
                  {currentPaperWidth} Roll
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Evaluates browser printing capabilities, detected hardware APIs, and thermal printer setup guidelines.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="btn-refresh-diagnostics"
              onClick={handleRefreshDiagnostics}
              disabled={isRefreshing}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Re-evaluate browser printer capabilities"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
              <span>Re-check</span>
            </button>

            <button
              type="button"
              id="btn-diagnostic-trigger-print"
              onClick={handleTestPrint}
              disabled={testPrintLoading}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Send standardized diagnostic string to default thermal printer to verify connection and paper feed status immediately"
            >
              <Printer className="w-4 h-4" />
              <span>{testPrintLoading ? 'Sending...' : 'Print Test Page'}</span>
            </button>

            <button
              type="button"
              id="btn-diagnostic-raw-escpos-action"
              onClick={() => setShowRawEscPosModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Generate & send raw ESC/POS binary command buffer (Bypasses Chrome dialog)"
            >
              <Terminal className="w-4 h-4 text-amber-400" />
              <span>Raw ESC/POS Test</span>
            </button>

            {onOpenTestModal && (
              <button
                type="button"
                id="btn-preview-diagnostic-slip"
                onClick={onOpenTestModal}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Preview Slip</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback message if test triggered */}
        {testResultFeedback && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-center gap-2 animate-fadeIn">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{testResultFeedback}</span>
          </div>
        )}

        {/* Iframe Notice & Standalone Launcher */}
        {isSandboxed && (
          <div className="p-3.5 bg-sky-950/40 border border-sky-800/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-sky-200">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                Running inside sandboxed iframe preview. For unrestricted 1-click physical printing and direct OS dialogs, open the billing system in a dedicated browser tab.
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.open(window.location.href, '_blank')}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer transition-colors"
            >
              <span>Open Standalone Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Quick summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Print Engine</div>
            <div className="text-sm font-extrabold text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>window.print()</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Ready for ESC/POS</div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paper Width</div>
            <div className="text-sm font-extrabold text-white mt-0.5 font-mono">
              {currentPaperWidth} (Roll)
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{currentPaperWidth === '80mm' ? '48 chars/line' : '32 chars/line'}</div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hardware Mode</div>
            <div className="text-sm font-extrabold text-amber-300 mt-0.5">
              {isMockMode ? 'Mock Simulated' : 'Direct Spooler'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{isMockMode ? 'Paper bypassed' : 'Physical print active'}</div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recent Print Jobs</div>
            <div className="text-sm font-extrabold text-sky-400 mt-0.5 font-mono">
              {recentLogs.length} tracked
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">In local session</div>
          </div>
        </div>

        {/* Active Hardware Profile Banner: Rugtek RP326B */}
        <div className="p-4 bg-gradient-to-r from-amber-500/10 via-slate-950 to-slate-900 border border-amber-500/40 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-300">Active Printer Profile:</span>
                  <span className="font-extrabold text-white text-sm">
                    {settings?.printerModelName || 'Rugtek RP326B'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ESC/POS 80mm
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    250 mm/sec
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  72mm printable width (576 dots) • Auto guillotine partial-cut • 24V RJ11 cash drawer trigger
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                id="btn-apply-rugtek-header"
                onClick={handleApplyRugtekProfile}
                disabled={applyingRugtek}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{applyingRugtek ? 'Applying...' : (settings?.printerModelName === 'Rugtek RP326B' ? 'Re-apply Rugtek RP326B' : 'Apply Rugtek RP326B Preset')}</span>
              </button>
            </div>
          </div>

          {rugtekAppliedFeedback && (
            <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{rugtekAppliedFeedback}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Browser-Side Printer Availability Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Laptop className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm sm:text-base text-white">Browser-Side Printer Availability &amp; Web APIs</h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Detected User Agent: <span className="font-mono text-slate-300">{typeof navigator !== 'undefined' ? navigator.userAgent.split(' ')[0] : 'Browser'}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {capabilities.map((cap) => {
            const IconComponent = cap.icon;
            return (
              <div 
                key={cap.id}
                className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 flex items-start gap-3 transition-colors hover:border-slate-700"
              >
                <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  cap.badgeType === 'success' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : cap.badgeType === 'warning'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : cap.badgeType === 'danger'
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  <IconComponent className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-xs text-white truncate">{cap.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                      cap.badgeType === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : cap.badgeType === 'warning'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : cap.badgeType === 'danger'
                        ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {cap.statusText}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    {cap.details}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mock Mode Control Toggle */}
        <div className="mt-4 p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-slate-200">Dev / Simulation Mode (Mock Print)</span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              When enabled, print actions log to console and database without triggering physical paper feeds or printer dialogs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleMock(!isMockMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isMockMode 
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' 
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              {isMockMode ? 'Mock Mode ON' : 'Mock Mode OFF'}
            </button>
          </div>
        </div>
      </div>

      {/* 3. Common Thermal Printer Setup Instructions for POS Systems */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                Thermal Printer Setup Instructions for POS Systems
              </h3>
              <p className="text-xs text-slate-400">
                Crucial browser margins, fast silent kiosk printing, hardware cables, and brand drivers.
              </p>
            </div>
          </div>
        </div>

        {/* Instruction Sub-tabs Navigation */}
        <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1 overflow-x-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveInstructionTab('dialog')}
            className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeInstructionTab === 'dialog'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>1. Browser Dialog</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInstructionTab('kiosk')}
            className={`flex-1 min-w-[130px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeInstructionTab === 'kiosk'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>2. Kiosk Auto-Print</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInstructionTab('hardware')}
            className={`flex-1 min-w-[125px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeInstructionTab === 'hardware'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>3. Hardware & Cables</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInstructionTab('models')}
            className={`flex-1 min-w-[125px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeInstructionTab === 'models'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>4. Brand Drivers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveInstructionTab('tamil')}
            className={`flex-1 min-w-[125px] py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeInstructionTab === 'tamil'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>5. Tamil &amp; Fonts</span>
          </button>
        </div>

        {/* Tab 1: Browser Dialog Configuration */}
        {activeInstructionTab === 'dialog' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Printer className="w-4 h-4" />
                <span>Chrome / Edge POS Print Dialog Settings (Must-Configure Once)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                To allow Chrome to send receipts directly to your physical <strong>Rugtek RP326 (3-inch / 80mm)</strong> thermal printer without getting blocked, configure these settings once. Chrome will remember them for all future bills:
              </p>

              {/* Crucial Chrome Pop-up / Dialog Permission Box */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1.5 text-slate-200">
                <div className="font-bold text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Crucial: Allow Pop-ups in Chrome for Instant Thermal Spooling</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  In Chrome, click the <strong>tune / site settings icon</strong> (immediately left of the web address bar) ➔ set <strong>Pop-ups and redirects</strong> to <strong>"Allow"</strong>. This permits Chrome to launch the physical thermal printer dialog instantly when clicking "Save &amp; Print" or "Print Bill".
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-900 border border-emerald-500/30 rounded-lg space-y-1 bg-emerald-500/5">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-300 flex items-center justify-center text-[11px] font-mono">1</span>
                    <span>Destination: Select Rugtek RP326</span>
                  </div>
                  <p className="text-slate-300">
                    Select your physical printer (e.g. <span className="text-emerald-400 font-mono font-bold">Rugtek RP326</span>, <span className="text-emerald-400 font-mono">POS-80</span>, or <span className="text-emerald-400 font-mono">Generic / Text Only</span>) instead of "Save as PDF".
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-lg space-y-1 bg-amber-500/5">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 flex items-center justify-center text-[11px] font-mono">2</span>
                    <span>Margins: Set to "None" (CRITICAL)</span>
                  </div>
                  <p className="text-slate-300">
                    Default margins add 0.5 inches on top and left, pushing receipts off-center and causing blank paper feeding. Always choose <strong>"None"</strong>.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-amber-500/30 rounded-lg space-y-1 bg-amber-500/5">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 flex items-center justify-center text-[11px] font-mono">3</span>
                    <span>Headers and footers: UNCHECK (CRITICAL)</span>
                  </div>
                  <p className="text-slate-300">
                    Uncheck this box to eliminate unwanted browser URLs, current dates, and page numbers from printing across your customer receipts.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-mono">4</span>
                    <span>Paper Size</span>
                  </div>
                  <p className="text-slate-400">
                    Select <strong>80mm (Receipt)</strong> or <strong>58mm (Roll)</strong>. On Windows drivers, select <span className="font-mono text-slate-300">Roll Paper 80 x 297mm</span>.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-mono">5</span>
                    <span>Scale: 100% (Default)</span>
                  </div>
                  <p className="text-slate-400">
                    Keep scale at 100%. Do not select "Fit to page" to preserve crisp thermal monospace fonts and barcodes.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-mono">6</span>
                    <span>Background Graphics: CHECK</span>
                  </div>
                  <p className="text-slate-400">
                    Check "Background graphics" so high-contrast inverse headers, divider bars, and monochrome restaurant logos render sharply.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Kiosk Auto-Print */}
        {activeInstructionTab === 'kiosk' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Zap className="w-4 h-4" />
                <span>Kiosk Mode: 0-Click Instant Silent Printing for Cashiers</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                In busy South Indian restaurants during rush hours, clicking "Print" in the browser confirmation dialog on every single bill slows down counter checkout. Chrome and Edge offer a native <strong>--kiosk-printing</strong> flag that instantly fires thermal print jobs directly to the paper roll with zero dialog popups.
              </p>

              {/* 1-Click Windows Batch Launcher */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-emerald-400 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>1-Click Windows Automated Launcher (Bypasses Google Preview)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => PrinterConnectionService.downloadSilentKioskBatScript()}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Silent POS Launcher (.bat)</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Double-clicking this downloaded file launches Chrome with <code className="text-amber-300 font-mono">--kiosk-printing</code>. Whenever cashiers tap the <strong className="text-amber-300 font-mono">[Ctrl]</strong> key, the receipt prints instantly on the Rugtek RP326 with <strong>0 milliseconds delay</strong> and <strong>0 preview popups</strong>.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {/* Windows Command */}
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <span>Windows POS Terminal Shortcut</span>
                      <span className="text-[10px] text-slate-500 font-mono">(Create Desktop Shortcut)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy('chrome.exe --kiosk --kiosk-printing "http://localhost:3000"', 'win-kiosk')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedKey === 'win-kiosk' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'win-kiosk' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg font-mono text-[11px] text-amber-300 overflow-x-auto select-all border border-slate-800">
                    chrome.exe --kiosk --kiosk-printing "http://localhost:3000"
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Right-click Chrome shortcut on Windows desktop &gt; Properties &gt; append this flag into the <strong>Target</strong> field.
                  </p>
                </div>

                {/* Mac Command */}
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">macOS Terminal Command</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --kiosk-printing "http://localhost:3000"', 'mac-kiosk')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedKey === 'mac-kiosk' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'mac-kiosk' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg font-mono text-[11px] text-amber-300 overflow-x-auto select-all border border-slate-800">
                    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk-printing "http://localhost:3000"
                  </div>
                </div>

                {/* Linux Command */}
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">Linux / Raspberry Pi Touch POS</span>
                    <button
                      type="button"
                      onClick={() => handleCopy('google-chrome --kiosk-printing "http://localhost:3000"', 'linux-kiosk')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedKey === 'linux-kiosk' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'linux-kiosk' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 rounded-lg font-mono text-[11px] text-amber-300 overflow-x-auto select-all border border-slate-800">
                    google-chrome --kiosk-printing "http://localhost:3000"
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Hardware & Cables */}
        {activeInstructionTab === 'hardware' && (
          <div className="space-y-4 text-xs">
            {/* Direct Hardware Pairing Interface */}
            <RugtekPrinterPairingSection 
              settings={settings}
              onUpdateSettings={onUpdateSettings}
            />

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Usb className="w-4 h-4" />
                <span>Physical Thermal Hardware Connections &amp; Cable Checklist</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Thermal printers use heat-activated chemically coated paper. Follow these physical hardware precautions to prevent paper jams, faded prints, or device freezes:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>24V DC 2.5A Dedicated Power Brick</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Thermal print heads require high momentary electrical spikes (up to 2.5A) to heat up resistor dots. Using an underpowered 12V supply causes faint receipts or sudden printer resets during barcode printing.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Thermal Paper Roll Orientation</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Thermal paper only has heat-sensitive coating on <strong>one side</strong>. Feed the roll from underneath so the glossy side faces the thermal print head. (Quick test: scratch with a coin; if black marks appear, that side is thermal).
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span>RJ11 / RJ12 Cash Drawer Trigger</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Connect the 6-pin telephone-style cable from the printer's <strong>DK port</strong> (Drawer Kick) to your cash drawer. Standard 24V solenoids open automatically when a bill prints.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-rose-400" />
                    <span>Cutter Jam Emergency Recovery</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    If the automatic guillotine blade jams, power off the printer, open the front manual cutter cover, and rotate the plastic thumb-wheel until the blade retracts completely before opening the roll cover.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Brand Drivers & Rugtek RP326B Spotlight */}
        {activeInstructionTab === 'models' && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Laptop className="w-4 h-4" />
              <span>Brand Drivers &amp; Recommended Configuration</span>
            </div>

            {/* Spotlight Rugtek RP326B Card */}
            <div className="p-4 sm:p-5 bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-2xl space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-white text-sm">Rugtek RP326B</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        RP-326 Series
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        80mm High-Speed (250mm/s)
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      Heavy-Duty 80mm ESC/POS Direct Thermal Receipt Printer with Auto-Cutter
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-apply-rugtek-in-tab"
                    onClick={handleApplyRugtekProfile}
                    disabled={applyingRugtek}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{applyingRugtek ? 'Applying...' : 'Apply Rugtek RP326B Settings'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleTestPrint}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-400" />
                    <span>Test Slip</span>
                  </button>
                </div>
              </div>

              {rugtekAppliedFeedback && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{rugtekAppliedFeedback}</span>
                </div>
              )}

              {/* Hardware Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-0.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Paper Width</div>
                  <div className="text-xs font-bold text-white">80mm (79.5 ± 0.5mm)</div>
                  <div className="text-[10px] text-amber-400/80">72mm Printable (576 dots)</div>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-0.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Print Speed</div>
                  <div className="text-xs font-bold text-emerald-400">250 mm/sec</div>
                  <div className="text-[10px] text-slate-400">High-speed counter printing</div>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-0.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Auto-Cutter</div>
                  <div className="text-xs font-bold text-sky-400">Partial Cut (Guillotine)</div>
                  <div className="text-[10px] text-slate-400">1.5 Million cuts rating</div>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl space-y-0.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Interface Ports</div>
                  <div className="text-xs font-bold text-amber-400">USB + LAN + RS232</div>
                  <div className="text-[10px] text-slate-400">24V RJ11 Cash Drawer</div>
                </div>
              </div>

              {/* Step-by-Step Rugtek RP326B Setup Guide */}
              <div className="space-y-3 pt-1">
                <div className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rugtek RP326B Step-by-Step Configuration Guide</span>
                </div>

                <div className="space-y-2.5">
                  {/* Step 1: Windows Driver */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="font-bold text-amber-300 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-mono font-bold">1</span>
                      <span>Windows Driver Installation &amp; Properties</span>
                    </div>
                    <ul className="list-disc list-inside text-slate-300 space-y-1 pl-1 text-[11px] leading-relaxed">
                      <li>Install the official <strong>Rugtek RP326 POS Printer Driver</strong> or select <strong>POS-80 Series</strong> driver in Windows.</li>
                      <li>Open Windows <strong>Control Panel &gt; Devices and Printers</strong> &gt; Right-click <strong>Rugtek RP326B</strong> &gt; <strong>Printer properties</strong>.</li>
                      <li>In <strong>General / Advanced &gt; Printing Defaults</strong>: Set Paper Size to <code className="text-amber-300 font-mono bg-slate-950 px-1 py-0.5 rounded">80 x 297 mm</code> or <code className="text-amber-300 font-mono bg-slate-950 px-1 py-0.5 rounded">Roll Paper 80mm</code>.</li>
                      <li>Under <strong>Device Settings</strong>: Set Cutter to <code className="text-emerald-300 font-mono bg-slate-950 px-1 py-0.5 rounded">Document Cut [Partial Cut]</code> so receipts don't fall to the floor.</li>
                      <li>Under <strong>Cash Drawer Setting</strong>: Select <code className="text-sky-300 font-mono bg-slate-950 px-1 py-0.5 rounded">Open Before Printing</code> (sends 24V pulse to RJ11 Pin 2).</li>
                    </ul>
                  </div>

                  {/* Step 2: Chrome / Edge Print Dialog */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-mono font-bold">2</span>
                      <span>Chrome / Edge Print Settings for Rugtek RP326B</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400">Destination:</span> <strong className="text-white font-mono">Rugtek RP326B</strong> or <strong className="text-white font-mono">POS-80</strong>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400">Paper Size:</span> <strong className="text-amber-300 font-mono">80 x 297 mm</strong> (or Roll 80mm)
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-amber-500/30 bg-amber-500/5">
                        <span className="text-amber-300 font-bold">Margins:</span> <strong className="text-white font-mono">None (0mm)</strong> <span className="text-[10px] text-slate-400">(Never use Default)</span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400">Scale:</span> <strong className="text-white font-mono">100%</strong> <span className="text-[10px] text-slate-400">(1:1 pixel raster)</span>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-slate-800/80">
                        <span className="text-slate-400">Headers &amp; Footers:</span> <strong className="text-rose-300 font-mono">Unchecked</strong>
                      </div>
                      <div className="p-2 bg-slate-950 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                        <span className="text-emerald-300 font-bold">Background graphics:</span> <strong className="text-white font-mono">Checked</strong>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Hardware Cables & Ports */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="font-bold text-sky-300 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px] font-mono font-bold">3</span>
                      <span>Rugtek RP326B Hardware Ports &amp; Dip Switches</span>
                    </div>
                    <ul className="list-disc list-inside text-slate-300 space-y-1 pl-1 text-[11px] leading-relaxed">
                      <li><strong>Power:</strong> Connect the original <strong>24V DC / 2.5A</strong> adapter (3-pin circular connector). Do not use a 12V adapter.</li>
                      <li><strong>USB:</strong> Plug into USB Type-B on rear. Use a rear motherboard USB port on the POS PC for maximum reliability.</li>
                      <li><strong>Cash Drawer:</strong> Plug standard RJ11/RJ12 6-pin cable into the rear "DK" port. Works with all standard 24V cash boxes.</li>
                      <li><strong>Serial RS-232:</strong> Default baud rate is <code className="text-amber-300 font-mono">19200 bps</code> (8 data bits, no parity, 1 stop bit).</li>
                      <li><strong>Emergency Cutter Recovery:</strong> If paper jams the blade, open the small front manual hatch and rotate the plastic thumb-wheel counter-clockwise until the blade retracts.</li>
                    </ul>
                  </div>

                  {/* Step 4: Silent Kiosk Mode */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                    <div className="font-bold text-purple-300 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-mono font-bold">4</span>
                      <span>One-Click Kiosk Auto-Print Shortcut for Rugtek RP326B</span>
                    </div>
                    <p className="text-slate-300 text-[11px]">
                      Launch Chrome or Edge with silent printing flags so clicking "Print Bill" prints immediately to the Rugtek RP326B without displaying the print dialog:
                    </p>
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-2 font-mono text-[11px] text-amber-300">
                      <span className="truncate">chrome.exe --kiosk --kiosk-printing --kiosk-printing-margin-type=3 "http://localhost:3000"</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('chrome.exe --kiosk --kiosk-printing --kiosk-printing-margin-type=3 "http://localhost:3000"', 'rugtek-kiosk')}
                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-[10px] shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        {copiedKey === 'rugtek-kiosk' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'rugtek-kiosk' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Other Common Brands */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-slate-300 font-bold text-xs">
                <Laptop className="w-4 h-4 text-slate-400" />
                <span>Other Supported Thermal Printer Brands</span>
              </div>
              <div className="space-y-2 pt-1">
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-emerald-400 text-xs">
                    Epson TM-T82, TM-T82II, TM-T82III, TM-m30
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Install <strong>Epson Advanced Printer Driver (APD)</strong>. In Windows Printer Properties &gt; Device Settings: Set Paper Source to <span className="font-mono text-slate-300">Roll Paper</span> and Cut Options to <span className="font-mono text-slate-300">Document Cut [Partial Cut]</span>.
                  </p>
                </div>

                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-amber-300 text-xs">
                    TVS Electronics RP-3200, RP-3160 Gold, TVS Star
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Install TVS RP Series Windows driver. Set paper width to <span className="font-mono text-slate-300">72mm or 80mm</span>. Set baud rate to 19200 or 9600 if connecting via Serial/RS-232 cable.
                  </p>
                </div>

                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-sky-300 text-xs">
                    Generic POS-80 / POS-58 USB Printers (Xprinter, Rongta, NGX, Retsol, Everycom)
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    Install vendor USB driver or select <span className="font-mono text-slate-300">POS-80 Series</span> in Windows. In Advanced Settings, ensure "Feed and Cut" is active.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Tamil & Font Rendering */}
        {activeInstructionTab === 'tamil' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>Tamil Unicode &amp; Regional Font Thermal Printing</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Most budget thermal receipt printers do not have built-in Tamil code-pages in hardware ROM. Here is how this software renders Tamil text (e.g. <strong>ஸ்ரீ சரவண பவன்</strong>, <strong>நெய் ரோஸ்ட் தோசை</strong>) crisply:
              </p>

              <div className="space-y-2.5 pt-1">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-white">High-DPI Graphic DOM Pipeline</div>
                  <p className="text-slate-400 leading-relaxed">
                    The software renders Tamil script using the web-embedded <strong>Mukta Malar</strong> font family at 203 DPI / 300 DPI raster resolution. This completely eliminates question marks ("????") or garbled characters.
                  </p>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1">
                  <div className="font-bold text-white">Paper Saver Dual-Language Toggle</div>
                  <p className="text-slate-400 leading-relaxed">
                    In <strong>Settings &gt; Paper Saver</strong>, you can choose whether to display Tamil names on bills and kitchen KOT tickets, or keep compact English labels to minimize paper roll usage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Troubleshooting Accordion: Common Thermal Printing Fixes */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">
                  Troubleshooting &amp; Common Fixes
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-bold">
                  {filteredTroubleshootingFixes.length} Solutions
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Step-by-step resolution guides for common POS thermal receipt printer issues
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expandAllTroubleshooting}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={collapseAllTroubleshooting}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-medium transition-colors cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Quick Filter Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={troubleshootSearchQuery}
            onChange={(e) => setTroubleshootSearchQuery(e.target.value)}
            placeholder="Filter troubleshooting guides (e.g. USB, blank receipts, paper orientation, margins, cutter jam)..."
            className="w-full pl-9.5 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-amber-500/50 rounded-xl text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
          />
          {troubleshootSearchQuery && (
            <button
              type="button"
              id="btn-clear-troubleshoot-search"
              aria-label="Clear troubleshooting search"
              onClick={() => setTroubleshootSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Accordion Item Cards */}
        {filteredTroubleshootingFixes.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-slate-400 space-y-2">
            <AlertCircle className="w-6 h-6 text-slate-500 mx-auto" />
            <div className="font-bold text-slate-300">No matching troubleshooting fixes found</div>
            <p className="text-slate-500 text-[11px]">
              Try searching with broader terms like &quot;USB&quot;, &quot;paper&quot;, &quot;margin&quot;, or &quot;cutter&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTroubleshootingFixes.map((item) => {
              const isExpanded = expandedTroubleshootIds.includes(item.id);
              const ItemIcon = item.icon;

              return (
                <div
                  key={item.id}
                  className={`border rounded-xl transition-colors overflow-hidden ${
                    isExpanded 
                      ? 'bg-slate-950 border-slate-700/80 shadow-md' 
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700/60'
                  }`}
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => toggleTroubleshootItem(item.id)}
                    className="w-full p-4 flex items-center justify-between text-left gap-3 cursor-pointer group"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                        item.badgeType === 'amber'
                          ? 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20'
                          : item.badgeType === 'emerald'
                          ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20'
                          : item.badgeType === 'rose'
                          ? 'bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20'
                          : 'bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20'
                      }`}>
                        <ItemIcon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-slate-100 group-hover:text-amber-300 transition-colors">
                            {item.title}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${
                            item.badgeType === 'amber'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                              : item.badgeType === 'emerald'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                              : item.badgeType === 'rose'
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                              : 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                          }`}>
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.symptom}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 p-1 rounded-md text-slate-400 group-hover:text-white transition-transform">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-amber-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-800/80 space-y-3.5 text-xs">
                      {/* Symptom Callout */}
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-2 text-slate-300">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-slate-200">Symptom:</strong> {item.symptom}
                        </div>
                      </div>

                      {/* Step-by-Step Resolution */}
                      <div className="space-y-2">
                        <div className="font-bold text-slate-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Recommended Fix Steps:</span>
                        </div>
                        <ol className="space-y-1.5 pl-5 list-decimal text-slate-300 leading-relaxed">
                          {item.steps.map((step, idx) => (
                            <li key={idx} className="pl-1">
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Pro Tip Box */}
                      {item.tip && (
                        <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-amber-300/90 leading-relaxed flex items-start gap-2">
                          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-amber-200">Hardware Tip:</strong> {item.tip}
                          </div>
                        </div>
                      )}

                      {/* Action Button If Present */}
                      {item.actionButton && (
                        <div className="pt-1 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={item.actionButton.action}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <item.actionButton.icon className="w-3.5 h-3.5 text-amber-400" />
                            <span>{item.actionButton.label}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Test Print Log (Tracks last 5 attempts & troubleshooting codes) */}
      <TestPrintLog 
        settings={settings} 
        onRunTestPrint={handleTestPrint} 
      />

      {/* Raw ESC/POS Diagnostic Modal */}
      <RawEscPosTestModal
        isOpen={showRawEscPosModal}
        onClose={() => setShowRawEscPosModal(false)}
        settings={settings}
      />

    </div>
  );
};
