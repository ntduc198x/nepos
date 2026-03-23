
import React, { Suspense, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
const Dashboard = React.lazy(() => import('./screens/Dashboard').then(m => ({ default: m.Dashboard })));
const Menu = React.lazy(() => import('./screens/Menu').then(m => ({ default: m.Menu })));
const FloorPlan = React.lazy(() => import('./screens/FloorPlan').then(m => ({ default: m.FloorPlan })));
const Inventory = React.lazy(() => import('./screens/Inventory').then(m => ({ default: m.Inventory })));
const Settings = React.lazy(() => import('./screens/Settings').then(m => ({ default: m.Settings })));
const Login = React.lazy(() => import('./screens/Login').then(m => ({ default: m.Login })));
const Reports = React.lazy(() => import('./screens/Reports').then(m => ({ default: m.Reports })));
const TaxDeclaration = React.lazy(() => import('./screens/TaxDeclaration').then(m => ({ default: m.TaxDeclaration })));
import { View } from './types';
import { CurrencyProvider } from './CurrencyContext';
import { ThemeProvider, useTheme } from './ThemeContext';
import { NetworkProvider } from './context/NetworkContext';
import { AuthProvider, useAuth } from './AuthContext';
import { DataProvider } from './context/DataContext';
import { DBProvider } from './context/DBProvider';
import { SettingsProvider, useSettingsContext } from './context/SettingsContext';
import { PrintPreviewProvider } from './context/PrintPreviewContext';
import { PrintPreviewModal } from './components/PrintPreviewModal';
import { ToastProvider } from './context/ToastContext';
import { LockScreen } from './components/LockScreen';
import { isSupabaseConfigured } from './supabase';
import { AlertTriangle, Loader2 } from 'lucide-react';

function AppContent({ currentView, setCurrentView }: { currentView: View, setCurrentView: (v: View) => void }) {
  const { user, role, loading, isLocked } = useAuth();
  const { brightness } = useTheme();
  const { settings } = useSettingsContext();

  // FIX 5: Guard redirect bằng !loading.
  // Nếu không có guard này: role='staff' từ cache khi loading=true
  // → redirect admin/manager khỏi inventory/tax trước khi DB xác nhận role thật.
  useEffect(() => {
    if (loading) return;
    if (role === 'staff') {
      if (currentView === 'inventory' || currentView === 'tax') {
        setCurrentView('menu');
      }
    }
  }, [loading, role, currentView, setCurrentView]);

  // --- GLOBAL SHORTCUTS ---
  useEffect(() => {
    if (!settings.enableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // SECURITY: Disable shortcuts when locked
      if (isLocked) return;

      if (e.key === 'F2') {
        e.preventDefault();
        if (currentView !== 'floorplan') {
          setCurrentView('floorplan');
          setTimeout(() => window.dispatchEvent(new CustomEvent('pos:shortcut:pay')), 100);
        } else {
          window.dispatchEvent(new CustomEvent('pos:shortcut:pay'));
        }
      } 
      else if (e.key === 'F3') {
        e.preventDefault();
        if (currentView !== 'menu') {
          setCurrentView('menu');
          setTimeout(() => window.dispatchEvent(new CustomEvent('pos:shortcut:focusSearch')), 100);
        } else {
          window.dispatchEvent(new CustomEvent('pos:shortcut:focusSearch'));
        }
      }
      else if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('pos:shortcut:closeModal'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.enableShortcuts, currentView, setCurrentView, isLocked]);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background text-text-main">
        <div className="flex items-center gap-3 text-secondary">
          <Loader2 className="animate-spin" size={20} />
          <span className="font-bold text-sm">Đang khởi tạo phiên đăng nhập...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={null}>
        <Login onLogin={() => {}} />
      </Suspense>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'menu': return <Menu />;
      case 'floorplan': return <FloorPlan />;
      case 'reports': return <Reports />;
      case 'inventory': 
        if (role === 'staff') return <Menu />;
        return <Inventory />;
      case 'settings': return <Settings onLogout={() => setCurrentView('login')} />;
      case 'tax': 
        if (role === 'staff') return <Menu />;
        return <TaxDeclaration />;
      default: return <Menu />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-background text-text-main overflow-hidden relative transition-colors duration-300">
      <div 
        className="fixed inset-0 z-[9999] bg-black pointer-events-none transition-opacity duration-300"
        style={{ opacity: (100 - brightness) / 100 }}
      />
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative pb-[70px] lg:pb-0 w-full transition-all duration-300">
        <Suspense fallback={null}>
          {renderView()}
        </Suspense>
      </main>
      <PrintPreviewModal />
      <LockScreen />
    </div>
  );
}

function App() {
  const [currentView, setCurrentView] = React.useState<View>('floorplan');

  // P0: Block app if configuration is missing
  if (!isSupabaseConfigured()) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-900 text-white p-8">
              <div className="max-w-md text-center space-y-6">
                  <div className="mx-auto size-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500">
                      <AlertTriangle size={40} />
                  </div>
                  <h1 className="text-3xl font-bold">Missing Configuration</h1>
                  <p className="text-slate-400">
                      The application cannot start because Supabase configuration is missing.
                      Please check your environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
                  </p>
                  <div className="p-4 bg-black/30 rounded-lg font-mono text-xs text-left text-slate-500">
                      VITE_SUPABASE_URL=...<br/>
                      VITE_SUPABASE_ANON_KEY=...
                  </div>
              </div>
          </div>
      );
  }

  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AuthProvider>
          <ToastProvider>
            <DBProvider>
              <NetworkProvider>
                <SettingsProvider>
                  <PrintPreviewProvider>
                    <DataProvider>
                      <AppContent currentView={currentView} setCurrentView={setCurrentView} />
                    </DataProvider>
                  </PrintPreviewProvider>
                </SettingsProvider>
              </NetworkProvider>
            </DBProvider>
          </ToastProvider>
        </AuthProvider>
      </CurrencyProvider>
    </ThemeProvider>
  );
}

export default App;
