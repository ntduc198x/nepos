
import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Lock, Settings, Plus, Trash2, Download, RefreshCw, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { TaxService } from '../services/TaxService';
import { ExpenseService } from '../services/ExpenseService';
import { useCurrency } from '../CurrencyContext';
import { TaxConfig, TaxPeriodClosing, TaxLedgerEntry, ExpenseEntry, BusinessActivity } from '../types/taxTypes';
import { can, PERMISSIONS } from '../utils/permissions';

const buildPeriodRange = (period: string, periodType: 'MONTH' | 'QUARTER') => {
  const [y, m] = period.split('-').map(Number);
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  const month = Number.isFinite(m) ? m : 1;

  if (periodType === 'QUARTER') {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const startMonth = (quarter - 1) * 3 + 1;
    const start = new Date(Date.UTC(year, startMonth - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, startMonth + 2, 0, 23, 59, 59));
    return { start, end, periodKey: `${year}-Q${quarter}` };
  }

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return { start, end, periodKey: `${year}-${String(month).padStart(2, '0')}` };
};

export const TaxDeclaration: React.FC = () => {
  const { t } = useTheme();
  const { formatPrice } = useCurrency();
  const { user, role } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'expenses' | 'export'>('overview');
  const [config, setConfig] = useState<TaxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Tax Logic State
  const [periodType, setPeriodType] = useState<'MONTH' | 'QUARTER'>('MONTH');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [calculation, setCalculation] = useState<any>(null);
  const [closing, setClosing] = useState<TaxPeriodClosing | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Expense State
  const [newExpense, setNewExpense] = useState<Partial<ExpenseEntry>>({ category: 'COGS', amount: 0, note: '' });

  const [categoryInput, setCategoryInput] = useState('');
  const [activityInput, setActivityInput] = useState<BusinessActivity>('FOOD_BEVERAGE');

  const activityOptions: BusinessActivity[] = ['FOOD_BEVERAGE', 'GOODS', 'SERVICES', 'OTHER'];
  const sortedCategoryMapEntries = useMemo(
    () => Object.entries(config?.category_activity_map || {}).sort((a, b) => a[0].localeCompare(b[0])),
    [config?.category_activity_map]
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const cfg = await TaxService.getConfig();
      setConfig(cfg);
      const resolvedPeriodType = cfg.tax_method.includes('QUARTER') ? 'QUARTER' : 'MONTH';
      setPeriodType(resolvedPeriodType);
      await runCalculation(selectedPeriod, cfg, resolvedPeriodType);
      setLoading(false);
    };
    init();
  }, []);

  const runCalculation = async (
    period: string,
    cfg: TaxConfig,
    forcedPeriodType?: 'MONTH' | 'QUARTER'
  ) => {
    const resolvedPeriodType = forcedPeriodType || (cfg.tax_method.includes('QUARTER') ? 'QUARTER' : 'MONTH');
    const { start, end, periodKey } = buildPeriodRange(period, resolvedPeriodType);

    const calc = await TaxService.calculateTaxLiability(start.toISOString(), end.toISOString());
    setCalculation(calc);

    const closed = await TaxService.getPeriodClosing(periodKey);
    setClosing(closed || null);
  };

  const handlePeriodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedPeriod(e.target.value);
    if (config) runCalculation(e.target.value, config);
  };

  const handleBackfill = async () => {
      if (!window.confirm("Backfill ledger from orders? This may take a moment.")) return;
      setLoading(true);
      const count = await TaxService.backfillLedgerFromOrders(config?.store_id);
      alert(`Backfilled ${count} entries.`);
      if (config) await runCalculation(selectedPeriod, config);
      setLoading(false);
  };

  const handleRebuildPeriodLedger = async () => {
      if (!config) return;
      const resolvedPeriodType = config.tax_method.includes('QUARTER') ? 'QUARTER' : 'MONTH';
      const { start, end } = buildPeriodRange(selectedPeriod, resolvedPeriodType);

      if (!window.confirm('Rebuild ledger for this period? Existing ledger entries in this period will be replaced.')) return;

      setLoading(true);
      try {
        const result = await TaxService.rebuildLedgerForPeriod(start.toISOString(), end.toISOString(), config.store_id);
        alert(`Rebuild done. Deleted ${result.deleted} old entries, inserted ${result.inserted} entries from completed orders.`);
        await runCalculation(selectedPeriod, config, resolvedPeriodType);
      } finally {
        setLoading(false);
      }
  };

  const handleAddExpense = async () => {
      if (!config || !newExpense.amount || !newExpense.category) return;
      await ExpenseService.addExpense({
          store_id: config.store_id,
          expense_date: new Date().toISOString().split('T')[0],
          category: newExpense.category!,
          amount: Number(newExpense.amount),
          note: newExpense.note,
          vendor: newExpense.vendor
      });
      setNewExpense({ category: 'COGS', amount: 0, note: '' });
      await runCalculation(selectedPeriod, config);
  };

  const handleDeleteExpense = async (id: number) => {
      if (!window.confirm("Delete this expense?")) return;
      await ExpenseService.deleteExpense(id);
      if (config) await runCalculation(selectedPeriod, config);
  };

  const handleSaveCategoryMap = () => {
    if (!config || !categoryInput.trim()) return;
    const key = categoryInput.trim().toLowerCase();
    setConfig(prev => prev ? ({
      ...prev,
      category_activity_map: {
        ...(prev.category_activity_map || {}),
        [key]: activityInput
      }
    }) : null);
    setCategoryInput('');
  };

  const handleDeleteCategoryMap = (key: string) => {
    setConfig(prev => {
      if (!prev) return prev;
      const next = { ...(prev.category_activity_map || {}) };
      delete next[key];
      return { ...prev, category_activity_map: next };
    });
  };

  const handleClosePeriod = async () => {
    if (!can(role, PERMISSIONS.TAX_CLOSE)) {
        alert("Access Denied: You do not have permission to close tax periods.");
        return;
    }

    if (!calculation || !user || !config) return;
    if (!window.confirm("Xác nhận chốt số liệu kỳ này? Sau khi chốt sẽ không thể thay đổi.")) return;
    
    try {
        const resolvedPeriodType = config.tax_method.includes('QUARTER') ? 'QUARTER' : 'MONTH';
        const { start, end, periodKey } = buildPeriodRange(selectedPeriod, resolvedPeriodType);

        const closed = await TaxService.closePeriod({
            config,
            periodKey,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
            periodRevenue: calculation.periodRevenue,
            totalExpenses: calculation.totalExpenses,
            taxableIncome: calculation.taxableIncome,
            vat: calculation.vat,
            pit: calculation.pit,
            details: calculation.details
        }, user.id);
        
        setClosing(closed);
        alert("Đã chốt kỳ thành công!");
    } catch (e) {
        console.error(e);
        alert("Lỗi khi chốt kỳ");
    }
  };

  const handleExportCSV = async (type: 'SUMMARY' | 'LEDGER' | 'EXPENSES' | 'S2A' | 'S2C' | 'S2D' | 'S2E') => {
      if (!calculation || !config) return;
      let csvContent = '';
      let filename = '';

      const resolvedPeriodType = config.tax_method.includes('QUARTER') ? 'QUARTER' : 'MONTH';
      const { start, end } = buildPeriodRange(selectedPeriod, resolvedPeriodType);

      if (type === 'SUMMARY') {
          const data = [{
              Period: selectedPeriod,
              Revenue: calculation.periodRevenue,
              Expenses: calculation.totalExpenses,
              TaxableIncome: calculation.taxableIncome,
              VAT: calculation.vat,
              PIT: calculation.pit,
              TotalTax: calculation.totalTax,
              Method: config?.calculation_method
          }];
          csvContent = TaxService.generateCSV(data);
          filename = `Tax_Summary_${selectedPeriod}.csv`;
      } else if (type === 'S2A') {
          const rows = TaxService.buildS2aRows(calculation);
          csvContent = TaxService.generateCSV(rows);
          filename = `TT152_S2a_HKD_${selectedPeriod}.csv`;
      } else if (type === 'S2C') {
          const rows = TaxService.buildS2cRows(calculation);
          csvContent = TaxService.generateCSV(rows);
          filename = `TT152_S2c_HKD_${selectedPeriod}.csv`;
      } else if (type === 'LEDGER') {
          csvContent = TaxService.generateCSV(TaxService.buildLedgerRowsFor152(calculation));
          filename = `TT152_Ledger_${selectedPeriod}.csv`;
      } else if (type === 'S2D') {
          const rows = await TaxService.buildS2dRows(start.toISOString(), end.toISOString());
          csvContent = TaxService.generateCSV(rows);
          filename = `TT152_S2d_HKD_${selectedPeriod}.csv`;
      } else if (type === 'S2E') {
          const rows = await TaxService.buildS2eRows(start.toISOString(), end.toISOString());
          csvContent = TaxService.generateCSV(rows);
          filename = `TT152_S2e_HKD_${selectedPeriod}.csv`;
      } else if (type === 'EXPENSES') {
          csvContent = TaxService.generateCSV(calculation.details.expenses);
          filename = `Tax_Expenses_${selectedPeriod}.csv`;
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const complianceChecklist = {
    hasPeriodClosing: !!closing,
    hasCategoryMapping: sortedCategoryMapEntries.length > 0,
    hasLedgerData: (calculation?.details?.ledger?.length || 0) > 0,
    hasExpenseOrZero: Array.isArray(calculation?.details?.expenses),
  };

  if (!can(role, PERMISSIONS.TAX_VIEW)) {
      return <div className="flex h-full items-center justify-center text-red-500 font-bold">Access Denied</div>;
  }

  if (loading || !calculation) return <div className="p-8 text-center">Loading Tax Data...</div>;

  return (
    <div className="flex flex-col h-full bg-background text-text-main overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-6 bg-background/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500"><FileText size={24} /></div>
            <div>
                <h1 className="text-xl font-bold">Kê Khai Thuế (HKD)</h1>
                <p className="text-xs text-secondary">Compliance 2026 • {config?.calculation_method === 'INCOME_NET' ? 'Phương pháp Thu Nhập' : 'Phương pháp Doanh Thu'}</p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <input 
                type="month" 
                value={selectedPeriod}
                onChange={handlePeriodChange}
                className="bg-surface border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none"
            />
            {can(role, PERMISSIONS.SETTINGS_EDIT) && (
                <button onClick={() => setIsConfigModalOpen(true)} className="p-2 hover:bg-surface rounded-lg border border-transparent hover:border-border transition-all">
                    <Settings size={20} />
                </button>
            )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-background px-6 gap-6">
         {(['overview', 'details', 'expenses', 'export'] as const).map(tab => (
             <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 text-sm font-bold uppercase border-b-2 transition-all ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-secondary'}`}
             >
                 {tab === 'overview' ? 'Tổng quan' : tab === 'details' ? 'Sổ chi tiết' : tab === 'expenses' ? 'Chi phí' : 'Xuất hồ sơ'}
             </button>
         ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-surface/30 custom-scrollbar">
         <div className="max-w-5xl mx-auto space-y-6">
            
            {/* Status Banner */}
            {closing ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-600">
                    <Lock size={20} />
                    <span className="font-bold">Kỳ này đã được chốt số liệu.</span>
                    <span className="ml-auto text-xs opacity-70 font-mono">Checksum: {closing.checksum.slice(0,16)}...</span>
                </div>
            ) : (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3 text-amber-600">
                    <AlertTriangle size={20} />
                    <span className="font-bold">Số liệu tạm tính - Chưa chốt kỳ.</span>
                </div>
            )}

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Revenue Card */}
                    <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
                        <p className="text-secondary text-xs font-bold uppercase mb-2">Doanh thu chịu thuế</p>
                        <div className="text-3xl font-black text-text-main">{formatPrice(calculation.periodRevenue)}</div>
                        <div className="mt-2 text-xs text-secondary flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-primary"/> Dựa trên {calculation.details.ledger.length} giao dịch
                        </div>
                    </div>

                    {/* Expenses Card */}
                    <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm">
                        <p className="text-secondary text-xs font-bold uppercase mb-2">Chi phí hợp lệ</p>
                        <div className="text-3xl font-black text-text-main">{formatPrice(calculation.totalExpenses)}</div>
                        <div className="mt-2 text-xs text-secondary flex items-center gap-1">
                            {calculation.details.expenses.length} khoản chi
                        </div>
                    </div>

                    {/* Tax Estimate */}
                    <div className={`bg-surface p-6 rounded-2xl border ${calculation.isTaxable ? 'border-red-500/30 bg-red-500/5' : 'border-border'} shadow-sm`}>
                        <p className="text-secondary text-xs font-bold uppercase mb-2">Nghĩa vụ thuế ({config?.calculation_method === 'INCOME_NET' ? 'Net' : 'Gross'})</p>
                        {calculation.isTaxable ? (
                            <>
                                <div className="text-3xl font-black text-red-500">{formatPrice(calculation.totalTax)}</div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <div>VAT ({config?.vat_rate_percent}%): <b>{formatPrice(calculation.vat)}</b></div>
                                    <div>TNCN ({config?.pit_rate_percent}%): <b>{formatPrice(calculation.pit)}</b></div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col h-full justify-center">
                                <span className="text-lg font-bold text-emerald-500">Miễn thuế</span>
                                <span className="text-xs text-secondary">Doanh thu &lt; 500tr/năm</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* DETAILS TAB (LEDGER) */}
            {activeTab === 'details' && (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                    <div className="p-4 border-b border-border flex justify-between items-center gap-3">
                        <h3 className="font-bold">Sổ chi tiết doanh thu</h3>
                        <div className="flex items-center gap-3">
                          <button onClick={handleBackfill} className="text-xs flex items-center gap-1 text-primary hover:underline">
                              <RefreshCw size={12}/> Backfill from Orders
                          </button>
                          <button onClick={handleRebuildPeriodLedger} className="text-xs flex items-center gap-1 text-amber-600 hover:underline">
                              <RefreshCw size={12}/> Rebuild kỳ này
                          </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-background text-secondary text-xs uppercase">
                                <tr>
                                    <th className="p-3">Ngày</th>
                                    <th className="p-3">Mã đơn</th>
                                    <th className="p-3">Loại</th>
                                    <th className="p-3 text-right">Gross</th>
                                    <th className="p-3 text-right">Net</th>
                                </tr>
                            </thead>
                            <tbody>
                                {calculation.details.ledger.map((entry: TaxLedgerEntry) => (
                                    <tr key={entry.id} className="border-b border-border hover:bg-background/50">
                                        <td className="p-3">{entry.business_date}</td>
                                        <td className="p-3 font-mono">{entry.order_id?.slice(0,8)}</td>
                                        <td className="p-3"><span className="px-2 py-1 bg-blue-500/10 text-blue-500 rounded text-xs font-bold">{entry.type}</span></td>
                                        <td className="p-3 text-right text-secondary">{formatPrice(entry.gross_amount)}</td>
                                        <td className="p-3 text-right font-bold">{formatPrice(entry.net_amount)}</td>
                                    </tr>
                                ))}
                                {calculation.details.ledger.length === 0 && (
                                    <tr><td colSpan={5} className="p-8 text-center text-secondary">Chưa có dữ liệu sổ sách.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* EXPENSES TAB */}
            {activeTab === 'expenses' && (
                <div className="space-y-6">
                    {/* Add Expense Form */}
                    {!closing && (
                        <div className="bg-surface p-4 rounded-2xl border border-border flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="text-xs font-bold text-secondary uppercase">Hạng mục</label>
                                <select 
                                    className="w-full mt-1 bg-background border border-border rounded-lg p-2"
                                    value={newExpense.category}
                                    onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                                >
                                    <option value="COGS">Giá vốn hàng bán</option>
                                    <option value="RENT">Thuê mặt bằng</option>
                                    <option value="LABOR">Nhân công</option>
                                    <option value="UTILITIES">Điện/Nước/Net</option>
                                    <option value="OTHER">Khác</option>
                                </select>
                            </div>
                            <div className="flex-1">
                                <label className="text-xs font-bold text-secondary uppercase">Số tiền</label>
                                <input 
                                    type="number" 
                                    className="w-full mt-1 bg-background border border-border rounded-lg p-2"
                                    value={newExpense.amount || ''}
                                    onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})}
                                />
                            </div>
                            <div className="flex-[2]">
                                <label className="text-xs font-bold text-secondary uppercase">Ghi chú / NCC</label>
                                <input 
                                    type="text" 
                                    className="w-full mt-1 bg-background border border-border rounded-lg p-2"
                                    value={newExpense.note || ''}
                                    onChange={e => setNewExpense({...newExpense, note: e.target.value})}
                                    placeholder="Ví dụ: Tiền điện tháng 2"
                                />
                            </div>
                            <button 
                                onClick={handleAddExpense}
                                className="p-2.5 bg-primary text-background rounded-lg hover:bg-primary-hover"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    )}

                    {/* Expense List */}
                    <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-background text-secondary text-xs uppercase">
                                <tr>
                                    <th className="p-3">Ngày</th>
                                    <th className="p-3">Hạng mục</th>
                                    <th className="p-3">Ghi chú</th>
                                    <th className="p-3 text-right">Số tiền</th>
                                    <th className="p-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {calculation.details.expenses.map((entry: ExpenseEntry) => (
                                    <tr key={entry.id} className="border-b border-border hover:bg-background/50">
                                        <td className="p-3">{entry.expense_date}</td>
                                        <td className="p-3"><span className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded text-xs font-bold">{entry.category}</span></td>
                                        <td className="p-3 text-secondary">{entry.note}</td>
                                        <td className="p-3 text-right font-bold">{formatPrice(entry.amount)}</td>
                                        <td className="p-3 text-center">
                                            {!closing && (
                                                <button onClick={() => handleDeleteExpense(entry.id!)} className="text-red-500 hover:bg-red-500/10 p-1 rounded">
                                                    <Trash2 size={16}/>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {calculation.details.expenses.length === 0 && (
                                    <tr><td colSpan={5} className="p-8 text-center text-secondary">Chưa có chi phí nào.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* EXPORT TAB */}
            {activeTab === 'export' && (
                <div className="space-y-6">
                    <div className="bg-surface p-6 rounded-2xl border border-border">
                        <h3 className="font-bold text-lg mb-4">Xuất dữ liệu & Báo cáo</h3>
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                            <button onClick={() => handleExportCSV('SUMMARY')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-primary"/>
                                <span className="font-bold">Báo cáo tổng hợp</span>
                                <span className="text-xs text-secondary">CSV Summary</span>
                            </button>
                            <button onClick={() => handleExportCSV('S2A')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-emerald-500"/>
                                <span className="font-bold">Mẫu S2a-HKD</span>
                                <span className="text-xs text-secondary">TT152 doanh thu theo ngành</span>
                            </button>
                            <button onClick={() => handleExportCSV('S2C')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-violet-500"/>
                                <span className="font-bold">Mẫu S2c-HKD</span>
                                <span className="text-xs text-secondary">TT152 doanh thu/chi phí</span>
                            </button>
                            <button onClick={() => handleExportCSV('LEDGER')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-blue-500"/>
                                <span className="font-bold">Sổ chi tiết doanh thu</span>
                                <span className="text-xs text-secondary">CSV Ledger Entries</span>
                            </button>
                            <button onClick={() => handleExportCSV('S2D')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-cyan-500"/>
                                <span className="font-bold">Mẫu S2d-HKD</span>
                                <span className="text-xs text-secondary">TT152 nhập/xuất/tồn</span>
                            </button>
                            <button onClick={() => handleExportCSV('S2E')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-rose-500"/>
                                <span className="font-bold">Mẫu S2e-HKD</span>
                                <span className="text-xs text-secondary">TT152 sổ chi tiết tiền</span>
                            </button>
                            <button onClick={() => handleExportCSV('EXPENSES')} className="p-4 border border-border rounded-xl hover:bg-background flex flex-col items-center gap-2 text-center">
                                <FileText size={32} className="text-amber-500"/>
                                <span className="font-bold">Bảng kê chi phí</span>
                                <span className="text-xs text-secondary">CSV Expenses</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-surface p-6 rounded-2xl border border-border">
                        <h3 className="font-bold text-lg mb-4">Hành động quản trị</h3>
                        <div className="flex gap-4">
                            <button 
                                onClick={handleClosePeriod}
                                disabled={!!closing}
                                className="px-6 py-3 bg-primary text-background font-bold rounded-xl flex items-center gap-2 hover:bg-primary-hover disabled:opacity-50"
                            >
                                <Lock size={18} /> {closing ? 'Đã chốt kỳ' : 'Chốt số liệu kỳ này'}
                            </button>
                        </div>
                        {closing && (
                             <p className="mt-4 text-xs text-secondary">
                                 Kỳ này đã được khóa sổ vào lúc {new Date(closing.closed_at).toLocaleString()} bởi user {closing.closed_by}. 
                                 Checksum bảo mật: {closing.checksum}
                             </p>
                        )}
                    </div>

                    <div className="bg-surface p-6 rounded-2xl border border-border">
                        <h3 className="font-bold text-lg mb-4">Checklist tuân thủ TT152 (vận hành)</h3>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className={complianceChecklist.hasLedgerData ? 'text-emerald-500' : 'text-amber-500'} />
                            Có dữ liệu sổ doanh thu trong kỳ
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className={complianceChecklist.hasCategoryMapping ? 'text-emerald-500' : 'text-amber-500'} />
                            Đã cấu hình map category sang nhóm ngành thuế
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className={complianceChecklist.hasPeriodClosing ? 'text-emerald-500' : 'text-amber-500'} />
                            Đã khóa/chốt số liệu kỳ
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 size={16} className={complianceChecklist.hasExpenseOrZero ? 'text-emerald-500' : 'text-amber-500'} />
                            Đã có dữ liệu chi phí để đối chiếu (hoặc xác nhận 0 chi phí)
                          </li>
                        </ul>
                        <p className="mt-3 text-xs text-secondary">
                          Khuyến nghị: lưu trữ file xuất S2a/S2c/S2d/S2e + chứng từ hóa đơn tối thiểu 5 năm.
                        </p>
                    </div>
                </div>
            )}
         </div>
      </div>

      {/* Config Modal */}
      {isConfigModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-surface w-full max-w-lg rounded-2xl border border-border shadow-2xl p-6">
                  <h2 className="text-xl font-bold mb-4">Cấu hình Thuế</h2>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                      <div>
                          <label className="text-xs font-bold text-secondary uppercase">Phương pháp tính (2026)</label>
                          <select 
                            className="w-full mt-1 bg-background border border-border rounded-lg p-2"
                            value={config?.calculation_method}
                            onChange={(e) => setConfig(prev => prev ? ({...prev, calculation_method: e.target.value as any}) : null)}
                          >
                              <option value="REVENUE_PERCENT">Tỷ lệ trên Doanh thu (Khoán/Kê khai)</option>
                              <option value="INCOME_NET">Doanh thu trừ Chi phí (Net Income)</option>
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-secondary uppercase">Tỷ lệ VAT (%)</label>
                              <input 
                                type="number" 
                                value={config?.vat_rate_percent} 
                                onChange={(e) => setConfig(prev => prev ? ({...prev, vat_rate_percent: Number(e.target.value)}) : null)}
                                className="w-full mt-1 bg-background border border-border rounded-lg p-2" 
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-secondary uppercase">Tỷ lệ TNCN (%)</label>
                              <input 
                                type="number" 
                                value={config?.pit_rate_percent} 
                                onChange={(e) => setConfig(prev => prev ? ({...prev, pit_rate_percent: Number(e.target.value)}) : null)}
                                className="w-full mt-1 bg-background border border-border rounded-lg p-2" 
                              />
                          </div>
                      </div>

                      <div className="pt-2 border-t border-border">
                        <label className="text-xs font-bold text-secondary uppercase">Map Category sang Nhóm ngành thuế</label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                          <input
                            value={categoryInput}
                            onChange={(e) => setCategoryInput(e.target.value)}
                            placeholder="vd: beverage, food, retail"
                            className="md:col-span-2 bg-background border border-border rounded-lg p-2 text-sm"
                          />
                          <select
                            value={activityInput}
                            onChange={(e) => setActivityInput(e.target.value as BusinessActivity)}
                            className="bg-background border border-border rounded-lg p-2 text-sm"
                          >
                            {activityOptions.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        <button
                          onClick={handleSaveCategoryMap}
                          className="mt-2 px-3 py-2 text-sm bg-primary text-background rounded-lg font-bold"
                        >
                          Thêm/Cập nhật map
                        </button>

                        <div className="mt-3 max-h-36 overflow-y-auto space-y-1 pr-1">
                          {sortedCategoryMapEntries.map(([key, val]) => (
                            <div key={key} className="flex items-center justify-between text-xs bg-background border border-border rounded px-2 py-1">
                              <span className="font-mono">{key} → <b>{val}</b></span>
                              <button onClick={() => handleDeleteCategoryMap(key)} className="text-red-500 hover:underline">Xóa</button>
                            </div>
                          ))}
                          {sortedCategoryMapEntries.length === 0 && (
                            <div className="text-xs text-secondary">Chưa có map category. Hệ thống sẽ dùng fallback theo mặc định.</div>
                          )}
                        </div>
                      </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                      <button onClick={() => setIsConfigModalOpen(false)} className="px-4 py-2 border border-border rounded-lg font-bold">Đóng</button>
                      <button 
                        onClick={async () => {
                            if (config) {
                                await TaxService.saveConfig(config);
                                await runCalculation(selectedPeriod, config);
                                setIsConfigModalOpen(false);
                            }
                        }} 
                        className="px-4 py-2 bg-primary text-background rounded-lg font-bold"
                      >
                        Lưu cấu hình
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
