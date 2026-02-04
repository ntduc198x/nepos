
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Check, AlertCircle, Save, Lock, X, Loader2, ChevronRight, 
  Store, Printer, Users, Palette, BarChart, ShieldCheck, 
  ArrowLeft, Search, AlertTriangle, FileText, Copy, 
  UserCog, Shield, Undo2, Wifi, WifiOff, RefreshCw, ShieldAlert, Keyboard,
  CheckCircle2, Plus, ChevronLeft, LayoutTemplate, Terminal, Info, CreditCard,
  Edit
} from 'lucide-react';
import { useSettingsLogic, SaveStatus } from '../hooks/useSettingsLogic';
import { supabase } from '../supabase';
import { useTheme } from '../ThemeContext';
import { SETTINGS_PRESETS, useSettingsContext } from '../context/SettingsContext';
import { SettingCardConfig, SettingSectionConfig, SettingItemConfig, SettingOption } from '../types/settingsTypes';
import { useAuth } from '../AuthContext';

// --- TYPES RE-EXPORT ---
export type { SettingControlType, SettingOption, SettingItemConfig, SettingSectionConfig, SettingCardConfig } from '../types/settingsTypes';

// --- COMPONENTS ---

// ... (DashboardCard component remains unchanged) ...
const DashboardCard: React.FC<{ title: string; description: string; icon: any; status?: string; onClick: () => void }> = ({ title, description, icon: Icon, status, onClick }) => (
  <button 
    onClick={onClick}
    className="flex flex-col text-left p-6 bg-surface border border-border rounded-2xl hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group relative overflow-hidden h-full"
  >
    <div className="flex justify-between items-start w-full mb-4">
      <div className="p-3 bg-background rounded-xl text-primary border border-border group-hover:scale-110 transition-transform">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      {status && (
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border
          ${status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
            status === 'warning' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
            'bg-red-500/10 text-red-500 border-red-500/20'}`}>
          {status === 'active' ? 'Vận hành: Mượt' : status === 'warning' ? 'Cần chú ý' : 'Lỗi'}
        </div>
      )}
    </div>
    <h3 className="text-lg font-bold text-text-main mb-1 group-hover:text-primary transition-colors">{title}</h3>
    <p className="text-xs text-secondary leading-relaxed line-clamp-2">{description}</p>
    <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0">
      <ChevronRight className="text-primary" size={20} />
    </div>
  </button>
);

// ... (DangerModal component remains unchanged) ...
const DangerModal: React.FC<{ isOpen: boolean; title: string; message: string; confirmText: string; onClose: () => void; onConfirm: () => void; requireInput?: string; isDanger?: boolean }> = ({ isOpen, title, message, confirmText, onClose, onConfirm, requireInput, isDanger = true }) => {
  const [inputValue, setInputValue] = useState('');
  useEffect(() => { if (isOpen) setInputValue(''); }, [isOpen]);
  if (!isOpen) return null;
  const canConfirm = !requireInput || inputValue === requireInput;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl p-6">
        <div className={`flex items-center gap-3 mb-4 ${isDanger ? 'text-red-500' : 'text-primary'}`}>
          <AlertTriangle size={24} />
          <h3 className="font-bold text-lg">{title}</h3>
        </div>
        <p className="text-sm text-secondary mb-6">{message}</p>
        {requireInput && (
          <div className="mb-6">
            <p className="text-xs font-bold text-text-main mb-2">Nhập <span className={`font-mono ${isDanger ? 'text-red-500' : 'text-primary'}`}>{requireInput}</span> để xác nhận:</p>
            <input value={inputValue} onChange={e => setInputValue(e.target.value)} className={`w-full bg-background border border-border rounded-lg px-3 py-3 text-sm outline-none focus:ring-1 font-mono ${isDanger ? 'focus:border-red-500 focus:ring-red-500' : 'focus:border-primary focus:ring-primary'}`} placeholder={requireInput} autoFocus />
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl font-bold text-secondary hover:bg-border transition-colors">Huỷ</button>
          <button onClick={onConfirm} disabled={!canConfirm} className={`flex-1 py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all ${isDanger ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' : 'bg-primary hover:bg-primary-hover text-background shadow-primary/20'}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

// ... (SettingInput component remains unchanged) ...
const SettingInput: React.FC<{ item: SettingItemConfig; value: any; onChange: (val: any) => void; isAdmin?: boolean }> = ({ item, value, onChange, isAdmin }) => {
  const { t } = useTheme();
  const [localVal, setLocalVal] = useState(value);
  
  useEffect(() => { setLocalVal(value); }, [value]);
  
  const handleBlur = () => {
    let finalVal = localVal;
    if (item.inputType === 'number') {
      let num = Number(finalVal);
      if (isNaN(num)) num = 0;
      if (item.min !== undefined && num < item.min) num = item.min;
      if (item.max !== undefined && num > item.max) num = item.max;
      finalVal = num;
    }
    if (finalVal !== value) onChange(finalVal);
    setLocalVal(finalVal);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalVal(e.target.value);
  };

  const widthClass = item.inputType === 'time' ? 'w-32' : 'w-full md:w-64';

  return (
    <div className="relative">
      <input 
        type={item.inputType || 'text'} 
        value={localVal} 
        onChange={handleChange} 
        onBlur={handleBlur} 
        min={item.min} 
        max={item.max} 
        disabled={item.disabled}
        placeholder={item.placeholder}
        className={`bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-main outline-none focus:border-primary font-medium ${widthClass} text-right ${item.suffix ? 'pr-8' : ''} ${item.disabled ? 'opacity-50 cursor-not-allowed bg-surface' : ''}`} 
      />
      {item.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-secondary pointer-events-none">{item.suffix}</span>}
    </div>
  );
};

// --- BANK SETUP COMPONENT ---
const BankSetup: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTheme();
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [bankConfig, setBankConfig] = useState({
    bankId: '',
    accountNo: '',
    accountName: '',
    template: 'compact2'
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('bank_config');
      if (stored) {
        setBankConfig(JSON.parse(stored));
      }
    } catch (e) { console.error("Error loading bank config", e); }

    const fetchBanks = async () => {
      setLoading(true);
      try {
        const res = await fetch('https://api.vietqr.io/v2/banks');
        const json = await res.json();
        if (json.code === '00' && Array.isArray(json.data)) {
          setBanks(json.data);
        }
      } catch (e) {
        console.error("Bank fetch error", e);
      } finally {
        setLoading(false);
      }
    };
    fetchBanks();
  }, []);

  const handleSave = () => {
    if (!bankConfig.bankId || !bankConfig.accountNo) {
      alert(t('Vui lòng nhập đầy đủ thông tin ngân hàng'));
      return;
    }
    setSaveStatus('saving');
    try {
      localStorage.setItem('bank_config', JSON.stringify(bankConfig));
      setTimeout(() => {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }, 500);
    } catch (e) {
      setSaveStatus('error');
    }
  };

  return (
    <div className="bg-background/50 rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard size={18} className="text-primary"/>
        <span className="text-sm font-bold text-text-main">{t('Ngân hàng (VietQR)')}</span>
        {isAdmin && <span className="ml-auto text-[10px] bg-surface border border-border px-2 py-0.5 rounded text-secondary">{t('Lưu trên máy này')}</span>}
      </div>

      {!isAdmin ? (
        <div className="p-4 text-center text-secondary text-sm bg-surface border border-border rounded-lg">
          <Lock size={16} className="mx-auto mb-2 opacity-50"/>
          {t('Administrator access required')}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-xs font-bold text-secondary uppercase">{t('Ngân hàng')}</label>
            <div className="relative">
              <select
                value={bankConfig.bankId}
                onChange={(e) => setBankConfig(prev => ({ ...prev, bankId: e.target.value }))}
                disabled={loading}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-bold text-text-main outline-none focus:border-primary appearance-none"
              >
                <option value="">{loading ? t('Loading...') : t('Chọn ngân hàng')}</option>
                {banks.map((b: any) => (
                  <option key={b.id} value={b.bin}>{b.shortName} - {b.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-secondary">
                <ChevronRight size={14} className="rotate-90"/>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-secondary uppercase">{t('Số tài khoản')}</label>
              <input 
                type="text" 
                value={bankConfig.accountNo}
                onChange={(e) => setBankConfig(prev => ({ ...prev, accountNo: e.target.value }))}
                placeholder="VD: 1900xxxx"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-secondary uppercase">{t('Tên chủ tài khoản')}</label>
              <input 
                type="text" 
                value={bankConfig.accountName}
                onChange={(e) => setBankConfig(prev => ({ ...prev, accountName: e.target.value.toUpperCase() }))}
                placeholder="NGUYEN VAN A"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-primary uppercase"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={handleSave}
              disabled={saveStatus === 'saving' || !bankConfig.bankId}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg font-bold text-sm shadow-sm hover:bg-primary-hover disabled:opacity-50 transition-all"
            >
              {saveStatus === 'saving' ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
              {saveStatus === 'saved' ? t('Đã lưu') : t('Lưu cấu hình ngân hàng')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// --- USER PIN MANAGEMENT COMPONENT ---
const UserPinManagement: React.FC<{ isAdmin: boolean }> = ({ isAdmin }) => {
  const { t } = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true });
      if (data) setUsers(data);
    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  const handleUpdatePin = async () => {
    if (!editingUser || newPin.length !== 4) return;
    setSavingPin(true);
    try {
      const { error } = await supabase.from('users').update({ pin_code: newPin }).eq('id', editingUser.id);
      if (error) throw error;
      alert(t('PIN updated successfully'));
      setEditingUser(null);
      setNewPin('');
      fetchUsers();
    } catch (e: any) {
      alert('Error updating PIN: ' + e.message);
    } finally {
      setSavingPin(false);
    }
  };

  if (!isAdmin) {
    return (
        <div className="p-4 bg-surface border border-border rounded-xl text-center text-sm text-secondary">
            <Lock size={16} className="mx-auto mb-2 opacity-50"/>
            {t('Administrator access required to manage users')}
        </div>
    );
  }

  return (
    <div className="bg-background/50 rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users size={18} className="text-primary"/>
        <span className="text-sm font-bold text-text-main">{t('Quản lý User & Mã PIN')}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-secondary text-[10px] uppercase font-bold">
            <tr>
              <th className="p-3 rounded-tl-lg">User</th>
              <th className="p-3">Role</th>
              <th className="p-3">PIN Status</th>
              <th className="p-3 rounded-tr-lg text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
                <tr><td colSpan={4} className="p-4 text-center"><Loader2 className="animate-spin mx-auto text-primary" size={20}/></td></tr>
            ) : users.map(user => (
                <tr key={user.id} className="hover:bg-surface transition-colors">
                    <td className="p-3">
                        <div className="font-bold text-text-main">{user.full_name || 'No Name'}</div>
                        <div className="text-xs text-secondary">{user.email}</div>
                    </td>
                    <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border
                            ${user.role === 'admin' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                              user.role === 'manager' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                              'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                            {user.role || 'Staff'}
                        </span>
                    </td>
                    <td className="p-3">
                        {user.pin_code ? <span className="text-emerald-500 font-bold text-xs">●●●●</span> : <span className="text-secondary text-xs italic">Not Set</span>}
                    </td>
                    <td className="p-3 text-right">
                        <button onClick={() => setEditingUser(user)} className="p-2 bg-surface hover:bg-border rounded-lg text-secondary hover:text-primary transition-all">
                            <Edit size={16} />
                        </button>
                    </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                <h3 className="font-bold text-lg mb-4 text-text-main">{t('Set PIN for')} {editingUser.full_name}</h3>
                <input 
                    type="text" 
                    maxLength={4}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 4-digit PIN"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-widest outline-none focus:border-primary mb-6"
                    autoFocus
                />
                <div className="flex gap-3">
                    <button onClick={() => { setEditingUser(null); setNewPin(''); }} className="flex-1 py-3 border border-border rounded-xl font-bold text-secondary">{t('Cancel')}</button>
                    <button onClick={handleUpdatePin} disabled={newPin.length !== 4 || savingPin} className="flex-1 py-3 bg-primary text-background rounded-xl font-bold shadow-lg disabled:opacity-50">
                        {savingPin ? <Loader2 className="animate-spin mx-auto"/> : t('Save PIN')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const SettingsListRenderer: React.FC<{ 
  sections: SettingSectionConfig[]; 
  values: Record<string, any>; 
  onValueChange: (key: string, value: any) => void; 
  onAction: (id: string) => void; 
  searchQuery: string; 
  setDangerModal: (m: any) => void; 
  setShowPwModal: (s: boolean) => void; 
  userRole: string;
  activePreset?: string;
  onPresetSelect: (id: string) => void;
}> = ({ sections, values, onValueChange, onAction, searchQuery, setDangerModal, setShowPwModal, userRole, activePreset, onPresetSelect }) => {
  const { t } = useTheme();
  const isAdmin = userRole === 'admin';

  const handleToggle = (item: SettingItemConfig, currentValue: boolean) => {
    if (item.disabled) return;
    if (!currentValue && item.confirmMessage) {
        setDangerModal({ open: true, type: 'TOGGLE_CONFIRM', title: `${t('Bật tính năng')}: ${t(item.label)}`, message: t(item.confirmMessage), confirmText: t('Đồng ý bật'), isDanger: true, onConfirmCallback: () => onValueChange(item.valueKey!, true) });
        return;
    }
    onValueChange(item.valueKey!, !currentValue);
  };
  const renderControl = (item: SettingItemConfig) => {
    const val = item.valueKey ? values[item.valueKey] : '';
    switch (item.type) {
      case 'toggle': return <button disabled={item.disabled} onClick={() => handleToggle(item, !!val)} className={`w-11 h-6 rounded-full relative transition-colors ${val ? (item.disabled ? 'bg-primary/50' : 'bg-primary') : (item.disabled ? 'bg-border/50' : 'bg-border')}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${val ? 'translate-x-5' : 'translate-x-0'}`} /></button>;
      case 'select': return <select disabled={item.disabled} value={val} onChange={(e) => onValueChange(item.valueKey!, e.target.value)} className="bg-surface border border-border rounded-lg px-3 py-2 text-sm font-bold text-text-main outline-none focus:border-primary cursor-pointer max-w-[150px] disabled:opacity-50 disabled:cursor-not-allowed">{item.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>;
      case 'input': return <SettingInput item={item} value={val} onChange={(newVal) => onValueChange(item.valueKey!, newVal)} isAdmin={isAdmin} />;
      case 'button': return <button disabled={item.disabled} onClick={() => { if (item.actionId === 'change_password') setShowPwModal(true); else onAction(item.actionId!); }} className={`px-4 py-2 border rounded-lg text-sm font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${item.variant === 'primary' ? 'bg-primary text-background border-primary hover:bg-primary-hover' : 'bg-surface border-border text-text-main hover:bg-border'}`}>{t(item.label)}</button>;
      case 'action-danger': return <button disabled={item.disabled} onClick={() => setDangerModal({ open: true, type: item.actionId!, isDanger: true })} className="px-4 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-sm font-bold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{t(item.label)}</button>;
      case 'info': return <span className="text-sm font-bold text-secondary bg-surface px-2 py-1 rounded border border-border max-w-[200px] truncate block">{val}</span>;
      case 'custom-bank-setup': return <BankSetup isAdmin={isAdmin} />;
      case 'custom-user-management': return <UserPinManagement isAdmin={isAdmin} />;
      default: return null;
    }
  };
  const filtered = sections.map(s => ({ ...s, items: s.items.filter(i => !searchQuery || t(i.label).toLowerCase().includes(searchQuery.toLowerCase()) || (i.subtitle && t(i.subtitle).toLowerCase().includes(searchQuery.toLowerCase()))) })).filter(s => s.items.length > 0);
  if (filtered.length === 0) return <div className="flex flex-col items-center justify-center py-20 opacity-50"><AlertCircle size={48} className="text-secondary mb-2"/><p className="text-sm font-bold text-secondary">{t('Không tìm thấy cài đặt nào phù hợp')}</p></div>;
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {filtered.map((s, i) => (
        <div key={i} className="space-y-3">
          <h3 className="text-xs font-black text-secondary uppercase tracking-widest ml-1 pl-2 border-l-2 border-primary/50">{t(s.title)}</h3>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
            {s.items.map((item, ii) => {
              
              if (item.type === 'preset-grid') {
                if (!isAdmin) return null; 
                return (
                  <div key={item.id} className="p-4 border-b border-border bg-background/30 last:border-0">
                     <h4 className="text-xs font-bold text-secondary uppercase tracking-widest mb-3 flex items-center gap-2">
                       <LayoutTemplate size={14} className="text-primary"/> {t(item.label)}
                     </h4>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {Object.entries(SETTINGS_PRESETS).map(([key, preset]) => (
                            <button 
                              key={key}
                              onClick={() => onPresetSelect(key)}
                              className={`text-left p-4 rounded-xl border transition-all relative overflow-hidden group
                                  ${activePreset === key 
                                  ? 'bg-primary/10 border-primary shadow-sm ring-1 ring-primary' 
                                  : 'bg-surface border-border hover:border-primary/50'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                  <span className={`font-bold text-sm ${activePreset === key ? 'text-primary' : 'text-text-main'}`}>{preset.label}</span>
                                  {activePreset === key && <CheckCircle2 size={16} className="text-primary" />}
                                </div>
                                <p className="text-[10px] text-secondary leading-relaxed line-clamp-2">{preset.desc}</p>
                                {activePreset !== key && (
                                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                                      <span className="bg-primary text-background text-xs font-bold px-3 py-1.5 rounded-full shadow-lg scale-90 group-hover:scale-100 transition-transform">{t('Áp dụng')}</span>
                                  </div>
                                )}
                            </button>
                        ))}
                     </div>
                  </div>
                );
              }

              if (item.type === 'custom-bank-setup' || item.type === 'custom-user-management') {
                  return (
                      <div key={item.id} className="p-4 border-b border-border last:border-0">
                          {renderControl(item)}
                      </div>
                  );
              }

              return (
                <div key={item.id} className={`flex items-center justify-between p-4 hover:bg-background transition-colors ${ii !== s.items.length - 1 ? 'border-b border-border' : ''} ${item.danger ? 'hover:border-red-500/20 hover:bg-red-500/5' : ''} ${item.disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="flex-1 pr-4 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className={`text-sm font-bold truncate ${item.danger ? 'text-red-500' : 'text-text-main'}`}>{t(item.label)}</h4>
                      {item.tags && item.tags.map(tag => <span key={tag} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider border border-primary/20 whitespace-nowrap">{t(tag)}</span>)}
                    </div>
                    {item.subtitle && <p className="text-xs text-secondary font-medium truncate">{t(item.subtitle)}</p>}
                  </div>
                  <div className="shrink-0 ml-2">{renderControl(item)}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ... (SettingsLayout, ShortcutModal, PasswordModal remain unchanged) ...
const SettingsLayout: React.FC<{ title: string; subtitle?: string; onBack: () => void; children: React.ReactNode; onSearch: (q: string) => void; saveStatus: SaveStatus }> = ({ title, subtitle, onBack, children, onSearch, saveStatus }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { t } = useTheme();
  return (
    <div className="flex flex-col h-full bg-background animate-in slide-in-from-right duration-300 absolute inset-0 z-20">
      <div className="h-20 border-b border-border flex items-center justify-between px-6 lg:px-8 bg-background/95 backdrop-blur shrink-0 z-30 sticky top-0 shadow-sm">
         <div className="flex items-center gap-4">
           <button onClick={onBack} className="p-2 -ml-2 hover:bg-surface rounded-full text-secondary hover:text-text-main transition-colors group"><ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" /></button>
           <div><h1 className="text-xl font-black tracking-tight text-text-main leading-none">{title}</h1>{subtitle && <p className="text-xs text-secondary font-bold mt-1.5 uppercase tracking-wide">{subtitle}</p>}</div>
         </div>
         <div className="flex items-center gap-4">
           {saveStatus === 'saving' && <div className="flex items-center gap-1.5 text-secondary text-xs font-bold animate-pulse"><Loader2 size={12} className="animate-spin"/> Saving...</div>}
           {saveStatus === 'saved' && <div className="flex items-center gap-1.5 text-emerald-500 text-xs font-bold transition-all duration-300"><CheckCircle2 size={12}/> Saved</div>}
           {saveStatus === 'error' && <div className="flex items-center gap-1.5 text-red-500 text-xs font-bold"><AlertCircle size={12}/> Error</div>}
           <div className="relative hidden md:block w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={16} /><input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); onSearch(e.target.value); }} placeholder={t("Tìm cài đặt...")} className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 text-sm font-medium outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all" autoFocus /></div>
         </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar bg-surface/30"><div className="max-w-3xl mx-auto pb-20">{children}</div></div>
    </div>
  );
};

const ShortcutModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTheme();
  const shortcuts = [
    { key: 'F2', action: 'Thanh toán nhanh' },
    { key: 'F3', action: 'Tìm kiếm món' },
    { key: 'F4', action: 'In lại hóa đơn gần nhất' },
    { key: 'Esc', action: 'Đóng modal / Huỷ bỏ' },
    { key: 'Ctrl + S', action: 'Lưu cài đặt' },
  ];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-border flex justify-between items-center bg-background/50">
          <h3 className="font-bold text-text-main text-lg flex items-center gap-2"><Keyboard size={20} className="text-primary"/> {t('Phím tắt hệ thống')}</h3>
          <button onClick={onClose}><X size={20} className="text-secondary hover:text-text-main"/></button>
        </div>
        <div className="p-2 bg-surface">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex justify-between items-center p-3 hover:bg-background rounded-lg border-b border-border/50 last:border-0 transition-colors">
              <span className="font-mono text-xs font-bold bg-primary/10 text-primary px-2 py-1 rounded border border-primary/20 min-w-[60px] text-center">{s.key}</span>
              <span className="text-sm font-bold text-secondary">{t(s.action)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const PasswordModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const { t } = useTheme();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleUpdate = async () => {
    if (password !== confirm) {
      setError(t('Mật khẩu không khớp'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      alert(t('Đổi mật khẩu thành công'));
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6">
        <h3 className="font-bold text-lg mb-4">{t('Đổi mật khẩu')}</h3>
        <input type="password" placeholder={t('Mật khẩu mới')} className="w-full mb-3 p-3 bg-background border border-border rounded-xl" value={password} onChange={e => setPassword(e.target.value)} />
        <input type="password" placeholder={t('Xác nhận mật khẩu mới')} className="w-full mb-3 p-3 bg-background border border-border rounded-xl" value={confirm} onChange={e => setConfirm(e.target.value)} />
        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-border rounded-xl font-bold">{t('Huỷ')}</button>
          <button onClick={handleUpdate} disabled={loading} className="flex-1 py-3 bg-primary text-background rounded-xl font-bold">{loading ? <Loader2 className="animate-spin" /> : t('Cập nhật')}</button>
        </div>
      </div>
    </div>
  );
};

export const Settings: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { t } = useTheme();
  const { role, lockApp, signOut } = useAuth();
  
  const { 
    state: { settings }, 
    updateSetting, 
    bulkSet,
    logAuditAction
  } = useSettingsContext();

  const {
    values: logicValues, 
    handleAction, 
    handleApplyPreset, 
    getActivePreset,
    notification, 
    saveStatus,
    cardStatuses
  } = useSettingsLogic();

  const combinedValues: any = { ...settings, ...logicValues };

  const [activeView, setActiveView] = useState('root');
  const [searchQuery, setSearchQuery] = useState('');
  const [dangerModal, setDangerModal] = useState<any>({ open: false });
  const [showPwModal, setShowPwModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleValueChange = (key: string, value: any) => {
      bulkSet({ [key]: value, presetId: '' });
  };

  const handleLockPOS = async () => {
    await logAuditAction('audit.action.lock_pos', 'User locked POS manually', 'success');
    lockApp();
  };

  const handleSwitchUser = async () => {
    await logAuditAction('audit.action.user_switch', 'User switched account', 'success');
    await signOut(); // Clear current session
    onLogout(); // Navigates to Login
  };

  // --- CONFIG ---

  const VIEW_CONFIGS = useMemo((): Record<string, SettingCardConfig> => {
    const isSystemTheme = settings.theme === 'system';
    const isScheduleEnabled = settings.themeScheduleEnabled;
    const isAdmin = role === 'admin';

    return {
    store: {
      id: 'store',
      title: 'Quán & Bán hàng',
      description: 'Thiết lập luồng order, thanh toán và quản lý bàn',
      icon: Store,
      sections: [
        {
          title: 'Mô hình vận hành (Preset)',
          items: [
            { id: 'presetGrid', label: 'Áp dụng nhanh mô hình', type: 'preset-grid' }
          ]
        },
        // A) COUNTER INFO
        {
          title: 'Thông tin quầy',
          items: [
            { id: 'counterName', label: 'Tên quầy / cửa hàng', type: 'input', inputType: 'text', placeholder: 'VD: Cafe ABC', valueKey: 'counterName' },
            { id: 'counterAddress', label: 'Địa chỉ', type: 'input', inputType: 'text', valueKey: 'counterAddress' },
            { id: 'counterPhone', label: 'Số điện thoại', type: 'input', inputType: 'tel', valueKey: 'counterPhone' },
            { id: 'receiptNote', label: 'Ghi chú in hóa đơn', subtitle: 'Hiển thị ở cuối hóa đơn', type: 'input', inputType: 'text', valueKey: 'receiptNote' },
          ]
        },
        // B) VIETQR / BANK CONFIG (Custom)
        {
          title: 'Cấu hình Ngân hàng (VietQR)',
          items: [
            { id: 'bankSetup', label: 'Thiết lập VietQR', type: 'custom-bank-setup' }
          ]
        },
        {
          title: 'Luồng bán hàng',
          items: [
            { id: 'quickOrder', label: 'Tạo đơn nhanh', subtitle: 'Bỏ qua bước chọn bàn, vào thẳng menu (giảm bước)', type: 'toggle', valueKey: 'quickOrder' },
            { id: 'defaultOrderType', label: 'Kiểu order mặc định', subtitle: 'Chọn hình thức phục vụ chính của quán', type: 'select', valueKey: 'defaultOrderType', options: [ { label: 'Tại bàn', value: 'dine-in' }, { label: 'Mang đi', value: 'takeaway' }, { label: 'Giao hàng', value: 'delivery' } ] },
            { id: 'confirmCancelOrder', label: 'Hỏi xác nhận khi huỷ món', subtitle: 'Tránh nhân viên bấm nhầm xoá món đã gọi', type: 'toggle', valueKey: 'confirmCancelOrder' },
          ]
        },
        {
          title: 'Thanh toán',
          items: [
            { id: 'allowSplitBill', label: 'Cho phép tách bill', subtitle: 'Tách đơn lớn thành nhiều đơn nhỏ để thanh toán', type: 'toggle', valueKey: 'allowSplitBill' },
            { id: 'allowMergeBill', label: 'Cho phép gộp bill', subtitle: 'Gộp nhiều bàn/đơn vào một hóa đơn thanh toán', type: 'toggle', valueKey: 'allowMergeBill' },
            { id: 'enableDiscount', label: 'Bật tính năng giảm giá', subtitle: 'Cho phép nhập giảm giá theo % hoặc số tiền', type: 'toggle', valueKey: 'enableDiscount' },
            { id: 'maxDiscountPercent', label: 'Giới hạn giảm giá tối đa', subtitle: 'Mức % giảm giá cao nhất nhân viên được phép nhập', type: 'input', inputType: 'number', min: 0, max: 100, suffix: '%', valueKey: 'maxDiscountPercent' },
          ]
        },
        {
          title: 'Bàn & Khu vực',
          items: [
            { id: 'enableTableMap', label: 'Bật quản lý bàn', subtitle: 'Hiển thị sơ đồ bàn (Tắt nếu chỉ bán mang đi)', type: 'toggle', valueKey: 'enableTableMap' },
            { id: 'enableAreas', label: 'Bật quản lý khu vực', subtitle: 'Phân chia bàn theo tầng hoặc phòng', type: 'toggle', valueKey: 'enableAreas' },
            { id: 'tableTimeAlert', label: 'Cảnh báo bàn mở quá lâu', subtitle: 'Hiện cảnh báo khi khách ngồi quá thời gian quy định', type: 'toggle', valueKey: 'tableTimeAlert' },
            { id: 'tableTimeLimit', label: 'Thời gian giới hạn', subtitle: 'Số phút tối đa trước khi cảnh báo', type: 'input', inputType: 'number', suffix: 'phút', valueKey: 'tableTimeLimit' },
          ]
        }
      ]
    },
    printing: {
      id: 'printing',
      title: 'In & Hóa đơn',
      description: 'Máy in, nội dung hóa đơn và thao tác in nhanh',
      icon: Printer,
      sections: [
        {
          title: 'Máy in',
          items: [
            { id: 'printerName', label: 'Tên máy in', type: 'input', valueKey: 'printerName' },
            { id: 'checkConnection', label: 'Kiểm tra kết nối', subtitle: 'Gửi tín hiệu đến máy in', type: 'button', actionId: 'check_connection' },
            { id: 'paperSize', label: 'Khổ giấy', type: 'select', valueKey: 'paperSize', options: [{ label: '80mm', value: '80mm' }, { label: '58mm', value: '58mm' }] },
          ]
        },
        {
          title: 'Hành vi in',
          items: [
            { id: 'autoPrint', label: 'Tự động in sau thanh toán', subtitle: 'Bấm Thanh toán là in ngay', type: 'toggle', valueKey: 'autoPrint' },
            { id: 'printTemp', label: 'In phiếu tạm khi tạo đơn', subtitle: 'Dùng khi muốn giữ bill tạm', type: 'toggle', valueKey: 'printTemp' },
            { id: 'reprintOnEdit', label: 'In lại khi chỉnh sửa đơn', subtitle: 'Thêm món/sửa món sẽ in lại', type: 'toggle', valueKey: 'reprintOnEdit' },
          ]
        },
        {
          title: 'Nội dung hóa đơn',
          items: [
            { id: 'showQr', label: 'Hiện QR thanh toán', subtitle: 'Khách quét mã chuyển khoản nhanh', type: 'toggle', valueKey: 'showQr' },
            { id: 'showStoreInfo', label: 'Hiện thông tin quán', subtitle: 'Tên/địa chỉ/SĐT trên hóa đơn', type: 'toggle', valueKey: 'showStoreInfo' },
            { id: 'wifiName', label: 'Tên Wifi', subtitle: 'In ở cuối hóa đơn cho khách tại bàn', type: 'input', valueKey: 'wifiName' },
            { id: 'wifiPassword', label: 'Mật khẩu Wifi', subtitle: 'In ở cuối hóa đơn cho khách tại bàn', type: 'input', valueKey: 'wifiPassword' },
            { id: 'receiptFontSize', label: 'Cỡ chữ hóa đơn', subtitle: 'Khuyên dùng ‘Vừa’ cho 80mm', type: 'select', valueKey: 'receiptFontSize', options: [{ label: 'Nhỏ', value: 'small' }, { label: 'Vừa', value: 'medium' }, { label: 'Lớn', value: 'large' }] },
            { id: 'printItemNotes', label: 'In ghi chú món', subtitle: 'Ghi chú nằm dưới tên món', type: 'toggle', valueKey: 'printItemNotes' },
            { id: 'testPrint', label: 'Test in', subtitle: 'In hóa đơn test', type: 'button', actionId: 'test_print' },
          ]
        }
      ]
    },
    staff: {
      id: 'staff',
      title: 'Nhân viên & Quyền hạn',
      description: 'Phân quyền, giới hạn thao tác nhạy cảm và bảo mật',
      icon: Users,
      sections: [
        {
          title: 'Quyền quan trọng (Staff Permissions)',
          items: [
            { id: 'allowCancelItem', label: 'Cho phép huỷ món', subtitle: 'Rủi ro: Nhân viên có thể huỷ đơn gian lận sau khi thu tiền.', confirmMessage: 'Cho phép nhân viên tự ý huỷ món có thể dẫn đến thất thoát doanh thu. Bạn có chắc chắn muốn bật?', type: 'toggle', valueKey: 'allowCancelItem', danger: true },
            { id: 'allowCancelOrder', label: 'Cho phép xóa hoàn toàn đơn hàng', subtitle: 'Rủi ro: Mất dữ liệu đơn hàng.', confirmMessage: 'Cho phép nhân viên xóa hoàn toàn đơn hàng (Cancel Order). Bạn có chắc chắn?', type: 'toggle', valueKey: 'allowCancelOrder', danger: true },
            { id: 'allowDiscount', label: 'Cho phép giảm giá', subtitle: 'Rủi ro: Áp dụng giảm giá sai quy định.', confirmMessage: 'Việc cho phép nhân viên tự giảm giá có thể bị lạm dụng. Bạn có chắc chắn?', type: 'toggle', valueKey: 'allowDiscount', danger: true },
            { id: 'allowRefund', label: 'Cho phép hoàn tiền / Mở két', subtitle: 'Rủi ro cao: Thất thoát tiền mặt trực tiếp.', confirmMessage: 'CẢNH BÁO: Quyền này cho phép nhân viên mở két tiền và hoàn trả tiền mặt. Bạn có chắc chắn?', type: 'toggle', valueKey: 'allowRefund', danger: true },
          ]
        },
        {
          title: 'Mã PIN thao tác nhạy cảm',
          items: [
            { id: 'userPinManagement', label: 'User PIN Management', type: 'custom-user-management' }
          ]
        },
        {
          title: 'Cấu hình Manager (Manager Config)',
          items: [
            { id: 'managerRequirePinCancelOrder', label: 'Manager phải nhập PIN khi hủy order', subtitle: 'Bắt buộc Manager xác thực cho các thao tác nhạy cảm', type: 'toggle', valueKey: 'managerRequirePinCancelOrder' },
            { id: 'managerRequirePinCancelItem', label: 'Manager phải nhập PIN khi xóa món', subtitle: 'Bắt buộc Manager xác thực cho các thao tác nhạy cảm', type: 'toggle', valueKey: 'managerRequirePinCancelItem' },
            { id: 'managerRequirePinDiscount', label: 'Manager phải nhập PIN khi giảm giá', subtitle: 'Bắt buộc Manager xác thực cho các thao tác nhạy cảm', type: 'toggle', valueKey: 'managerRequirePinDiscount' },
            { id: 'managerRequirePinReprint', label: 'Manager phải nhập PIN khi in lại hóa đơn', subtitle: 'Bắt buộc Manager xác thực cho các thao tác nhạy cảm', type: 'toggle', valueKey: 'managerRequirePinReprint' },
          ]
        }
      ]
    },
    ui: {
      id: 'ui',
      title: 'Giao diện & Trải nghiệm',
      description: 'Tùy chỉnh tốc độ thao tác, hiển thị và phím tắt',
      icon: Palette,
      sections: [
        {
          title: 'Giao diện & Ngôn ngữ',
          items: [
            { 
              id: 'theme', 
              label: 'Chế độ hiển thị', 
              subtitle: 'Giao diện Sáng / Tối', 
              type: 'select', 
              valueKey: 'theme', 
              options: [
                { label: 'Hệ thống (System)', value: 'system' },
                { label: 'Tối (Dark)', value: 'dark' }, 
                { label: 'Sáng (Light)', value: 'light' },
              ] 
            },
            {
              id: 'themeScheduleEnabled',
              label: 'Tự động theo khung giờ (06:00–18:00 sáng, 18:00–06:00 tối)',
              subtitle: isSystemTheme ? 'Tự động chuyển đổi Light/Dark' : 'Chỉ áp dụng khi chọn System',
              type: 'toggle',
              valueKey: 'themeScheduleEnabled',
              disabled: !isSystemTheme
            },
            ...(isSystemTheme && isScheduleEnabled ? [
              { id: 'themeDayStart', label: 'Giờ bắt đầu Sáng', type: 'input', inputType: 'time', valueKey: 'themeDayStart' } as SettingItemConfig,
              { id: 'themeNightStart', label: 'Giờ bắt đầu Tối', type: 'input', inputType: 'time', valueKey: 'themeNightStart' } as SettingItemConfig,
            ] : []),
            { id: 'language', label: 'Ngôn ngữ', subtitle: 'Áp dụng cho toàn bộ hệ thống, không cần khởi động lại', type: 'select', valueKey: 'language', options: [{label: 'Tiếng Việt', value: 'vi'}, {label: 'English', value: 'en'}] },
          ]
        },
        {
          title: 'Tốc độ thao tác',
          items: [
            { id: 'singleTapAdd', label: 'Chạm 1 lần để thêm món', subtitle: 'Mặc định trên tablet giúp order nhanh hơn', type: 'toggle', valueKey: 'singleTapAdd' },
            { id: 'soundEffect', label: 'Âm thanh beep khi thêm món', subtitle: 'Phản hồi âm thanh giúp biết đã nhận lệnh', type: 'toggle', valueKey: 'soundEffect' },
          ]
        },
        {
          title: 'Hiển thị',
          items: [
            { id: 'uiDensity', label: 'Mật độ giao diện', subtitle: 'Chọn độ thoáng của các nút bấm', type: 'select', valueKey: 'uiDensity', options: [{ label: 'Thoáng', value: 'spacious' }, { label: 'Vừa', value: 'medium' }, { label: 'Dày (Compact)', value: 'compact' }] },
            { id: 'uiFontSize', label: 'Cỡ chữ tổng', subtitle: 'Ảnh hưởng toàn bộ ứng dụng', type: 'select', valueKey: 'uiFontSize', options: [{ label: 'Nhỏ', value: 'small' }, { label: 'Vừa', value: 'medium' }, { label: 'Lớn', value: 'large' }] },
            { id: 'highContrast', label: 'Chế độ tương phản cao', subtitle: 'Dễ nhìn hơn trong môi trường ánh sáng mạnh', type: 'toggle', valueKey: 'highContrast' },
          ]
        },
        {
          title: 'Shortcut',
          items: [
            { id: 'enableShortcuts', label: 'Bật phím tắt bàn phím', subtitle: 'F2: Thanh toán, F3: Tìm món...', type: 'toggle', valueKey: 'enableShortcuts' },
            { id: 'viewShortcuts', label: 'Xem danh sách phím tắt', subtitle: 'Hiển thị bảng tra cứu phím tắt', type: 'button', actionId: 'view_shortcuts' },
          ]
        }
      ]
    },
    report: {
      id: 'report',
      title: 'Báo cáo & Kiểm soát',
      description: 'Giữ số liệu sạch, hạn chế thất thoát, kiểm soát vận hành',
      icon: BarChart,
      sections: [
        {
          title: 'Nhật ký thao tác (Audit)',
          items: [
            { id: 'logSensitiveActions', label: 'Ghi log thao tác nhạy cảm', subtitle: 'Lưu lại khi nhân viên huỷ món, giảm giá hoặc hoàn tiền', type: 'toggle', valueKey: 'logSensitiveActions' },
            { id: 'logShiftChanges', label: 'Ghi log đổi ca', subtitle: 'Lưu thời điểm và người thực hiện giao ca', type: 'toggle', valueKey: 'logShiftChanges' },
            { id: 'logRetention', label: 'Thời gian lưu log', subtitle: 'Tự động xoá log cũ để giảm dung lượng', type: 'select', valueKey: 'logRetention', options: [{ label: '7 ngày', value: '7' }, { label: '30 ngày', value: '30' }, { label: '90 ngày', value: '90' }] },
          ]
        },
        {
          title: 'Cảnh báo thất thoát',
          items: [
            { id: 'alertHighDiscount', label: 'Cảnh báo khi giảm giá cao', subtitle: 'Hiện cảnh báo đỏ nếu % giảm giá vượt mức quy định', type: 'toggle', valueKey: 'alertHighDiscount' },
            { id: 'highDiscountThreshold', label: 'Ngưỡng cảnh báo giảm giá', subtitle: 'Ví dụ: 20% - Cao hơn mức này sẽ báo động', type: 'input', inputType: 'number', suffix: '%', valueKey: 'highDiscountThreshold' },
            { id: 'alertCancel', label: 'Cảnh báo huỷ món bất thường', subtitle: 'Phát hiện nếu một bàn bị huỷ món liên tục', type: 'toggle', valueKey: 'alertCancel' },
          ]
        },
        {
          title: 'Đóng ca (Shift Close)',
          items: [
            { id: 'requireShiftClose', label: 'Bắt buộc đóng ca cuối ngày', subtitle: 'Không thể bán hàng ngày mới nếu chưa chốt ca cũ', type: 'toggle', valueKey: 'requireShiftClose' },
            { id: 'requireCashCount', label: 'Yêu cầu nhập tiền thực thu', subtitle: 'Nhân viên phải đếm tiền và nhập số liệu khi đóng ca', type: 'toggle', valueKey: 'requireCashCount' },
          ]
        },
        {
          title: 'Quyền xem báo cáo & Dữ liệu',
          items: [
            { id: 'reportAccess', label: 'Ai được xem báo cáo', subtitle: 'Giới hạn đúng người, đúng việc', type: 'select', valueKey: 'reportAccess', options: [{ label: 'Chỉ chủ quán', value: 'owner' }, { label: 'Chủ + quản lý', value: 'manager' }, { label: 'Tất cả nhân viên', value: 'all' }] },
            { id: 'hideRevenue', label: 'Ẩn doanh thu chi tiết', subtitle: 'Nhân viên chỉ thấy số lượng, không thấy tiền', type: 'toggle', valueKey: 'hideRevenue' },
            { id: 'allowExport', label: 'Cho phép xuất dữ liệu', subtitle: 'Chỉ nên bật cho chủ quán', type: 'toggle', valueKey: 'allowExport' },
          ]
        }
      ]
    },
    system: {
      id: 'system',
      title: 'Hệ thống & An toàn',
      description: 'Bán ổn định khi mất mạng, bảo vệ dữ liệu, yên tâm vận hành',
      icon: ShieldCheck,
      sections: [
        {
          title: 'Offline & Đồng bộ',
          items: [
            { id: 'autoSync', label: 'Tự động đồng bộ', subtitle: 'Tự đẩy dữ liệu lên server khi có mạng', type: 'toggle', valueKey: 'autoSync' },
            { id: 'syncNow', label: combinedValues.networkStatusLabel === 'Offline' ? 'Đang Offline' : 'Đồng bộ ngay', subtitle: 'Đẩy thủ công các đơn Offline lên hệ thống', type: 'button', actionId: 'sync_now', disabled: combinedValues.networkStatusLabel === 'Offline' },
            { id: 'networkStatusLabel', label: 'Trạng thái mạng', type: 'info', valueKey: 'networkStatusLabel' },
            { id: 'pendingSyncCount', label: 'Đơn chờ đồng bộ', type: 'info', valueKey: 'pendingSyncCount' },
            { id: 'lastSyncTime', label: 'Lần đồng bộ cuối', type: 'info', valueKey: 'lastSyncTimeDisplay' },
            ...(combinedValues.lastSyncError && combinedValues.lastSyncError !== 'Không có lỗi' ? [{ id: 'lastSyncError', label: 'Lỗi đồng bộ', type: 'info', valueKey: 'lastSyncError' } as SettingItemConfig] : []),
          ]
        },
        {
          title: 'Sao lưu',
          items: [
            { id: 'exportData', label: 'Xuất dữ liệu', subtitle: isAdmin ? 'Tải về file dự phòng (JSON)' : 'Chỉ Admin', type: 'button', actionId: 'export_data', disabled: !isAdmin },
            { id: 'importData', label: 'Nhập dữ liệu', subtitle: isAdmin ? 'Khôi phục từ file backup' : 'Chỉ Admin', type: 'button', actionId: 'import_data', disabled: !isAdmin },
          ]
        },
        {
          title: 'Danger Zone',
          items: [
            { id: 'factoryReset', label: 'Xoá dữ liệu cục bộ', subtitle: isAdmin ? 'Thao tác này sẽ xoá toàn bộ dữ liệu trên thiết bị này.' : 'Chỉ Admin', type: 'action-danger', actionId: 'factory_reset', disabled: !isAdmin },
            { id: 'runTests', label: 'Chạy kiểm tra vận hành', subtitle: 'Quét lỗi cấu hình và rủi ro bảo mật', type: 'button', actionId: 'run_scenario_tests' },
          ]
        }
      ]
    }
  }}, [settings, role, t, combinedValues]);

  const wrapAction = async (id: string) => {
    if (id === 'view_shortcuts') setShowShortcuts(true);
    else if (id === 'run_scenario_tests') {
      await handleAction(id);
      setDangerModal({ open: false });
    } else {
      await handleAction(id);
    }
  };

  const activePreset = getActivePreset();

  const visibleCards = useMemo(() => {
    if (role === 'admin') return Object.values(VIEW_CONFIGS);
    if (role === 'manager') return [VIEW_CONFIGS.ui, VIEW_CONFIGS.printing, VIEW_CONFIGS.system];
    return [VIEW_CONFIGS.ui];
  }, [role, VIEW_CONFIGS]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
      {notification && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[150] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 border
          ${notification.type === 'success' ? 'bg-emerald-500 text-white border-emerald-600' : 
            notification.type === 'error' ? 'bg-red-500 text-white border-red-600' : 
            notification.type === 'info' ? 'bg-blue-500 text-white border-blue-600' : 
            'bg-amber-500 text-white border-amber-600'}`}>
          {notification.type === 'success' ? <Check size={18} /> : 
           notification.type === 'error' ? <AlertCircle size={18} /> : 
           notification.type === 'info' ? <Info size={18} /> : 
           <AlertTriangle size={18} />}
          <span className="font-bold text-sm">{notification.msg}</span>
        </div>
      )}

      {activeView === 'root' ? (
        <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 lg:p-8">
          <div className="max-w-6xl mx-auto w-full pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
              <div>
                <h1 className="text-3xl font-black tracking-tight text-text-main mb-2">{t('Cài đặt hệ thống')}</h1>
                <p className="text-secondary font-medium">{t('Quản lý toàn bộ cấu hình quán')}</p>
              </div>
              <div className="flex gap-3">
                 <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-lg border border-border">
                    <div className={`w-2 h-2 rounded-full ${combinedValues.isOnline ? (combinedValues.networkStatusLabel.includes('No Server') ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-red-500'}`} />
                    <span className="text-xs font-bold text-text-main">{t(combinedValues.networkStatusLabel)}</span>
                 </div>
                 
                 <button 
                    onClick={handleLockPOS} 
                    className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 rounded-xl font-bold transition-all text-sm flex items-center gap-2"
                 >
                    <Lock size={16} /> {t('Lock POS')}
                 </button>
                 <button 
                    onClick={handleSwitchUser} 
                    className="px-4 py-2 bg-surface hover:bg-primary/10 text-secondary hover:text-primary border border-border hover:border-primary/20 rounded-xl font-bold transition-all text-sm flex items-center gap-2"
                 >
                    <Users size={16} /> {t('Switch User')}
                 </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
              {visibleCards.map((cfg) => (
                <DashboardCard 
                  key={cfg.id}
                  title={t(cfg.title)}
                  description={t(cfg.description)}
                  icon={cfg.icon}
                  status={cardStatuses[cfg.id]}
                  onClick={() => setActiveView(cfg.id)}
                />
              ))}
            </div>
            
            <div className="mt-8 pt-8 border-t border-border flex justify-between items-center text-secondary text-xs">
               <p>Signed in as <strong className="text-text-main">{combinedValues.userEmail}</strong> <span className="uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded ml-2 font-bold">{role}</span></p>
               <div className="flex gap-4">
                  <button onClick={() => setShowPwModal(true)} className="hover:text-primary transition-colors hover:underline">{t('Đổi mật khẩu')}</button>
                  <span>Ver {combinedValues.appVersion}</span>
               </div>
            </div>
          </div>
        </div>
      ) : (
        <SettingsLayout 
          title={t(VIEW_CONFIGS[activeView].title)} 
          subtitle={t(VIEW_CONFIGS[activeView].description)} 
          onBack={() => setActiveView('root')}
          onSearch={setSearchQuery}
          saveStatus={saveStatus}
        >
          <SettingsListRenderer 
            sections={VIEW_CONFIGS[activeView].sections} 
            values={combinedValues} 
            onValueChange={handleValueChange}
            onAction={wrapAction}
            searchQuery={searchQuery}
            setDangerModal={setDangerModal}
            setShowPwModal={setShowPwModal}
            userRole={role}
            activePreset={activePreset || undefined}
            onPresetSelect={(id) => {
               setDangerModal({
                 open: true,
                 type: 'APPLY_PRESET',
                 title: t('Xác nhận thay đổi mô hình'),
                 message: t('Áp dụng mô hình này sẽ thay đổi nhiều thiết lập. Tiếp tục?'),
                 confirmText: t('Áp dụng'),
                 isDanger: false,
                 onConfirmCallback: () => handleApplyPreset(id)
               });
            }}
          />
        </SettingsLayout>
      )}

      <DangerModal 
        isOpen={dangerModal.open} 
        onClose={() => setDangerModal({ open: false })} 
        title={dangerModal.title || (dangerModal.type === 'factory_reset' ? t('Xoá dữ liệu trên máy này?') : t('Xác nhận hành động'))}
        message={dangerModal.message || (dangerModal.type === 'factory_reset' ? t('Thao tác này không thể hoàn tác. Nhập DELETE để xác nhận.') : '')}
        confirmText={dangerModal.confirmText || t('Xoá')}
        requireInput={dangerModal.type === 'factory_reset' ? 'DELETE' : undefined}
        onConfirm={async () => {
          setDangerModal({ open: false });
          if (dangerModal.onConfirmCallback) await dangerModal.onConfirmCallback();
          else await wrapAction(dangerModal.type);
        }}
        isDanger={dangerModal.isDanger}
      />

      <PasswordModal 
        isOpen={showPwModal} 
        onClose={() => setShowPwModal(false)} 
      />
      
      {showShortcuts && (
        <ShortcutModal onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
};
