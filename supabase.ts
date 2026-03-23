
import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    return import.meta.env[key] || import.meta.env[`VITE_${key}`];
  }
  return '';
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseKey = getEnv('SUPABASE_ANON_KEY');

export const isSupabaseConfigured = () => {
    return !!supabaseUrl && !!supabaseKey;
};

// Fail-safe client creation. If config is missing, we create a dummy client 
// but the App should block access via isSupabaseConfigured()
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder', 
  {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb-resbar-pos-token', // Unique storage key to prevent collisions
  },
  global: {
    headers: { 'x-application-name': 'resbar-pos' },
    fetch: async (...args: [string | URL | Request, RequestInit | undefined]) => {
      if (!isSupabaseConfigured()) {
        throw new Error("Supabase is not configured. Missing Environment Variables.");
      }
      try {
        const response = await fetch(...args);
        
        // Handle 400 Bad Request specifically for Auth token issues
        if (response.status === 400) {
          const body = await response.clone().json().catch(() => ({}));
          if (body.error_description?.includes('Refresh Token Not Found') || body.error?.includes('invalid_grant')) {
             console.error('🚨 Supabase Auth failure: Refresh token missing or invalid.');
             // We don't clear storage here because it's a low-level fetch, 
             // but AuthContext listens for failures.
          }
        }
        
        return response;
      } catch (err) {
        console.error('[Supabase Fetch Error]:', err);
        throw err;
      }
    }
  }
});
