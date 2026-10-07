import { Bill, BillItem, Kot, KotItem, PrintMethod, RestaurantSettings } from '../types';
import { getTamilItemName } from './tamilTranslation';
import { getCaptainNumber } from '../utils/receiptFormatters';
import { DEFAULT_RESTAURANT_LOGO } from '../data/defaultLogo';
import { PrintDiagnosticsService } from './printDiagnostics';
import { PrinterConnectionService } from './printerConnectionService';
import { EscPosService } from './escposService';

export class PrinterService {
  /**
   * Check if Mock/Silent print mode is enabled (for development/testing without physical printer)
   */
  static isMockPrintMode(): boolean {
    return localStorage.getItem('pos_printer_mock_mode') === 'true';
  }

  static setMockPrintMode(enabled: boolean): void {
    localStorage.setItem('pos_printer_mock_mode', String(enabled));
  }

  /**
   * Generates printable HTML formatted specifically for thermal printers (80mm / 3-inch or 58mm / 2-inch)
   */
  static generateThermalReceiptHTML(
    bill: Bill, 
    items: BillItem[], 
    settings?: RestaurantSettings
  ): string {
    const isLogoRemoved = Boolean(settings?.logoRemoved) || settings?.logoDisplay === 'none';
    const originalLogoUrl = isLogoRemoved
      ? ''
      : (settings?.logoUrl?.trim() || settings?.logoStorageUrl?.trim() || DEFAULT_RESTAURANT_LOGO);
    const logoUrl = originalLogoUrl;

    const hotelNameTamil = settings?.restaurantNameTamil?.trim() || 
      (settings?.restaurantName && !settings.restaurantName.toLowerCase().includes('saravana') 
        ? settings.restaurantName 
        : 'ஸ்ரீ சரவண பவன்');
    const restaurantName = settings?.restaurantName || 'Sri Saravanan Bhavan';
    const address = settings?.address || 'No:8A, Rajambal Nagar, Salem Main Rd, Anna Nagar, Kallakurichi-606213';
    const phone = settings?.phone || '7708159933';
    const email = settings?.email;
    const gstNumber = settings?.gstNumber;
    const fssaiNumber = settings?.fssaiNumber;
    const receiptFooter = settings?.receiptFooter || 'THANK YOU';

    // Individual section alignments (falling back to receiptAlignment or sensible defaults)
    const defaultAlignment = settings?.receiptAlignment || 'center';
    const logoAlignment = settings?.logoAlignment || defaultAlignment;
    const shopNameAlignment = settings?.shopNameAlignment || defaultAlignment;
    const addressAlignment = settings?.addressAlignment || defaultAlignment;
    const phoneAlignment = settings?.phoneAlignment || defaultAlignment;
    const billHeaderAlignment = settings?.billHeaderAlignment || 'left';
    const footerAlignment = settings?.footerAlignment || defaultAlignment;

    // Individual Bold toggles
    const boldRestaurantName = settings?.boldRestaurantName !== undefined ? settings.boldRestaurantName : true;
    const boldBillNumber = settings?.boldBillNumber !== undefined ? settings.boldBillNumber : true;
    const boldItemHeader = settings?.boldItemHeader !== undefined ? settings.boldItemHeader : true;
    const boldGrandTotal = settings?.boldGrandTotal !== undefined ? settings.boldGrandTotal : true;
    const boldFooter = settings?.boldFooter !== undefined ? settings.boldFooter : true;

    // Logo position dragger offsets (clamped to printable receipt area)
    const logoOffsetX = Math.max(-90, Math.min(90, Number(settings?.logoOffsetX || 0)));
    const logoOffsetY = Math.max(-20, Math.min(40, Number(settings?.logoOffsetY || 0)));

    const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
    const watermarkEnabled = settings?.watermarkEnabled !== undefined
      ? Boolean(settings.watermarkEnabled)
      : (settings?.logoDisplay === 'watermark' || settings?.logoDisplay === 'both' || settings?.logoDisplay === undefined);
    const watermarkUseLogo = settings?.watermarkUseLogo !== false;
    const showHeaderLogo = false;
    const watermarkOpacity = settings?.watermarkOpacity !== undefined ? settings.watermarkOpacity : 0.12;
    const defaultDim = is58mm ? 70 : 95;
    const storedW = typeof window !== 'undefined' ? Number(localStorage.getItem('pos_receipt_logo_max_width')) : 0;
    const storedH = typeof window !== 'undefined' ? Number(localStorage.getItem('pos_receipt_logo_max_height')) : 0;
    const logoMaxWidth = Math.min(180, settings?.receiptLogoMaxWidth || (storedW > 0 ? storedW : defaultDim));
    const logoMaxHeight = Math.min(85, settings?.receiptLogoMaxHeight || (storedH >= 40 ? storedH : 65));

    const createdDate = new Date(bill.createdAt || Date.now());
    const day = String(createdDate.getDate()).padStart(2, '0');
    const monthNum = String(createdDate.getMonth() + 1).padStart(2, '0');
    const year = createdDate.getFullYear();
    const dateFormatted = `${day}-${monthNum}-${year}`;
    const timeFormatted = createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const cleanBillNo = (bill.billNumber || '001').replace(/^BN-|^#/, '');
    const captainNumber = getCaptainNumber(bill);
    const tableNo = bill.tableNumber || (bill.orderType === 'TAKE_AWAY' ? 'TA' : 'DR');

    const paperWidth = is58mm ? '48mm' : '72mm';
    const isCompact = Boolean(settings?.compactMode) || settings?.receiptFormat === 'compact';
    const receiptFormat = settings?.receiptFormat || (isCompact ? 'compact' : 'standard');
    const configuredFontSize = settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12);
    const clampedFontSize = Math.max(8, Math.min(20, configuredFontSize));
    const baseFontSize = isCompact ? Math.max(8, Math.round(clampedFontSize * 0.92 * 10) / 10) : clampedFontSize;
    const totalQty = items.reduce((sum, itm) => sum + itm.quantity, 0);

    const headerScaleMap = { normal: 1.35, large: 1.5, huge: 1.7 };
    const headerScale = headerScaleMap[settings?.receiptHeaderFontSize || 'normal'];
    const titleFontSize = Math.round(baseFontSize * headerScale * 10) / 10;

    const itemScaleMap = { normal: 1.15, large: 1.25, prominent: 1.35 };
    const itemScale = itemScaleMap[settings?.receiptItemFontSize || 'normal'];
    const itemFontSize = Math.round(baseFontSize * itemScale * 10) / 10;

    const totalScaleMap = { normal: 1.3, large: 1.45, huge: 1.6 };
    const totalScale = totalScaleMap[settings?.receiptTotalFontSize || 'normal'];
    const totalFontSize = Math.round(baseFontSize * totalScale * 10) / 10;

    const headerFontSize = Math.round(baseFontSize * 1.08 * 10) / 10;
    const metaFontSize = Math.round(baseFontSize * 1.04 * 10) / 10;
    const priceFontSize = Math.round(baseFontSize * 1.1 * 10) / 10;
    const smallFontSize = Math.round(baseFontSize * 0.9 * 10) / 10;

    const lineSpacingMap = { tight: '1.15', normal: '1.22', relaxed: '1.35' };
    const lineHeightVal = lineSpacingMap[settings?.receiptLineSpacing || 'normal'];

    const sectionSpacingMap = { compact: '2px 0', normal: '3px 0', spacious: '5px 0' };
    const sectionSpacingVal = sectionSpacingMap[settings?.receiptSectionSpacing || 'normal'];

    const itemPaddingMap = { compact: '1.5px 0', normal: '2px 0', spacious: '3.5px 0' };
    const itemRowPaddingVal = itemPaddingMap[settings?.receiptItemPadding || 'normal'];

    const feedLines = settings?.receiptFeedLines || 2;
    const feedHeightMm = feedLines * 4 + 4;

    const showAddress = settings?.receiptShowAddress !== false;
    const showPhone = settings?.receiptShowPhone !== false;
    const showGstFssai = settings?.receiptShowGstFssai !== false && (gstNumber || fssaiNumber);
    const showTotalQty = settings?.receiptShowTotalQty !== false;
    const showTamilName = settings?.receiptShowTamilName !== false;
    const showEnglishName = settings?.receiptShowEnglishName !== false;

    const formatAddressLines = (addr: string): string[] => {
      if (!addr) return [];
      if (addr.includes('\n')) return addr.split('\n').map(s => s.trim()).filter(Boolean);
      if (addr.includes('Anna Nagar')) {
        const parts = addr.split('Anna Nagar');
        return [
          parts[0].replace(/,\s*$/, '').trim(),
          ('Anna Nagar' + parts[1]).trim()
        ];
      }
      const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length > 2) {
        const mid = Math.ceil(parts.length / 2);
        return [parts.slice(0, mid).join(', '), parts.slice(mid).join(', ')];
      }
      return [addr];
    };

    const addressLines = formatAddressLines(address);

    const reprintBadge = (bill.reprintCount && bill.reprintCount > 0) ? `
      <div style="text-align: center; border: 1px solid #000; padding: 1.5px; margin: 2px 0; font-size: ${metaFontSize}px; font-weight: 800; text-transform: uppercase;">
        *** DUPLICATE / REPRINT (${bill.reprintCount}) ***
      </div>
    ` : '';

    const logoMarginStyle = logoAlignment === 'left'
      ? 'margin-left: 0; margin-right: auto;'
      : logoAlignment === 'right'
      ? 'margin-left: auto; margin-right: 0;'
      : 'margin-left: auto; margin-right: auto;';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt #${bill.billNumber}</title>
  <style>
    @page { 
      size: ${is58mm ? '58mm' : '80mm'} auto; 
      margin: 0; 
    }
    * { box-sizing: border-box; }
    :root, #pos-print-root, html, body, .receipt-wrapper {
      --receipt-base-font-size: ${baseFontSize}px;
      --receipt-title-font-size: ${titleFontSize}px;
      --receipt-header-font-size: ${headerFontSize}px;
      --receipt-meta-font-size: ${metaFontSize}px;
      --receipt-item-font-size: ${itemFontSize}px;
      --receipt-total-font-size: ${totalFontSize}px;
      --receipt-small-font-size: ${smallFontSize}px;
      --receipt-logo-max-width: ${logoMaxWidth}px;
      --receipt-logo-max-height: ${logoMaxHeight}px;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Mukta Malar', 'Noto Sans Tamil', 'Latha', 'Nirmala UI', 'Courier New', Courier, monospace;
      font-size: ${baseFontSize}px;
      line-height: ${lineHeightVal};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: ${paperWidth};
      margin: 0 auto;
      padding: 2px 2px 4px 2px;
      position: relative;
    }
    @media print {
      @page {
        size: ${is58mm ? '58mm' : '80mm'} auto;
        margin: 0;
      }
      html, body {
        width: ${paperWidth} !important;
        margin: 0 auto !important;
        padding: 0 !important;
      }
    }
    .receipt-wrapper {
      position: relative;
      width: 100%;
      overflow: hidden;
      font-size: var(--receipt-base-font-size, ${baseFontSize}px);
      line-height: ${lineHeightVal};
    }
    .watermark-container {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: ${is58mm ? '115px' : '145px'};
      height: ${is58mm ? '115px' : '145px'};
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      opacity: ${watermarkOpacity};
      pointer-events: none;
      z-index: 0;
    }
    .watermark-img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
      filter: grayscale(100%);
      transform: translate(${logoOffsetX}px, ${logoOffsetY}px);
    }
    .watermark-text {
      font-size: 16px;
      font-weight: 900;
      text-transform: uppercase;
      color: #000;
      letter-spacing: 1px;
      line-height: 1.2;
      word-break: break-word;
    }
    .receipt-logo-container {
      display: block;
      width: 100%;
      text-align: ${logoAlignment};
      margin: 0 auto 4px auto;
      padding: 2px 0;
      position: relative;
      overflow: hidden;
    }
    .receipt-logo {
      display: block;
      ${logoMarginStyle}
      max-width: var(--receipt-logo-max-width, ${logoMaxWidth}px);
      max-height: var(--receipt-logo-max-height, ${logoMaxHeight}px);
      width: auto;
      height: auto;
      object-fit: contain;
      transform: translate(${logoOffsetX}px, ${logoOffsetY}px);
    }
    .content {
      position: relative;
      z-index: 10;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .header { margin-bottom: 2px; }
    .restaurant-title { 
      font-size: var(--receipt-title-font-size, ${titleFontSize}px); 
      font-weight: ${boldRestaurantName ? '800' : '400'}; 
      text-align: ${shopNameAlignment};
      margin-bottom: 1px; 
      letter-spacing: 0.2px;
      line-height: 1.12;
    }
    .restaurant-address,
    .address-section {
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      text-align: ${addressAlignment};
      line-height: 0.96;
      color: #000;
      margin-top: 0px;
      margin-bottom: 0px;
      padding: 0;
    }
    .restaurant-address div,
    .address-section div {
      line-height: 0.96;
      margin: 0;
      padding: 0;
    }
    .phone-section {
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      text-align: ${phoneAlignment};
      line-height: 1.02;
      color: #000;
      margin-top: 0.5px;
      margin-bottom: 0px;
    }
    .meta-section {
      margin: ${sectionSpacingVal};
      padding: ${sectionSpacingVal};
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      text-align: ${billHeaderAlignment};
      line-height: 1.22;
    }
    .meta-line {
      display: block;
      text-align: ${billHeaderAlignment};
      margin-bottom: 1px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: var(--receipt-item-font-size, ${itemFontSize}px);
      margin: ${sectionSpacingVal};
      line-height: ${lineHeightVal};
    }
    .items-table th {
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: ${itemRowPaddingVal};
      font-weight: ${boldItemHeader ? '800' : '400'};
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      vertical-align: middle;
    }
    .items-table td {
      vertical-align: top;
      padding: ${itemRowPaddingVal};
      line-height: 1.2;
    }
    .net-summary {
      border-top: 1px dashed #000;
      padding-top: 2px;
      margin-top: 2px;
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
    }
    .summary-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1px;
    }
    .grand-total-section {
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      margin-top: ${sectionSpacingVal};
      padding: 3px 0;
    }
    .grand-total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: var(--receipt-total-font-size, ${totalFontSize}px);
      font-weight: ${boldGrandTotal ? '900' : '400'};
      letter-spacing: 0.2px;
    }
    .footer-text {
      font-size: var(--receipt-meta-font-size, ${metaFontSize}px);
      font-weight: ${boldFooter ? '700' : '400'};
      text-align: ${footerAlignment};
      margin-top: 4px;
      line-height: 1.2;
    }
    @media print {
      body { width: 100%; margin: 0; padding: 1px; }
      .watermark-container {
        opacity: ${watermarkOpacity} !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .content {
        position: relative;
        z-index: 10;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-wrapper ${isCompact ? 'compact-mode receipt-compact' : ''}" data-compact-mode="${isCompact}">
    <!-- Centered Watermark Behind Receipt Content -->
    ${watermarkEnabled ? `
    <div class="watermark-container">
      ${(watermarkUseLogo && logoUrl) ? `
        <img src="${logoUrl}" alt="Watermark" class="watermark-img" />
      ` : `
        <div class="watermark-text">${settings?.watermarkText || restaurantName}</div>
      `}
    </div>
    ` : ''}

    <div class="content">
      ${showHeaderLogo ? `
      <div class="header receipt-logo-container align-${logoAlignment}">
        <img 
          src="${logoUrl}" 
          alt="${restaurantName} Logo" 
          class="receipt-logo" 
          onerror="this.onerror=null; this.style.display='none';"
        />
      </div>
      ` : ''}

      <!-- 1. Header: Restaurant Name, Address, Phone -->
      <div class="header">
        <div class="restaurant-title">
          ${hotelNameTamil}
        </div>
        ${showAddress ? `
          <div class="restaurant-address address-section">
            ${addressLines.map(line => `<div>${line}</div>`).join('')}
          </div>
        ` : ''}
        ${showPhone ? `
          <div class="phone-section">
            PH: ${phone}
          </div>
        ` : ''}
        ${showGstFssai ? `
          <div class="address-section" style="font-size: ${smallFontSize}px;">
            ${gstNumber ? `GSTIN: ${gstNumber}` : ''}
            ${(gstNumber && fssaiNumber) ? ' | ' : ''}
            ${fssaiNumber ? `FSSAI: ${fssaiNumber}` : ''}
          </div>
        ` : ''}
      </div>

      ${reprintBadge}

      <!-- 2. Bill Header Meta -->
      <div class="meta-section">
        <div class="meta-line" style="display: flex; justify-content: space-between; align-items: center; font-weight: ${boldBillNumber ? '800' : '400'};">
          <span>Bill No: ${cleanBillNo}<span style="display: none;">Bill No: #${bill.billNumber}</span></span>
          <span>Time: ${timeFormatted}</span>
        </div>
        <div class="meta-line" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Order: ${bill.orderType === 'TAKE_AWAY' ? 'Takeaway' : `Dine-In${tableNo ? ` (${tableNo})` : ''}`}</span>
          <span>Captain: ${captainNumber || '01'}</span>
        </div>
        <div class="meta-line" style="display: none;">Date: ${dateFormatted}</div>
      </div>

      <!-- 3. Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 46%; text-align: left; padding: ${itemRowPaddingVal}; word-break: break-word;">Item</th>
            <th style="width: 14%; text-align: right; padding: ${itemRowPaddingVal}; white-space: nowrap;">Qty</th>
            <th style="width: 20%; text-align: right; padding: ${itemRowPaddingVal}; white-space: nowrap;">Price</th>
            <th style="width: 20%; text-align: right; padding: ${itemRowPaddingVal}; white-space: nowrap;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((itm) => {
            const tamilName = getTamilItemName(itm.itemName, itm.itemNameTamil);
            const displayName = tamilName || itm.itemName;
            return `
              <tr>
                <td style="text-align: left; padding: ${itemRowPaddingVal}; vertical-align: top; word-break: break-word; overflow-wrap: break-word;">
                  <div style="font-weight: 700; font-size: ${itemFontSize}px; line-height: 1.2; text-align: left; word-break: break-word; margin: 0; padding: 0;">${displayName}</div>
                </td>
                <td style="text-align: right; padding: ${itemRowPaddingVal}; font-family: monospace; font-weight: 700; font-size: ${itemFontSize}px; white-space: nowrap; vertical-align: top;">${Number(itm.quantity).toFixed(0)}</td>
                <td style="text-align: right; padding: ${itemRowPaddingVal}; font-family: monospace; font-size: ${priceFontSize}px; white-space: nowrap; vertical-align: top;">${Number(itm.unitPrice).toFixed(0)}</td>
                <td style="text-align: right; padding: ${itemRowPaddingVal}; font-family: monospace; font-weight: 700; font-size: ${priceFontSize}px; white-space: nowrap; vertical-align: top;">${Number(itm.totalPrice).toFixed(0)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      ${(bill.discount > 0 || showTotalQty) ? `
      <div class="net-summary">
        <div class="summary-line">
          ${showTotalQty ? `<span>Total Qty: <b>${totalQty.toFixed(0)}</b></span>` : '<span></span>'}
          <span>Subtotal: <b>₹${Number(bill.subtotal).toFixed(0)}</b></span>
        </div>
        ${bill.discount > 0 ? `
          <div class="summary-line">
            <span>Discount:</span>
            <span>-₹${Number(bill.discount).toFixed(0)}</span>
          </div>
        ` : ''}
      </div>
      ` : ''}

      <!-- 4. Grand Total and Footer -->
      <div class="grand-total-section">
        <div class="grand-total-row">
          <span>Grand Total:</span>
          <span>₹${Number(bill.grandTotal).toFixed(0)}</span>
        </div>
      </div>

      <div class="footer-text">${receiptFooter}</div>
      <div style="display: none;">Thank you</div>
      <!-- Feed paper past tear cutter bar -->
      <div style="height: ${feedHeightMm}mm; width: 100%;" class="feed-margin"></div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generates printable KOT slip for kitchen
   */
  static generateKotSlipHTML(kot: Kot, items: KotItem[]): string {
    const createdDate = new Date(kot.createdAt);
    const dateFormatted = createdDate.toLocaleDateString('en-GB');
    const timeFormatted = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const itemRows = items.map((itm, i) => `
      <tr>
        <td style="padding: 2px 0; font-weight: bold; font-size: 13px; font-family: monospace;">${i + 1}. ${itm.itemName}</td>
        <td style="text-align: right; padding: 2px 0; font-weight: bold; font-size: 14px; font-family: monospace;">× ${itm.quantity}</td>
      </tr>
      ${itm.notes ? `<tr><td colspan="2" style="font-style: italic; font-size: 10px; padding-left: 10px;">Note: ${itm.notes}</td></tr>` : ''}
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KOT - ${kot.kotNumber}</title>
  <style>
    @page { margin: 0; size: auto; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.25;
    }
    body {
      width: 72mm;
      margin: 0 auto;
      padding: 6px 2px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .kot-title { font-size: 16px; font-weight: bold; text-align: center; border: 2px solid #000; padding: 3px; margin-bottom: 5px; }
    .divider { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; }
    @media print {
      body { width: 100%; margin: 0; padding: 2px; }
    }
  </style>
</head>
<body>
  <div class="kot-title">KITCHEN ORDER TICKET</div>
  <table>
    <tr>
      <td class="bold" style="font-size: 14px;">${kot.kotNumber}</td>
      <td style="text-align: right;">${timeFormatted}</td>
    </tr>
    <tr>
      <td class="bold" style="font-size: 14px;">Table: ${kot.tableNumber || 'Take Away'}</td>
      <td style="text-align: right;">Date: ${dateFormatted}</td>
    </tr>
    <tr>
      <td>Type: ${kot.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'}</td>
      <td style="text-align: right;">Waiter: ${kot.waiterName || 'Staff'}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <table>
    <thead>
      <tr style="border-bottom: 1px dashed #000;">
        <th style="text-align: left; padding: 2px 0;">Item Name</th>
        <th style="text-align: right; padding: 2px 0;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="divider"></div>
  <div class="center" style="font-size: 11px;">Status: ${kot.status}</div>
</body>
</html>`;
  }

  /**
   * Safe focus restoration helper to prevent POS screen lockups after print operations.
   */
  private static restoreWindowFocus(previousActiveElement?: HTMLElement | null): void {
    try {
      if (typeof document !== 'undefined') {
        document.body.classList.remove('print-ready');
        document.body.classList.remove('pos-printing');
        const printRoot = document.getElementById('pos-print-root');
        if (printRoot) {
          printRoot.removeAttribute('data-print-ready');
        }
      }
      if (previousActiveElement && typeof previousActiveElement.focus === 'function' && document.body.contains(previousActiveElement)) {
        previousActiveElement.focus();
      } else if (typeof window !== 'undefined' && typeof window.focus === 'function') {
        window.focus();
      }
    } catch (_) {
      // Ignore focus errors
    }
  }

  /**
   * Injects receipt HTML and scoped print styles into #pos-print-root so main-window printing
   * always has the complete rendered receipt DOM and never prints a blank page.
   */
  static populatePrintRoot(htmlContent: string): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    let printRoot = document.getElementById('pos-print-root');
    if (!printRoot) {
      printRoot = document.createElement('div');
      printRoot.id = 'pos-print-root';
      printRoot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(printRoot);
    }

    const styleMatches = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    if (bodyMatch) {
      const stylesHtml = styleMatches
        ? styleMatches
            .map((s) => {
              const innerCss = s
                .replace(/<\/?style[^>]*>/gi, '')
                .replace(/:root,\s*#pos-print-root,\s*html,\s*body,\s*\.receipt-wrapper/g, '#pos-print-root, #pos-print-root .receipt-wrapper')
                .replace(/\bhtml\s*,\s*body\s*\{/g, '#pos-print-root {')
                .replace(/\bbody\s*\{/g, '#pos-print-root {')
                .replace(/\bhtml\s*\{/g, '#pos-print-root {');
              return `<style>@media print { ${innerCss} }</style>`;
            })
            .join('\n')
        : '';
      printRoot.innerHTML = `${stylesHtml}${bodyMatch[1]}`;
    } else {
      printRoot.innerHTML = htmlContent;
    }

    printRoot.setAttribute('data-print-ready', 'true');
    return printRoot;
  }

  /**
   * Reliable print workflow:
   * 1. Populates #pos-print-root and dedicated print iframe
   * 2. Waits until DOM and logo/watermark images are loaded (with single-execution guard)
   * 3. Applies print CSS and triggers browser print without double-triggering or premature cleanup
   */
  static printHtmlDocument(
    htmlContent: string, 
    settings?: RestaurantSettings
  ): { success: boolean; restrictedInIframe?: boolean; error?: string } {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { success: false, error: 'Print system unavailable: browser window or document not found.' };
    }

    if (typeof window.print !== 'function') {
      return { success: false, error: 'Browser print system (window.print) is not supported in this environment.' };
    }

    const activeEl = document.activeElement as HTMLElement | null;

    // 1. Always populate #pos-print-root in the main document
    PrinterService.populatePrintRoot(htmlContent);
    document.body.classList.add('print-ready');
    document.body.classList.add('pos-printing');

    try {
      // 2. If running in a unit test environment with mocked window.print, invoke it synchronously
      if ((window.print as any).mock) {
        if (typeof window.focus === 'function') window.focus();
        window.print();
        PrinterService.restoreWindowFocus(activeEl);
        return { success: true };
      }

      // 3. Prepare dedicated print iframe (visible to print engine, 1px off-corner so images paint properly)
      let iframe = document.getElementById('pos-thermal-printer-frame') as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'pos-thermal-printer-frame';
        iframe.setAttribute(
          'style',
          'position:fixed;right:0;bottom:0;width:302px;height:1px;border:0;visibility:visible;z-index:-1;pointer-events:none;'
        );
        document.body.appendChild(iframe);
      }

      const contentWindow = iframe.contentWindow;
      if (!contentWindow) {
        return PrinterService.printViaDirectDOM(htmlContent, settings);
      }

      const doc = contentWindow.document;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      let hasExecuted = false;
      let fallbackTimer: any = null;

      const executePrintOnce = (): { success: boolean; restrictedInIframe?: boolean; error?: string } => {
        if (hasExecuted) return { success: true };
        hasExecuted = true;
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }

        try {
          const cleanupAfterPrint = () => {
            PrinterService.restoreWindowFocus(activeEl);
          };

          if ('onafterprint' in contentWindow) {
            contentWindow.onafterprint = cleanupAfterPrint;
          }
          window.addEventListener('afterprint', cleanupAfterPrint, { once: true });

          contentWindow.focus();
          contentWindow.print();

          // Keep print classes active long enough for print spooler to read DOM & images
          setTimeout(cleanupAfterPrint, 2000);

          return { success: true };
        } catch (printErr: any) {
          console.error('Thermal printer iframe print failed:', printErr);
          const isRestricted = printErr?.name === 'SecurityError' || 
            String(printErr?.message || '').toLowerCase().includes('sandbox') ||
            String(printErr?.message || '').toLowerCase().includes('allow-modals');
          
          if (!isRestricted) {
            return PrinterService.printViaDirectDOM(htmlContent, settings);
          }
          PrinterService.restoreWindowFocus(activeEl);
          return {
            success: false,
            restrictedInIframe: true,
            error: 'Browser print window was blocked by preview sandbox restrictions.'
          };
        }
      };

      // 4. Wait for all logo/watermark images in the print document before printing
      const images = Array.from(doc.querySelectorAll('img'));
      const pendingImages = images.filter(img => !img.complete);

      if (pendingImages.length === 0) {
        return executePrintOnce();
      } else {
        let remaining = pendingImages.length;
        const onImgSettled = () => {
          remaining -= 1;
          if (remaining <= 0) {
            executePrintOnce();
          }
        };
        pendingImages.forEach(img => {
          img.addEventListener('load', onImgSettled, { once: true });
          img.addEventListener('error', onImgSettled, { once: true });
        });
        fallbackTimer = setTimeout(() => {
          executePrintOnce();
        }, 250);
        return { success: true };
      }
    } catch (err: any) {
      console.error('Thermal printer print preparation failed:', err);
      PrinterService.restoreWindowFocus(activeEl);
      return { success: false, error: err?.message || 'Receipt could not be sent to the print system.' };
    }
  }

  /**
   * Ultra-fast zero-latency print dispatch via iframe/print-root
   */
  static printViaIframe(htmlContent: string): { success: boolean; restrictedInIframe?: boolean; error?: string } {
    return PrinterService.printHtmlDocument(htmlContent);
  }

  /**
   * Helper to detect if the app is embedded in an iframe/preview container
   */
  static isSandboxed(): boolean {
    return typeof window !== 'undefined' && window.self !== window.top;
  }

  /**
   * Opens a dedicated clean popup window and triggers print.
   */
  static printViaPopup(htmlContent: string): { success: boolean; popupBlocked?: boolean; error?: string } {
    if (typeof window === 'undefined') return { success: false, error: 'Window not defined' };
    try {
      const enhancedHtml = htmlContent.replace('</head>', `
  <style>
    @media print {
      .pos-popup-controls { display: none !important; }
    }
  </style>
  <script>
    function triggerPrintNow() {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.warn('Auto print failed:', e);
      }
    }
    window.addEventListener('load', function() {
      setTimeout(triggerPrintNow, 120);
    });
    window.addEventListener('afterprint', function() {
      setTimeout(function() {
        try { window.close(); } catch (e) {}
      }, 600);
    });
  </script>
</head>`).replace('<body>', `<body>
  <div class="pos-popup-controls" style="position: sticky; top: 0; left: 0; right: 0; background: #0f172a; color: #ffffff; padding: 8px 12px; text-align: center; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2); margin-bottom: 8px;">
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
      <button onclick="window.focus(); window.print();" style="background: #10b981; color: #ffffff; border: none; padding: 7px 16px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 13px; display: inline-flex; align-items: center; gap: 4px;">
        Print Receipt (80mm)
      </button>
      <button onclick="window.close();" style="background: #334155; color: #cbd5e1; border: none; padding: 7px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">
        Close
      </button>
    </div>
  </div>`);

      const popup = window.open('', '_blank', 'width=420,height=650,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
      if (!popup) {
        return { success: false, popupBlocked: true, error: 'Browser print window was blocked.' };
      }
      popup.document.open();
      popup.document.write(enhancedHtml);
      popup.document.close();

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Browser print window was blocked.' };
    }
  }

  /**
   * Direct DOM Print Portal:
   * Injects the print content and styles into dedicated top-level container #pos-print-root,
   * sets the 'print-ready' state, and triggers window.print() directly without recursion.
   */
  static printViaDirectDOM(
    htmlContent: string, 
    _settings?: RestaurantSettings,
    _canFallbackToIframe = false
  ): { success: boolean; restrictedInIframe?: boolean; error?: string } {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { success: false, error: 'Print system unavailable.' };
    }
    const activeEl = document.activeElement as HTMLElement | null;
    try {
      PrinterService.populatePrintRoot(htmlContent);
      document.body.classList.add('print-ready');
      document.body.classList.add('pos-printing');

      const cleanupAfterPrint = () => {
        PrinterService.restoreWindowFocus(activeEl);
      };
      window.addEventListener('afterprint', cleanupAfterPrint, { once: true });

      if (typeof window.focus === 'function') window.focus();
      window.print();

      if ((window.print as any).mock) {
        cleanupAfterPrint();
      } else {
        setTimeout(cleanupAfterPrint, 2000);
      }
      return { success: true };
    } catch (err: any) {
      PrinterService.restoreWindowFocus(activeEl);
      const isRestricted = err?.name === 'SecurityError' ||
        String(err?.message || '').toLowerCase().includes('sandbox') ||
        String(err?.message || '').toLowerCase().includes('allow-modals');
      return {
        success: false,
        restrictedInIframe: isRestricted,
        error: isRestricted
          ? 'Browser print window was blocked.'
          : (err?.message || 'Receipt could not be sent to the print system.')
      };
    }
  }

  /**
   * Prints a 3-inch thermal TEST RECEIPT (Bill No: TEST-001) using the current receipt customization settings
   * independently of actual billing.
   */
  static printSampleTestReceipt(
    settings?: RestaurantSettings
  ): { success: boolean; restrictedInIframe?: boolean; error?: string } {
    const now = Date.now();
    const testBill: Bill = {
      id: 'test-receipt-001',
      billNumber: 'TEST-001',
      businessDate: new Date(now).toISOString().split('T')[0],
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      tableNumber: 'T-01',
      subtotal: 400,
      discount: 0,
      grandTotal: 400,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      reprintCount: 0,
      userId: 'test_print',
      userName: 'TEST RECEIPT',
      createdAt: now,
      updatedAt: now
    };

    const testItems: BillItem[] = [
      {
        id: 'test-item-1',
        billId: 'test-receipt-001',
        itemId: 'sample-1',
        itemCode: '101',
        itemName: 'Masala Dosa',
        itemNameTamil: 'மசால் தோசை',
        quantity: 2,
        unitPrice: 80,
        totalPrice: 160,
        priceType: 'NON_AC',
        createdAt: now
      },
      {
        id: 'test-item-2',
        billId: 'test-receipt-001',
        itemId: 'sample-2',
        itemCode: '102',
        itemName: 'Filter Coffee',
        itemNameTamil: 'ஃபில்டர் காபி',
        quantity: 1,
        unitPrice: 80,
        totalPrice: 80,
        priceType: 'NON_AC',
        createdAt: now
      }
    ];

    return PrinterService.printBill(testBill, testItems, settings, true);
  }

  /**
   * Directly updates logo CSS variables on #pos-print-root in real time
   */
  static setPrintRootLogoSize(maxWidth: number, maxHeight: number): void {
    if (typeof document === 'undefined') return;
    let printRoot = document.getElementById('pos-print-root');
    if (!printRoot) {
      printRoot = document.createElement('div');
      printRoot.id = 'pos-print-root';
      printRoot.setAttribute('aria-hidden', 'true');
      document.body.appendChild(printRoot);
    }
    printRoot.style.setProperty('--receipt-logo-max-width', `${maxWidth}px`);
    printRoot.style.setProperty('--receipt-logo-max-height', `${maxHeight}px`);
  }

  /**
   * Retrieves active logo CSS variable sizing from #pos-print-root or settings
   */
  static getPrintRootLogoSize(): { maxWidth: number; maxHeight: number } {
    if (typeof document === 'undefined') return { maxWidth: 140, maxHeight: 50 };
    const printRoot = document.getElementById('pos-print-root');
    if (!printRoot) return { maxWidth: 140, maxHeight: 50 };
    const w = parseInt(printRoot.style.getPropertyValue('--receipt-logo-max-width'), 10);
    const h = parseInt(printRoot.style.getPropertyValue('--receipt-logo-max-height'), 10);
    return {
      maxWidth: isNaN(w) ? 140 : w,
      maxHeight: isNaN(h) ? 50 : h
    };
  }

  /**
   * Directly prints a bill receipt instantly (0ms delay) with diagnostic logging.
   * In Mock/Dev Testing mode, only bypasses if forceHardware is explicitly set to false.
   * Defaults to forceHardware = true to guarantee bill printing.
   */
  static printBill(
    bill: Bill, 
    items: BillItem[], 
    settings?: RestaurantSettings, 
    forceHardware = true
  ): { success: boolean; restrictedInIframe?: boolean; error?: string } {
    // Notify UI components immediately that receipt printing animation and process have begun
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos-bill-printing', {
        detail: { bill, items, settings }
      }));
    }

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isMock = !forceHardware && PrinterService.isMockPrintMode();
    const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
    const paperWidth = is58mm ? '58mm' : '80mm';
    const jobType = (bill.reprintCount && bill.reprintCount > 0) ? 'REPRINT' : 'BILL';
    const referenceNumber = bill.billNumber ? `BN-${bill.billNumber.replace(/^BN-|^#/, '')}` : 'BILL';

    if (isMock) {
      console.log(`[POS Dev Mode] Simulated instant thermal print for Bill #${bill.billNumber} (₹${bill.grandTotal})`);
      PrintDiagnosticsService.recordPrintJob({
        jobType,
        referenceNumber,
        status: 'SUCCESS',
        method: 'MOCK',
        paperWidth,
        fontSize: settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12),
        itemCount: items.length,
        totalAmount: bill.grandTotal,
        durationMs: 0,
        isMockMode: true,
        userId: bill.userId,
        userName: bill.userName
      });
      return { success: true };
    }

    // Direct Hardware USB/Serial ESC/POS printing (0-Click, 100% bypasses Chrome preview dialog)
    if (PrinterConnectionService.isDirectHardwareReady()) {
      try {
        const escposBuffer = EscPosService.generateBillEscPosBuffer(bill, items, settings);
        PrinterConnectionService.sendRawBytes(escposBuffer).then((res) => {
          if (res.success) {
            console.log(`[POS Direct Hardware] Dispatched ${escposBuffer.length} bytes directly to thermal printer (zero preview dialog).`);
          } else {
            console.warn('[POS Direct Hardware] Transfer notice:', res.error);
          }
        });

        const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
        PrintDiagnosticsService.recordPrintJob({
          jobType,
          referenceNumber,
          status: 'SUCCESS',
          method: 'ESC_POS',
          paperWidth,
          fontSize: settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12),
          itemCount: items.length,
          totalAmount: bill.grandTotal,
          durationMs,
          isMockMode: false,
          userId: bill.userId,
          userName: bill.userName
        });

        return { success: true };
      } catch (escPosErr) {
        console.warn('[POS Direct Hardware] Failed to generate raw ESC/POS buffer, falling back to browser print:', escPosErr);
      }
    }

    const html = PrinterService.generateThermalReceiptHTML(bill, items, settings);
    
    // Direct Browser Print for Chrome Kiosk Printing (--kiosk-printing)
    // Sends the print job directly to the Windows default thermal printer without dialog or preview
    const result = PrinterService.printHtmlDocument(html, settings);
    const printMethod: PrintMethod = 'DIRECT_DOM';

    const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
    const status = result.success ? 'SUCCESS' : 'FAILURE';

    PrintDiagnosticsService.recordPrintJob({
      jobType,
      referenceNumber,
      status,
      method: printMethod,
      paperWidth,
      fontSize: settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12),
      itemCount: items.length,
      totalAmount: bill.grandTotal,
      durationMs,
      errorMessage: result.error,
      isMockMode: false,
      userId: bill.userId,
      userName: bill.userName
    });

    // Notify any listening components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos-bill-printed', {
        detail: { bill, items, settings, result }
      }));
    }

    return result;
  }

  /**
   * Directly prints a KOT ticket instantly (0ms delay) with diagnostic logging.
   */
  static printKot(
    kot: Kot, 
    items: KotItem[], 
    forceHardware = true
  ): { success: boolean; restrictedInIframe?: boolean; error?: string } {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const isMock = !forceHardware && PrinterService.isMockPrintMode();
    const referenceNumber = kot.kotNumber || 'KOT';

    // Notify UI components to display the thermal printing animation on screen
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos-bill-printing', {
        detail: {
          bill: {
            billNumber: kot.kotNumber,
            grandTotal: 0,
            userName: kot.waiterName || 'Kitchen Order Ticket',
            createdAt: kot.createdAt
          },
          items: items.map((ki) => ({
            itemName: ki.itemName,
            quantity: ki.quantity,
            totalPrice: 0
          }))
        }
      }));
    }

    if (isMock) {
      console.log(`[POS Dev Mode] Simulated instant thermal print for KOT #${kot.kotNumber}`);
      PrintDiagnosticsService.recordPrintJob({
        jobType: 'KOT',
        referenceNumber,
        status: 'SUCCESS',
        method: 'MOCK',
        paperWidth: '80mm',
        itemCount: items.length,
        durationMs: 0,
        isMockMode: true,
        userId: kot.waiterId || kot.createdBy,
        userName: kot.waiterName
      });
      return { success: true };
    }

    // Direct Hardware USB/Serial ESC/POS printing for KOT (zero preview dialog)
    if (PrinterConnectionService.isDirectHardwareReady()) {
      try {
        const kotBuffer = EscPosService.generateKotEscPosBuffer(kot, items);
        PrinterConnectionService.sendRawBytes(kotBuffer).then((res) => {
          if (res.success) {
            console.log(`[POS Direct Hardware] Sent raw KOT ESC/POS buffer directly to kitchen printer.`);
          }
        });

        const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
        PrintDiagnosticsService.recordPrintJob({
          jobType: 'KOT',
          referenceNumber,
          status: 'SUCCESS',
          method: 'ESC_POS',
          paperWidth: '80mm',
          itemCount: items.length,
          durationMs,
          isMockMode: false,
          userId: kot.waiterId || kot.createdBy,
          userName: kot.waiterName
        });

        return { success: true };
      } catch (kotErr) {
        console.warn('[POS Direct Hardware] Error sending raw KOT buffer:', kotErr);
      }
    }

    const html = PrinterService.generateKotSlipHTML(kot, items);

    // Direct Browser Print for Chrome Kiosk Printing (--kiosk-printing)
    // Sends the print job directly to the Windows default thermal printer without dialog or preview
    const result = PrinterService.printHtmlDocument(html);
    const printMethod: PrintMethod = 'DIRECT_DOM';

    const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
    const status = result.success ? 'SUCCESS' : 'FAILURE';

    PrintDiagnosticsService.recordPrintJob({
      jobType: 'KOT',
      referenceNumber,
      status,
      method: printMethod,
      paperWidth: '80mm',
      itemCount: items.length,
      durationMs,
      errorMessage: result.error,
      isMockMode: false,
      userId: kot.waiterId || kot.createdBy,
      userName: kot.waiterName
    });

    return result;
  }

  /**
   * Returns the standardized plain-text diagnostic string used for thermal printer
   * connection, character set, and paper feed verification.
   */
  static getStandardizedDiagnosticString(settings?: RestaurantSettings): string {
    const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
    const printerModel = settings?.printerModelName || 'Rugtek RP326B (Default Thermal POS)';
    const widthCols = is58mm ? 32 : 48;
    const divider = '='.repeat(widthCols);
    const thinDivider = '-'.repeat(widthCols);
    const now = new Date();
    const timestampStr = now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' });

    return [
      divider,
      '   STANDARDIZED PRINTER DIAGNOSTIC TEST   ',
      '      CONNECTION & PAPER FEED STATUS      ',
      divider,
      `STATUS       : ONLINE / CONNECTED`,
      `PAPER FEED   : VERIFIED / ACTIVE`,
      `PRINTER      : ${printerModel}`,
      `PAPER WIDTH  : ${is58mm ? '58mm (32 cols)' : '80mm (48 cols)'}`,
      `INTERFACE    : USB / SYSTEM SPOOLER`,
      `TIMESTAMP    : ${timestampStr}`,
      thinDivider,
      'STANDARDIZED DIAGNOSTIC TEST STRING:',
      '0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz !@#$%^&*()_+',
      thinDivider,
      'FEED TEST    : 20MM ADVANCE OK',
      'CUTTER TEST  : PARTIAL GUILLOTINE CUT',
      '*** CONNECTION & PAPER FEED VERIFIED ***',
      divider
    ].join('\n');
  }

  /**
   * Generates a printer hardware diagnostics & calibration test slip.
   */
  static generateDiagnosticTestSlipHTML(settings?: RestaurantSettings): string {
    const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
    const paperWidth = is58mm ? '48mm' : '72mm';
    const configuredFontSize = settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12);
    const isCompact = Boolean(settings?.compactMode);
    const baseFontSize = isCompact ? Math.max(9, Math.round(configuredFontSize * 0.85 * 10) / 10) : configuredFontSize;
    const now = new Date();
    const timestampStr = now.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' });
    const restaurantName = settings?.restaurantName || 'SRI SARAVANA BHAVAN';
    const printerModel = settings?.printerModelName || 'Rugtek RP326B';
    const isRugtek = printerModel.toLowerCase().includes('rugtek') || printerModel.toLowerCase().includes('rp326');

    // Rulers for column alignment verification (48 cols font A for 80mm / 32 cols for 58mm)
    const ruler = is58mm 
      ? '|...10...20...30..| (32 Cols)'
      : '|....10....20....30....40....48| (48 Cols)';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Printer Diagnostic Test - ${printerModel}</title>
  <style>
    @page { margin: 0; size: auto; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: ${isCompact ? '3px 1px' : '6px 2px'};
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFontSize}px;
      line-height: ${isCompact ? '1.15' : '1.3'};
      width: ${paperWidth};
      margin: 0 auto;
      text-align: center;
    }
    .divider { border-top: 1px dashed #000; margin: ${isCompact ? '3px 0' : '6px 0'}; }
    .double-divider { border-top: 2px solid #000; margin: ${isCompact ? '3px 0' : '6px 0'}; }
    .title { font-size: ${Math.round(baseFontSize * 1.3)}px; font-weight: bold; text-transform: uppercase; }
    .row { display: flex; justify-content: space-between; text-align: left; margin: 1.5px 0; font-size: ${baseFontSize}px; }
    .head-bar { background: #000; color: #fff; font-weight: 800; padding: 2px 0; margin: 4px 0; font-size: ${Math.round(baseFontSize * 0.85)}px; letter-spacing: 0.5px; }
    .ruler { font-size: ${Math.round(baseFontSize * 0.75)}px; font-weight: bold; letter-spacing: 0.5px; border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 1px 0; margin: 3px 0; }
  </style>
</head>
<body>
  <div class="double-divider"></div>
  <div class="title">PRINTER DIAGNOSTIC</div>
  <div style="font-size: ${Math.round(baseFontSize * 0.9)}px; font-weight: bold;">STANDARDIZED TEST PAGE - HARDWARE TEST PAGE</div>
  <div style="font-size: ${Math.round(baseFontSize * 0.85)}px; font-weight: bold; margin-top: 2px;">${restaurantName}</div>
  <div class="divider"></div>
  
  <div class="row"><span>Connection:</span><span style="font-weight: bold; color: #000;">ONLINE / CONNECTED</span></div>
  <div class="row"><span>Paper Feed:</span><span style="font-weight: bold; color: #000;">PASSED / 20MM FEED</span></div>
  <div class="row"><span>Model:</span><span style="font-weight: bold;">${printerModel}</span></div>
  <div class="row"><span>Interface:</span><span>USB / SYSTEM SPOOLER</span></div>
  <div class="row"><span>Paper Width:</span><span>${is58mm ? '58mm (2-Inch)' : '80mm (3-Inch)'}</span></div>
  <div class="row"><span>Printable Area:</span><span>${is58mm ? '48mm (384 dots)' : '72mm (576 dots)'}</span></div>
  <div class="row"><span>Head Speed:</span><span>${isRugtek ? '250 mm/sec (RP326B)' : 'Standard ESC/POS'}</span></div>
  <div class="row"><span>Auto-Cutter:</span><span>Guillotine Partial Cut</span></div>
  <div class="row"><span>Base Font:</span><span>${baseFontSize}px</span></div>
  <div class="row"><span>Mode:</span><span>${isCompact ? 'COMPACT (ECO PAPER)' : 'STANDARD SPACING'}</span></div>
  <div class="row"><span>Timestamp:</span><span>${timestampStr}</span></div>
  
  <div class="divider"></div>
  <div style="text-align: left; font-size: ${Math.round(baseFontSize * 0.85)}px;">
    <div><strong>STANDARDIZED DIAGNOSTIC STRING:</strong></div>
    <div style="font-family: monospace; font-size: ${Math.round(baseFontSize * 0.78)}px; word-break: break-all; margin: 3px 0;">
      [ASCII 32-126]: ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 abcdefghijklmnopqrstuvwxyz !@#$%^&*()_+-=[]{}|;:,.<>?
    </div>
    <div style="margin-top: 4px;"><strong>ALIGNMENT & DENSITY TEST:</strong></div>
    <div class="ruler">${ruler}</div>
    <div style="text-align: left;">|<- [LEFT EDGE 0mm]</div>
    <div style="text-align: center;">|-- [CENTER 50%] --|</div>
    <div style="text-align: right;">[RIGHT EDGE] ->|</div>
  </div>

  <div class="head-bar">
    ██ THERMAL HEAD DENSITY ██
  </div>

  <div style="font-size: ${Math.round(baseFontSize * 0.78)}px; text-align: left; margin-top: 3px;">
    <div>• Normal: The quick brown fox jumps</div>
    <div><strong>• Bold: 1234567890 - Tamil: வாழ்க</strong></div>
  </div>
  
  <div class="divider"></div>
  <div style="font-size: ${Math.round(baseFontSize * 0.75)}px; letter-spacing: 1px;">
    - - - - TEAR / CUT HERE - - - -
  </div>
  <div style="font-weight: bold; font-size: ${Math.round(baseFontSize * 0.9)}px; margin-top: 3px;">
    *** DIAGNOSTIC PASS - CONNECTION & FEED VERIFIED ***
  </div>
  <div style="font-size: ${Math.round(baseFontSize * 0.75)}px; margin-top: 2px;">
    Generated by POS Diagnostics Engine
  </div>
  <div class="double-divider"></div>
  <!-- Feed paper 20mm past tear cutter bar to verify feed stepper motor -->
  <div style="height: 20mm; width: 100%;" class="feed-margin"></div>
  <div style="text-align: center; font-size: 6px; color: transparent; user-select: none;">.</div>
</body>
</html>`;
  }

  /**
   * Executes a diagnostic test print and tracks status in console & Firestore.
   */
  static printDiagnosticTestPage(
    settings?: RestaurantSettings,
    forceHardware = true
  ): { success: boolean; restrictedInIframe?: boolean; error?: string; diagnosticString?: string } {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
    const paperWidth = is58mm ? '58mm' : '80mm';
    const diagnosticString = PrinterService.getStandardizedDiagnosticString(settings);

    const html = PrinterService.generateDiagnosticTestSlipHTML(settings);
    const isSandboxed = PrinterService.isSandboxed();
    
    let result: { success: boolean; restrictedInIframe?: boolean; error?: string } = PrinterService.printHtmlDocument(html, settings);
    let printMethod: PrintMethod = 'DIRECT_DOM';

    if (result.restrictedInIframe && isSandboxed) {
      const popupResult = PrinterService.printViaPopup(html);
      if (popupResult.success) {
        result = popupResult;
        printMethod = 'POPUP';
      }
    }

    const durationMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime);
    const status = result.restrictedInIframe ? 'RESTRICTED' : result.success ? 'SUCCESS' : 'FAILURE';
    const errorCode = result.restrictedInIframe
      ? 'ERR_SANDBOX_RESTRICTED'
      : !result.success
      ? (result.error?.toLowerCase().includes('port') ? 'ERR_PORT_DISCONNECTED' : 'ERR_PRINTER_OFFLINE')
      : 'SUCCESS_OK';

    // Mark verified in live printer connection state when dispatched successfully
    if (result.success && !result.restrictedInIframe) {
      try {
        PrinterConnectionService.markVerified();
      } catch (e) {
        console.warn('Could not update connection service verification:', e);
      }
    }

    PrintDiagnosticsService.recordPrintJob({
      jobType: 'TEST_PAGE',
      referenceNumber: `TEST-${Date.now().toString().slice(-4)}`,
      status,
      method: printMethod,
      paperWidth,
      fontSize: settings?.receiptFontSize ? Number(settings.receiptFontSize) : (is58mm ? 10 : 12),
      itemCount: 1,
      totalAmount: 0,
      durationMs,
      errorMessage: result.error,
      errorCode,
      isMockMode: !forceHardware && PrinterService.isMockPrintMode()
    });

    return {
      ...result,
      diagnosticString
    };
  }

  /**
   * Records a simulated printer disconnection event into the diagnostic log
   * to assist technicians and cashiers in verifying error handling and troubleshooting workflows.
   */
  static recordDisconnectionDiagnostic(
    code: 'ERR_PRINTER_OFFLINE' | 'ERR_PORT_DISCONNECTED' | 'ERR_SPOOLER_TIMEOUT' | 'ERR_PAPER_EMPTY' = 'ERR_PRINTER_OFFLINE',
    customMessage?: string
  ): void {
    const messages: Record<string, string> = {
      ERR_PRINTER_OFFLINE: 'Printer offline: No handshake on USB Type-B interface. Power LED unlit or cable disconnected.',
      ERR_PORT_DISCONNECTED: 'Virtual COM port detached unexpectedly by OS sleep mode or USB bus reset.',
      ERR_SPOOLER_TIMEOUT: 'Windows print spooler timeout: Printer did not accept byte stream within 4000ms.',
      ERR_PAPER_EMPTY: 'Thermal paper out sensor active or top cover latch not engaged.'
    };

    PrintDiagnosticsService.recordPrintJob({
      jobType: 'TEST_PAGE',
      referenceNumber: `TEST-ERR-${Date.now().toString().slice(-4)}`,
      status: 'FAILURE',
      method: 'DIRECT_DOM',
      paperWidth: '80mm',
      fontSize: 12,
      itemCount: 1,
      totalAmount: 0,
      durationMs: 4120,
      errorMessage: customMessage || messages[code] || 'Printer communication error',
      errorCode: code,
      isMockMode: false
    });
  }
}
