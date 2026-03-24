
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { supabase } from './supabase';
import { SETTINGS_STORAGE_KEY } from './services/SettingsService';

export type UserRole = 'admin' | 'manager' | 'staff';

interface AuthContextType {
  user: any;
  role: UserRole;
  storeId: string;
  loading: boolean;
  signOut: () => Promise<void>;
  isLocked: boolean;
  lockApp: () => void;
  unlockApp: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('auth_user');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });

  // Role khởi tạo từ localStorage để sidebar render đúng icon ngay lập tức.
  // Quyết định gate page access chỉ xảy ra sau khi loading=false.
  const [role, setRole] = useState<UserRole>(() => {
    const cached = localStorage.getItem('auth_role');
    return (cached === 'admin' || cached === 'manager' || cached === 'staff') ? cached : 'staff';
  });

  const [storeId, setStoreId] = useState<string>(() => {
    return localStorage.getItem('auth_store_id') || 'STORE_DEFAULT';
  });

  // FIX 1: loading luôn bắt đầu TRUE dù user có cache hay không.
  // Nếu true từ đầu: App.tsx trả về null → useEffect redirect KHÔNG chạy sớm
  // → admin/manager không bị đẩy khỏi inventory/tax do role='staff' tạm thời từ cache.
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);

  // FIX 8: Mutex ngăn handleUserUpdate chạy song song.
  // initAuth và onAuthStateChange(SIGN_IN) đều fire gần như cùng lúc → race condition.
  const isHandlingUpdate = useRef(false);

  const clearAuth = () => {
    setUser(null);
    setRole('staff');
    setStoreId('STORE_DEFAULT');
    setIsLocked(false);

    const keysToRemove = ['auth_user', 'auth_role', 'auth_store_id', 'sb-resbar-pos-token'];
    keysToRemove.forEach(key => localStorage.removeItem(key));

    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(SETTINGS_STORAGE_KEY)) return;
        if (key.startsWith('sb-') || key.startsWith('supabase.')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Error cleaning storage:', e);
    }
  };

  // FIX 3: Validate role từ DB bằng runtime check, không cast mù quáng.
  // Nếu DB trả về giá trị lạ (null, '', 'superadmin'...) → trả null → dùng fallback.
  const normalizeRole = (raw: any): UserRole | null => {
    const val = (raw || '').toString().toLowerCase().trim();
    if (val === 'admin' || val === 'manager' || val === 'staff') return val as UserRole;
    return null;
  };

  const fetchAuthoritativeClaims = async (userData: any): Promise<{ role: UserRole | null; storeId: string | null }> => {
    if (!userData) return { role: null, storeId: null };

    const authUid = userData.id;
    const email = userData.email;
    let data: any = null;

    // Attempt 1: users.id == authUid (phổ biến nhất)
    ({ data } = await supabase.from('users').select('role, store_id').eq('id', authUid).maybeSingle());
    if (data) return { role: normalizeRole(data.role), storeId: data.store_id || null };

    // Attempt 2: users.auth_user_id == authUid
    // @ts-ignore
    ({ data } = await supabase.from('users').select('role, store_id').eq('auth_user_id', authUid).maybeSingle());
    if (data) return { role: normalizeRole(data.role), storeId: data.store_id || null };

    // Attempt 3: users.user_id == authUid
    // @ts-ignore
    ({ data } = await supabase.from('users').select('role, store_id').eq('user_id', authUid).maybeSingle());
    if (data) return { role: normalizeRole(data.role), storeId: data.store_id || null };

    // Attempt 4: users.email == email (fallback cuối)
    if (email) {
      ({ data } = await supabase.from('users').select('role, store_id').eq('email', email).maybeSingle());
      if (data) return { role: normalizeRole(data.role), storeId: data.store_id || null };
    }

    console.warn('[AUTH] Không tìm thấy user trong bảng users. Sử dụng fallback role.');
    return { role: null, storeId: null };
  };

  const handleUserUpdate = async (userData: any) => {
    if (!userData) return;

    // FIX 8: Guard chống race condition — bỏ qua nếu đang xử lý
    if (isHandlingUpdate.current) {
      console.log('[AUTH] handleUserUpdate đang chạy, bỏ qua lần gọi trùng.');
      return;
    }
    isHandlingUpdate.current = true;

    try {
      setUser(userData);

      // Keep last known good role/store as baseline to avoid accidental downgrade on transient failures.
      const cachedRole = normalizeRole(localStorage.getItem('auth_role'));
      let finalRole: UserRole = cachedRole || role || 'staff';
      let finalStoreId: string = localStorage.getItem('auth_store_id') || storeId || 'STORE_DEFAULT';

      // Bước 1: app_metadata từ JWT (Server-signed, độ tin cậy cao)
      // FIX 2: Chấp nhận tất cả role hợp lệ kể cả 'staff'
      const appRole = normalizeRole(userData.app_metadata?.role);
      const appStoreId = userData.app_metadata?.store_id;
      if (appRole) finalRole = appRole;
      if (appStoreId) finalStoreId = appStoreId;

      // Bước 2: users table trong DB (Authoritative — nguồn tin cậy cao nhất)
      if (navigator.onLine) {
        try {
          const dbClaims = await Promise.race([
            fetchAuthoritativeClaims(userData),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('db claims timeout')), 1500))
          ]) as any;
          if (dbClaims.role) finalRole = dbClaims.role;
          if (dbClaims.storeId) finalStoreId = dbClaims.storeId;
        } catch (e) {
          console.warn('[AUTH] DB claims timeout/unavailable, keeping fast path claims:', e);
        }
      }

      // FIX 4: Luôn gọi setRole vô điều kiện, không guard bằng stale closure comparison.
      console.log(`[AUTH] ✅ Role xác nhận: ${finalRole} | Store: ${finalStoreId}`);
      setRole(finalRole);
      setStoreId(finalStoreId);

      localStorage.setItem('auth_user', JSON.stringify(userData));
      localStorage.setItem('auth_role', finalRole);
      localStorage.setItem('auth_store_id', finalStoreId);

    } finally {
      // Luôn tắt loading và release mutex, kể cả khi có lỗi
      isHandlingUpdate.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const bootHardStop = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 2000);

    const getSessionWithTimeout = async (ms: number) => {
      return Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`getSession timeout after ${ms}ms`)), ms))
      ]);
    };

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await getSessionWithTimeout(8000) as any;

        if (!isMounted) return;

        if (error) {
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('invalid refresh token')) {
            console.error('🔥 Auth Error: Invalid refresh token. Purging state.');
            clearAuth();
          }
          throw error;
        }

        if (session) {
          await handleUserUpdate(session.user);
        } else {
          if (navigator.onLine) clearAuth();
          if (isMounted) setLoading(false);
        }
      } catch (e: any) {
        console.warn('Auth initialization warning:', e);
        // Never keep app in white-screen loading state on init failure/timeout.
        // Only purge credentials on explicit invalid-token errors.
        if (isMounted) {
          const msg = String(e?.message || '').toLowerCase();
          if (msg.includes('invalid refresh token') || msg.includes('refresh token not found')) {
            clearAuth();
          }
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`🔑 Auth Event: ${event}`);

      if (!isMounted) return;

      // FIX 6: Chỉ xử lý SIGNED_IN nếu mutex không bận.
      // initAuth và SIGNED_IN event thường fire gần nhau — mutex ngăn chạy đôi.
      if (event === 'SIGNED_IN' && session) {
        await handleUserUpdate(session.user);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        await handleUserUpdate(session.user);
      } else if (event === 'SIGNED_OUT' || (event as string) === 'USER_DELETED') {
        clearAuth();
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(bootHardStop);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      const u = user;
      clearAuth();
      setLoading(false);
      if (u && navigator.onLine) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error('Sign out error', e);
    }
  };

  const lockApp = () => setIsLocked(true);
  const unlockApp = () => setIsLocked(false);

  return (
    <AuthContext.Provider value={{ user, role, storeId, loading, signOut, isLocked, lockApp, unlockApp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
