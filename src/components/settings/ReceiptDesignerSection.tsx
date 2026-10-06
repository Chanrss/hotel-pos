import React from 'react';
import { 
  FileText, 
  Type, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  MoveVertical, 
  Leaf, 
  Zap, 
  Receipt, 
  Check, 
  RotateCcw, 
  Layers, 
  Sliders, 
  Printer, 
  Scissors, 
  Sparkles,
  Eye,
  Building2,
  Phone,
  Hash
} from 'lucide-react';
import { RestaurantSettings } from '../../types';

interface ReceiptDesignerSectionProps {
  formData: RestaurantSettings;
  setFormData: React.Dispatch<React.SetStateAction<RestaurantSettings>>;
  onSave: () => void;
  isSaving?: boolean;
}

export const ReceiptDesignerSection: React.FC<ReceiptDesignerSectionProps> = ({
  formData,
  setFormData,
  onSave,
  isSaving = false
}) => {
  // Preset templates with instant 1-click styling profiles
  const applyPreset = (preset: 'standard' | 'compact' | 'tiffin_token' | 'gst_tax_invoice') => {
    switch (preset) {
      case 'standard':
        setFormData(prev => ({
          ...prev,
          receiptFormat: 'standard',
          receiptFontSize: 12,
          receiptHeaderFontSize: 'large',
          receiptItemFontSize: 'large',
          receiptTotalFontSize: 'large',
          receiptAlignment: 'center',
          receiptLineSpacing: 'normal',
          receiptSectionSpacing: 'normal',
          receiptItemPadding: 'normal',
          receiptPaperMargin: 'normal',
          receiptShowItemSl: true,
          receiptShowTotalQty: true,
          receiptShowAddress: true,
          receiptShowPhone: true,
          receiptShowGstFssai: true,
          receiptShowTamilName: true,
          receiptShowEnglishName: false,
          compactMode: false,
          receiptFeedLines: 2
        }));
        break;
      case 'compact':
        setFormData(prev => ({
          ...prev,
          receiptFormat: 'compact',
          receiptFontSize: 10,
          receiptHeaderFontSize: 'normal',
          receiptItemFontSize: 'normal',
          receiptTotalFontSize: 'normal',
          receiptAlignment: 'center',
          receiptLineSpacing: 'tight',
          receiptSectionSpacing: 'compact',
          receiptItemPadding: 'compact',
          receiptPaperMargin: 'minimal',
          receiptShowItemSl: false,
          receiptShowTotalQty: true,
          receiptShowAddress: true,
          receiptShowPhone: true,
          receiptShowGstFssai: false,
          receiptShowTamilName: true,
          receiptShowEnglishName: false,
          compactMode: true,
          receiptFeedLines: 1
        }));
        break;
      case 'tiffin_token':
        setFormData(prev => ({
          ...prev,
          receiptFormat: 'tiffin_token',
          receiptFontSize: 12,
          receiptHeaderFontSize: 'large',
          receiptItemFontSize: 'prominent',
          receiptTotalFontSize: 'huge',
          receiptAlignment: 'center',
          receiptLineSpacing: 'normal',
          receiptSectionSpacing: 'compact',
          receiptItemPadding: 'normal',
          receiptPaperMargin: 'normal',
          receiptShowItemSl: true,
          receiptShowTotalQty: true,
          receiptShowAddress: false,
          receiptShowPhone: false,
          receiptShowGstFssai: false,
          receiptShowTamilName: true,
          receiptShowEnglishName: false,
          compactMode: false,
          receiptFeedLines: 2
        }));
        break;
      case 'gst_tax_invoice':
        setFormData(prev => ({
          ...prev,
          receiptFormat: 'gst_tax_invoice',
          receiptFontSize: 11,
          receiptHeaderFontSize: 'large',
          receiptItemFontSize: 'normal',
          receiptTotalFontSize: 'large',
          receiptAlignment: 'center',
          receiptLineSpacing: 'normal',
          receiptSectionSpacing: 'normal',
          receiptItemPadding: 'normal',
          receiptPaperMargin: 'normal',
          receiptShowItemSl: true,
          receiptShowTotalQty: true,
          receiptShowAddress: true,
          receiptShowPhone: true,
          receiptShowGstFssai: true,
          receiptShowTamilName: true,
          receiptShowEnglishName: true,
          compactMode: false,
          receiptFeedLines: 3
        }));
        break;
    }
  };

  const activeFormat = formData.receiptFormat || (formData.compactMode ? 'compact' : 'standard');
  const activeAlignment = formData.receiptAlignment || 'center';
  const activeLineSpacing = formData.receiptLineSpacing || (formData.compactMode ? 'tight' : 'normal');
  const activeSectionSpacing = formData.receiptSectionSpacing || (formData.compactMode ? 'compact' : 'normal');
  const activeItemPadding = formData.receiptItemPadding || (formData.compactMode ? 'compact' : 'normal');
  const activePaperMargin = formData.receiptPaperMargin || (formData.compactMode ? 'minimal' : 'normal');
  const baseFontSize = formData.receiptFontSize || (formData.paperWidth === '58mm' ? 10 : 11);

  return (
    <div className="space-y-5">
      {/* 1. Format Templates Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Receipt Format Templates</h3>
              <p className="text-xs text-slate-400">Select a layout template or fine-tune individually below</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => applyPreset('standard')}
            className="text-[11px] font-semibold text-slate-400 hover:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Standard</span>
          </button>
        </div>

        {/* 4 Format Preset Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Preset 1: Classic Restaurant */}
          <button
            type="button"
            onClick={() => applyPreset('standard')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
              activeFormat === 'standard' && !formData.compactMode
                ? 'bg-amber-500/15 border-amber-500/80 text-white shadow-xs'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-white">Classic Restaurant Bill</span>
              </div>
              {activeFormat === 'standard' && !formData.compactMode && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/30 text-amber-300">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Complete item tables with serial numbers, net summary, and clear totals.
            </p>
          </button>

          {/* Preset 2: Compact Paper-Saver */}
          <button
            type="button"
            onClick={() => applyPreset('compact')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
              activeFormat === 'compact' || formData.compactMode
                ? 'bg-emerald-500/15 border-emerald-500/80 text-white shadow-xs'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-white">Compact Paper-Saver</span>
              </div>
              {(activeFormat === 'compact' || formData.compactMode) && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/30 text-emerald-300">
                  Eco 40% Save
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Condensed line-height (1.12), micro margins, tightly grouped item rows. Saves 35–40% roll paper length!
            </p>
          </button>

          {/* Preset 3: Fast Tiffin & Token */}
          <button
            type="button"
            onClick={() => applyPreset('tiffin_token')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
              activeFormat === 'tiffin_token'
                ? 'bg-amber-500/15 border-amber-500/80 text-white shadow-xs'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-white">Fast Tiffin &amp; Token Slip</span>
              </div>
              {activeFormat === 'tiffin_token' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/30 text-amber-300">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Big bold Token/Bill number banner at top, enlarged items, quick kitchen or self-service pickup.
            </p>
          </button>

          {/* Preset 4: GST Tax Invoice */}
          <button
            type="button"
            onClick={() => applyPreset('gst_tax_invoice')}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
              activeFormat === 'gst_tax_invoice'
                ? 'bg-amber-500/15 border-amber-500/80 text-white shadow-xs'
                : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-white">GST Tax Invoice Format</span>
              </div>
              {activeFormat === 'gst_tax_invoice' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/30 text-amber-300">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Formal GSTIN/FSSAI banner, itemized taxable values, and SGST 2.5% + CGST 2.5% tax breakdown.
            </p>
          </button>
        </div>
      </div>

      {/* 2. Font Size Customization */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <Type className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Font Size Controls</h3>
            <p className="text-xs text-slate-400">Scale the base text and individual section font sizes</p>
          </div>
        </div>

        {/* Base Font Size Slider */}
        <div className="space-y-2.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200">
              Receipt Base Font Size
            </label>
            <span className="text-xs font-mono font-bold text-amber-400 bg-slate-900 px-2.5 py-0.5 rounded-md border border-slate-800">
              {baseFontSize}px
            </span>
          </div>

          <input
            type="range"
            min="9"
            max="16"
            step="1"
            value={baseFontSize}
            onChange={(e) => setFormData(prev => ({ ...prev, receiptFontSize: Number(e.target.value) }))}
            className="w-full accent-amber-500 cursor-pointer"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {[
              { label: '9px Micro', val: 9 },
              { label: '10px 58mm', val: 10 },
              { label: '11px Eco', val: 11 },
              { label: '12px Standard', val: 12 },
              { label: '13px Medium', val: 13 },
              { label: '14px Large', val: 14 },
              { label: '16px XL', val: 16 }
            ].map((preset) => (
              <button
                key={preset.val}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, receiptFontSize: preset.val }))}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                  baseFontSize === preset.val
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Granular Section Font Sizes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Header Title Scale */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">Hotel Title Scale</label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'normal', label: 'Normal' },
                { id: 'large', label: 'Large' },
                { id: 'huge', label: 'Huge' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptHeaderFontSize: s.id as any }))}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center ${
                    (formData.receiptHeaderFontSize || 'large') === s.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Item Name Scale */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">Item Names Scale</label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'normal', label: 'Standard' },
                { id: 'large', label: 'Large' },
                { id: 'prominent', label: 'Prominent' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptItemFontSize: s.id as any }))}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center ${
                    (formData.receiptItemFontSize || 'large') === s.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grand Total Scale */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">Grand Total Scale</label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'normal', label: 'Normal' },
                { id: 'large', label: 'Large' },
                { id: 'huge', label: 'Ultra Bold' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptTotalFontSize: s.id as any }))}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center ${
                    (formData.receiptTotalFontSize || 'large') === s.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Receipt Alignment Customization */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <AlignCenter className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Receipt Alignment</h3>
            <p className="text-xs text-slate-400">Align header, grand total, and receipt footers</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'left', label: 'Left Aligned', icon: AlignLeft, desc: 'Traditional invoice left alignment' },
            { id: 'center', label: 'Center (Default)', icon: AlignCenter, desc: 'Classic thermal restaurant center alignment' },
            { id: 'right', label: 'Right Aligned', icon: AlignRight, desc: 'Alternative right-balanced alignment' }
          ].map((al) => {
            const Icon = al.icon;
            const isSelected = activeAlignment === al.id;
            return (
              <button
                key={al.id}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, receiptAlignment: al.id as any }))}
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-xs ring-1 ring-amber-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-300'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-xs text-white">{al.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{al.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Spacing & Margin Customization */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <MoveVertical className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Spacing &amp; Margins</h3>
            <p className="text-xs text-slate-400">Control line height, section spacing, and item row padding</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Line Spacing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Line Height / Spacing</label>
              <span className="text-[10px] font-mono text-amber-400">
                {activeLineSpacing === 'tight' ? '1.12x' : activeLineSpacing === 'relaxed' ? '1.42x' : '1.25x'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'tight', label: 'Tight', desc: 'Saves roll' },
                { id: 'normal', label: 'Normal', desc: 'Standard' },
                { id: 'relaxed', label: 'Relaxed', desc: 'Spacious' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptLineSpacing: s.id as any }))}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center ${
                    activeLineSpacing === s.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <div>{s.label}</div>
                  <div className="text-[9px] opacity-70">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section Spacing */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Section Padding</label>
              <span className="text-[10px] font-mono text-amber-400">
                {activeSectionSpacing === 'compact' ? '2px' : activeSectionSpacing === 'spacious' ? '8px' : '5px'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'compact', label: 'Compact', desc: '2mm' },
                { id: 'normal', label: 'Normal', desc: '4mm' },
                { id: 'spacious', label: 'Spacious', desc: '6mm' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptSectionSpacing: s.id as any }))}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center ${
                    activeSectionSpacing === s.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <div>{s.label}</div>
                  <div className="text-[9px] opacity-70">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Item Row Padding */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300">Item Rows Spacing</label>
              <span className="text-[10px] font-mono text-amber-400">
                {activeItemPadding === 'compact' ? 'Tight' : activeItemPadding === 'spacious' ? 'Roomy' : 'Default'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { id: 'compact', label: 'Tight', desc: '1px' },
                { id: 'normal', label: 'Normal', desc: '2px' },
                { id: 'spacious', label: 'Roomy', desc: '4px' }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, receiptItemPadding: s.id as any }))}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center ${
                    activeItemPadding === s.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <div>{s.label}</div>
                  <div className="text-[9px] opacity-70">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Paper Cut Feed Lines */}
        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Scissors className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-xs font-bold text-slate-200">Roll Feed Lines Before Cutter</div>
              <div className="text-[11px] text-slate-500">Blank paper feed so the cutter bar doesn't cut through the total</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {[1, 2, 3, 4].map((lines) => (
              <button
                key={lines}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, receiptFeedLines: lines }))}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  (formData.receiptFeedLines || 2) === lines
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {lines} {lines === 1 ? 'line' : 'lines'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Content Toggles & Custom Text */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Content Elements &amp; Footer</h3>
            <p className="text-xs text-slate-400">Show or hide specific header lines, table columns, and footer text</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Show Address */}
          <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-xs text-slate-200">Print Store Address</div>
              <div className="text-[10px] text-slate-500">Street &amp; city lines in header</div>
            </div>
            <input
              type="checkbox"
              checked={formData.receiptShowAddress !== false}
              onChange={(e) => setFormData(prev => ({ ...prev, receiptShowAddress: e.target.checked }))}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </label>

          {/* Show Phone */}
          <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-xs text-slate-200">Print Phone Number</div>
              <div className="text-[10px] text-slate-500">Contact number line</div>
            </div>
            <input
              type="checkbox"
              checked={formData.receiptShowPhone !== false}
              onChange={(e) => setFormData(prev => ({ ...prev, receiptShowPhone: e.target.checked }))}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </label>

          {/* Show GST & FSSAI */}
          <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-xs text-slate-200">Print GSTIN &amp; FSSAI Badges</div>
              <div className="text-[10px] text-slate-500">Government registration numbers</div>
            </div>
            <input
              type="checkbox"
              checked={formData.receiptShowGstFssai !== false}
              onChange={(e) => setFormData(prev => ({ ...prev, receiptShowGstFssai: e.target.checked }))}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </label>

          {/* Show Item Serial (#) */}
          <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-xs text-slate-200">Print Item Serial Numbers (#)</div>
              <div className="text-[10px] text-slate-500">1, 2, 3 sequence column in table</div>
            </div>
            <input
              type="checkbox"
              checked={formData.receiptShowItemSl !== false}
              onChange={(e) => setFormData(prev => ({ ...prev, receiptShowItemSl: e.target.checked }))}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </label>

          {/* Show Total Qty */}
          <label className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
            <div className="space-y-0.5">
              <div className="font-bold text-xs text-slate-200">Print Total Item Quantity</div>
              <div className="text-[10px] text-slate-500">Total items count in summary</div>
            </div>
            <input
              type="checkbox"
              checked={formData.receiptShowTotalQty !== false}
              onChange={(e) => setFormData(prev => ({ ...prev, receiptShowTotalQty: e.target.checked }))}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </label>
        </div>

        {/* Custom Footer Message Input */}
        <div className="pt-2">
          <label className="block text-xs font-bold text-slate-300 mb-1">
            Receipt Footer Message
          </label>
          <input
            type="text"
            value={formData.receiptFooter || ''}
            onChange={(e) => setFormData(prev => ({ ...prev, receiptFooter: e.target.value }))}
            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono transition-colors"
            placeholder="*** THANK YOU VISIT AGAIN ***"
          />
          <p className="text-[11px] text-slate-500 mt-1">Printed centered directly beneath the Grand Total banner</p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-sm rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20"
        >
          <Check className="w-4 h-4" />
          <span>{isSaving ? 'Saving Formats...' : 'Save Receipt Design & Settings'}</span>
        </button>
      </div>
    </div>
  );
};
