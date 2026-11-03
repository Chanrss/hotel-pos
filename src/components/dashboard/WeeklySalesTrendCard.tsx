import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  BarChart3, 
  Award, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownRight, 
  ReceiptText,
  Calendar,
  Activity,
  Database
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell
} from 'recharts';
import { Bill } from '../../types';
import { calculateDailyNetSales } from '../../services/salesCalculationEngine';

export interface DailyTrendPoint {
  date: string;
  dayLabel: string;
  shortDate: string;
  fullDateLabel: string;
  sales: number;
  orders: number;
  avgTicket: number;
  isToday: boolean;
}

export interface WeeklySalesTrendCardProps {
  bills: Bill[];
  businessDate: string;
  canViewRevenue: boolean;
  isFirestoreLive?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyTrendPoint }>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data: DailyTrendPoint = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-700 text-xs min-w-[190px]">
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
          <span className="font-bold text-slate-200">{data.fullDateLabel}</span>
          {data.isToday && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
              Today
            </span>
          )}
        </div>
        <div className="pt-2 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Revenue:</span>
            <span className="font-mono font-black text-emerald-400 text-sm">
              ₹{data.sales.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Completed Orders:</span>
            <span className="font-mono font-bold text-slate-200">{data.orders} bills</span>
          </div>
          {data.orders > 0 && (
            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800">
              <span className="text-slate-400">Avg Ticket:</span>
              <span className="font-mono text-amber-300">
                ₹{data.avgTicket.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const WeeklySalesTrendCard: React.FC<WeeklySalesTrendCardProps> = ({
  bills,
  businessDate,
  canViewRevenue,
  isFirestoreLive = true
}) => {
  // Default to 'line' as requested: visualize daily sales revenue trends over past 7 days via Recharts Line chart
  const [chartViewMode, setChartViewMode] = useState<'line' | 'area' | 'bar'>('line');

  // Compute 7 consecutive days ending on businessDate (Day -6 to Today)
  const last7DaysInfo = useMemo(() => {
    const parts = businessDate.split('-').map((p) => parseInt(p, 10));
    const year = parts[0] || new Date().getFullYear();
    const month = parts[1] || (new Date().getMonth() + 1);
    const day = parts[2] || new Date().getDate();

    const baseDate = new Date(year, month - 1, day);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const days: {
      date: string;
      dayLabel: string;
      shortDate: string;
      fullDateLabel: string;
      isToday: boolean;
    }[] = [];

    for (let i = 6; i >= 0; i--) {
      const target = new Date(baseDate);
      target.setDate(baseDate.getDate() - i);

      const yyyy = target.getFullYear();
      const mm = String(target.getMonth() + 1).padStart(2, '0');
      const dd = String(target.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const dayOfWeek = target.getDay();
      const dayLabel = dayNames[dayOfWeek];
      const shortDate = `${target.getDate()} ${monthNames[target.getMonth()]}`;
      const fullDateLabel = `${dayNames[dayOfWeek]}, ${target.getDate()} ${monthNames[target.getMonth()]}`;

      days.push({
        date: dateStr,
        dayLabel,
        shortDate,
        fullDateLabel,
        isToday: dateStr === businessDate
      });
    }

    return days;
  }, [businessDate]);

  // Aggregate daily sales & orders using canonical calculateDailyNetSales
  // (Prevents duplicate counting of reprints, excludes cancelled bills, and handles re-bills correctly)
  const trendData: DailyTrendPoint[] = useMemo(() => {
    const billsByDate: Record<string, Bill[]> = {};
    bills.forEach((b) => {
      const d = b.businessDate;
      if (!billsByDate[d]) {
        billsByDate[d] = [];
      }
      billsByDate[d].push(b);
    });

    return last7DaysInfo.map((item) => {
      const dayBills = billsByDate[item.date] || [];
      const breakdown = calculateDailyNetSales(dayBills);
      const avgTicket = breakdown.validBillCount > 0 ? Math.round(breakdown.netSales / breakdown.validBillCount) : 0;
      return {
        ...item,
        sales: breakdown.netSales,
        orders: breakdown.validBillCount,
        avgTicket
      };
    });
  }, [bills, last7DaysInfo]);

  // High-level 7-day aggregates
  const totalRevenue = useMemo(() => {
    return trendData.reduce((acc, d) => acc + d.sales, 0);
  }, [trendData]);

  const totalOrders = useMemo(() => {
    return trendData.reduce((acc, d) => acc + d.orders, 0);
  }, [trendData]);

  const dailyAverage = useMemo(() => {
    return Math.round(totalRevenue / 7);
  }, [totalRevenue]);

  const peakDay = useMemo(() => {
    return trendData.reduce((best, cur) => (cur.sales > best.sales ? cur : best), trendData[0]);
  }, [trendData]);

  const todayPoint = useMemo(() => {
    return trendData.find((d) => d.isToday) || trendData[trendData.length - 1];
  }, [trendData]);

  // Compare today to daily average
  const todayComparison = useMemo(() => {
    if (dailyAverage === 0) return { pct: 0, isHigher: false };
    const diff = todayPoint.sales - dailyAverage;
    const pct = Math.round(Math.abs(diff / dailyAverage) * 100);
    return { pct, isHigher: diff >= 0 };
  }, [todayPoint, dailyAverage]);

  const startDateLabel = last7DaysInfo[0]?.shortDate || '';
  const endDateLabel = last7DaysInfo[last7DaysInfo.length - 1]?.shortDate || '';

  // Custom Dot for Recharts Line Chart
  const renderLineDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (typeof cx !== 'number' || typeof cy !== 'number') return null;
    const isToday = payload?.isToday;
    const isPeak = peakDay && payload?.date === peakDay.date && peakDay.sales > 0;

    if (isToday) {
      return (
        <g key={`dot-${payload.date}`}>
          <circle cx={cx} cy={cy} r={6} fill="#d97706" stroke="#ffffff" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={9} fill="none" stroke="#d97706" strokeWidth={1} strokeDasharray="2 2" opacity={0.8} />
        </g>
      );
    }
    if (isPeak) {
      return (
        <circle key={`dot-${payload.date}`} cx={cx} cy={cy} r={5.5} fill="#059669" stroke="#ffffff" strokeWidth={2} />
      );
    }
    return (
      <circle key={`dot-${payload.date}`} cx={cx} cy={cy} r={4} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
    );
  };

  return (
    <div 
      id="weekly-sales-trend-card"
      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col gap-4"
    >
      {/* Header: Title, 7-Day Range, and Metric Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#0F172A] text-emerald-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
                Weekly Sales Trend
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md whitespace-nowrap">
                <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Last 7 Days: {startDateLabel} – {endDateLabel}</span>
              </span>
              {isFirestoreLive && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md" title="Real-time data synced from Firestore bills collection">
                  <Database className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span>Firestore Live</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualizing daily revenue trajectory and billing volume over the past 7 days
            </p>
          </div>
        </div>

        {/* View Toggle (Line vs Area vs Bar) & Metrics */}
        {canViewRevenue && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle View */}
            <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChartViewMode('line')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  chartViewMode === 'line'
                    ? 'bg-[#0F172A] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Line Chart</span>
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('area')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  chartViewMode === 'area'
                    ? 'bg-[#0F172A] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Area Curve</span>
              </button>
              <button
                type="button"
                onClick={() => setChartViewMode('bar')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  chartViewMode === 'bar'
                    ? 'bg-[#0F172A] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Daily Bars</span>
              </button>
            </div>

            {/* Quick Stat Pill: 7-Day Total */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">7-Day Total:</span>
              <span className="font-mono font-black text-xs sm:text-sm text-emerald-600">
                ₹{totalRevenue.toLocaleString()}
              </span>
            </div>

            {/* Quick Stat Pill: Peak Day */}
            {peakDay && peakDay.sales > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 flex items-center gap-1.5 text-emerald-900">
                <Award className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-[10px] font-bold">
                  Peak: <span className="font-mono">{peakDay.dayLabel}</span> (₹{peakDay.sales.toLocaleString()})
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Visualization Canvas */}
      <div className="w-full">
        {canViewRevenue ? (
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartViewMode === 'line' ? (
                /* Recharts LineChart for Daily Sales Revenue Trends */
                <LineChart
                  data={trendData}
                  margin={{ top: 12, right: 16, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={({ x, y, payload }) => {
                      const point = trendData.find((d) => d.dayLabel === payload.value);
                      const isToday = point?.isToday;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={12}
                            textAnchor="middle"
                            fill={isToday ? '#b45309' : '#475569'}
                            fontWeight={isToday ? 800 : 600}
                            fontSize={11}
                          >
                            {payload.value}
                          </text>
                          {point && (
                            <text
                              x={0}
                              y={0}
                              dy={24}
                              textAnchor="middle"
                              fill={isToday ? '#d97706' : '#94a3b8'}
                              fontSize={9}
                              fontFamily="monospace"
                            >
                              {point.shortDate}
                            </text>
                          )}
                        </g>
                      );
                    }}
                    height={42}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  {dailyAverage > 0 && (
                    <ReferenceLine 
                      y={dailyAverage} 
                      stroke="#cbd5e1" 
                      strokeDasharray="4 4" 
                      label={{ 
                        value: `Avg: ₹${dailyAverage >= 1000 ? `${(dailyAverage / 1000).toFixed(1)}k` : dailyAverage}`, 
                        position: 'insideTopRight', 
                        fill: '#64748b', 
                        fontSize: 10,
                        fontFamily: 'monospace'
                      }} 
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="Daily Revenue"
                    stroke="#059669"
                    strokeWidth={3}
                    dot={renderLineDot}
                    activeDot={{ 
                      r: 7, 
                      stroke: '#059669', 
                      strokeWidth: 2.5, 
                      fill: '#ffffff' 
                    }}
                  />
                </LineChart>
              ) : chartViewMode === 'area' ? (
                /* Recharts AreaChart */
                <AreaChart
                  data={trendData}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="salesTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={({ x, y, payload }) => {
                      const point = trendData.find((d) => d.dayLabel === payload.value);
                      const isToday = point?.isToday;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={12}
                            textAnchor="middle"
                            fill={isToday ? '#b45309' : '#475569'}
                            fontWeight={isToday ? 800 : 600}
                            fontSize={11}
                          >
                            {payload.value}
                          </text>
                          {point && (
                            <text
                              x={0}
                              y={0}
                              dy={24}
                              textAnchor="middle"
                              fill={isToday ? '#d97706' : '#94a3b8'}
                              fontSize={9}
                              fontFamily="monospace"
                            >
                              {point.shortDate}
                            </text>
                          )}
                        </g>
                      );
                    }}
                    height={42}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="#059669"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#salesTrendGradient)"
                    activeDot={{ r: 6, stroke: '#059669', strokeWidth: 2, fill: '#ffffff' }}
                  />
                </AreaChart>
              ) : (
                /* Recharts BarChart */
                <BarChart
                  data={trendData}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={({ x, y, payload }) => {
                      const point = trendData.find((d) => d.dayLabel === payload.value);
                      const isToday = point?.isToday;
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            dy={12}
                            textAnchor="middle"
                            fill={isToday ? '#b45309' : '#475569'}
                            fontWeight={isToday ? 800 : 600}
                            fontSize={11}
                          >
                            {payload.value}
                          </text>
                          {point && (
                            <text
                              x={0}
                              y={0}
                              dy={24}
                              textAnchor="middle"
                              fill={isToday ? '#d97706' : '#94a3b8'}
                              fontSize={9}
                              fontFamily="monospace"
                            >
                              {point.shortDate}
                            </text>
                          )}
                        </g>
                      );
                    }}
                    height={42}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar
                    dataKey="sales"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                  >
                    {trendData.map((entry, index) => {
                      let fillColor = '#0284c7'; // Sky/Blue for past days
                      if (entry.isToday) {
                        fillColor = '#d97706'; // Amber for Today
                      } else if (peakDay && entry.date === peakDay.date && peakDay.sales > 0) {
                        fillColor = '#059669'; // Emerald for Peak day
                      }
                      return <Cell key={`cell-${index}`} fill={fillColor} />;
                    })}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-44 flex flex-col items-center justify-center text-slate-400 p-4 border border-dashed border-slate-200 rounded-xl">
            <ShieldAlert className="w-8 h-8 text-amber-500 mb-2" />
            <p className="text-xs font-bold text-slate-700">Financial Visualizations Restricted</p>
            <p className="text-[11px] text-slate-500">Your role does not have access to view weekly revenue metrics.</p>
          </div>
        )}
      </div>

      {/* Footer Metrics Breakdown: 7-Day Performance Indicators */}
      {canViewRevenue && (
        <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
          {/* Card 1: 7-Day Average Daily Sales */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] font-semibold text-slate-500">Daily Average</div>
            <div className="font-mono font-black text-sm sm:text-base text-slate-900 mt-0.5">
              ₹{dailyAverage.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">7-day rolling mean</div>
          </div>

          {/* Card 2: 7-Day Order Volume */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <ReceiptText className="w-3 h-3 text-slate-400" />
              <span>Completed Bills</span>
            </div>
            <div className="font-mono font-black text-sm sm:text-base text-slate-900 mt-0.5">
              {totalOrders} bills
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Avg {totalOrders > 0 ? (totalOrders / 7).toFixed(1) : 0} bills/day
            </div>
          </div>

          {/* Card 3: Today's Revenue */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] font-semibold text-slate-500">Today's Sales</div>
            <div className="font-mono font-black text-sm sm:text-base text-amber-700 mt-0.5">
              ₹{todayPoint.sales.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {todayPoint.orders} orders logged
            </div>
          </div>

          {/* Card 4: Trend Momentum */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 sm:p-3">
            <div className="text-[11px] font-semibold text-slate-500">Trend Momentum</div>
            <div className="flex items-center gap-1 mt-0.5">
              {todayComparison.isHigher ? (
                <>
                  <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-mono font-bold text-xs sm:text-sm text-emerald-700">
                    +{todayComparison.pct}% vs avg
                  </span>
                </>
              ) : (
                <>
                  <ArrowDownRight className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="font-mono font-bold text-xs sm:text-sm text-slate-700">
                    -{todayComparison.pct}% vs avg
                  </span>
                </>
              )}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Today vs 7-day average</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklySalesTrendCard;

