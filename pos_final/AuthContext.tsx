
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { SETTINGS_STORAGE_KEY } from './services/SettingsService';

type UserRole = 'admin' | 'manager' | 'staff';

interface AuthContextType {
  user: any;
  role: UserRole;
  loading: boolean;
  signOut: () => Promise<void>;
  
  // Lock Screen functionality
  isLocked: boolean;
  lockApp: () => void;
  unlockApp: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state from localStorage for zero-lag UI
  const [user, setUser] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('auth_user');
      return cached ? JSON.parse(cached) : null;
    } catch (e) { 
      return null; 
    }
  });

  // Default to 'staff' if unknown, but prioritize local storage
  const [role, setRole] = useState<UserRole>(() => {
    const cached = localStorage.getItem('auth_role');
    return (cached === 'admin' || cached === 'manager' || cached === 'staff') ? cached : 'staff';
  });
  
  const [loading, setLoading] = useState(!user);
  const [isLocked, setIsLocked] = useState(false);

  /**
   * Clears ONLY auth-related keys from storage.
   * Explicitly preserves Settings and other app data.
   */
  const clearAuth = () => {
    console.log("🧹 Clearing Auth State & Storage...");
    setUser(null);
    setRole('staff');
    setIsLocked(false);
    
    // 1. Keys to always remove
    const keysToRemove = [
        'auth_user', 
        'auth_role', 
        'sb-resbar-pos-token', // Matches supabase.ts config
        'sb-ddtcrhmpuwkrykopcdgy-auth-token' // Legacy/Default fallback
    ];

    keysToRemove.forEach(key => localStorage.removeItem(key));

    // 2. Scan and remove Supabase patterns (sb-*)
    // SAFEGUARD: Do NOT remove Settings
    try {
        Object.keys(localStorage).forEach((key) => {
            // PROTECT: Skip Settings Keys
            if (key.startsWith(SETTINGS_STORAGE_KEY)) {
                return;
            }

            // DELETE: Supabase Auth Tokens or internal auth keys
            if (key.startsWith('sb-') || key.startsWith('supabase.')) {
                localStorage.removeItem(key);
            }
        });
    } catch (e) {
        console.warn("Error cleaning storage:", e);
    }
  };

  const determineRole = (userData: any): UserRole => {
    if (!userData) return 'staff';
    const metaRole = userData.user_metadata?.role?.toLowerCase();
    const appRole = userData.app_metadata?.role?.toLowerCase();
    
    // Normalize logic
    if (metaRole === 'admin' || appRole === 'admin' || userData.email?.includes('admin')) return 'admin';
    if (metaRole === 'manager' || appRole === 'manager') return 'manager';
    return 'staff';
  };

  const handleUserUpdate = async (userData: any) => {
    if (!userData) return;
    setUser(userData);
    
    const newRole = determineRole(userData);
    setRole(newRole);
    
    localStorage.setItem('auth_user', JSON.stringify(userData));
    localStorage.setItem('auth_role', newRole);
    setLoading(false);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('invalid refresh token')) {
            console.error("🔥 Critical Auth Error: Invalid refresh token. Purging state.");
            clearAuth();
          }
          throw error;
        }

        if (session) {
          await handleUserUpdate(session.user);
        } else {
          if (navigator.onLine) clearAuth();
        }
      } catch (e) {
        console.warn("Auth initialization warning:", e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔑 Auth Event: ${event}`);
      if (session) {
        await handleUserUpdate(session.user);
      } else if (event === 'SIGNED_OUT' || (event as string) === 'USER_DELETED') {
        clearAuth();
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user) handleUserUpdate(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      const u = user;
      clearAuth();
      if (u && navigator.onLine) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error("Sign out error", e);
    }
  };

  const lockApp = () => setIsLocked(true);
  const unlockApp = () => setIsLocked(false);

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut, isLocked, lockApp, unlockApp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
