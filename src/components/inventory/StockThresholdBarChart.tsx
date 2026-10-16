import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell, 
  ReferenceLine 
} from 'recharts';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  BarChart3, 
  Filter, 
  ArrowUpDown, 
  ShieldAlert, 
  Package, 
  Sparkles,
  Info
} from 'lucide-react';
import { InventoryItem } from '../../types';

export interface StockThresholdBarChartProps {
  inventory: InventoryItem[];
  selectedCategory?: string;
  onSelectItem?: (item: InventoryItem) => void;
  className?: string;
}

type FilterMode = 'ALL' | 'DEFICIT_ONLY' | 'OUT_OF_STOCK';
type SortMode = 'DEFICIT_FIRST' | 'STOCK_ASC' | 'STOCK_DESC' | 'NAME_ASC';

interface ProcessedChartItem {
  id: string;
  itemCode: string;
  itemName: string;
  shortName: string;
  itemNameTamil?: string;
  category: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  deficit: number;
  ratio: number;
  status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HEALTHY';
  rawItem: InventoryItem;
}

export const StockThresholdBarChart: React.FC<StockThresholdBarChartProps> = ({
  inventory,
  selectedCategory,
  onSelectItem,
  className = ''
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('DEFICIT_FIRST');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>(selectedCategory || 'ALL');

  // Sync category filter when prop changes
  React.useEffect(() => {
    if (selectedCategory) {
      setActiveCategoryFilter(selectedCategory);
    }
  }, [selectedCategory]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set).sort();
  }, [inventory]);

  // Process data points
  const { chartData, metrics } = useMemo(() => {
    let lowCount = 0;
    let outCount = 0;
    let healthyCount = 0;

    const processed: ProcessedChartItem[] = inventory.map((item) => {
      const current = Number(item.currentStock) || 0;
      const min = Number(item.minimumStock) || 0;
      const deficit = Math.max(0, min - current);
      const ratio = min > 0 ? (current / min) : (current > 0 ? 2 : 0);

      let status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HEALTHY' = 'HEALTHY';
      if (current <= 0) {
        status = 'OUT_OF_STOCK';
        outCount += 1;
      } else if (current < min) {
        status = 'LOW_STOCK';
        lowCount += 1;
      } else {
        healthyCount += 1;
      }

      const shortName = item.itemName.length > 14 
        ? `${item.itemName.slice(0, 13)}…` 
        : item.itemName;

      return {
        id: item.id,
        itemCode: item.itemCode || '',
        itemName: item.itemName,
        shortName,
        itemNameTamil: item.itemNameTamil,
        category: item.category || 'General',
        unit: item.unit || 'Nos',
        currentStock: current,
        minimumStock: min,
        deficit,
        ratio,
        status,
        rawItem: item
      };
    });

    // Filter by Category
    let filtered = processed;
    if (activeCategoryFilter !== 'ALL') {
      filtered = filtered.filter(
        (i) => i.category.toLowerCase() === activeCategoryFilter.toLowerCase()
      );
    }

    // Filter by Threshold status
    if (filterMode === 'DEFICIT_ONLY') {
      filtered = filtered.filter((i) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK');
    } else if (filterMode === 'OUT_OF_STOCK') {
      filtered = filtered.filter((i) => i.status === 'OUT_OF_STOCK');
    }

    // Sort items
    filtered.sort((a, b) => {
      if (sortMode === 'DEFICIT_FIRST') {
        if (b.deficit !== a.deficit) return b.deficit - a.deficit;
        return a.ratio - b.ratio;
      }
      if (sortMode === 'STOCK_ASC') return a.currentStock - b.currentStock;
      if (sortMode === 'STOCK_DESC') return b.currentStock - a.currentStock;
      return a.itemName.localeCompare(b.itemName);
    });

    // Limit to max 24 items in chart for crisp layout readability
    const chartItems = filtered.slice(0, 24);

    return {
      chartData: chartItems,
      metrics: {
        totalMonitored: inventory.length,
        lowStock: lowCount,
        outOfStock: outCount,
        healthy: healthyCount
      }
    };
  }, [inventory, activeCategoryFilter, filterMode, sortMode]);

  // Color generator for stock bar
  const getBarColor = (item: ProcessedChartItem) => {
    if (item.currentStock <= 0) return '#ef4444'; // Red for Out of Stock
    if (item.currentStock < item.minimumStock) return '#f59e0b'; // Amber for Low Stock
    return '#10b981'; // Emerald for Healthy Stock
  };

  return (
    <div 
      className={`bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4 ${className}`}
      data-testid="stock-threshold-chart-container"
    >
      {/* Header and Title */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Stock vs Minimum Threshold Visualizer</span>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                Safety Stock
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Live comparison of physical stock counts against mandatory buffer threshold requirements
            </p>
          </div>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>{metrics.healthy} Healthy</span>
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${
            metrics.lowStock > 0 
              ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse' 
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>{metrics.lowStock} Below Min</span>
          </div>

          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${
            metrics.outOfStock > 0 
              ? 'bg-red-50 border-red-200 text-red-700' 
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span>{metrics.outOfStock} Out of Stock</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Sort Dropdowns */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 text-xs">
        {/* Category Pills / Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-0.5">
          <span className="text-slate-400 font-bold text-[11px] flex items-center gap-1 shrink-0 pl-1">
            <Filter className="w-3 h-3 text-slate-500" />
            Category:
          </span>
          <button
            type="button"
            onClick={() => setActiveCategoryFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold text-2xs sm:text-xs transition-colors cursor-pointer shrink-0 ${
              activeCategoryFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            All Categories ({inventory.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-lg font-bold text-2xs sm:text-xs transition-colors cursor-pointer shrink-0 ${
                activeCategoryFilter === cat
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* View Filter & Sort Options */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Status Filter */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-2 py-0.5 rounded-md font-bold text-2xs transition-colors cursor-pointer ${
                filterMode === 'ALL' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Items
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('DEFICIT_ONLY')}
              className={`px-2 py-0.5 rounded-md font-bold text-2xs transition-colors cursor-pointer flex items-center gap-1 ${
                filterMode === 'DEFICIT_ONLY' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Low Only</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-2xs font-bold text-slate-700 cursor-pointer shadow-2xs focus:outline-none"
              aria-label="Sort inventory items"
            >
              <option value="DEFICIT_FIRST">Sort: Largest Deficit</option>
              <option value="STOCK_ASC">Sort: Lowest Stock</option>
              <option value="STOCK_DESC">Sort: Highest Stock</option>
              <option value="NAME_ASC">Sort: Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      {chartData.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-center">
          <Package className="w-8 h-8 text-slate-300 mb-2" />
          <p className="text-xs font-bold text-slate-700">No inventory items match the current filter.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Try resetting the category or status filter above.</p>
        </div>
      ) : (
        <div className="w-full">
          <div className="h-80 w-full" data-testid="recharts-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 25, right: 15, left: -10, bottom: 50 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="shortName" 
                  angle={-30} 
                  textAnchor="end" 
                  interval={0}
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  height={55}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  allowDecimals={false}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload as ProcessedChartItem;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-white text-xs max-w-xs space-y-1.5 z-50">
                        <div className="border-b border-slate-800 pb-1.5 flex items-start justify-between gap-2">
                          <div>
                            <div className="font-extrabold text-sm text-amber-300">
                              {data.itemName}
                            </div>
                            {data.itemNameTamil && (
                              <div className="text-[11px] text-slate-400 font-sans">
                                {data.itemNameTamil}
                              </div>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            {data.category}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-2xs pt-1">
                          <div className="bg-slate-800/80 p-1.5 rounded-lg">
                            <span className="text-slate-400 block">Current Stock:</span>
                            <span className="font-mono text-sm font-black text-white">
                              {data.currentStock} {data.unit}
                            </span>
                          </div>
                          <div className="bg-slate-800/80 p-1.5 rounded-lg">
                            <span className="text-slate-400 block">Min Threshold:</span>
                            <span className="font-mono text-sm font-black text-slate-300">
                              {data.minimumStock} {data.unit}
                            </span>
                          </div>
                        </div>

                        <div className="pt-1">
                          {data.status === 'OUT_OF_STOCK' ? (
                            <div className="flex items-center gap-1.5 text-red-400 font-bold text-2xs bg-red-950/70 border border-red-800/60 p-1 rounded">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>OUT OF STOCK: Immediate restocking required</span>
                            </div>
                          ) : data.status === 'LOW_STOCK' ? (
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-2xs bg-amber-950/70 border border-amber-800/60 p-1 rounded">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>BELOW MINIMUM: Deficit of {data.deficit} {data.unit}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-2xs bg-emerald-950/70 border border-emerald-800/60 p-1 rounded">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>HEALTHY: +{data.currentStock - data.minimumStock} {data.unit} safety buffer</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                <Legend 
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 600 }}
                />

                {/* Bar 1: Current Stock Level (Dynamic Color Coded) */}
                <Bar 
                  dataKey="currentStock" 
                  name="Current Stock Level"
                  radius={[4, 4, 0, 0]}
                  onClick={(data: any) => {
                    if (data && data.rawItem && onSelectItem) {
                      onSelectItem(data.rawItem);
                    }
                  }}
                  cursor={onSelectItem ? 'pointer' : 'default'}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                  ))}
                </Bar>

                {/* Bar 2: Minimum Required Buffer Threshold */}
                <Bar 
                  dataKey="minimumStock" 
                  name="Minimum Required Threshold"
                  fill="#94a3b8" 
                  opacity={0.6}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Color Legend Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-2xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span className="font-semibold text-slate-700">Healthy Stock (&ge; Min)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span className="font-semibold text-slate-700">Low Stock (&lt; Min)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                <span className="font-semibold text-slate-700">Out of Stock (= 0)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-400/60 inline-block" />
                <span className="font-semibold text-slate-700">Required Threshold</span>
              </span>
            </div>

            <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
              <Info className="w-3 h-3" />
              Showing {chartData.length} items. Click any bar to jump to item stock.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
