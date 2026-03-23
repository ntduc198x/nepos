
import { Order } from '../types';

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

const escapeHtml = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const isSandboxed = (): boolean => {
  try {
    if (window.frameElement && window.frameElement.hasAttribute('sandbox')) return true;
    return window.self !== window.top;
  } catch (e) {
    return true;
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
 * Helper to resolve settings with fallbacks
 */
const getEffectiveSettings = (injectedSettings?: any) => {
  if (injectedSettings && Object.keys(injectedSettings).length > 0) {
    return injectedSettings;
  }
  try {
    // Priority 1: New Device Global Key
    const globalStr = localStorage.getItem('RESBAR_SETTINGS_STORE:device_global');
    if (globalStr) return JSON.parse(globalStr).data;

    // Priority 2: Legacy Key
    const legacyStr = localStorage.getItem('RESBAR_SETTINGS_STORE');
    if (legacyStr) return JSON.parse(legacyStr).data;
  } catch(e) {
    console.warn("Failed to load settings from storage", e);
  }
  return {};
};

const generateRawBTCompactHTML = (order: any, config: any, subtotal: number, discount: number, finalTotal: number, paperSize: string) => {
  const isSmall = paperSize === '58mm';
  const widthMm = isSmall ? 58 : 80;
  const fontSize = isSmall ? 11 : 12;

  const itemsHtml = (order.items || []).map((item: any) => {
    const qty = item.quantity || item.qty || 1;
    const price = Number(item.price || 0);
    const lineTotal = qty * price;
    return `
      <tr>
        <td class="name">${escapeHtml(item.name || item._snapshot_name || item._display_name || 'Item')}</td>
        <td class="qty">${qty}</td>
        <td class="amt">${formatMoney(lineTotal)}</td>
      </tr>
      ${(item.note && item.note.trim()) ? `<tr><td colspan="3" class="note">* ${escapeHtml(item.note.trim())}</td></tr>` : ''}
    `;
  }).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @media print { @page { size: ${widthMm}mm auto; margin: 0; } }
          html, body { margin: 0; padding: 0; width: ${widthMm}mm; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: ${fontSize}px; color: #000; }
          .root { padding: 4mm 3mm 6mm; }
          .center { text-align: center; }
          .store { font-weight: 700; font-size: ${isSmall ? 15 : 16}px; text-transform: uppercase; }
          .meta { margin-top: 2px; font-size: ${isSmall ? 10 : 11}px; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { vertical-align: top; padding: 1px 0; }
          .name { width: 58%; font-weight: 600; word-break: break-word; }
          .qty { width: 12%; text-align: center; }
          .amt { width: 30%; text-align: right; font-weight: 700; white-space: nowrap; }
          .note { font-size: ${isSmall ? 9 : 10}px; color: #333; font-style: italic; padding-left: 2px; }
          .sum { display: flex; justify-content: space-between; margin: 2px 0; }
          .total { display: flex; justify-content: space-between; font-weight: 800; font-size: ${isSmall ? 13 : 14}px; margin-top: 4px; }
          .footer { margin-top: 8px; text-align: center; font-size: ${isSmall ? 9 : 10}px; }
        </style>
      </head>
      <body>
        <div class="root">
          <div class="center store">${escapeHtml(config.storeName || 'Nepos')}</div>
          ${config.address ? `<div class="center meta">${escapeHtml(config.address)}</div>` : ''}
          ${config.phone ? `<div class="center meta">${escapeHtml(config.phone)}</div>` : ''}
          <div class="line"></div>
          <div class="meta">Mã đơn: #${String(order.id || '').slice(-6)}</div>
          <div class="meta">Thời gian: ${formatDate(order.created_at)}</div>
          <div class="line"></div>
          <table>${itemsHtml}</table>
          <div class="line"></div>
          <div class="sum"><span>Tạm tính</span><b>${formatMoney(subtotal)}</b></div>
          ${discount > 0 ? `<div class="sum"><span>Giảm giá</span><b>-${formatMoney(discount)}</b></div>` : ''}
          <div class="total"><span>TỔNG CỘNG</span><span>${formatMoney(finalTotal)}</span></div>
          <div class="meta">Thanh toán: <b>${escapeHtml(order.payment_method || 'UNPAID')}</b></div>
          <div class="line"></div>
          <div class="footer">${escapeHtml(config.footerMessage || 'Xin cảm ơn & Hẹn gặp lại!')}</div>
        </div>
      </body>
    </html>
  `;
};

/**
 * GENERATE RECEIPT HTML - THERMAL PRINTER OPTIMIZED
 * Accepts optional 'settings' object to ensure immediate update reflection.
 */
export const generateReceiptHTML = async (order: any, settingsOrPaperSize?: any) => {
  // Handle overload: settings object OR paperSize string
  let settings: any = {};
  let forcedPaperSize = '';

  if (typeof settingsOrPaperSize === 'string') {
    forcedPaperSize = settingsOrPaperSize;
    settings = getEffectiveSettings();
  } else {
    settings = getEffectiveSettings(settingsOrPaperSize);
  }

  const paperSize = forcedPaperSize || settings.paperSize || '80mm';

  console.log("🖨️ [Print] Resolving Store Info:", { 
    name: settings.counterName, 
    address: settings.counterAddress, 
    phone: settings.counterPhone 
  });

  const subtotal = order.subtotal || order.total_amount || order.total || 0;
  const discount = order.discount_amount || 0;
  const finalTotal = order.total_amount ?? (subtotal - discount);

  const isSmall = paperSize === '58mm';

  // 1. PHYSICAL PAPER WIDTH (For @page size)
  const physicalWidthMm = isSmall ? 58 : 80;

  // 2. SAFE PRINTABLE AREA (Content Width)
  const safeWidthMm = isSmall ? 48 : 72;

  // Font scaling
  const baseFontSize = isSmall ? '12px' : '13px';
  const headerFontSize = isSmall ? '15px' : '17px';

  const config = {
    storeName: settings.counterName || settings.storeName || "Nepos",
    address: settings.counterAddress || settings.storeAddress || "",
    phone: settings.counterPhone || settings.storePhone || "",
    wifiName: settings.wifiName || "",
    wifiPass: settings.wifiPassword || "",
    footerMessage: settings.receiptNote || "Xin cảm ơn & Hẹn gặp lại!"
  };

  // Android/RawBT path: use compact thermal-safe template for sharper output.
  if ((settings.printMethod || '').toLowerCase() === 'rawbt') {
    return generateRawBTCompactHTML(order, config, subtotal, discount, finalTotal, paperSize);
  }

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
    let imgSource = await fetchImageAsBase64(qrUrl);
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
          <span class="item-name">${escapeHtml(item.name || item._snapshot_name || item._display_name)}</span>
          <span class="item-total">${formatMoney(totalLine)}</span>
        </div>
        <div class="item-row-sub">
          ${qty} x ${formatMoney(unitPrice)}
        </div>
        ${note ? `<div class="item-note">Note: ${escapeHtml(note)}</div>` : ''}
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
              <div class="store-name break-word">${escapeHtml(config.storeName)}</div>
              <div class="store-info break-word">${escapeHtml(config.address)}</div>
              <div class="store-info">Hotline: ${escapeHtml(config.phone)}</div>
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
              <div style="font-size: 8px; opacity: 0.6; margin-top: 4px;">Powered by Nepos</div>
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

/**
 * Print Order Receipt
 * @param order Order data
 * @param settings Optional settings object to override storage lookup (ensures up-to-date data)
 */
export const printOrderReceipt = async (order: any, settings?: any) => {
  if (!order) return;
  
  // Use passed settings or fetch effective settings
  const effSettings = getEffectiveSettings(settings);
  
  const html = await generateReceiptHTML(order, effSettings);
  const printMethod = effSettings.printMethod || 'browser';

  if (isSandboxed() && printMethod !== 'rawbt') return;
  
  if (printMethod === 'rawbt') printViaRawBT(html);
  else printViaIframe(html);
};

/**
 * Print Test Ticket
 * @param settings Optional settings to test current config
 */
export const printTestTicket = async (settings?: any): Promise<string> => {
  const testOrder = {
    id: "TEST-8888", table: "TEST", staff_name: "Admin", created_at: new Date().toISOString(),
    total_amount: 55000, subtotal: 55000,
    items: [
      { name: "Cà phê sữa đá Sài Gòn (Size L)", quantity: 1, price: 25000 },
      { name: "Trà Đào Cam Sả (Đặc biệt nhiều đào)", quantity: 1, price: 30000, note: "Ít đường, nhiều đá, thêm topping" }
    ],
    payment_method: "Cash"
  };
  return await generateReceiptHTML(testOrder, settings);
};
