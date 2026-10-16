import React, { useState } from 'react';
import {
  HardDrive,
  Download,
  Clock,
  ShieldCheck,
  Calendar,
  FileCheck2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Layers,
  FileText
} from 'lucide-react';
import { RestaurantSettings, DailyBackupRecord, AutomatedDailyBackupConfig } from '../../types';
import {
  getAutomatedDailyBackupConfig,
  saveAutomatedDailyBackupConfig,
  getDailyBackupHistory,
  exportCoreBillingArchive,
  downloadDatabaseBackup,
  triggerBlobDownload
} from '../../services/backupService';
import { getBusinessDate } from '../../services/billNumberEngine';

interface DailyBackupSettingsCardProps {
  settings?: RestaurantSettings;
  onRefreshSettings?: () => void;
}

export const DailyBackupSettingsCard: React.FC<DailyBackupSettingsCardProps> = ({
  settings,
  onRefreshSettings
}) => {
  const [config, setConfig] = useState<AutomatedDailyBackupConfig>(getAutomatedDailyBackupConfig);
  const [history, setHistory] = useState<DailyBackupRecord[]>(getDailyBackupHistory);
  const [isExportingCore, setIsExportingCore] = useState(false);
  const [isExportingFull, setIsExportingFull] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showSchemaInfo, setShowSchemaInfo] = useState(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<DailyBackupRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const activeBusinessDate = getBusinessDate(settings?.businessDayStartHour || '04:00');

  const todayRecord = history.find(
    (r) => r.businessDate === activeBusinessDate && r.status === 'SUCCESS'
  );

  const handleConfigChange = async (updates: Partial<AutomatedDailyBackupConfig>) => {
    const updated = await saveAutomatedDailyBackupConfig(updates);
    setConfig(updated);
    setStatusMessage({ text: 'Automated backup settings updated successfully.', type: 'success' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleExportCoreBilling = async () => {
    setIsExportingCore(true);
    setStatusMessage(null);
    try {
      const result = await exportCoreBillingArchive({
        restaurantSettings: settings,
        businessDate: activeBusinessDate,
        triggerType: 'MANUAL',
        autoDownload: true
      });

      if (result.success && result.record) {
        setHistory(getDailyBackupHistory());
        setStatusMessage({
          text: `Core billing archive downloaded: ${result.billCount} bills (₹${result.totalRevenue.toLocaleString('en-IN')}) exported to "${result.filename}"`,
          type: 'success'
        });
      } else {
        setStatusMessage({
          text: result.error || 'Failed to generate core billing backup.',
          type: 'error'
        });
      }
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'Error creating core billing backup.', type: 'error' });
    } finally {
      setIsExportingCore(false);
    }
  };

  const handleExportFullDatabase = async () => {
    setIsExportingFull(true);
    setStatusMessage(null);
    try {
      const result = await downloadDatabaseBackup(settings?.restaurantName);
      if (result.success) {
        setHistory(getDailyBackupHistory());
        setStatusMessage({
          text: `Full database backup downloaded: ${result.totalDocuments} documents exported to "${result.filename}"`,
          type: 'success'
        });
      } else {
        setStatusMessage({
          text: result.error || 'Failed to export full database.',
          type: 'error'
        });
      }
    } catch (e: any) {
      setStatusMessage({ text: e?.message || 'Error exporting full database.', type: 'error' });
    } finally {
      setIsExportingFull(false);
    }
  };

  const handleReDownload = (record: DailyBackupRecord) => {
    // Generates a clean downloadable summary for historical record
    const summaryJson = JSON.stringify({
      archiveRecord: record,
      restaurant: settings?.restaurantName || 'Restaurant',
      exportedAt: record.exportedAt,
      instructions: 'Historical archive metadata. To re-export live database records, use "Export Core Billing Archive (.JSON)".'
    }, null, 2);
    triggerBlobDownload(record.filename, summaryJson);
  };

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-5" id="automated-daily-backup-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">Automated Daily Database Backup & Billing Archives</h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                JSON Archiving
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatically exports core billing, receipts, itemized sales, and register logs to a downloadable JSON file for manual archiving.
            </p>
          </div>
        </div>

        {/* Daily Backup Status Pill */}
        <div className="shrink-0">
          {todayRecord ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Archived Today ({todayRecord.billCount} bills • ₹{todayRecord.totalRevenue.toLocaleString('en-IN')})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Pending Today's Backup (Scheduled at {config.scheduledTime})</span>
            </div>
          )}
        </div>
      </div>

      {/* Notification status banner */}
      {statusMessage && (
        <div className={`p-3 rounded-xl flex items-center gap-2.5 text-xs font-medium ${
          statusMessage.type === 'success'
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/15 border border-red-500/30 text-red-300'
        }`}>
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span className="flex-1">{statusMessage.text}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
        {/* Toggle Automated Backup */}
        <div className="flex items-start justify-between gap-3 pr-2">
          <div>
            <label className="text-xs font-bold text-slate-200 block">Automated Daily Backup</label>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              When enabled, the POS system runs a daily scheduled backup of all billing records and automatically saves a downloadable JSON archive.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
            <input
              type="checkbox"
              id="toggle-automated-daily-backup"
              checked={config.enabled}
              onChange={(e) => handleConfigChange({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Scheduled Time */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Daily Backup Time (24h)</span>
            </label>
            <span className="text-[10px] text-slate-400">Current Business Day: {activeBusinessDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="time"
              id="input-daily-backup-time"
              disabled={!config.enabled}
              value={config.scheduledTime}
              onChange={(e) => handleConfigChange({ scheduledTime: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={!config.enabled}
              onClick={() => handleConfigChange({ scheduledTime: '22:00' })}
              className="px-2.5 py-2 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-950 border border-slate-800 rounded-lg whitespace-nowrap cursor-pointer hover:border-slate-700 disabled:opacity-50"
              title="Reset to standard 10:00 PM closing time"
            >
              22:00 (10 PM)
            </button>
          </div>
        </div>

        {/* Download Mode */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-200 block">Browser Download Behavior</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!config.enabled}
              onClick={() => handleConfigChange({ autoDownload: true })}
              className={`py-2 px-3 text-xs rounded-lg border text-left cursor-pointer transition-all ${
                config.autoDownload
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              } disabled:opacity-50`}
            >
              <span className="block font-semibold">Auto-Download File</span>
              <span className="text-[10px] opacity-75">Saves directly to Downloads</span>
            </button>
            <button
              type="button"
              disabled={!config.enabled}
              onClick={() => handleConfigChange({ autoDownload: false })}
              className={`py-2 px-3 text-xs rounded-lg border text-left cursor-pointer transition-all ${
                !config.autoDownload
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              } disabled:opacity-50`}
            >
              <span className="block font-semibold">Notify with Prompt</span>
              <span className="text-[10px] opacity-75">Shows 1-click download toast</span>
            </button>
          </div>
        </div>

        {/* Backup Scope */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-200 block">Archive Data Scope</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!config.enabled}
              onClick={() => handleConfigChange({ scope: 'CORE_BILLING' })}
              className={`py-2 px-3 text-xs rounded-lg border text-left cursor-pointer transition-all ${
                config.scope === 'CORE_BILLING'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              } disabled:opacity-50`}
            >
              <span className="block font-semibold">Core Billing Data</span>
              <span className="text-[10px] opacity-75">Bills, items, KOTs, registers</span>
            </button>
            <button
              type="button"
              disabled={!config.enabled}
              onClick={() => handleConfigChange({ scope: 'FULL_DATABASE' })}
              className={`py-2 px-3 text-xs rounded-lg border text-left cursor-pointer transition-all ${
                config.scope === 'FULL_DATABASE'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              } disabled:opacity-50`}
            >
              <span className="block font-semibold">Full Database</span>
              <span className="text-[10px] opacity-75">All collections & telemetry</span>
            </button>
          </div>
        </div>
      </div>

      {/* Instant Actions (Manual Archiving) */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span>Manual Archiving & Export on Demand</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            id="download-core-billing-archive-btn"
            onClick={handleExportCoreBilling}
            disabled={isExportingCore || isExportingFull}
            className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm text-xs"
          >
            <Download className={`w-4 h-4 ${isExportingCore ? 'animate-bounce' : ''}`} />
            <span>{isExportingCore ? 'Compiling Billing Archive...' : 'Download Core Billing Archive (.JSON)'}</span>
          </button>

          <button
            type="button"
            id="download-full-database-archive-btn"
            onClick={handleExportFullDatabase}
            disabled={isExportingCore || isExportingFull}
            className="py-2.5 px-4 bg-slate-900 hover:bg-slate-850 active:bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs disabled:opacity-50"
          >
            <Layers className={`w-4 h-4 ${isExportingFull ? 'animate-spin' : ''}`} />
            <span>{isExportingFull ? 'Exporting All Collections...' : 'Download Full Database (.JSON)'}</span>
          </button>
        </div>
      </div>

      {/* Historical Backups Table */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>Daily Archive History ({history.length} records)</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
          </button>
          <span className="text-[11px] text-slate-400 font-mono">
            {todayRecord ? 'Status: Up to date' : 'Status: Daily archive due'}
          </span>
        </div>

        {showHistory && (
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            {history.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                <HardDrive className="w-8 h-8 mx-auto text-slate-700 mb-2 opacity-60" />
                <p>No archives generated yet. Click "Download Core Billing Archive" above to produce today's backup.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-64 no-scrollbar">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Date & Time</th>
                      <th className="py-2 px-3">Trigger</th>
                      <th className="py-2 px-3">Scope</th>
                      <th className="py-2 px-3">Bills & Sales</th>
                      <th className="py-2 px-3">Records</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {history.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="font-bold text-slate-200">{record.businessDate}</div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(record.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            record.triggerType === 'AUTOMATED'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                          }`}>
                            {record.triggerType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-400">
                          {record.action === 'Export Excel' || record.exportFormat === 'Export Excel' || record.exportFormat === 'XLSX' ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">
                              Export Excel
                            </span>
                          ) : record.scope === 'CORE_BILLING' ? (
                            'Core Billing'
                          ) : (
                            'Full DB'
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="text-emerald-400 font-bold">{record.billCount} bills</span>
                          {record.totalRevenue > 0 && (
                            <span className="text-slate-400 ml-1.5 font-normal">
                              (₹{record.totalRevenue.toLocaleString('en-IN')})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 text-[11px]">
                          {record.totalDocuments} docs
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleReDownload(record)}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title={`Re-download file: ${record.filename}`}
                          >
                            <Download className="w-3 h-3 text-emerald-400" />
                            <span>Download</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Archiving Instructions & Schema Toggle */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowSchemaInfo(!showSchemaInfo)}
          className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5 cursor-pointer font-medium"
        >
          <Info className="w-3.5 h-3.5 text-emerald-400" />
          <span>{showSchemaInfo ? 'Hide Archive Specifications & Restore Guide' : 'How does Core Billing JSON Archiving work?'}</span>
          {showSchemaInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showSchemaInfo && (
          <div className="mt-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-2 leading-relaxed">
            <p>
              <strong className="text-slate-200">Core Billing Data Archive Structure:</strong> Every generated JSON file bundles all completed & cancelled bills, itemized line records, active table drafts, kitchen order tickets (KOTs), daily business registers, counter sequences, and catalog configurations.
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-300 font-mono text-[10px]">
              <li>Archive Name: <span className="text-emerald-400">&#123;restaurant&#125;_billing_backup_YYYY-MM-DD_HHMMSS.json</span></li>
              <li>Calculates automated financial summaries: Total Revenue, Cash vs UPI splits, and average bill value.</li>
              <li>Embeds 32-bit FNV-1a verification checksum to prevent data tampering.</li>
              <li>Compliant with accounting standards and manual archiving on local pen drives, external SSDs, or secure cloud drives.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
