
import { db } from '../db';
import { ExpenseEntry } from '../types/taxTypes';

export class ExpenseService {

  static async getExpenses(storeId: string, startDate: string, endDate: string): Promise<ExpenseEntry[]> {
    return await db.expense_entries
      .where('[expense_date+store_id]')
      .between([startDate, storeId], [endDate, storeId], true, true)
      .toArray();
  }

  static async addExpense(entry: Omit<ExpenseEntry, 'id' | 'created_at'>): Promise<number> {
    const newEntry: ExpenseEntry = {
      ...entry,
      created_at: new Date().toISOString()
    };
    return await db.expense_entries.add(newEntry);
  }

  static async updateExpense(id: number, updates: Partial<ExpenseEntry>): Promise<number> {
    return await db.expense_entries.update(id, updates);
  }

  static async deleteExpense(id: number): Promise<void> {
    return await db.expense_entries.delete(id);
  }

  static async getTotalExpenses(storeId: string, startDate: string, endDate: string): Promise<number> {
    const expenses = await this.getExpenses(storeId, startDate, endDate);
    return expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }
}
