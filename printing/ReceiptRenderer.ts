import { Order } from '../types';
import { AppSettings } from '../types/settingsTypes';

export class ReceiptRenderer {
  public static async render(order: Order, settings: AppSettings): Promise<string> {
    const isSmall = settings.paperSize === '58mm';
    const physicalWidthMm = isSmall ? 58 : 80;
    const safeWidthMm = isSmall ? 48 : 72;
    const fontSize = isSmall ? '11px' : '12px';
    
    const formatPrice = (val: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    };

    const total = order.total_amount || order.total || 0;
    const subtotal = order.subtotal || order.total || 0;
    const discount = order.discount_amount || 0;
    const isTakeaway = (order.table || '').toLowerCase() === 'takeaway' || (order.table_id || '').toLowerCase() === 'takeaway';

    let itemsHtml = '';
    order.items?.forEach(item => {
        itemsHtml += `
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <span style="font-size: 11px; font-weight: 600; flex: 1; line-height: 1.25; word-break: break-word;">${item.name}</span>
                    <span style="font-size: 11px; font-weight: 600; white-space: nowrap;">${formatPrice(item.price * item.quantity)}</span>
                </div>
                <div style="font-size: 10px; color: #4b5563; margin-top: 2px;">
                    ${item.quantity} x ${formatPrice(item.price)}
                </div>
                ${item.note ? `<div style="font-size: 9px; font-style: italic; color: #4b5563; margin-top: 2px; padding-left: 8px; border-left: 1px solid #d1d5db;">Note: ${item.note}</div>` : ''}
            </div>
        `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Inter', sans-serif; 
            background: white;
          }
          .receipt-container {
            width: ${physicalWidthMm}mm;
            margin: 0 auto;
            padding: 8px 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            color: black;
          }
          .content {
            width: ${safeWidthMm}mm;
            font-size: ${fontSize};
            line-height: 1.25;
          }
          .divider { border-bottom: 1px dashed #bbb; margin: 8px 0; width: 100%; height: 1px; }
          .text-center { text-center: center; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .font-bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="content">
            <div style="text-align: center; margin-bottom: 12px;">
              <div style="font-size: 15px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px;">${settings.counterName || "NEPOS"}</div>
              ${settings.counterAddress ? `<div style="font-size: 10px; color: #374151;">${settings.counterAddress}</div>` : ''}
              ${settings.counterPhone ? `<div style="font-size: 10px; color: #374151;">Hotline: ${settings.counterPhone}</div>` : ''}
            </div>

            <div class="divider"></div>

            <div style="font-size: 10px; margin-bottom: 4px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #4b5563;">Order:</span>
                <span style="font-weight: bold;">#${order.id.slice(-6)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #4b5563;">Date:</span>
                <span style="font-weight: bold;">${new Date().toLocaleString('vi-VN')}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #4b5563;">Table:</span>
                <span style="font-weight: bold;">${order.table || 'Takeaway'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #4b5563;">Staff:</span>
                <span style="font-weight: bold;">${order.staff || 'POS'}</span>
              </div>
            </div>

            <div class="divider"></div>

            <div style="margin: 12px 0;">
              ${itemsHtml}
            </div>

            <div class="divider"></div>

            <div style="margin: 12px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                <span>Tạm tính</span>
                <span style="font-weight: 600;">${formatPrice(subtotal)}</span>
              </div>
              ${discount > 0 ? `
              <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                <span>Giảm giá</span>
                <span style="font-weight: 600;">-${formatPrice(discount)}</span>
              </div>` : ''}
              
              <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px;">
                <span style="font-size: 13px; font-weight: bold; text-transform: uppercase;">TỔNG CỘNG</span>
                <span style="font-size: 16px; font-weight: 800;">${formatPrice(total)}</span>
              </div>
            </div>

            <div class="divider"></div>

            <div style="text-align: center; font-size: 10px; color: #4b5563; margin-top: 16px;">
              <div style="word-wrap: break-word;">${settings.receiptNote || "Xin cảm ơn & Hẹn gặp lại!"}</div>
              <div style="font-size: 8px; margin-top: 4px; opacity: 0.6;">Powered by Nepos</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
