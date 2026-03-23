let printModulePromise: Promise<typeof import('./printService')> | null = null;

const loadPrintModule = () => {
  if (!printModulePromise) {
    printModulePromise = import('./printService');
  }
  return printModulePromise;
};

export const isSandboxed = (): boolean => {
  try {
    if (window.frameElement && window.frameElement.hasAttribute('sandbox')) return true;
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export const generateReceiptHTML = async (...args: Parameters<typeof import('./printService')['generateReceiptHTML']>) => {
  const mod = await loadPrintModule();
  return mod.generateReceiptHTML(...args);
};

export const printOrderReceipt = async (...args: Parameters<typeof import('./printService')['printOrderReceipt']>) => {
  const mod = await loadPrintModule();
  return mod.printOrderReceipt(...args);
};

export const printViaIframe = async (...args: Parameters<typeof import('./printService')['printViaIframe']>) => {
  const mod = await loadPrintModule();
  return mod.printViaIframe(...args);
};

export const printTestTicket = async (...args: Parameters<typeof import('./printService')['printTestTicket']>) => {
  const mod = await loadPrintModule();
  return mod.printTestTicket(...args);
};
