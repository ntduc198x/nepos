
import React from 'react';
import { Order } from '../types';
import { useCurrency } from '../CurrencyContext';
import { useSettingsContext } from '../context/SettingsContext';

interface ReceiptProps {
  data: Order | null;
}

export const Receipt: React.FC<ReceiptProps> = ({ data }) => {
  const { formatPrice } = useCurrency();
  
  // Settings & Config
  let settings: any = {};
  try {
      const { settings: ctxSettings } = useSettingsContext();
      settings = ctxSettings;
  } catch (e) {
      const stored = localStorage.getItem('RESBAR_SETTINGS_STORE');
      if (stored) settings = JSON.parse(stored).data;
  }
  const bankConfigStr = localStorage.getItem('bank_config');
  const bankConfig = bankConfigStr ? JSON.parse(bankConfigStr) : null;

  if (!data) return <div className="hidden"></div>;

  const calculateItemTotal = (price: number, qty: number) => price * qty;
  const total = data.total_amount || data.total || 0;
  const subtotal = data.subtotal || data.total || 0;
  const discount = data.discount_amount || 0;

  // Logic
  const isTakeaway = (data.table || '').toLowerCase() === 'takeaway' || (data.table_id || '').toLowerCase() === 'takeaway';
  const isTransfer = (data.payment_method || '').toLowerCase() === 'transfer';
  const showQr = !!bankConfig && (isTakeaway || isTransfer);
  const showWifi = !isTakeaway && (!!settings.wifiName || !!settings.wifiPassword);

  // Width Logic - CORRECTED
  const isSmall = settings.paperSize === '58mm';
  
  // Physical Width (Use this for outer container)
  const physicalWidthMm = isSmall ? 58 : 80;
  
  // Safe Printable Width (Content)
  // Standard thermal printers usually print 72mm on 80mm paper, and 48mm on 58mm paper.
  const safeWidthMm = isSmall ? 48 : 72; 

  return (
    <div 
        id="receipt-root" 
        className="bg-white text-black mx-auto font-sans antialiased box-border w-full flex flex-col items-center py-2"
        style={{ width: `${physicalWidthMm}mm` }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          #receipt-root { 
              font-family: 'Inter', sans-serif; 
              line-height: 1.25; 
              color: #000; 
              font-size: ${isSmall ? '11px' : '12px'};
              box-sizing: border-box;
          }
          .r-divider { border-bottom: 1px dashed #bbb; opacity: 0.6; margin: 8px 0; width: 100%; height: 1px; }
        `}
      </style>
      
      {/* SAFE CONTENT CONTAINER */}
      <div className="flex flex-col box-border" style={{ width: `${safeWidthMm}mm` }}>
        
        {/* Header */}
        <div className="text-center mb-3">
          <div className="text-[15px] font-bold uppercase tracking-wide mb-1 leading-tight break-words whitespace-pre-wrap">{settings.counterName || "RESBAR POS"}</div>
          {settings.counterAddress && <div className="text-[10px] text-gray-700 break-words whitespace-pre-wrap">{settings.counterAddress}</div>}
          {settings.counterPhone && <div className="text-[10px] text-gray-700">Hotline: {settings.counterPhone}</div>}
        </div>

        <div className="r-divider"></div>

        {/* Meta - 2 Cols - Clean */}
        <div className="text-[10px] space-y-1 mb-1">
          <div className="flex justify-between">
              <span className="text-gray-600 whitespace-nowrap mr-2">Order:</span>
              <span className="font-bold text-black text-right">#{data.id.slice(-6)}</span>
          </div>
          <div className="flex justify-between">
              <span className="text-gray-600 whitespace-nowrap mr-2">Date:</span>
              <span className="font-bold text-black text-right">{new Date().toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'})} {new Date().toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          <div className="flex justify-between">
              <span className="text-gray-600 whitespace-nowrap mr-2">Table:</span>
              <span className="font-bold text-black text-right">{data.table || 'Takeaway'}</span>
          </div>
          <div className="flex justify-between">
              <span className="text-gray-600 whitespace-nowrap mr-2">Staff:</span>
              <span className="font-bold text-black truncate max-w-[120px] text-right">{data.staff || 'POS'}</span>
          </div>
          <div className="flex justify-between">
              <span className="text-gray-600 whitespace-nowrap mr-2">Type:</span>
              <span className="font-bold uppercase text-right">{isTakeaway ? 'TAKEAWAY' : 'DINE-IN'}</span>
          </div>
        </div>

        <div className="r-divider"></div>

        {/* Item List - Block Layout */}
        <div className="my-3">
          {data.items?.map((item, idx) => (
            <div key={idx} className="mb-2 last:mb-0">
              {/* Line 1: Name & Total */}
              <div className="flex justify-between items-start gap-2">
                  <span className="text-[11px] font-semibold flex-1 leading-tight break-words whitespace-pre-wrap">{item.name}</span>
                  <span className="text-[11px] font-semibold whitespace-nowrap">{formatPrice(calculateItemTotal(item.price, item.quantity))}</span>
              </div>
              {/* Line 2: Qty x Price */}
              <div className="text-[10px] text-gray-600 mt-0.5">
                  {item.quantity} x {formatPrice(item.price)}
              </div>
              {/* Line 3: Note */}
              {item.note && (
                  <div className="text-[9px] italic text-gray-600 mt-0.5 pl-2 border-l border-gray-300">
                      Note: {item.note}
                  </div>
              )}
            </div>
          ))}
        </div>

        <div className="r-divider"></div>

        {/* Totals */}
        <div className="space-y-1 mb-4 mt-3">
          <div className="flex justify-between text-[11px]">
            <span>Tạm tính</span>
            <span className="font-semibold">{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 && (
              <div className="flex justify-between text-[11px]">
                  <span>Giảm giá</span>
                  <span className="font-semibold">-{formatPrice(discount)}</span>
              </div>
          )}
          
          <div className="flex justify-between items-end mt-2">
            <span className="text-[13px] font-bold uppercase">TỔNG CỘNG</span>
            <span className="text-[16px] font-extrabold leading-none">{formatPrice(total)}</span>
          </div>

          <div className="flex justify-between items-center text-[10px] text-gray-700 mt-2">
              <span>Thanh toán: <strong className="uppercase">{data.payment_method || 'Unpaid'}</strong></span>
          </div>
        </div>

        {/* QR Section */}
        {showQr && (
          <>
            <div className="r-divider"></div>
            <div className="text-center my-3">
              <div className="font-bold text-[9px] mb-1 tracking-widest">QUÉT MÃ THANH TOÁN</div>
              <div 
                  className="bg-gray-100 mx-auto flex items-center justify-center border border-dashed border-gray-300 text-[9px] text-gray-400"
                  style={{ width: isSmall ? '120px' : '140px', height: isSmall ? '120px' : '140px' }}
              >
                  [QR in Print]
              </div>
              <div className="mt-1 text-[9px] font-semibold">{bankConfig.bankId} • {bankConfig.accountNo}</div>
              <div className="text-[9px] uppercase">{bankConfig.accountName}</div>
            </div>
          </>
        )}

        {/* Wifi Section */}
        {showWifi && (
          <>
            <div className="r-divider"></div>
            <div className="text-center my-2 text-[10px] border border-dashed border-gray-300 rounded p-1.5">
              {settings.wifiName && <div>WIFI: <strong>{settings.wifiName}</strong></div>}
              {settings.wifiPassword && <div>PASS: <strong>{settings.wifiPassword}</strong></div>}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="text-center text-[10px] text-gray-600 mt-4 font-medium">
          <div className="break-words whitespace-pre-wrap">{settings.receiptNote || "Xin cảm ơn & Hẹn gặp lại!"}</div>
          <div className="text-[8px] mt-1 opacity-60">Powered by ResBar POS</div>
        </div>

      </div>
    </div>
  );
};
    