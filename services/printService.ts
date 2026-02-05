
import { Order } from '../types';
import QRCode from 'qrcode'; // Thư viện tạo QR Offline

// Helper: Format tiền tệ VNĐ chuẩn
const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

// Helper: Format ngày giờ gọn gàng
const formatDate = (dateString?: string) => {
  const date = dateString ? new Date(dateString) : new Date();
  return date.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit'
  }); // Output: 14:30 15/10/24
};

const utf8ToBase64 = (str: string) => {
  return window.btoa(unescape(encodeURIComponent(str)));
};

export const isSandboxed = (): boolean => {
  try {
    if (window.frameElement && window.frameElement.hasAttribute('sandbox')) return true;
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

const generateQR = async (text: string, width = 150): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, { width: width, margin: 0, errorCorrectionLevel: 'M' });
  } catch (err) {
    console.error("Lỗi tạo QR Offline:", err);
    return '';
  }
};

// New Helper: Fetch remote image and convert to Base64 for embedding
const fetchImageAsBase64 = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Error fetching QR image:", error);
    return null;
  }
};

/**
 * GENERATE RECEIPT HTML - THERMAL PRINTER OPTIMIZED
 * Fix: Explicitly define Physical Width (80mm) vs Content Width (72mm)
 */
export const generateReceiptHTML = async (order: any, paperSize: '58mm' | '80mm' = '80mm') => {
  const subtotal = order.subtotal || order.total_amount || order.total || 0;
  const discount = order.discount_amount || 0;
  const finalTotal = order.total_amount ?? (subtotal - discount);

  // --- Settings & Config ---
  const storedSettingsStr = localStorage.getItem('RESBAR_SETTINGS_STORE');
  const storedSettings = storedSettingsStr ? JSON.parse(storedSettingsStr)?.data : {};

  const isSmall = paperSize === '58mm';

  // 1. PHYSICAL PAPER WIDTH (For @page size)
  const physicalWidthMm = isSmall ? 58 : 80;

  // 2. SAFE PRINTABLE AREA (Content Width)
  // 80mm printer -> ~72mm printable
  // 58mm printer -> ~48mm printable
  const safeWidthMm = isSmall ? 48 : 72;

  // Font scaling
  const baseFontSize = isSmall ? '11px' : '12px';
  const headerFontSize = isSmall ? '14px' : '16px';

  const config = {
    storeName: storedSettings?.counterName || "ThongDong Coffee F&B",
    address: storedSettings?.counterAddress || "",
    phone: storedSettings?.counterPhone || "",
    wifiName: storedSettings?.wifiName || "",
    wifiPass: storedSettings?.wifiPassword || "",
    footerMessage: storedSettings?.receiptNote || "Xin cảm ơn & Hẹn gặp lại!"
  };

  const bankConfigStr = localStorage.getItem('bank_config');
  const bankConfig = bankConfigStr ? JSON.parse(bankConfigStr) : null;

  // --- Logic Context ---
  const isTakeaway = (order.table_id || '').toLowerCase() === 'takeaway' || (order.table || '').toLowerCase() === 'takeaway';
  const isTransfer = (order.payment_method || '').toLowerCase() === 'transfer';

  // Logic hiển thị
  const showQr = !!bankConfig && (isTakeaway || isTransfer);
  const showWifi = !isTakeaway && (!!config.wifiName || !!config.wifiPass);

  // --- QR Generation ---
  let qrHtml = '';
  if (showQr) {
    const qrUrl = `https://img.vietqr.io/image/${bankConfig.bankId}-${bankConfig.accountNo}-compact.png?amount=${finalTotal}&addInfo=${encodeURIComponent(order.id)}&accountName=${encodeURIComponent(bankConfig.accountName)}`;

    // FIX: Use the actual image from VietQR, do NOT generate a QR code of the URL string.
    // We convert it to Base64 to ensure it prints reliably (no loading race conditions).
    let imgSource = await fetchImageAsBase64(qrUrl);

    // Fallback: If fetch fails (e.g. offline/CORS), use URL directly and hope printer/browser handles it.
    if (!imgSource) imgSource = qrUrl;

    qrHtml = `
      <div class="divider"></div>
      <div class="qr-section">
        <div class="qr-caption">QUÉT MÃ THANH TOÁN</div>
        <img src="${imgSource}" class="qr-img" />
        <div class="qr-bank">${bankConfig.accountNo}</div>
        <div class="qr-owner">${bankConfig.accountName}</div>
      </div>
    `;
  }

  // --- Wifi HTML ---
  let wifiHtml = '';
  if (showWifi) {
    wifiHtml = `
        <div class="divider"></div>
        <div class="wifi-box">
            <div>WIFI: <strong>${config.wifiName}</strong></div>
            <div>PASS: <strong>${config.wifiPass}</strong></div>
        </div>
      `;
  }

  // --- Items HTML (Block Layout) ---
  const itemsHtml = order.items.map((item: any) => {
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
        ${note ? `<div class="item-note">Note: ${note}</div>` : ''}
      </div>
    `;
  }).join('');

  // --- Render Full HTML ---
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Receipt #${order.id}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          
          /* LOCK PRINT ARCHITECTURE */
          @media print {
             @page {
                size: ${physicalWidthMm}mm auto; /* Lock Physical Width */
                margin: 0;    /* Remove browser margins */
             }
             html, body {
                margin: 0;
                padding: 0;
                width: ${physicalWidthMm}mm; /* Match Page Width */
                min-width: ${physicalWidthMm}mm;
             }
             /* Force Exact Color */
             * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
             }
          }

          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #fff; color: #000;
            font-size: ${baseFontSize}; 
            line-height: 1.25;
            -webkit-font-smoothing: antialiased;
            /* Layout Center for Preview */
            display: flex;
            flex-direction: column;
            align-items: center;
            box-sizing: border-box;
          }

          /* OUTER CONTAINER: The Strip */
          .receipt-root {
            width: ${physicalWidthMm}mm;
            background: #fff;
            display: flex;
            flex-direction: column;
            align-items: center; /* Center the safe content */
            padding-top: 5px;
            padding-bottom: 20px;
            box-sizing: border-box;
          }

          /* INNER CONTAINER: Safe Zone */
          .receipt-content {
            width: ${safeWidthMm}mm;
            display: flex;
            flex-direction: column;
            box-sizing: border-box; /* Crucial */
          }

          /* UTILS */
          .text-center { text-align: center; }
          .bold { font-weight: 600; }
          .uppercase { text-transform: uppercase; }
          .break-word { 
             word-break: break-word; 
             overflow-wrap: break-word; 
             white-space: pre-wrap;
          }

          /* COMPONENT STYLES */
          .header { text-align: center; margin-bottom: 10px; }
          .store-name { font-size: ${headerFontSize}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; line-height: 1.1; }
          .store-info { font-size: 10px; color: #000; margin-bottom: 2px; }

          .divider { border-bottom: 1px dashed #000; margin: 6px 0; height: 1px; width: 100%; opacity: 0.8; }

          .meta-group { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px; }
          .label { color: #000; white-space: nowrap; margin-right: 5px; }
          .value { font-weight: 600; text-align: right; word-break: break-all; }

          .items-container { margin: 8px 0; }
          .item-block { margin-bottom: 6px; }
          .item-row-main { display: flex; justify-content: space-between; align-items: flex-start; }
          .item-name { font-weight: 600; font-size: 11px; flex: 1; padding-right: 5px; }
          .item-total { font-weight: 700; font-size: 11px; white-space: nowrap; }
          .item-row-sub { font-size: 10px; color: #333; margin-top: 1px; }
          .item-note { font-size: 9px; font-style: italic; color: #444; margin-top: 1px; padding-left: 6px; border-left: 1px solid #ccc; }

          .summary-section { margin-top: 8px; }
          .summary-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
          .total-row { display: flex; justify-content: space-between; margin-top: 6px; align-items: flex-end; border-top: 1px solid #000; padding-top: 4px; }
          .total-label { font-size: 12px; font-weight: 800; text-transform: uppercase; }
          .total-val { font-size: 15px; font-weight: 900; }

          .payment-info { margin-top: 4px; font-size: 10px; display: flex; justify-content: space-between; color: #000; }

          .qr-section { text-align: center; margin: 10px 0; }
          .qr-caption { font-size: 9px; font-weight: 700; letter-spacing: 1px; margin-top: 4px; }
          /* QR Image scaling: Ensures print clarity (250px max width for 80mm) */
          .qr-img { width: 80%; max-width: 250px; height: auto; display: block; margin: 0 auto; image-rendering: pixelated; }
          .qr-bank { font-size: 9px; font-weight: 600; margin-top: 2px; }
          .qr-owner { font-size: 9px; text-transform: uppercase; }

          .wifi-box { text-align: center; font-size: 10px; border: 1px dashed #000; padding: 4px; border-radius: 4px; margin: 8px 0; }

          .footer { text-align: center; font-size: 10px; color: #000; margin-top: 12px; font-weight: 500; }
        </style>
      </head>
      <body>
        <div class="receipt-root">
          <div class="receipt-content">
            
            <div class="header">
              <div class="store-name break-word">${config.storeName}</div>
              <div class="store-info break-word">${config.address}</div>
              <div class="store-info">Hotline: ${config.phone}</div>
            </div>

            <div class="divider"></div>

            <div class="meta-group">
              <span class="label">Order:</span>
              <span class="value">#${order.id.slice(-6)}</span>
            </div>
            <div class="meta-group">
              <span class="label">Date:</span>
              <span class="value">${formatDate(order.created_at)}</span>
            </div>

            <div class="divider"></div>

            <div class="items-container">
              ${itemsHtml}
            </div>

            <div class="divider"></div>

            <div class="summary-section">
              <div class="summary-row">
                <span>Tạm tính</span>
                <span class="bold">${formatMoney(subtotal)}</span>
              </div>
              ${discount > 0 ? `
              <div class="summary-row">
                <span>Giảm giá</span>
                <span class="bold">-${formatMoney(discount)}</span>
              </div>` : ''}
              
              <div class="total-row">
                <span class="total-label">TỔNG CỘNG</span>
                <span class="total-val">${formatMoney(finalTotal)}</span>
              </div>

              <div class="payment-info">
                <span>Thanh toán: <strong class="uppercase">${order.payment_method || 'Unpaid'}</strong></span>
              </div>
            </div>

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
};

export const printViaIframe = (html: string) => {
  if (isSandboxed()) {
    console.warn("Print execution blocked in Sandbox.");
    return;
  }
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '100%', bottom: '100%', width: '0', height: '0', border: 'none' });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open(); doc.write(html); doc.close();
    iframe.onload = () => {
      setTimeout(() => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        catch (e) { console.error("Print failed:", e); }
        setTimeout(() => document.body.removeChild(iframe), 1500);
      }, 500);
    };
  }
};

const printViaRawBT = (html: string) => {
  window.location.href = `rawbt:data:text/html;base64,${utf8ToBase64(html)}`;
};

export const printOrderReceipt = async (order: any) => {
  if (!order) return;
  const printConfig = JSON.parse(localStorage.getItem('print_config') || '{"method":"browser","paperSize":"80mm"}');
  const html = await generateReceiptHTML(order, printConfig.paperSize || '80mm');
  if (isSandboxed() && printConfig.method !== 'rawbt') return;
  if (printConfig.method === 'rawbt') printViaRawBT(html);
  else printViaIframe(html);
};

export const printTestTicket = async (): Promise<string> => {
  const testOrder = {
    id: "TEST-8888", table: "TEST", staff_name: "Admin", created_at: new Date().toISOString(),
    total_amount: 55000, subtotal: 55000,
    items: [
      { name: "Cà phê sữa đá Sài Gòn (Size L)", quantity: 1, price: 25000 },
      { name: "Trà Đào Cam Sả (Đặc biệt nhiều đào)", quantity: 1, price: 30000, note: "Ít đường, nhiều đá, thêm topping" }
    ],
    payment_method: "Cash"
  };
  return await generateReceiptHTML(testOrder, '80mm');
};
