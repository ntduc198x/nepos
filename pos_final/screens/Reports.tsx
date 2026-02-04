
import React, { useState, useMemo, useEffect } from 'react';
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

type TabView = 'overview' | 'trends' | 'history' | 'payments' | 'staff' | 'export';
type DateRangeType = 'today' | 'yesterday' | 'week' | 'custom';

export const Reports: React.FC = () => {
  const { formatPrice } = useCurrency();
  const { t } = useTheme();
  const { menuItems, tables, getReportOrders } = useData();
  const { can, guardSensitive, settings } = useSettingsContext();
  const { role } = useAuth();

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<TabView>('overview');
  const [dateRange, setDateRange] = useState<DateRangeType>('today');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [reportData, setReportData] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // --- MASKING HELPER ---
  // If settings.hideRevenue is true and user is staff, show "—"
  const maskedFormatPrice = (val: number) => {
    if (settings.hideRevenue && role === 'staff') {
        return "—";
    }
    return formatPrice(val);
  };

  // --- HANDLERS ---
  const handleDatePreset = (preset: DateRangeType) => {
    setDateRange(preset);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = y.toISOString().split('T')[0];
      setFromDate(yStr);
      setToDate(yStr);
    } else if (preset === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 7);
      setFromDate(w.toISOString().split('T')[0]);
      setToDate(todayStr);
    }
  };

  useEffect(() => {
    handleDatePreset('today');
  }, []);

  useEffect(() => {
    const fetch = async () => {
      // Gate check before fetching
      if (!can('report.view')) return;
      
      setIsLoading(true);
      // Use DataContext helper which applies RBAC filters internally
      const data = await getReportOrders({ 
        from: new Date(fromDate).toISOString(), 
        to: new Date(toDate + 'T23:59:59').toISOString() 
      });
      setReportData(data);
      setIsLoading(false);
    };
    if (fromDate && toDate) fetch();
  }, [fromDate, toDate, getReportOrders, can]);

  // --- AGGREGATION ---
  const stats = useMemo(() => {
    const completed = reportData.filter(o => o.status === 'Completed');
    const revenue = completed.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const orderCount = completed.length;
    const cancelledCount = reportData.filter(o => o.status === 'Cancelled').length;
    
    return {
      revenue,
      orders: orderCount,
      cancelled: cancelledCount,
      aov: orderCount ? revenue / orderCount : 0,
      cancelRate: reportData.length ? (cancelledCount / reportData.length) * 100 : 0
    };
  }, [reportData]);

  // New Financial Summary Aggregation
  const financialSummary = useMemo(() => {
    const completed = reportData.filter(o => o.status === 'Completed');
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
  }, [reportData]);

  const filteredHistory = useMemo(() => {
    if (!reportData) return [];
    return reportData.filter(o => 
      o.id.toString().includes(searchQuery) || 
      getTableLabel(o, tables).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [reportData, searchQuery, tables]);

  // --- CHART DATA PREPARATION ---
  const hourlyData = useMemo(() => {
    const hours = Array(24).fill(0).map((_, i) => ({ 
      hour: i, 
      label: `${i}:00`, 
      amount: 0,
      orders: 0
    }));

    reportData.forEach(o => {
      if (o.status !== 'Completed') return;
      const d = new Date(o.created_at);
      const h = d.getHours();
      if (hours[h]) {
        hours[h].amount += (o.total_amount || 0);
        hours[h].orders += 1;
      }
    });

    // Determine active range to trim chart (optional, but looks better)
    // For now, let's just return the full 24h or a slice based on business hours if we wanted
    return hours;
  }, [reportData]);

  const topItemsData = useMemo(() => {
    const itemMap = new Map<string, number>();
    
    reportData.forEach(o => {
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
  }, [reportData]);

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
            + reportData.map(o => 
                `${o.id},${o.created_at},${getTableLabel(o, tables)},${o.status},${o.total_amount},${o.payment_method || ''},${o.staff_name || ''}`
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
  if (!can('report.view')) {
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
                                                    <td className="px-6 py-4 text-secondary">{new Date(order.created_at || '').toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
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
                                        <span>{new Date(order.created_at || '').toLocaleString()}</span>
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
