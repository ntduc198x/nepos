
import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../db';
import { Loader2, AlertCircle } from 'lucide-react';

interface DBContextType {
  dbReady: boolean;
}

const DBContext = createContext<DBContextType | undefined>(undefined);

export const DBProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        console.log("🏗️ DBProvider: Opening Database...");
        
        // Step 1: Attempt to open
        await db.open();

        // Step 2: Validate stores exist
        const requiredStores = ['orders', 'order_items', 'pos_tables', 'menu_items', 'offline_queue', 'settings'];
        const missingStores = requiredStores.filter(s => !db.tables.some(t => t.name === s));

        if (missingStores.length > 0) {
          throw new Error(`NotFoundError: Missing stores ${missingStores.join(', ')}`);
        }

        console.log("✅ DBProvider: Database ready and validated.");
        setDbReady(true);
      } catch (err: any) {
        console.error("🚨 DBProvider: Database failure. Attempting self-heal...", err);
        
        try {
          // Step 3: Self-heal (Delete and recreate)
          db.close();
          await db.delete();
          await db.open();
          console.log("♻️ DBProvider: Database successfully healed.");
          setDbReady(true);
        } catch (healErr: any) {
          console.error("Critical DB Failure:", healErr);
          setError("Local database is corrupted and cannot be repaired. Please check browser storage permissions.");
        }
      }
    };

    initDB();
  }, []);

  if (error) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-text-main mb-2">Lỗi Lưu Trữ Dữ Liệu</h1>
        <p className="text-secondary text-sm max-w-md">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-primary text-background font-bold rounded-xl">Thử lại</button>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <Loader2 size={48} className="animate-spin text-primary mb-4" />
        <p className="text-secondary font-bold animate-pulse">Đang kiểm tra dữ liệu hệ thống...</p>
      </div>
    );
  }

  return (
    <DBContext.Provider value={{ dbReady }}>
      {children}
    </DBContext.Provider>
  );
};

export const useDB = () => {
  const context = useContext(DBContext);
  if (!context) throw new Error('useDB must be used within DBProvider');
  return context;
};
