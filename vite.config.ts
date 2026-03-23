import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }

          if (id.includes('@supabase/')) return 'vendor-supabase';
          if (id.includes('/dexie')) return 'vendor-dexie';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
          if (id.includes('/recharts/')) return 'vendor-charts';
          if (id.includes('/qrcode/')) return 'vendor-qrcode';

          return undefined;
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve('.'),
    }
  }
});
