
import { TaxConfig } from '../types/taxTypes';

/**
 * Tính giá trị chịu thuế của một đơn hàng dựa trên cấu hình.
 * Logic này phải khớp với cách tính doanh thu tổng trong TaxService.
 */
export const computeNetForTax = (order: any, config: TaxConfig): number => {
  // 1. Xác định Gross Amount (Tổng tiền hàng trước giảm giá)
  // Trong NEPOS: total_amount thường là Net (sau giảm giá).
  // Gross = Total + Discount
  const finalTotal = order.total_amount || order.total || 0;
  const discount = order.discount_amount || 0;
  const grossAmount = finalTotal + discount;

  let net = grossAmount;

  // 2. Xử lý Chiết khấu (Discount)
  // Nếu cấu hình `include_discount = true` => Cho phép trừ chiết khấu khỏi doanh thu chịu thuế
  // (Tức là tính thuế trên giá thực thu)
  if (config.include_discount) {
      net = net - discount;
  }

  // 3. Xử lý Phụ thu (Surcharge)
  // Giả định surcharge đã nằm trong grossAmount. Nếu hệ thống tách riêng surcharge, cần cộng vào đây.
  // if (config.include_surcharge) { net += order.surcharge_amount || 0; }

  // 4. Xử lý Hoàn tiền (Refunds)
  // Logic hiện tại cho list "Included Transactions" chỉ lấy đơn Completed.
  // Nếu đơn bị Refund 1 phần, cần trừ đi nếu config cho phép.
  // Giả sử có field refunded_amount
  // if (config.include_refunds) { net -= order.refunded_amount || 0; }
  
  return Math.max(0, net);
};

export const formatTaxNumber = (num: number) => {
    return new Intl.NumberFormat('vi-VN').format(Math.round(num));
};
