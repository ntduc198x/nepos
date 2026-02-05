
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, BarChart3, List, X, ArrowLeft, Receipt, Clock, Wallet, 
  CreditCard, DollarSign, ShoppingBag, CheckCircle2, XCircle, 
  HelpCircle, Smartphone, Printer, TrendingUp, Calendar, Users, 
  PieChart, FileDown, Copy, Check, ChevronRight, Activity,
  ArrowRight, Eye, Loader2, Lock, Utensils, Coins, CreditCard as CardIcon, QrCode
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell
} from 'recharts';
import { useCurrency } from '../CurrencyContext';
import { useTheme } from '../ThemeContext';
import { useData } from '../context/DataContext';
import { enrichOrderDetails, getTableLabel } from '../utils/orderHelpers';
import { printOrderReceipt } from '../services/printService';
import { Order } from '../types';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../AuthContext';
import { supabase } from '../supabase';

type TabView = 'overview' | 'trends' | 'history' | 'payments' | 'staff' | 'export';
type DateRangeType = 'today' | 'yesterday' | 'week' | 'custom';

export const Reports: React.FC = () => {
  const { formatPrice } = useCurrency();
  const { t } = useTheme();
  const { menuItems, tables, getReportOrders } = useData();
  const { can, guardSensitive, settings } = useSettingsContext();
  const { role, user } = useAuth();

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [dateRange, setDateRange] = useState<DateRangeType>('today');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [reportData, setReportData] = useState<Order[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // --- REFS FOR STABLE FETCHING ---
  // Fix: Prevent infinite loop by stabilizing function references
  const canRef = useRef(can);
  const getReportOrdersRef = useRef(getReportOrders);
  const fetchingRef = useRef(false);

  useEffect(() => { canRef.current = can; }, [can]);
  useEffect(() => { getReportOrdersRef.current = getReportOrders; }, [getReportOrders]);

  // Stable permission check
  const canViewReport = useMemo(() => {
    try {
      return can('report.view');
    } catch {
      return false;
    }
  }, [can]);

  // --- FETCH ADMINS (For Manager RBAC) ---
  useEffect(() => {
    if (role === 'manager') {
      supabase.from('users').select('id').eq('role', 'admin')
        .then(({ data }) => {
          if (data) setAdminIds(new Set(data.map(u => u.id)));
        });
    }
  }, [role]);

  // --- MASKING HELPER ---
  const maskedFormatPrice = (val: number) => {
    if (settings.hideRevenue && role === 'staff') {
        return "—";
    }
    return formatPrice(val);
  };

  // --- HANDLERS ---
  const handleDatePreset = (preset: DateRangeType) => {
    setDateRange(preset);
    // Use local time for setting input values (YYYY-MM-DD)
    const now = new Date();
    
    // Helper to format YYYY-MM-DD in local time
    const toLocalYMD = (date: Date) => {
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
      return localDate.toISOString().split('T')[0];
    };

    if (preset === 'today') {
      const todayStr = toLocalYMD(now);
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toLocalYMD(y);
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      setFromDate(toLocalYMD(w));
      setToDate(toLocalYMD(now));
    }
  };

  useEffect(() => {
    handleDatePreset('today');
  }, []);

  // --- MAIN FETCH EFFECT ---
  useEffect(() => {
    const run = async () => {
      // 1. Pre-flight Checks
      if (!canViewReport) return;
      if (!fromDate || !toDate) return;
      if (fetchingRef.current) return; // Prevent re-entry

      // 2. Lock & Loading State
      fetchingRef.current = true;
      setIsLoading(true);

      try {
        // 3. Construct Date Objects (Local -> ISO UTC)
        // Parsing YYYY-MM-DD manually ensures we treat it as local time start/end
        const [fy, fm, fd] = fromDate.split('-').map(Number);
        const [ty, tm, td] = toDate.split('-').map(Number);

        const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
        const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);

        // 4. Call via Ref (Stable)
        const data = await getReportOrdersRef.current({ 
          from: start.toISOString(), 
          to: end.toISOString() 
        });

        // 5. Update State
        setReportData(data);
      } catch (err) {
        console.error('[Reports] fetch failed:', err);
      } finally {
        // 6. Cleanup & Unlock
        setIsLoading(false);
        fetchingRef.current = false;
      }
    };

    run();
  }, [fromDate, toDate, canViewReport]); // Minimal dependency array

  // --- RBAC FILTERED DATA ---
  // This is the single source of truth for charts and stats
  const accessibleOrders = useMemo(() => {
    // 1. Staff: Already filtered by DataContext (User ID check), but double check here for robustness
    if (role === 'staff' && user) {
        return reportData.filter(o => o.user_id === user.id || o.staff_name === user.email);
    }
    
    // 2. Manager: Filter out Admin orders (if adminIds loaded)
    if (role === 'manager') {
        return reportData.filter(o => !o.user_id || !adminIds.has(o.user_id));
    }

    // 3. Admin: See all
    return reportData;
  }, [reportData, role, user, adminIds]);

  // --- AGGREGATION ---
  const stats = useMemo(() => {
    const completed = accessibleOrders.filter(o => o.status === 'Completed');
    const revenue = completed.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const orderCount = completed.length;
    const cancelledCount = accessibleOrders.filter(o => o.status === 'Cancelled').length;
    
    return {
      revenue,
      orders: orderCount,
      cancelled: cancelledCount,
      aov: orderCount ? revenue / orderCount : 0,
      cancelRate: accessibleOrders.length ? (cancelledCount / accessibleOrders.length) * 100 : 0
    };
  }, [accessibleOrders]);

  // New Financial Summary Aggregation
  const financialSummary = useMemo(() => {
    const completed = accessibleOrders.filter(o => o.status === 'Completed');
    let grossSales = 0;
    let totalDiscount = 0;
    let netSales = 0;
    const paymentMethods: Record<string, number> = { 'Cash': 0, 'Card': 0, 'Transfer': 0 };

    completed.forEach(o => {
        const total = o.total_amount || 0;
        const discount = o.discount_amount || 0;
        const subtotal = total + discount; // Reconstruct gross

        grossSales += subtotal;
        totalDiscount += discount;
        netSales += total;

        const method = o.payment_method || 'Other';
        // Normalize keys
        let key = 'Other';
        if (method === 'Cash') key = 'Cash';
        else if (method === 'Card') key = 'Card';
        else if (method === 'Transfer') key = 'Transfer';
        
        paymentMethods[key] = (paymentMethods[key] || 0) + total;
    });

    return { grossSales, totalDiscount, netSales, paymentMethods };
  }, [accessibleOrders]);

  const filteredHistory = useMemo(() => {
    if (!accessibleOrders) return [];
    return accessibleOrders.filter(o => 
      o.id.toString().includes(searchQuery) || 
      getTableLabel(o, tables).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [accessibleOrders, searchQuery, tables]);

  // --- CHART DATA PREPARATION ---
  const hourlyData = useMemo(() => {
    const hours = Array(24).fill(0).map((_, i) => ({ 
      hour: i, 
      label: `${i}:00`, 
      amount: 0,
      orders: 0
    }));

    accessibleOrders.forEach(o => {
      if (o.status !== 'Completed') return;
      // Use updated_at as primary timestamp for revenue
      const timeStr = o.updated_at || o.created_at;
      if (!timeStr) return;
      
      const d = new Date(timeStr);
      const h = d.getHours();
      if (hours[h]) {
        hours[h].amount += (o.total_amount || 0);
        hours[h].orders += 1;
      }
    });

    return hours;
  }, [accessibleOrders]);

  const topItemsData = useMemo(() => {
    const itemMap = new Map<string, number>();
    
    accessibleOrders.forEach(o => {
      if (o.status !== 'Completed') return;
      const items = o.items || [];
      items.forEach((item: any) => {
        const name = item.snapshot_name || item.name || item._display_name || 'Unknown';
        const qty = item.quantity || item.qty || 0;
        itemMap.set(name, (itemMap.get(name) || 0) + qty);
      });
    });

    const sorted = Array.from(itemMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5); // Top 5

    return sorted;
  }, [accessibleOrders]);

  // --- ACTIONS ---
  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleExport = async () => {
    if (!can('report.export')) {
        alert(t('Export Permission Denied'));
        return;
    }

    const result = await guardSensitive('export_data', () => {
        const csvContent = "data:text/csv;charset=utf-8," 
            + "Order ID,Time,Table,Status,Total,Payment Method,Staff\n"
            + accessibleOrders.map(o => 
                `${o.id},${o.updated_at || o.created_at},${getTableLabel(o, tables)},${o.status},${o.total_amount},${o.payment_method || ''},${o.staff_name || ''}`
            ).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `resbar_report_${fromDate}_${toDate}.csv`);
        document.body.appendChild(link);
        link.click();
        return "OK";
    });

    if (!result.ok) {
        // Toast handled by guardSensitive
    }
  };

  // --- RENDER HELPERS ---
  const renderKPICard = (title: string, value: string, subValue: string, icon: any, colorClass: string) => (
    <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col gap-2 relative overflow-hidden group">
        <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${colorClass}`}>
            {React.createElement(icon, { size: 64 })}
        </div>
        <div className="flex items-center gap-2 mb-1">
            <div className={`p-2 rounded-lg ${colorClass.replace('text-', 'bg-').replace('500', '500/10')} ${colorClass}`}>
                {React.createElement(icon, { size: 18 })}
            </div>
            <span className="text-secondary font-bold text-xs uppercase tracking-wider">{title}</span>
        </div>
        <div className="text-3xl font-black text-text-main">{value}</div>
        <div className="text-xs font-medium text-secondary">{subValue}</div>
    </div>
  );

  // --- PERMISSION BLOCK ---
  if (!canViewReport) {
      return (
          <div className="flex-1 flex flex-col items-center justify-center h-full bg-background p-8 text-center animate-in fade-in">
              <div className="p-8 bg-surface border border-border rounded-3xl shadow-sm max-w-md flex flex-col items-center gap-4">
                  <div className="p-4 bg-red-500/10 rounded-full text-red-500">
                      <Lock size={48} />
                  </div>
                  <h2 className="text-xl font-bold text-text-main">{t('Access Denied')}</h2>
                  <p className="text-secondary text-sm whitespace-pre-line">
                      {t('Report Access Message')}
                  </p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-background transition-colors">
      
      {/* HEADER */}
      <div className="h-auto lg:h-20 p-4 lg:px-8 border-b border-border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-background/95 backdrop-blur shrink-0 z-20 sticky top-0">
         <div>
            <h1 className="text-2xl font-black text-text-main flex items-center gap-2">
               <BarChart3 className="text-primary" /> {t('Reports')}
            </h1>
            <p className="text-xs text-secondary font-medium mt-1">{t('Overview')} & {t('History')}</p>
         </div>
         
         <div className="flex flex-col lg:flex-row gap-3 w-full lg:w-auto">
            <div className="flex bg-surface p-1 rounded-xl border border-border shadow-sm">
               {(['today', 'yesterday', 'week', 'custom'] as DateRangeType[]).map(r => (
                 <button 
                   key={r}
                   onClick={() => handleDatePreset(r)}
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateRange === r ? 'bg-primary text-background shadow-md' : 'text-secondary hover:text-text-main'}`}
                 >
                   {t(r)}
                 </button>
               ))}
            </div>
            <div className="flex gap-2 items-center bg-surface border border-border rounded-xl px-2 shadow-sm">
                <Calendar size={16} className="text-secondary ml-1"/>
                <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setDateRange('custom'); }} className="bg-transparent border-none text-xs font-bold text-text-main outline-none py-2 w-24" />
                <ArrowRight size={12} className="text-secondary"/>
                <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setDateRange('custom'); }} className="bg-transparent border-none text-xs font-bold text-text-main outline-none py-2 w-24" />
            </div>
         </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
         
         {/* LEFT: TABS & STATS */}
         <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar">
            <div className="max-w-6xl mx-auto space-y-8 pb-20">
                {/* KPI GRID */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {renderKPICard(t('Revenue'), maskedFormatPrice(stats.revenue), `${stats.orders} ${t('Orders')}`, DollarSign, 'text-emerald-500')}
                    {renderKPICard(t('Total Orders'), stats.orders.toString(), t('Completed'), ShoppingBag, 'text-blue-500')}
                    {renderKPICard(t('AOV'), maskedFormatPrice(stats.aov), t('Avg Bill'), TrendingUp, 'text-purple-500')}
                    {renderKPICard(t('Cancel Rate'), `${stats.cancelRate.toFixed(1)}%`, `${stats.cancelled} ${t('Cancelled')}`, XCircle, 'text-red-500')}
                </div>

                {/* TABS */}
                <div className="border-b border-border flex gap-6 overflow-x-auto no-scrollbar">
                    {(['overview', 'history'] as TabView[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-3 text-sm font-bold uppercase tracking-wide border-b-2 transition-all whitespace-nowrap ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-secondary hover:text-text-main'}`}
                        >
                            {t(tab)}
                        </button>
                    ))}
                    {/* Restricted Tabs */}
                    {can('report.export') && (
                        <button onClick={handleExport} className="pb-3 text-sm font-bold uppercase tracking-wide border-b-2 border-transparent text-secondary hover:text-primary flex items-center gap-2 ml-auto">
                            <FileDown size={16} /> {t('Export')}
                        </button>
                    )}
                </div>

                {/* TAB CONTENT */}
                {isLoading ? (
                    <div className="h-64 flex items-center justify-center">
                        <Loader2 className="animate-spin text-primary" size={48} />
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && (
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                
                                {/* CHARTS SECTION */}
                                <div className="xl:col-span-2 space-y-6">
                                    {/* Hourly Revenue Chart */}
                                    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <h3 className="font-bold text-lg flex items-center gap-2">
                                                <TrendingUp size={20} className="text-emerald-500"/> {t('Hourly')}
                                            </h3>
                                        </div>
                                        <div className="h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="rgb(16, 185, 129)" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="rgb(16, 185, 129)" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.5} />
                                                    <XAxis 
                                                        dataKey="label" 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} 
                                                        interval={3}
                                                    />
                                                    <YAxis 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                                                        tickFormatter={(val) => val >= 1000 ? `${val/1000}k` : val}
                                                    />
                                                    <Tooltip 
                                                        contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        itemStyle={{ color: 'var(--color-text-main)', fontSize: '12px', fontWeight: 'bold' }}
                                                        labelStyle={{ color: 'var(--color-text-secondary)', fontSize: '10px', marginBottom: '4px' }}
                                                        formatter={(val: number) => maskedFormatPrice(val)}
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="amount" 
                                                        stroke="rgb(16, 185, 129)" 
                                                        strokeWidth={2}
                                                        fillOpacity={1} 
                                                        fill="url(#colorRevenue)" 
                                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Top Items Bar Chart */}
                                    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                                        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                                            <Utensils size={20} className="text-orange-500"/> {t('Top Selling Items')}
                                        </h3>
                                        <div className="h-[250px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={topItemsData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                                                    <XAxis type="number" hide />
                                                    <YAxis 
                                                        dataKey="name" 
                                                        type="category" 
                                                        axisLine={false} 
                                                        tickLine={false}
                                                        width={120}
                                                        tick={{ fontSize: 11, fill: 'var(--color-text-main)', fontWeight: 600 }}
                                                    />
                                                    <Tooltip
                                                        cursor={{fill: 'var(--color-border)', opacity: 0.2}}
                                                        contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                                                        itemStyle={{ color: 'var(--color-text-main)', fontSize: '12px', fontWeight: 'bold' }}
                                                    />
                                                    <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
                                                        {topItemsData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={index === 0 ? 'rgb(16, 185, 129)' : 'rgba(16, 185, 129, 0.6)'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                {/* Financial Summary Card (Replaces Recent Activity) */}
                                <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm h-fit">
                                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                                        <Wallet size={20} className="text-primary"/> {t('Financial Summary')}
                                    </h3>
                                    
                                    <div className="space-y-6">
                                        {/* Main Total */}
                                        <div className="bg-background border border-border rounded-xl p-4 text-center">
                                            <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">{t('Net Sales')}</p>
                                            <p className="text-3xl font-black text-primary">{maskedFormatPrice(financialSummary.netSales)}</p>
                                        </div>

                                        {/* Breakdown */}
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-secondary">{t('Gross Sales')}</span>
                                                <span className="font-bold text-text-main">{maskedFormatPrice(financialSummary.grossSales)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm text-red-500">
                                                <span>{t('Total Discount')}</span>
                                                <span className="font-bold">-{maskedFormatPrice(financialSummary.totalDiscount)}</span>
                                            </div>
                                            <div className="border-t border-border pt-2 flex justify-between items-center text-sm font-bold">
                                                <span>{t('Net Sales')}</span>
                                                <span className="text-emerald-500">{maskedFormatPrice(financialSummary.netSales)}</span>
                                            </div>
                                        </div>

                                        {/* Payment Methods Breakdown */}
                                        <div>
                                            <p className="text-xs font-bold text-secondary uppercase tracking-widest mb-3">{t('Payment Methods')}</p>
                                            <div className="space-y-3">
                                                {[
                                                    { key: 'Cash', label: t('Cash'), icon: Coins, color: 'text-green-500', bg: 'bg-green-500' },
                                                    { key: 'Card', label: t('Card'), icon: CardIcon, color: 'text-blue-500', bg: 'bg-blue-500' },
                                                    { key: 'Transfer', label: t('Transfer'), icon: QrCode, color: 'text-purple-500', bg: 'bg-purple-500' }
                                                ].map(m => {
                                                    const amount = financialSummary.paymentMethods[m.key] || 0;
                                                    const percent = financialSummary.netSales > 0 ? (amount / financialSummary.netSales) * 100 : 0;
                                                    
                                                    return (
                                                        <div key={m.key} className="space-y-1">
                                                            <div className="flex justify-between items-center text-xs">
                                                                <div className="flex items-center gap-2">
                                                                    <m.icon size={14} className={m.color} />
                                                                    <span className="font-bold text-text-main">{m.label}</span>
                                                                </div>
                                                                <span className="font-medium text-text-main">{maskedFormatPrice(amount)}</span>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                                                                <div className={`h-full rounded-full ${m.bg}`} style={{ width: `${percent}%` }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {/* Others */}
                                                {(financialSummary.paymentMethods['Other'] || 0) > 0 && (
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <HelpCircle size={14} className="text-gray-500" />
                                                                <span className="font-bold text-text-main">{t('Other')}</span>
                                                            </div>
                                                            <span className="font-medium text-text-main">{maskedFormatPrice(financialSummary.paymentMethods['Other'])}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full bg-gray-500" style={{ width: `${(financialSummary.paymentMethods['Other'] / financialSummary.netSales) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => setActiveTab('history')}
                                        className="w-full mt-6 py-3 text-xs font-bold text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <List size={14} /> {t('View Detailed History')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="p-4 border-b border-border flex gap-4">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} />
                                        <input 
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder={t('Search ID or Table...')}
                                            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-background text-xs font-bold text-secondary uppercase tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4 border-b border-border">Order ID</th>
                                                <th className="px-6 py-4 border-b border-border">Table</th>
                                                <th className="px-6 py-4 border-b border-border">Time</th>
                                                <th className="px-6 py-4 border-b border-border">Total</th>
                                                <th className="px-6 py-4 border-b border-border">Status</th>
                                                <th className="px-6 py-4 border-b border-border text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border text-sm">
                                            {filteredHistory.map(order => (
                                                <tr key={order.id} onClick={() => setSelectedOrderId(order.id)} className="hover:bg-background/50 cursor-pointer transition-colors group">
                                                    <td className="px-6 py-4 font-mono text-xs font-bold text-secondary">
                                                        #{order.id.slice(-6)}
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-text-main">{getTableLabel(order, tables)}</td>
                                                    <td className="px-6 py-4 text-secondary">{new Date(order.updated_at || order.created_at || '').toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                                                    <td className="px-6 py-4 font-black text-primary">{maskedFormatPrice(order.total_amount || 0)}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase border ${
                                                            order.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                                                            order.status === 'Cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                                                            'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                        }`}>
                                                            {t(order.status)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button className="p-2 hover:bg-border rounded-lg text-secondary opacity-0 group-hover:opacity-100 transition-all">
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {filteredHistory.length === 0 && (
                                        <div className="p-12 text-center text-secondary opacity-50 font-bold text-sm uppercase tracking-widest">
                                            {t('No history found')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
         </div>

         {/* RIGHT: DETAIL DRAWER */}
         {selectedOrderId && (
             <div className="w-full lg:w-96 bg-surface border-l border-border h-full shrink-0 flex flex-col shadow-2xl animate-in slide-in-from-right duration-300 absolute lg:relative inset-0 z-30">
                 {(() => {
                     const order = reportData.find(o => o.id === selectedOrderId);
                     if (!order) return null;
                     const { items: enrichedItems } = enrichOrderDetails(order, menuItems);

                     return (
                         <>
                            <div className="p-6 border-b border-border flex items-center justify-between bg-background/95 backdrop-blur shrink-0">
                                <div>
                                    <h3 className="font-black text-xl text-text-main">{getTableLabel(order, tables)}</h3>
                                    <div className="flex items-center gap-2 text-xs text-secondary mt-1">
                                        <span onClick={() => handleCopyId(order.id)} className="font-mono cursor-pointer hover:text-primary transition-colors flex items-center gap-1">
                                            #{order.id.slice(-8)} {copiedId === order.id ? <Check size={10} className="text-emerald-500"/> : <Copy size={10}/>}
                                        </span>
                                        <span>•</span>
                                        <span>{new Date(order.updated_at || order.created_at || '').toLocaleString()}</span>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedOrderId(null)} className="p-2 hover:bg-border rounded-xl text-secondary"><X size={24}/></button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                                {/* Items List */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-secondary uppercase tracking-widest">{t('Items Detail')}</h4>
                                    {enrichedItems.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-start">
                                            <div className="flex gap-3">
                                                <span className="font-bold text-primary text-sm w-6">x{item.quantity}</span>
                                                <div>
                                                    <p className="font-bold text-sm text-text-main">{item._display_name}</p>
                                                    {item.note && <p className="text-xs text-amber-500 italic mt-0.5">{item.note}</p>}
                                                </div>
                                            </div>
                                            <span className="font-bold text-sm text-text-main">{maskedFormatPrice(item.price * item.quantity)}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Payment Info */}
                                <div className="p-4 bg-background border border-border rounded-xl space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-secondary">{t('Subtotal')}</span>
                                        <span className="font-bold">{maskedFormatPrice(order.total_amount + (order.discount_amount || 0))}</span>
                                    </div>
                                    {order.discount_amount > 0 && (
                                        <div className="flex justify-between items-center text-sm text-red-500">
                                            <span>Discount</span>
                                            <span className="font-bold">-{maskedFormatPrice(order.discount_amount)}</span>
                                        </div>
                                    )}
                                    <div className="border-t border-border pt-3 flex justify-between items-center">
                                        <span className="font-black text-lg text-primary">{t('Total')}</span>
                                        <span className="font-black text-lg text-primary">{maskedFormatPrice(order.total_amount)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-secondary bg-surface p-2 rounded-lg justify-center uppercase tracking-wider">
                                        {order.payment_method === 'Cash' && <DollarSign size={14} />}
                                        {order.payment_method === 'Card' && <CreditCard size={14} />}
                                        {order.payment_method === 'Transfer' && <Smartphone size={14} />}
                                        {order.payment_method || 'Unknown'}
                                    </div>
                                </div>

                                {/* Staff Info */}
                                <div className="flex items-center gap-3 p-3 bg-surface border border-border rounded-xl">
                                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                        {(order.staff_name || 'POS').substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-xs text-secondary font-bold uppercase tracking-wider">Served By</p>
                                        <p className="text-sm font-bold text-text-main">{order.staff_name || 'Unknown'}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 border-t border-border bg-background shrink-0">
                                <button 
                                    onClick={() => guardSensitive('reprint_receipt', () => printOrderReceipt({ ...order, items: enrichedItems }))}
                                    className="w-full py-3 bg-surface border border-border hover:bg-border text-text-main rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <Printer size={18} /> {t('Reprint Receipt')}
                                </button>
                            </div>
                         </>
                     );
                 })()}
             </div>
         )}
      </div>
    </div>
  );
};
