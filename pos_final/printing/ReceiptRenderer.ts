
import { AppSettings } from '../types/settingsTypes';
import QRCode from 'qrcode';

// Helper: Format tiền tệ VNĐ chuẩn
const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

// Helper: Format ngày giờ
const formatDate = (dateString?: string) => {
  const date = dateString ? new Date(dateString) : new Date();
  return date.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit'
  });
};

const generateQR = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, { width: 256, margin: 1, errorCorrectionLevel: 'Q' });
  } catch (err) {
    console.error("Lỗi tạo QR Offline:", err);
    return ''; 
  }
};

export class ReceiptRenderer {
  public static async render(order: any, settings: AppSettings): Promise<string> {
    const subtotal = order.subtotal_amount || order.subtotal || order.total_amount || 0;
    const discount = order.discount_amount || 0;
    const finalTotal = order.total_amount ?? (subtotal - discount); 

    // Logic khổ giấy
    const isSmall = settings.paperSize === '58mm';
    const physicalWidthMm = isSmall ? 58 : 80;
    const safeWidthMm = isSmall ? 48 : 72; // Safe print area
    
    const baseFontSize = isSmall ? '11px' : '12px';
    const headerFontSize = isSmall ? '14px' : '16px';

    const config = {
        storeName: settings.counterName || "ResBar POS",
        branchName: "", // Branch name not in current AppSettings, leaving blank
        headerMessage: "", // Not in AppSettings
        address: settings.counterAddress || "",
        phone: settings.counterPhone || "",
        taxCode: "", // Not in AppSettings
        footerMessage: settings.receiptNote || "Xin cảm ơn & Hẹn gặp lại!",
        
        wifiName: settings.wifiName || "",
        wifiPass: settings.wifiPassword || "",
    };

    const isTakeaway = (order.table_id || '').toLowerCase() === 'takeaway' || (order.table || '').toLowerCase() === 'takeaway';
    
    // Bank Config from LocalStorage
    const bankConfigStr = localStorage.getItem('bank_config');
    const bankConfig = bankConfigStr ? JSON.parse(bankConfigStr) : null;

    // QR Logic
    let qrHtml = '';
    if (settings.showQr && bankConfig) {
        const qrContent = `https://img.vietqr.io/image/${bankConfig.bankId}-${bankConfig.accountNo}-compact2.png?amount=${finalTotal}&addInfo=${encodeURIComponent(order.id)}&accountName=${encodeURIComponent(bankConfig.accountName)}`;
        const qrBase64 = await generateQR(qrContent);
        
        if (qrBase64) {
            qrHtml = `
              <div class="divider"></div>
              <div class="qr-section">
                <img src="${qrBase64}" class="qr-img" />
                <div class="qr-caption">ORDER #${order.id.slice(-6)}</div>
              </div>
            `;
        }
    }

    let wifiHtml = '';
    const showWifi = !isTakeaway && (!!config.wifiName || !!config.wifiPass);
    if (showWifi) {
        wifiHtml = `
          <div class="divider"></div>
          <div class="wifi-box">
              <div>WIFI: <strong>${config.wifiName}</strong></div>
              <div>PASS: <strong>${config.wifiPass}</strong></div>
          </div>
        `;
    }
    
    // Bank Info Section
    let bankHtml = '';
    if (bankConfig) {
       bankHtml = `
         <div class="divider"></div>
         <div class="text-center" style="font-size: 10px; margin-top: 5px;">
            <div class="bold">CHUYỂN KHOẢN</div>
            <div>${bankConfig.bankId} • ${bankConfig.accountNo}</div>
            <div class="uppercase">${bankConfig.accountName || ''}</div>
         </div>
       `;
    }

    const itemsHtml = (order.items || []).map((item: any) => {
      const unitPrice = item.price;
      const qty = item.quantity || item.qty;
      const totalLine = unitPrice * qty;
      const note = (item.note && item.note.trim()) ? item.note.trim() : null;

      return `
        <div class="item-block">
          <div class="item-row-main">
            <span class="item-name">${item.name || item._snapshot_name || item._display_name}</span>
            <span class="item-total">${formatMoney(totalLine)}</span>
          </div>
          <div class="item-row-sub">
            ${qty} x ${formatMoney(unitPrice)}
          </div>
          ${note && settings.printItemNotes ? `<div class="item-note">Note: ${note}</div>` : ''}
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Receipt #${order.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            @media print {
               @page { size: ${physicalWidthMm}mm auto; margin: 0; }
               html, body { margin: 0; padding: 0; width: ${physicalWidthMm}mm; min-width: ${physicalWidthMm}mm; }
               * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            body { 
              font-family: 'Inter', sans-serif; background: #fff; color: #000;
              font-size: ${baseFontSize}; line-height: 1.25;
              display: flex; flex-direction: column; align-items: center;
              box-sizing: border-box;
            }
            .receipt-root { width: ${physicalWidthMm}mm; background: #fff; display: flex; flex-direction: column; align-items: center; padding-top: 5px; padding-bottom: 20px; box-sizing: border-box; }
            .receipt-content { width: ${safeWidthMm}mm; display: flex; flex-direction: column; box-sizing: border-box; }
            
            .text-center { text-align: center; } .bold { font-weight: 600; } .uppercase { text-transform: uppercase; } .italic { font-style: italic; }
            .break-word { word-break: break-word; overflow-wrap: break-word; white-space: pre-wrap; }
            .header { text-align: center; margin-bottom: 12px; }
            .store-name { font-size: ${headerFontSize}; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; line-height: 1.2; }
            .store-info { font-size: 10px; color: #333; margin-bottom: 2px; }
            .divider { border-bottom: 1px dashed #bbb; margin: 8px 0; height: 1px; width: 100%; }
            .meta-group { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px; }
            .label { color: #555; white-space: nowrap; margin-right: 8px; }
            .value { font-weight: 600; text-align: right; }
            .items-container { margin: 10px 0; }
            .item-block { margin-bottom: 8px; }
            .item-row-main { display: flex; justify-content: space-between; align-items: flex-start; }
            .item-name { font-weight: 600; font-size: 11px; flex: 1; padding-right: 8px; }
            .item-total { font-weight: 600; font-size: 11px; white-space: nowrap; }
            .item-row-sub { font-size: 10px; color: #555; margin-top: 1px; }
            .item-note { font-size: 9px; font-style: italic; color: #444; margin-top: 1px; padding-left: 6px; border-left: 1px solid #ccc; }
            .summary-section { margin-top: 10px; }
            .summary-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
            .total-row { display: flex; justify-content: space-between; margin-top: 8px; align-items: flex-end; }
            .total-label { font-size: 13px; font-weight: 700; text-transform: uppercase; }
            .total-val { font-size: 16px; font-weight: 800; }
            .payment-info { margin-top: 6px; font-size: 10px; display: flex; justify-content: space-between; color: #333; }
            .qr-section { text-align: center; margin: 12px 0; }
            .qr-caption { font-size: 9px; font-weight: 700; letter-spacing: 1px; margin-top: 4px; }
            .qr-img { width: 65%; max-width: 250px; height: auto; display: block; margin: 0 auto; image-rendering: pixelated; }
            .wifi-box { text-align: center; font-size: 10px; border: 1px dashed #ccc; padding: 4px; border-radius: 4px; margin: 8px 0; }
            .footer { text-align: center; font-size: 10px; color: #555; margin-top: 15px; font-weight: 500; }
          </style>
        </head>
        <body>
          <div class="receipt-root">
            <div class="receipt-content">
              <div class="header">
                <div class="store-name break-word">${config.storeName}</div>
                ${config.branchName ? `<div class="store-info bold uppercase">${config.branchName}</div>` : ''}
                ${config.headerMessage ? `<div class="store-info italic break-word">${config.headerMessage}</div>` : ''}
                ${config.address ? `<div class="store-info break-word">${config.address}</div>` : ''}
                ${config.phone ? `<div class="store-info">Hotline: ${config.phone}</div>` : ''}
                ${config.taxCode ? `<div class="store-info">MST: ${config.taxCode}</div>` : ''}
              </div>
              <div class="divider"></div>
              <div class="meta-group"><span class="label">Order:</span><span class="value">#${order.id.slice(-6)}</span></div>
              <div class="meta-group"><span class="label">Date:</span><span class="value">${formatDate(order.created_at)}</span></div>
              <div class="divider"></div>
              <div class="items-container">${itemsHtml}</div>
              <div class="divider"></div>
              <div class="summary-section">
                <div class="summary-row"><span>Tạm tính</span><span class="bold">${formatMoney(subtotal)}</span></div>
                ${discount > 0 ? `<div class="summary-row"><span>Giảm giá</span><span class="bold">-${formatMoney(discount)}</span></div>` : ''}
                <div class="total-row"><span class="total-label">TỔNG CỘNG</span><span class="total-val">${formatMoney(finalTotal)}</span></div>
                <div class="payment-info"><span>Thanh toán: <strong class="uppercase">${order.payment_method || 'Unpaid'}</strong></span></div>
              </div>
              ${bankHtml}
              ${qrHtml}
              ${wifiHtml}
              <div class="footer">
                <div class="break-word">${config.footerMessage}</div>
                <div style="font-size: 8px; opacity: 0.6; margin-top: 4px;">Powered by ResBar POS</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
