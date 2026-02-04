
import { IPrintAdapter, PrintCapabilities } from './IPrintAdapter';
import { AppSettings } from '../types/settingsTypes';
import { ReceiptRenderer } from './ReceiptRenderer';

export class WebPrintAdapter implements IPrintAdapter {
  
  private isSandboxed(): boolean {
    try {
      if (window.frameElement && window.frameElement.hasAttribute('sandbox')) return true;
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  }

  private utf8ToBase64(str: string) {
    return window.btoa(unescape(encodeURIComponent(str)));
  }

  private printViaIframe(html: string) {
    if (this.isSandboxed()) {
      console.warn("WebPrintAdapter: Blocked by Sandbox. Use Preview instead.");
      return;
    }
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '100%', bottom: '100%', width: '0', height: '0', border: 'none' });
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error("Print failed:", e);
          }
          setTimeout(() => document.body.removeChild(iframe), 1500);
        }, 500);
      };
    }
  }

  private printViaRawBT(html: string) {
    const base64Html = this.utf8ToBase64(html);
    window.location.href = `rawbt:data:text/html;base64,${base64Html}`;
  }

  async printReceipt(orderData: any, settings: AppSettings): Promise<void> {
    const html = await ReceiptRenderer.render(orderData, settings);
    
    if (settings.printMethod === 'rawbt') {
        this.printViaRawBT(html);
    } else {
        this.printViaIframe(html);
    }
  }

  async generatePreview(orderData: any, settings: AppSettings): Promise<string> {
    return await ReceiptRenderer.render(orderData, settings);
  }

  getCapabilities(): PrintCapabilities {
    return {
      supportsPreview: true,
      supportsSilentPrint: false, // Browser print dialog always appears
      requiresInteraction: this.isSandboxed() // If sandboxed, we rely on Preview Modal logic
    };
  }
}
