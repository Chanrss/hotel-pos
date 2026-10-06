import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Sparkles, 
  Maximize2, 
  Sliders, 
  Lock, 
  Unlock, 
  RotateCcw, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  Eye, 
  Crosshair, 
  Code, 
  Layers, 
  FileCode, 
  Crown, 
  Flame, 
  Coffee,
  Scan,
  RefreshCw,
  Printer
} from 'lucide-react';
import { RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';
import { PrinterService } from '../../services/printerService';
import { 
  OFFICIAL_LOGO_STORAGE_PATH, 
  OFFICIAL_LOGO_STORAGE_URL, 
  OFFICIAL_LOGO_PUBLIC_URL, 
  syncBrandLogoToFirebase 
} from '../../services/brandLogoService';
import { 
  analyzeLogoImage, 
  autoCenterAndTrimLogo, 
  generateMonochromeThermalLogo, 
  generateReceiptLogoPrintStyles,
  LOGO_PRESETS_80MM,
  LOGO_PRESETS_58MM,
  LogoImageMetrics
} from '../../utils/logoProcessor';

export interface CentralizedLogoProcessorProps {
  settings: RestaurantSettings;
  onUpdateSettings: (updater: (prev: RestaurantSettings) => RestaurantSettings) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

const QUICK_LOGO_PRESETS = [
  {
    id: 'ssb',
    name: 'Sri Saravana Bhavan (SSB)',
    icon: Sparkles,
    dataUrl: DEFAULT_RESTAURANT_LOGO,
    desc: 'Official Protected Brand Crest (Immutable)'
  }
];

export const CentralizedLogoProcessor: React.FC<CentralizedLogoProcessorProps> = ({
  settings,
  onUpdateSettings,
  onSave,
  isSaving = false
}) => {
  const is58mm = settings.paperWidth === '58mm';
  const activeLogo = settings.logoUrl?.trim() ? settings.logoUrl : DEFAULT_RESTAURANT_LOGO;
  const activeMonochromeLogo = settings.monochromeLogoUrl || '';
  
  // Current active dimensions
  const activeWidth = settings.receiptLogoMaxWidth || 85;
  const activeHeight = settings.receiptLogoMaxHeight || 85;
  const activeDisplay = (settings.logoDisplay && settings.logoDisplay !== 'watermark') ? settings.logoDisplay : 'both';
  const watermarkOpacity = settings.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.12;

  // Local processing states
  const [metrics, setMetrics] = useState<LogoImageMetrics | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTrimming, setIsTrimming] = useState(false);
  const [isGeneratingMono, setIsGeneratingMono] = useState(false);
  const [isSyncingStorage, setIsSyncingStorage] = useState(false);
  const [lockRatio, setLockRatio] = useState(true);
  const [showCrosshairs, setShowCrosshairs] = useState(true);
  const [showCssInspector, setShowCssInspector] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [monoThreshold, setMonoThreshold] = useState(140);
  const [activeTab, setActiveTab] = useState<'upload' | 'presets' | 'url'>('upload');
  const [urlInputValue, setUrlInputValue] = useState('');

  // Analyze active logo whenever it changes
  useEffect(() => {
    let isCurrent = true;
    setIsAnalyzing(true);
    analyzeLogoImage(activeLogo).then((m) => {
      if (isCurrent) {
        setMetrics(m);
        setIsAnalyzing(false);
      }
    });
    return () => { isCurrent = false; };
  }, [activeLogo]);

  // Sync real-time CSS variables to #pos-print-root
  useEffect(() => {
    PrinterService.setPrintRootLogoSize(activeWidth, activeHeight);
  }, [activeWidth, activeHeight]);

  const dimensionPresets = is58mm ? LOGO_PRESETS_58MM : LOGO_PRESETS_80MM;

  // Compute bulletproof styles
  const printStyles = useMemo(() => {
    return generateReceiptLogoPrintStyles({
      maxWidth: activeWidth,
      maxHeight: activeHeight,
      alignment: settings.receiptAlignment || 'center',
      isCompact: Boolean(settings.compactMode),
      watermarkOpacity
    });
  }, [activeWidth, activeHeight, settings.receiptAlignment, settings.compactMode, watermarkOpacity]);

  // Dimension adjustment handlers
  const handleWidthChange = (newWidth: number) => {
    const clampedW = Math.max(30, Math.min(is58mm ? 180 : 260, Math.round(newWidth)));
    if (lockRatio && metrics?.aspectRatio) {
      const computedH = Math.round(clampedW / metrics.aspectRatio);
      onUpdateSettings((prev) => ({
        ...prev,
        receiptLogoMaxWidth: clampedW,
        receiptLogoMaxHeight: Math.max(20, Math.min(160, computedH))
      }));
    } else {
      onUpdateSettings((prev) => ({ ...prev, receiptLogoMaxWidth: clampedW }));
    }
  };

  const handleHeightChange = (newHeight: number) => {
    const clampedH = Math.max(20, Math.min(160, Math.round(newHeight)));
    if (lockRatio && metrics?.aspectRatio) {
      const computedW = Math.round(clampedH * metrics.aspectRatio);
      onUpdateSettings((prev) => ({
        ...prev,
        receiptLogoMaxWidth: Math.max(30, Math.min(is58mm ? 180 : 260, computedW)),
        receiptLogoMaxHeight: clampedH
      }));
    } else {
      onUpdateSettings((prev) => ({ ...prev, receiptLogoMaxHeight: clampedH }));
    }
  };

  // Preset selector
  const handleApplyPreset = (preset: typeof dimensionPresets[0]) => {
    onUpdateSettings((prev) => ({
      ...prev,
      receiptLogoMaxWidth: preset.width,
      receiptLogoMaxHeight: preset.height
    }));
    setActionNotice(`Applied ${preset.label} (${preset.width}×${preset.height}px)`);
    setTimeout(() => setActionNotice(null), 2500);
  };

  // File Upload Processor
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setActionNotice('Please select an image file (PNG, JPG, WebP, SVG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      if (!result) return;

      onUpdateSettings((prev) => ({
        ...prev,
        logoUrl: result
      }));

      // Analyze new file immediately to suggest best dimensions
      const newMetrics = await analyzeLogoImage(result);
      if (newMetrics.shape === 'circular-square') {
        const defaultDim = is58mm ? 70 : 85;
        onUpdateSettings((prev) => ({
          ...prev,
          receiptLogoMaxWidth: defaultDim,
          receiptLogoMaxHeight: defaultDim
        }));
      } else {
        const defaultW = is58mm ? 120 : 145;
        const defaultH = Math.round(defaultW / Math.max(1, newMetrics.aspectRatio));
        onUpdateSettings((prev) => ({
          ...prev,
          receiptLogoMaxWidth: defaultW,
          receiptLogoMaxHeight: Math.max(30, defaultH)
        }));
      }

      setActionNotice('New logo loaded and optical dimensions scaled!');
      setTimeout(() => setActionNotice(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  // Auto-Center & Trim Whitespace
  const handleAutoCenterTrim = async () => {
    setIsTrimming(true);
    try {
      const trimmedUrl = await autoCenterAndTrimLogo(activeLogo);
      onUpdateSettings((prev) => ({
        ...prev,
        logoUrl: trimmedUrl
      }));
      setActionNotice('Auto-center & trim complete! Transparent borders cropped to true bounds.');
    } catch {
      setActionNotice('Auto-center could not process this image.');
    } finally {
      setIsTrimming(false);
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  // Generate 1-bit Monochrome Thermal Override
  const handleGenerateMonochrome = async () => {
    setIsGeneratingMono(true);
    try {
      const monoUrl = await generateMonochromeThermalLogo(activeLogo, monoThreshold);
      onUpdateSettings((prev) => ({
        ...prev,
        monochromeLogoUrl: monoUrl
      }));
      setActionNotice('1-Bit Monochrome thermal override created! Crisp black & white active.');
    } catch {
      setActionNotice('Failed to generate monochrome bitmap.');
    } finally {
      setIsGeneratingMono(false);
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  // Persist exact uploaded logo to Firebase Storage path & configuration
  const handleSyncFirebaseStorage = async () => {
    setIsSyncingStorage(true);
    try {
      const res = await syncBrandLogoToFirebase();
      onUpdateSettings((prev) => ({
        ...prev,
        logoStoragePath: res.path,
        logoStorageUrl: res.url,
        logoUrl: res.url,
        logoProtectedBrandAsset: true
      }));
      setActionNotice(`Protected logo stored & synced to Firebase! (${res.path})`);
    } catch {
      setActionNotice('Notice: Saved to local offline state.');
    } finally {
      setIsSyncingStorage(false);
      setTimeout(() => setActionNotice(null), 4000);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5 text-slate-100">
      
      {/* Top Header & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Scan className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-white tracking-wide">
                Centralized Receipt Logo & Watermark Processor
              </h3>
              <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                POS CSS Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Guarantees mathematically centered alignment, optical scaling, and paper roll compatibility
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncFirebaseStorage}
            disabled={isSyncingStorage}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Persist immutable brand logo path and URL into Firebase configuration"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isSyncingStorage ? 'Syncing...' : 'Sync to Firebase Storage'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onUpdateSettings((prev) => ({
                ...prev,
                logoUrl: DEFAULT_RESTAURANT_LOGO,
                monochromeLogoUrl: '',
                receiptLogoMaxWidth: 85,
                receiptLogoMaxHeight: 85,
                logoDisplay: 'both',
                watermarkOpacity: 0.12
              }));
              setActionNotice('Restored Sri Saravana Bhavan official circular crest (85×85px)!');
              setTimeout(() => setActionNotice(null), 3000);
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restore SSB Crest</span>
          </button>

          {onSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Protected Brand Asset Notice Banner */}
      <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-sm">
            <img 
              src={OFFICIAL_LOGO_PUBLIC_URL} 
              alt="Official Logo Asset" 
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-white text-xs sm:text-sm">
                Official Shop Logo — Sri Saravana Bhavan
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                PROTECTED BRAND ASSET
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Original uploaded asset preserved directly without AI regeneration or alteration. Proportional scaling only.
            </p>
            <div className="text-[10px] font-mono text-amber-400/90 mt-0.5">
              Storage: <span className="text-slate-300">{OFFICIAL_LOGO_STORAGE_PATH}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSyncFirebaseStorage}
          disabled={isSyncingStorage}
          className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{isSyncingStorage ? 'Syncing...' : 'Sync to Firebase'}</span>
        </button>
      </div>

      {actionNotice && (
        <div className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Main Grid: Left = Ingestion & Tuning, Right = Live Receipt Paper Optical Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column (7 cols): Ingestion, Scaling, Controls */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Logo Source Selection Tabs */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                1. Logo Source & Ingestion
              </span>
              <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    activeTab === 'upload' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('presets')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    activeTab === 'presets' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Presets
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('url')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    activeTab === 'url' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  URL / Data
                </button>
              </div>
            </div>

            {/* TAB: Upload Drag & Drop */}
            {activeTab === 'upload' && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
                }}
                className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center transition-all ${
                  isDragging 
                    ? 'border-amber-400 bg-amber-500/10 scale-[1.01]' 
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-200">
                      Drag & Drop Shop Logo image, or{' '}
                      <label className="text-amber-400 hover:text-amber-300 cursor-pointer underline font-bold">
                        Browse Files
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                          }}
                        />
                      </label>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Accepts PNG, JPG, WebP, SVG. Stored in client memory and synced across print jobs.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Presets */}
            {activeTab === 'presets' && (
              <div className="grid grid-cols-2 gap-2">
                {QUICK_LOGO_PRESETS.map((p) => {
                  const isSelected = activeLogo === p.dataUrl;
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onUpdateSettings((prev) => ({
                          ...prev,
                          logoUrl: p.dataUrl,
                          receiptLogoMaxWidth: p.id === 'ssb' ? 85 : 140,
                          receiptLogoMaxHeight: p.id === 'ssb' ? 85 : 50
                        }));
                        setActionNotice(`Applied ${p.name} preset!`);
                        setTimeout(() => setActionNotice(null), 2500);
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{p.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB: Direct URL */}
            {activeTab === 'url' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInputValue}
                    onChange={(e) => setUrlInputValue(e.target.value)}
                    placeholder="Paste image URL or data:image/... base64 string"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 font-mono focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (urlInputValue.trim()) {
                        onUpdateSettings((prev) => ({ ...prev, logoUrl: urlInputValue.trim() }));
                        setActionNotice('Custom logo URL applied!');
                        setTimeout(() => setActionNotice(null), 2500);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}

            {/* Real-time Image Optical Diagnostics Bar */}
            {metrics && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px]">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-slate-400">Natural Size: </span>
                    <span className="font-mono font-bold text-amber-300">
                      {metrics.naturalWidth} × {metrics.naturalHeight}px
                    </span>
                  </div>
                  <div className="hidden sm:block text-slate-600">•</div>
                  <div>
                    <span className="text-slate-400">Ratio: </span>
                    <span className="font-mono font-bold text-slate-200">
                      {metrics.aspectRatio} : 1
                    </span>
                  </div>
                  <div className="hidden sm:block text-slate-600">•</div>
                  <div className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-semibold uppercase text-[10px]">
                    {metrics.shape === 'circular-square' ? 'Circular / Square 1:1' : metrics.shape.toUpperCase()}
                  </div>
                </div>

                {/* Auto-Center Whitespace Trim Tool */}
                <button
                  type="button"
                  onClick={handleAutoCenterTrim}
                  disabled={isTrimming}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-medium text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  title="Detects and crops asymmetric transparent borders to ensure absolute geometric centering"
                >
                  <Crosshair className={`w-3 h-3 text-amber-400 ${isTrimming ? 'animate-spin' : ''}`} />
                  <span>{isTrimming ? 'Trimming...' : 'Auto-Center & Crop'}</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Scaling & Dimension Presets */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  2. Receipt Scaling & Dimension Presets
                </span>
                <span className="text-[11px] text-slate-400">
                  Target Paper: <span className="font-mono font-bold text-amber-400">{settings.paperWidth || '80mm'}</span> thermal roll
                </span>
              </div>

              <button
                type="button"
                onClick={() => setLockRatio(!lockRatio)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                  lockRatio 
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lockRatio ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                <span>{lockRatio ? 'Ratio Locked' : 'Ratio Free'}</span>
              </button>
            </div>

            {/* Quick Dimension Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {dimensionPresets.map((preset) => {
                const isActive = activeWidth === preset.width && activeHeight === preset.height;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-xs' 
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="truncate">{preset.label}</span>
                      <span className="font-mono text-amber-400 shrink-0 ml-1">
                        {preset.width}×{preset.height}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fine-Tuning Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">Max Width</span>
                  <span className="font-mono font-bold text-amber-400">{activeWidth}px</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max={is58mm ? "170" : "250"}
                  value={activeWidth}
                  onChange={(e) => handleWidthChange(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">Max Height</span>
                  <span className="font-mono font-bold text-amber-400">{activeHeight}px</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="140"
                  value={activeHeight}
                  onChange={(e) => handleHeightChange(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 3. Placement Mode & Watermark Tuning */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              3. Receipt Placement Mode & Watermark Opacity
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'both', label: 'Header + Watermark', desc: 'Prominent & Authentic' },
                { id: 'header', label: 'Header Only', desc: 'Clean Top Placement' },
                { id: 'watermark', label: 'Watermark Only', desc: 'Subtle Center Fade' },
                { id: 'none', label: 'No Logo', desc: 'Text Only' }
              ].map((m) => {
                const isSelected = activeDisplay === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onUpdateSettings((prev) => ({ ...prev, logoDisplay: m.id as any }));
                    }}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-xs' 
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{m.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{m.desc}</div>
                  </button>
                );
              })}
            </div>

            {(activeDisplay === 'watermark' || activeDisplay === 'both') && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-semibold">Watermark Background Light Tone</span>
                  <span className="font-mono font-bold text-amber-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {Math.round(watermarkOpacity * 100)}% Opacity
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.30"
                  step="0.01"
                  value={watermarkOpacity}
                  onChange={(e) => onUpdateSettings((prev) => ({ ...prev, watermarkOpacity: parseFloat(e.target.value) }))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>5% Subtle (High Readability)</span>
                  <span>12% Recommended</span>
                  <span>30% Dark Stamp</span>
                </div>
              </div>
            )}
          </div>

          {/* 4. Thermal Monochrome 1-Bit Mode (Optional Hardware B&W) */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  4. Hardware Monochrome (1-Bit B&W) Override
                </span>
                <span className="text-[11px] text-slate-400">
                  Pre-dithers graphics for thermal heads that smudge synthetic grayscale
                </span>
              </div>

              {activeMonochromeLogo && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateSettings((prev) => ({ ...prev, monochromeLogoUrl: '' }));
                    setActionNotice('Cleared monochrome override. Using standard logo.');
                    setTimeout(() => setActionNotice(null), 2500);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 underline cursor-pointer"
                >
                  Clear Override
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerateMonochrome}
                disabled={isGeneratingMono}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isGeneratingMono ? 'Processing...' : 'Generate 1-Bit Thermal Bitmap'}</span>
              </button>

              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="text-[11px] text-slate-400 shrink-0">Threshold:</span>
                <input
                  type="range"
                  min="80"
                  max="200"
                  value={monoThreshold}
                  onChange={(e) => setMonoThreshold(Number(e.target.value))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <span className="font-mono text-xs text-amber-400 shrink-0">{monoThreshold}</span>
              </div>
            </div>

            {activeMonochromeLogo && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Active: High-contrast 1-bit thermal override enabled for physical print.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Live Optical Receipt Paper Crosshair Simulator */}
        <div className="lg:col-span-5 flex flex-col space-y-3">
          
          <div className="flex items-center justify-between bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                Optical Centering Stage
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCrosshairs(!showCrosshairs)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                  showCrosshairs 
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                title="Toggle visual optical center alignment guide"
              >
                <Crosshair className="w-3 h-3" />
                <span>Grid</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCssInspector(!showCssInspector)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 transition-all cursor-pointer ${
                  showCssInspector 
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
                title="View injected Receipt Print CSS variables"
              >
                <Code className="w-3 h-3" />
                <span>CSS</span>
              </button>
            </div>
          </div>

          {/* Simulated Thermal Paper Roll with Centering Crosshair */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 flex justify-center items-start min-h-[460px] relative overflow-hidden">
            
            {/* The Thermal Paper Sheet */}
            <div 
              style={{
                width: is58mm ? '230px' : '285px'
              }}
              className="bg-white text-black p-3.5 shadow-2xl relative border-x border-slate-300 select-none font-mono text-[11px] transition-all"
            >
              {/* Optional Centering Crosshair Guide Line (Non-printing optical reference) */}
              {showCrosshairs && (
                <>
                  {/* Vertical Center Axis */}
                  <div 
                    className="absolute inset-y-0 left-1/2 w-[1px] bg-red-500/50 pointer-events-none z-30" 
                    title="Mathematical Center Axis (Roll Width Midpoint)"
                  />
                  {/* Horizontal Axis through Header Logo */}
                  <div 
                    className="absolute left-0 right-0 top-[60px] h-[1px] bg-red-500/30 pointer-events-none z-30"
                  />
                  {/* Corner alignment ticks */}
                  <div className="absolute top-1 left-1 text-[8px] font-mono text-red-500/60 pointer-events-none z-30">
                    0mm
                  </div>
                  <div className="absolute top-1 right-1 text-[8px] font-mono text-red-500/60 pointer-events-none z-30">
                    {is58mm ? '58mm' : '80mm'}
                  </div>
                </>
              )}

              {/* Watermark layer */}
              {(activeDisplay === 'watermark' || activeDisplay === 'both') && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 overflow-hidden">
                  <div 
                    className="w-40 h-40 flex items-center justify-center transition-opacity"
                    style={{ opacity: watermarkOpacity }}
                  >
                    <img 
                      src={activeLogo} 
                      alt="Watermark" 
                      className="w-36 h-36 object-contain drop-shadow-[0_0_4px_rgba(0,0,0,0.2)]" 
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              )}

              {/* Receipt Content */}
              <div className="relative z-10 text-center">
                
                {/* 1. Header Logo (Center Guaranteed by Block Margins) */}
                {(activeDisplay === 'header' || activeDisplay === 'both') && (
                  <div 
                    className="receipt-logo-container mb-2"
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      margin: `0 auto ${printStyles.marginBottom} auto`
                    }}
                  >
                    <img 
                      src={activeLogo} 
                      alt="Sri Saravana Bhavan Official Logo" 
                      style={{
                        maxWidth: `${activeWidth}px`,
                        maxHeight: `${activeHeight}px`,
                        objectFit: 'contain',
                        display: 'block',
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        width: 'auto',
                        height: 'auto'
                      }}
                      className="receipt-logo drop-shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                {/* Restaurant Name */}
                <div className="font-extrabold text-[15px] leading-tight text-black tracking-wide uppercase">
                  {settings.restaurantName || 'SRI SARAVANA BHAVAN'}
                </div>
                <div className="text-[9px] text-slate-700 leading-tight mt-1">
                  Salem Main Rd, Kallakurichi-606213
                  <br />
                  PH: 7708159933
                </div>

                {/* Divider */}
                <div className="border-t border-dashed border-black my-2" />

                {/* Mock Bill Rows */}
                <div className="flex justify-between text-[10px] font-bold pb-1 border-b border-black">
                  <span>ITEM</span>
                  <span>QTY</span>
                  <span>AMT</span>
                </div>
                <div className="py-1 space-y-0.5 text-[9.5px]">
                  <div className="flex justify-between">
                    <span>Ghee Roast Dosa</span>
                    <span>1</span>
                    <span>₹95.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Special Filter Coffee</span>
                    <span>2</span>
                    <span>₹60.00</span>
                  </div>
                </div>

                <div className="border-t border-black my-1.5" />

                <div className="flex justify-between text-[12px] font-black">
                  <span>TOTAL:</span>
                  <span>₹155.00</span>
                </div>

                <div className="text-[8.5px] font-semibold text-slate-600 mt-2">
                  *** THANK YOU VISIT AGAIN ***
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible CSS Inspector */}
          {showCssInspector && (
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
                <span>Active Print CSS Output:</span>
                <span className="text-[10px] text-slate-500 font-sans">Injected into thermal printheads</span>
              </div>
              <pre className="text-[10.5px] text-slate-300 bg-slate-900 p-2.5 rounded-lg overflow-x-auto leading-relaxed border border-slate-800">
{`/* Centralized Receipt Logo CSS */
#pos-print-root {
  --receipt-logo-max-width: ${activeWidth}px;
  --receipt-logo-max-height: ${activeHeight}px;
  --receipt-watermark-opacity: ${watermarkOpacity};
}

.receipt-logo-container {
  display: block !important;
  width: 100% !important;
  text-align: center !important;
  margin: 0 auto ${printStyles.marginBottom} auto !important;
}

.receipt-logo {
  display: block !important;
  margin-left: auto !important;
  margin-right: auto !important;
  max-width: var(--receipt-logo-max-width, ${activeWidth}px) !important;
  max-height: var(--receipt-logo-max-height, ${activeHeight}px) !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
}`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
