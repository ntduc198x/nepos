
import { AppSettings } from '../types/settingsTypes';

export interface PrintCapabilities {
  supportsPreview: boolean;
  supportsSilentPrint: boolean;
  requiresInteraction: boolean;
}

export interface IPrintAdapter {
  /**
   * Thực hiện in hóa đơn
   * @param orderData Dữ liệu đơn hàng
   * @param settings Cấu hình hệ thống (để lấy khổ giấy, tên quán...)
   */
  printReceipt(orderData: any, settings: AppSettings): Promise<void>;

  /**
   * Tạo HTML hoặc dữ liệu để xem trước (nếu hỗ trợ)
   */
  generatePreview(orderData: any, settings: AppSettings): Promise<string>;

  /**
   * Trả về khả năng của Adapter
   */
  getCapabilities(): PrintCapabilities;
}
