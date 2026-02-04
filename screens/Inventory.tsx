import React, { useState, useMemo, useEffect } from 'react';
import { 
  Package, 
  AlertTriangle, 
  TrendingUp, 
  PlusCircle, 
  RefreshCw, 
  Check,
  X,
  Loader2,
  AlertCircle,
  Calculator
} from 'lucide-react';
import { useCurrency } from '../CurrencyContext';
import { supabase, isSupabaseConfigured } from '../supabase';
import { InventoryItem } from '../types';
import { useTheme } from '../ThemeContext';

export const Inventory: React.FC = () => {
  const { formatPrice } = useCurrency();
  const { t } = useTheme();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]); // Items with potential yield
  const [loading, setLoading] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // View State
  const [viewMode, setViewMode] = useState<'stock' | 'yield'>('stock');

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    quantity: '',
    unit: 'kg',
    category: 'Pantry',
    note: ''
  });

  useEffect(() => {
    if (isSupabaseConfigured()) {
        fetchData();
    } else {
        setLoading(false);
        setErrorMsg('Database not configured. Please go to Settings.');
    }
  }, [viewMode]);

  const fetchData = async () => {
    setLoading(true);
    try {
        // Fetch Inventory
        const { data: invData, error } = await supabase.from('inventory').select('*').order('name');
        if (error) throw error;

        const processedInv = (invData || []).map((item: any) => ({
            ...item,
            status: item.stock <= 0 ? 'Critical' : item.stock <= item.threshold ? 'Low' : 'Good'
        }));
        setItems(processedInv);

        // Fetch Menu Items & Yields if in Yield Mode
        if (viewMode === 'yield') {
            const { data: menuData } = await supabase
                .from('menu_items')
                .select('*, menu_item_ingredients(*)');
            
            if (menuData) {
                const yieldCalculated = menuData.map((mItem: any) => {
                    let maxYield = Infinity;
                    const ingredients = mItem.menu_item_ingredients;
                    
                    if (!ingredients || ingredients.length === 0) {
                        maxYield = -1; // No recipe
                    } else {
                        ingredients.forEach((ing: any) => {
                             const rawItem = processedInv.find((i: any) => i.id === ing.inventory_item_id);
                             if (rawItem && ing.quantity_required > 0) {
                                 const possible = Math.floor(rawItem.stock / ing.quantity_required);
                                 if (possible < maxYield) maxYield = possible;
                             } else {
                                 maxYield = 0; // Missing ingredient
                             }
                        });
                    }
                    return { ...mItem, theoreticalYield: maxYield };
                });
                setMenuItems(yieldCalculated);
            }
        }
    } catch (error: any) {
        console.error('Error fetching data:', error);
        setErrorMsg('Failed to load data.');
    } finally {
        setLoading(false);
    }
  };

  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.quantity) return;

    const qty = parseFloat(formData.quantity);
    if (isNaN(qty) || qty <= 0) return;

    try {
      const existingItem = items.find(i => i.name.toLowerCase() === formData.name.toLowerCase());
      
      if (formData.id || existingItem) {
        const targetId = formData.id || existingItem?.id;
        const currentStock = existingItem ? existingItem.stock : 0;
        
        const { error } = await supabase
          .from('inventory')
          .update({ stock: currentStock + qty })
          .eq('id', targetId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory')
          .insert([{
            name: formData.name,
            category: formData.category,
            stock: qty,
            unit: formData.unit,
            max_stock: qty * 5, 
            threshold: qty * 0.2, 
            price: 0
          }]);
        if (error) throw error;
      }

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2000);
      setFormData({ id: '', name: '', quantity: '', unit: 'kg', category: 'Pantry', note: '' });
      fetchData();

    } catch (error) {
      console.error('Error updating inventory:', error);
      alert('Failed to update inventory');
    }
  };

  const fillForm = (item: InventoryItem) => {
    setFormData({
      id: item.id,
      name: item.name,
      quantity: '',
      unit: item.unit,
      category: item.category,
      note: ''
    });
  };

  // Stats Calculation
  const stats = useMemo(() => {
    const totalValue = items.reduce((acc, item) => acc + (item.stock * item.price), 0);
    const lowStockCount = items.filter(i => i.status !== 'Good').length;
    const topItem = [...items].sort((a, b) => (b.stock * b.price) - (a.stock * a.price))[0];
    return { totalValue, lowStockCount, topItem };
  }, [items]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden transition-colors">
      <div className="h-20 border-b border-border flex items-center justify-between px-8 bg-background/95 backdrop-blur shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-text-main text-2xl font-bold tracking-tight">{t('Inventory Management')}</h1>
          <p className="text-secondary text-xs mt-1">{t('Manage stock')}</p>
        </div>
        <div className="flex gap-3">
           <div className="bg-surface border border-border p-1 rounded-lg flex shadow-sm">
               <button 
                  onClick={() => setViewMode('stock')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-all ${viewMode === 'stock' ? 'bg-primary text-background shadow' : 'text-secondary hover:text-text-main'}`}
               >
                  {t('Stock View')}
               </button>
               <button 
                  onClick={() => setViewMode('yield')}
                  className={`px-3 py-1 text-xs font-bold rounded transition-all ${viewMode === 'yield' ? 'bg-primary text-background shadow' : 'text-secondary hover:text-text-main'}`}
               >
                  {t('Yield Analysis')}
               </button>
           </div>
          <button 
            onClick={fetchData}
            className="flex items-center gap-2 px-4 h-9 rounded-lg bg-surface border border-border text-text-main text-sm font-bold hover:border-primary transition-all shadow-sm"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t('Sync')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
          
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft flex flex-col relative overflow-hidden group">
               <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 rounded-lg bg-primary-bg text-primary"><Package size={20} /></div>
                 <p className="text-secondary text-xs font-bold uppercase tracking-wider">{t('Total Value')}</p>
               </div>
               <div className="flex items-end justify-between">
                 <p className="text-text-main text-3xl font-bold">{formatPrice(stats.totalValue)}</p>
               </div>
            </div>
            
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft flex flex-col relative overflow-hidden group hover:border-red-500/50 transition-colors">
               <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 rounded-lg bg-red-500/10 text-red-500"><AlertTriangle size={20} /></div>
                 <p className="text-secondary text-xs font-bold uppercase tracking-wider">{t('Low Stock')}</p>
               </div>
               <div className="flex items-end justify-between">
                 <p className="text-text-main text-3xl font-bold">{stats.lowStockCount}</p>
                 <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${stats.lowStockCount > 0 ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-green-500 bg-green-500/10 border-green-500/20'}`}>
                   {stats.lowStockCount > 0 ? t('Action Needed') : t('All Good')}
                 </span>
               </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-soft flex flex-col relative overflow-hidden group">
               <div className="flex items-center gap-3 mb-2">
                 <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500"><TrendingUp size={20} /></div>
                 <p className="text-secondary text-xs font-bold uppercase tracking-wider">{t('Top Item')}</p>
               </div>
               <div className="flex items-end justify-between">
                 <p className="text-text-main text-3xl font-bold truncate max-w-[150px]">{stats.topItem?.name || 'N/A'}</p>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form - Only in Stock View */}
            {viewMode === 'stock' && (
              <div className="lg:col-span-4 bg-surface border border-border rounded-2xl p-6 h-fit flex flex-col sticky top-0 shadow-soft">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-primary-bg p-2 rounded-lg text-primary"><PlusCircle size={24} /></div>
                  <div>
                    <h2 className="text-text-main text-lg font-bold">{t('Stock In')}</h2>
                    <p className="text-secondary text-xs">{t('Add new ingredients')}</p>
                  </div>
                </div>
                
                <form className="flex flex-col gap-5 flex-1" onSubmit={handleStockIn}>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">{t('Ingredient Name')}</label>
                    <div className="relative">
                      <input 
                        className="w-full bg-background text-text-main border border-border rounded-xl px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary text-sm font-medium outline-none transition-all" 
                        placeholder="e.g. Fresh Milk" 
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        required
                      />
                      {formData.name && (
                           <button 
                             type="button" 
                             onClick={() => setFormData({...formData, name: ''})}
                             className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-text-main"
                           >
                             <X size={16} />
                           </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-secondary uppercase tracking-wider">{t('Quantity')}</label>
                      <input 
                        className="w-full bg-background text-text-main border border-border rounded-xl px-4 py-3 focus:ring-1 focus:ring-primary text-sm font-medium outline-none transition-all" 
                        placeholder="0.00" 
                        type="number"
                        step="0.01"
                        value={formData.quantity}
                        onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-secondary uppercase tracking-wider">{t('Unit')}</label>
                      <select 
                        className="w-full bg-background text-text-main border border-border rounded-xl px-4 py-3 focus:ring-1 focus:ring-primary text-sm font-medium appearance-none outline-none transition-all cursor-pointer"
                        value={formData.unit}
                        onChange={(e) => setFormData({...formData, unit: e.target.value})}
                      >
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="L">L</option>
                        <option value="ml">ml</option>
                        <option value="pcs">pcs</option>
                        <option value="packs">packs</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">{t('Category')}</label>
                    <select 
                      className="w-full bg-background text-text-main border border-border rounded-xl px-4 py-3 focus:ring-1 focus:ring-primary text-sm font-medium appearance-none outline-none transition-all cursor-pointer"
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                    >
                      <option value="Pantry">{t('Pantry')}</option>
                      <option value="Dairy">{t('Dairy')}</option>
                      <option value="Produce">{t('Produce')}</option>
                      <option value="Coffee">{t('Coffee')}</option>
                      <option value="Packaging">{t('Packaging')}</option>
                      <option value="Meat">{t('Meat')}</option>
                      <option value="Seafood">{t('Seafood')}</option>
                      <option value="Beverages">{t('Beverages')}</option>
                    </select>
                  </div>

                  <button 
                    type="submit"
                    className={`mt-auto w-full h-12 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2
                      ${isSuccess ? 'bg-green-500 text-white' : 'bg-primary hover:bg-primary-hover text-background shadow-primary/20'}
                    `}
                  >
                    {isSuccess ? <><Check size={20} /> {t('Stock Added')}</> : <><PlusCircle size={20} /> {t('Add Stock')}</>}
                  </button>
                </form>
              </div>
            )}

            {/* Main Table Area */}
            <div className={`${viewMode === 'stock' ? 'lg:col-span-8' : 'lg:col-span-12'} bg-surface border border-border rounded-2xl flex flex-col h-full overflow-hidden shadow-soft`}>
               <div className="p-6 border-b border-border flex justify-between items-center bg-surface">
                 <div className="flex items-center gap-3">
                   <div className="bg-primary-bg p-2 rounded-lg text-primary">
                       {viewMode === 'stock' ? <Package size={20} /> : <Calculator size={20} />}
                   </div>
                   <div>
                     <h2 className="text-text-main text-lg font-bold">{viewMode === 'stock' ? t('Inventory List') : t('Potential Yield Analysis')}</h2>
                     <p className="text-secondary text-xs">{viewMode === 'stock' ? t('Track all ingredients') : t('Theoretical max')}</p>
                   </div>
                 </div>
               </div>
               
               <div className="overflow-y-auto custom-scrollbar flex-1">
                 {loading ? (
                   <div className="flex items-center justify-center h-48"><Loader2 size={32} className="animate-spin text-primary" /></div>
                 ) : errorMsg ? (
                    <div className="flex flex-col h-48 items-center justify-center text-red-400 gap-3"><AlertCircle size={32} /><p className="font-bold">{errorMsg}</p></div>
                 ) : (
                   <table className="w-full text-left">
                     <thead className="bg-background text-secondary text-xs uppercase font-bold tracking-wider sticky top-0 z-10">
                       <tr>
                         <th className="px-6 py-4 border-b border-border">{t('Item Name')}</th>
                         <th className="px-6 py-4 border-b border-border">{viewMode === 'stock' ? t('Stock Level') : t('Est. Yield')}</th>
                         <th className="px-6 py-4 border-b border-border">{t('Status')}</th>
                         {viewMode === 'stock' && <th className="px-6 py-4 border-b border-border text-right">{t('Action')}</th>}
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-border text-sm">
                        {viewMode === 'stock' ? (
                          // STOCK VIEW
                          items.map((item) => (
                          <tr key={item.id} className="hover:bg-border/30 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded-full bg-border flex items-center justify-center text-xs font-bold text-secondary">
                                    {item.name.substring(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                    <p className="font-bold text-text-main">{item.name}</p>
                                    <p className="text-xs text-secondary">{t(item.category)}</p>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-text-main font-bold">{item.stock} {item.unit}</span>
                              <span className="text-secondary text-xs ml-2">/ {item.max_stock}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold 
                                ${item.status === 'Critical' ? 'bg-red-500/10 text-red-500' : 
                                  item.status === 'Low' ? 'bg-orange-500/10 text-orange-500' : 
                                  'bg-green-500/10 text-green-500'}`}>
                                {t(item.status)}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button onClick={() => fillForm(item)} className="bg-background hover:bg-primary hover:text-background text-primary border border-border rounded-lg p-2 transition-all">
                                  <PlusCircle size={16} />
                                </button>
                            </td>
                          </tr>
                          ))
                        ) : (
                          // YIELD VIEW
                          menuItems.map((item) => (
                              <tr key={item.id} className="hover:bg-border/30 transition-colors">
                                  <td className="px-6 py-4">
                                      <p className="font-bold text-text-main">{item.name}</p>
                                      <p className="text-xs text-secondary">{t(item.category)}</p>
                                  </td>
                                  <td className="px-6 py-4">
                                      {item.theoreticalYield === -1 ? (
                                          <span className="text-secondary text-xs italic">{t('No recipe defined')}</span>
                                      ) : (
                                          <div className="flex items-center gap-2">
                                              <span className="text-xl font-bold text-primary">{item.theoreticalYield}</span>
                                              <span className="text-xs text-secondary">{t('units')}</span>
                                          </div>
                                      )}
                                  </td>
                                  <td className="px-6 py-4">
                                      <div className="flex flex-col">
                                          <span className="text-[10px] text-secondary uppercase font-bold">{t('Manual Stock')}</span>
                                          <span className="text-text-main font-bold">{item.stock}</span>
                                      </div>
                                  </td>
                              </tr>
                          ))
                        )}
                     </tbody>
                   </table>
                 )}
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};