import { describe, it, expect, vi } from 'vitest';
import { PrinterService } from './printerService';
import { PrintService } from './PrintService';
import { Bill, BillItem, Kot, KotItem, RestaurantSettings } from '../types';

describe('PrinterService thermal receipt formatting', () => {
  const sampleBill: Bill = {
    id: 'bill-123',
    billNumber: '42',
    businessDate: '2026-08-28',
    orderType: 'DINE_IN',
    priceType: 'NON_AC',
    tableNumber: 'T4',
    subtotal: 100,
    discount: 10,
    grandTotal: 90,
    status: 'COMPLETED',
    reprintCount: 0,
    userId: 'staff_1',
    userName: 'Cashier John',
    createdAt: 1724810000000,
    updatedAt: 1724810000000
  };

  const sampleItems: BillItem[] = [
    {
      id: 'bi-1',
      billId: 'bill-123',
      itemId: 'm1',
      itemCode: '101',
      itemName: 'Masala Dosa',
      quantity: 1,
      unitPrice: 70,
      totalPrice: 70,
      priceType: 'NON_AC',
      createdAt: 1724810000000
    },
    {
      id: 'bi-2',
      billId: 'bill-123',
      itemId: 'm2',
      itemCode: '201',
      itemName: 'Filter Coffee',
      quantity: 1,
      unitPrice: 30,
      totalPrice: 30,
      priceType: 'NON_AC',
      createdAt: 1724810000000
    }
  ];

  const sampleSettings: RestaurantSettings = {
    restaurantName: 'Anand Bhavan Hotel',
    address: '123 Main Bazaar, Chennai',
    phone: '+91 98765 43210',
    tagline: 'Authentic South Indian Taste'
  };

  it('generates 80mm thermal receipt HTML with correct restaurant header & details', () => {
    const html = PrinterService.generateThermalReceiptHTML(sampleBill, sampleItems, sampleSettings);

    expect(html).toContain('Anand Bhavan Hotel');
    expect(html).toContain('123 Main Bazaar, Chennai');
    expect(html).toContain('Bill No: #42');
    // Either Tamil translated name or English item name
    expect(html.includes('மசால் தோசை') || html.includes('Masala Dosa')).toBe(true);
    expect(html.includes('ஃபில்டர் காபி') || html.includes('Filter Coffee')).toBe(true);
    expect(html).toContain('70');
    expect(html).toContain('30');
    expect(html).toContain('90');
    expect(html).toContain('Thank you');
  });

  it('generates 58mm thermal receipt with tailored compact width', () => {
    const settings58: RestaurantSettings = {
      ...sampleSettings,
      printerType: 'THERMAL_58MM'
    };
    const html = PrinterService.generateThermalReceiptHTML(sampleBill, sampleItems, settings58);

    expect(html).toContain('width: 48mm');
    expect(html).toContain('font-size: 10px');
    expect(html).toContain('Anand Bhavan Hotel');
  });

  it('includes reprint indicator if reprintCount > 0', () => {
    const reprintBill: Bill = {
      ...sampleBill,
      reprintCount: 2
    };
    const html = PrinterService.generateThermalReceiptHTML(reprintBill, sampleItems, sampleSettings);

    expect(html).toContain('*** DUPLICATE / REPRINT (2) ***');
  });

  it('generates printable KOT slip with table, items, and quantities', () => {
    const kot: Kot = {
      id: 'kot-1',
      kotNumber: 'KOT-05',
      businessDate: '2026-08-28',
      orderType: 'DINE_IN' as const,
      tableNumber: 'T-2',
      waiterId: 'w-1',
      waiterName: 'Ramesh',
      status: 'OPEN' as const,
      itemsCount: 3,
      createdBy: 'Ramesh',
      createdAt: 1724810000000,
      updatedAt: 1724810000000
    };

    const kotItems = [
      {
        id: 'ki-1',
        kotId: 'kot-1',
        itemId: 'm1',
        itemCode: '101',
        itemName: 'Ghee Roast Dosa',
        quantity: 2,
        priceType: 'NON_AC' as const,
        unitPrice: 80,
        notes: 'Extra crispy',
        createdAt: 1724810000000,
        updatedAt: 1724810000000
      }
    ];

    const kotHtml = PrinterService.generateKotSlipHTML(kot, kotItems);
    expect(kotHtml).toContain('KITCHEN ORDER TICKET');
    expect(kotHtml).toContain('KOT-05');
    expect(kotHtml).toContain('Table: T-2');
    expect(kotHtml).toContain('Ghee Roast Dosa');
    expect(kotHtml).toContain('× 2');
    expect(kotHtml).toContain('Note: Extra crispy');
  });

  it('supports toggling mock dev print mode', () => {
    PrinterService.setMockPrintMode(true);
    expect(PrinterService.isMockPrintMode()).toBe(true);

    PrinterService.setMockPrintMode(false);
    expect(PrinterService.isMockPrintMode()).toBe(false);
  });

  it('generates standardized diagnostic string verifying connection and paper feed status', () => {
    const diagnosticString = PrinterService.getStandardizedDiagnosticString(sampleSettings);

    expect(diagnosticString).toContain('STANDARDIZED PRINTER DIAGNOSTIC TEST');
    expect(diagnosticString).toContain('STATUS       : ONLINE / CONNECTED');
    expect(diagnosticString).toContain('PAPER FEED   : VERIFIED / ACTIVE');
    expect(diagnosticString).toContain('FEED TEST    : 20MM ADVANCE OK');
    expect(diagnosticString).toContain('STANDARDIZED DIAGNOSTIC TEST STRING:');
    expect(diagnosticString).toContain('0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(diagnosticString).toContain('*** CONNECTION & PAPER FEED VERIFIED ***');
  });

  it('generates diagnostic test slip HTML with connection status, character set, and 20mm paper feed', () => {
    const html = PrinterService.generateDiagnosticTestSlipHTML(sampleSettings);

    expect(html).toContain('PRINTER DIAGNOSTIC');
    expect(html).toContain('STANDARDIZED TEST PAGE');
    expect(html).toContain('ONLINE / CONNECTED');
    expect(html).toContain('PASSED / 20MM FEED');
    expect(html).toContain('STANDARDIZED DIAGNOSTIC STRING');
    expect(html).toContain('THERMAL HEAD DENSITY');
    expect(html).toContain('height: 20mm');
    expect(html).toContain('CONNECTION & FEED VERIFIED');
  });

  it('ensures printHtmlDocument uses consistent window.print() trigger compatible with Chrome Kiosk Printing', () => {
    const printSpy = vi.fn();
    window.print = printSpy;
    const focusSpy = vi.fn();
    window.focus = focusSpy;
    const popupSpy = vi.spyOn(window, 'open');

    const result = PrinterService.printHtmlDocument('<div>Receipt Content</div>', sampleSettings);

    expect(result.success).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(popupSpy).not.toHaveBeenCalled();

    const printRoot = document.getElementById('pos-print-root');
    expect(printRoot).not.toBeNull();
  });

  it('ensures printBill executes consistent window.print() trigger without opening popups or dialogs', () => {
    const printSpy = vi.fn();
    window.print = printSpy;
    const popupSpy = vi.spyOn(window, 'open');

    const result = PrinterService.printBill(sampleBill, sampleItems, sampleSettings, true);

    expect(result.success).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(popupSpy).not.toHaveBeenCalled();
  });

  it('ensures printKot executes consistent window.print() trigger without opening popups or dialogs', () => {
    const printSpy = vi.fn();
    window.print = printSpy;
    const popupSpy = vi.spyOn(window, 'open');

    const kot: Kot = {
      id: 'kot-2',
      kotNumber: 'KOT-99',
      businessDate: '2026-08-28',
      orderType: 'DINE_IN',
      tableNumber: 'T-1',
      waiterId: 'w-1',
      createdBy: 'Staff',
      status: 'OPEN',
      itemsCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const kotItems: KotItem[] = [
      {
        id: 'ki-2',
        kotId: 'kot-2',
        itemId: 'm2',
        itemCode: '202',
        itemName: 'Poori Masala',
        quantity: 1,
        priceType: 'NON_AC' as const,
        unitPrice: 60,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const result = PrinterService.printKot(kot, kotItems, true);

    expect(result.success).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(popupSpy).not.toHaveBeenCalled();
  });

  it('ensures printViaIframe and printViaDirectDOM both route through the consistent window.print() trigger', () => {
    const printSpy = vi.fn();
    window.print = printSpy;
    const popupSpy = vi.spyOn(window, 'open');

    const res1 = PrinterService.printViaIframe('<div>Test Iframe Call</div>');
    expect(res1.success).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);

    const res2 = PrinterService.printViaDirectDOM('<div>Test Direct DOM Call</div>');
    expect(res2.success).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(2);

    expect(popupSpy).not.toHaveBeenCalled();
  });

  it('applies custom font size, per-element alignments, bold toggles, logo offsets, and watermark settings', () => {
    const customSettings: RestaurantSettings = {
      ...sampleSettings,
      receiptFontSize: 13,
      logoOffsetX: 25,
      logoOffsetY: 12,
      watermarkEnabled: true,
      watermarkUseLogo: true,
      logoAlignment: 'left',
      shopNameAlignment: 'right',
      addressAlignment: 'left',
      phoneAlignment: 'right',
      billHeaderAlignment: 'center',
      footerAlignment: 'right',
      boldRestaurantName: false,
      boldBillNumber: true,
      boldItemHeader: false,
      boldGrandTotal: true,
      boldFooter: true,
    };

    const html = PrinterService.generateThermalReceiptHTML(sampleBill, sampleItems, customSettings);
    expect(html).toContain('--receipt-base-font-size: 13px;');
    expect(html).toContain('translate(25px, 12px)');
    expect(html).toContain('class="watermark-container"');
    expect(html).toContain('text-align: left;');
    expect(html).toContain('text-align: right;');
  });

  it('hides logo when logoRemoved is true', () => {
    const html = PrinterService.generateThermalReceiptHTML(sampleBill, sampleItems, {
      ...sampleSettings,
      logoRemoved: true,
      watermarkEnabled: false,
    });
    expect(html).not.toContain('class="receipt-logo"');
    expect(html).not.toContain('class="watermark-container"');
  });

  it('executes printSampleTestReceipt with TEST-001 sample receipt independently of billing', async () => {
    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', {
      value: printSpy,
      writable: true,
      configurable: true
    });

    const result = await PrinterService.printSampleTestReceipt(sampleSettings);
    expect(result.success).toBe(true);
    expect(printSpy).toHaveBeenCalledTimes(1);

    const printRoot = document.getElementById('pos-print-root');
    expect(printRoot?.innerHTML).toContain('TEST-001');
    expect(printRoot?.innerHTML).toContain('மசால் தோசை');
    expect(printRoot?.innerHTML).toContain('ஃபில்டர் காபி');
  });

  it('queues and executes PrintService.printReceipt(data) and PrintService.testPrint() via direct ESC/POS without calling window.print() or window.open(), and retries failed jobs without duplicating bills', async () => {
    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', {
      value: printSpy,
      writable: true,
      configurable: true
    });
    const popupSpy = vi.spyOn(window, 'open');

    PrintService.clearPrintJobs();
    PrintService.setSimulatedPrinterState('READY');

    const receiptResult = await PrintService.printReceipt({
      bill: sampleBill,
      items: sampleItems,
      settings: sampleSettings,
      forcePrint: true
    });
    expect(receiptResult.success).toBe(true);
    expect(receiptResult.job?.status).toBe('PRINTED');
    expect(receiptResult.escPosBytes).toBeGreaterThan(0);
    expect(printSpy).not.toHaveBeenCalled();
    expect(popupSpy).not.toHaveBeenCalled();

    const testResult = await PrintService.testPrint(sampleSettings);
    expect(testResult.success).toBe(true);
    expect(testResult.job?.billNumber).toBe('TEST-001');
    expect(printSpy).not.toHaveBeenCalled();
    expect(popupSpy).not.toHaveBeenCalled();

    const diag = PrintService.getDiagnosticStatus();
    expect(diag.printerStatus).toBe('Ready');
    expect(diag.lastPrint).toBe('Successful');

    // Simulate printer failure -> verify job is FAILED and retry reuses the same bill & job
    PrintService.setSimulatedPrinterState('DISCONNECTED');
    const failedBill: Bill = { ...sampleBill, id: 'bill-015', billNumber: '015' };
    const failedResult = await PrintService.printReceipt({
      bill: failedBill,
      items: sampleItems,
      settings: sampleSettings,
      forcePrint: true
    });
    expect(failedResult.success).toBe(false);
    expect(failedResult.job?.status).toBe('FAILED');
    expect(failedResult.job?.attempts).toBe(1);

    // Reconnect printer and retry the SAME bill
    PrintService.setSimulatedPrinterState('READY');
    const retryResult = await PrintService.printReceipt({
      bill: failedBill,
      items: sampleItems,
      settings: sampleSettings,
      forcePrint: true,
      isRetry: true,
      jobId: failedResult.jobId
    });
    expect(retryResult.success).toBe(true);
    expect(retryResult.jobId).toBe(failedResult.jobId);
    expect(retryResult.job?.billNumber).toBe('015');
    expect(retryResult.job?.status).toBe('PRINTED');
    expect(retryResult.job?.attempts).toBe(2);
    expect(printSpy).not.toHaveBeenCalled();
  });
});
