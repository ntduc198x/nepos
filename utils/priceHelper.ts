
import { MenuItem } from '../types';

/**
 * Tính tổng tiền của một đơn hàng dựa trên danh sách item và thực đơn đã cache.
 * Ưu tiên lấy giá từ thực đơn gốc để đảm bảo tính đồng bộ.
 */
export const calculateOrderTotal = (orderItems: any[], menuList: MenuItem[]) => {
  if (!orderItems || !Array.isArray(orderItems)) return 0;
  
  return orderItems.reduce((total, item) => {
    // Tìm thông tin món trong Cache Menu dựa trên ID
    const itemId = item.menu_item_id || item.id;
    const menuItem = menuList.find(m => m.id === itemId);
    
    // Logic lấy giá: Ưu tiên giá thực đơn gốc > giá snapshot trong đơn > 0
    const price = menuItem ? menuItem.price : (item.price || 0);
    const quantity = item.quantity || item.qty || 0;
    
    return total + (price * quantity);
  }, 0);
};
