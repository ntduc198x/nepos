
import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    return import.meta.env[key] || import.meta.env[`VITE_${key}`];
  }
  return '';
};

const DEFAULT_URL = 'https://ddtcrhmpuwkrykopcdgy.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkdGNyaG1wdXdrcnlrb3BjZGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNzUyNzQsImV4cCI6MjA4Mjk1MTI3NH0.fRiktr4dyulelEDmwGPyHwWtbWVn2yLNAVCFJY6JCQA';

const supabaseUrl = getEnv('SUPABASE_URL') || DEFAULT_URL;
const supabaseKey = getEnv('SUPABASE_ANON_KEY') || DEFAULT_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb-resbar-pos-token', // Unique storage key to prevent collisions
  },
  global: {
    headers: { 'x-application-name': 'resbar-pos' },
    fetch: async (...args: [string | URL | Request, RequestInit | undefined]) => {
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

export const isSupabaseConfigured = () => {
    return supabaseUrl !== '' && supabaseKey !== '';
};
