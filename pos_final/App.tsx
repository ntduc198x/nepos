
import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './screens/Dashboard';
import { Menu } from './screens/Menu';
import { FloorPlan } from './screens/FloorPlan';
import { Inventory } from './screens/Inventory';
import { Settings } from './screens/Settings';
import { Login } from './screens/Login';
import { Reports } from './screens/Reports';
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

function AppContent({ currentView, setCurrentView }: { currentView: View, setCurrentView: (v: View) => void }) {
  const { user, loading } = useAuth();
  const { brightness } = useTheme();
  const { settings } = useSettingsContext();

  // --- GLOBAL SHORTCUTS ---
  useEffect(() => {
    if (!settings.enableShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore F-keys if user is typing in an input field (optional, but good UX)
      // However, spec says "REAL global shortcuts", usually implied to override unless strictly text input.
      // Let's allow F2/F3 everywhere for quick context switching.
      
      if (e.key === 'F2') {
        e.preventDefault();
        if (currentView !== 'floorplan') {
          setCurrentView('floorplan');
          // Delay dispatch to allow component to mount/render
          setTimeout(() => window.dispatchEvent(new CustomEvent('pos:shortcut:pay')), 100);
        } else {
          window.dispatchEvent(new CustomEvent('pos:shortcut:pay'));
        }
      } 
      else if (e.key === 'F3') {
        e.preventDefault();
        if (currentView !== 'menu') {
          setCurrentView('menu');
          // Delay dispatch to allow component to mount/render
          setTimeout(() => window.dispatchEvent(new CustomEvent('pos:shortcut:focusSearch')), 100);
        } else {
          window.dispatchEvent(new CustomEvent('pos:shortcut:focusSearch'));
        }
      }
      else if (e.key === 'Escape') {
        // Dispatch close modal event
        window.dispatchEvent(new CustomEvent('pos:shortcut:closeModal'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.enableShortcuts, currentView, setCurrentView]);

  if (loading) return null;

  if (!user) {
    return <Login onLogin={() => {}} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'menu':
        return <Menu />;
      case 'floorplan':
        return <FloorPlan />;
      case 'reports':
         return <Reports />;
      case 'inventory':
        return <Inventory />;
      case 'settings':
        return <Settings onLogout={() => setCurrentView('login')} />;
      default:
        return <FloorPlan />;
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
        {renderView()}
      </main>
      
      {/* Global Modals */}
      <PrintPreviewModal />
      <LockScreen />
    </div>
  );
}

function App() {
  const [currentView, setCurrentView] = React.useState<View>('floorplan');

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
