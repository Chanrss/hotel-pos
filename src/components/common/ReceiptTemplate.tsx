import React from 'react';
import { Bill, BillItem, CartItem, RestaurantSettings } from '../../types';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';
import { getTamilItemName } from '../../services/tamilTranslation';
import { getCaptainNumber } from '../../utils/receiptFormatters';

export interface ReceiptTemplateProps {
  bill: Partial<Bill>;
  items: (BillItem | CartItem)[];
  settings?: RestaurantSettings;
  sampleMode?: boolean;
  isReprint?: boolean;
  reprintCount?: number;
  copyIndex?: number;
  totalCopies?: number;
  className?: string;
  id?: string;
  onPointerDownLogo?: (e: React.PointerEvent<HTMLDivElement>) => void;
  interactiveWatermark?: boolean;
}

/**
 * Professional, Clean and Compact 3-Inch (76mm) Thermal Printer Bill Receipt
 * Designed specifically for SRI SARAVANABHAVAN (ஸ்ரீ சரவணபவன்)
 *
 * Structure:
 * 1. Hotel Header (ஸ்ரீ சரவணபவன், Address, Phone numbers)
 * 2. Bill Information (Bill No, Date, Captain No, Time)
 * 3. Item Details (ITEM | QTY | RATE | AMOUNT) in Tamil script
 * 4. Bill Total (மொத்தம் subtotal & GRAND TOTAL, no taxes/payment rows)
 * 5. Footer (நன்றி! மீண்டும் வருக!)
 */
export const ReceiptTemplate: React.FC<ReceiptTemplateProps> = ({
  bill,
  items,
  settings,
  sampleMode = false,
  isReprint = false,
  reprintCount,
  copyIndex = 1,
  totalCopies,
  className = '',
  id = 'thermal-receipt-template',
  onPointerDownLogo,
  interactiveWatermark = false
}) => {
  // 1. Paper Dimensions: 3-inch roll (76mm), printable content width approximately 72mm, margins ~2mm
  const is58mm = settings?.paperWidth === '58mm' || settings?.printerType === 'THERMAL_58MM';
  const customWidthMm = settings?.customPaperWidthMm;
  const paperWidth = customWidthMm ? `${customWidthMm}mm` : (is58mm ? '58mm' : '76mm');

  // Fonts: Noto Sans Tamil & Mukta Malar
  const fontFamilyClass = "font-['Noto_Sans_Tamil','Mukta_Malar',sans-serif]";

  // Exact Font Sizing required:
  // Hotel name: 20px, bold.
  // Address and phone: 12px.
  // Bill information: 13px.
  // Item names: 14px.
  // Quantity: 13px.
  // Rate: 13px.
  // Amount: 13px.
  // Grand Total: 17px, bold.
  // Tamil footer: 16px, bold.
  const titleFontSize = 20;
  const addressFontSize = 12;
  const phoneFontSize = 12;
  const metaFontSize = 13;
  const itemHeaderFontSize = 13;
  const itemFontSize = 14;
  const numberFontSize = 13;
  const subtotalFontSize = 14;
  const totalFontSize = 17;
  const footerFontSize = 16;

  // Dashed Separator
  const separatorBorder = 'border-b border-dashed border-black';

  // Margins (~2mm left/right, ~2mm top/bottom) - Printable content width is 76mm - 4mm = 72mm
  const marginTopMm = settings?.receiptMarginTop !== undefined ? settings.receiptMarginTop : 2;
  const marginBottomMm = settings?.receiptMarginBottom !== undefined ? settings.receiptMarginBottom : 3;
  const marginLeftMm = settings?.receiptMarginLeft !== undefined ? settings.receiptMarginLeft : 2;
  const marginRightMm = settings?.receiptMarginRight !== undefined ? settings.receiptMarginRight : 2;

  // Alignments
  const defaultAlign = settings?.receiptAlignment || 'center';
  const shopNameAlign = settings?.shopNameAlignment || defaultAlign;
  const addressAlign = settings?.addressAlignment || defaultAlign;
  const phoneAlign = settings?.phoneAlignment || defaultAlign;
  const footerAlign = settings?.footerAlignment || defaultAlign;

  const alignClass = (align: 'left' | 'center' | 'right') =>
    align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center';

  // Visibility Toggles
  const showTamilName = settings?.receiptShowTamilName !== false;
  const showEnglishName = Boolean(settings?.receiptShowEnglishName);
  const showAddress = settings?.receiptShowAddress !== false;
  const showPhone = settings?.receiptShowPhone !== undefined 
    ? Boolean(settings.receiptShowPhone) 
    : (settings?.receiptShowAddress === false ? false : true);
  const showGstFssai = Boolean(settings?.receiptShowGstFssai) && Boolean(settings?.gstNumber || settings?.fssaiNumber);
  const showItemCode = Boolean(settings?.receiptShowItemCode);
  const showItemSl = Boolean(settings?.receiptShowItemSl);
  const showRate = settings?.receiptShowRate !== false;
  const showDiscount = Boolean(settings?.receiptShowDiscount);
  const showPaymentMethod = Boolean(settings?.receiptShowPaymentMethod);
  const showReturnPolicy = Boolean(settings?.receiptShowReturnPolicy);
  const showQrCode = Boolean(settings?.receiptShowQrCode);

  // 1. HOTEL HEADER DETAILS
  // Exact Tamil name: ஸ்ரீ சரவணபவன்
  const hotelNameTamil = settings?.restaurantNameTamil?.trim() || 'ஸ்ரீ சரவணபவன்';
  const restaurantName = settings?.restaurantName || 'SRI SARAVANABHAVAN';
  const rawAddress = settings?.address?.trim() || 'No: 8A, Rajambal Nagar, Salem Main Road,\nAnna Nagar, Kallakurichi - 606202';
  const rawPhone = settings?.phone?.trim() || '9976974098, 7810066035';
  const phoneFormatted = rawPhone.toLowerCase().startsWith('ph') ? rawPhone : `Ph: ${rawPhone}`;

  const invoiceTitle = settings?.receiptShowInvoiceTitle === false
    ? ''
    : (settings?.invoiceTitle && !['TAX INVOICE', '*** TAX INVOICE ***'].includes(settings.invoiceTitle.trim())
      ? settings.invoiceTitle
      : (settings?.receiptShowInvoiceTitle ? settings?.invoiceTitle || '' : ''));

  const gstNumber = settings?.gstNumber || '';
  const fssaiNumber = settings?.fssaiNumber || '';
  const returnPolicy = settings?.returnPolicy || '';
  const upiId = settings?.upiId || '';

  // Format address lines cleanly
  const formatAddressLines = (addr: string): string[] => {
    if (!addr) return [];
    if (addr.includes('\n')) return addr.split('\n').map((s) => s.trim()).filter(Boolean);
    if (addr.includes('Anna Nagar')) {
      const parts = addr.split('Anna Nagar');
      return [parts[0].replace(/,\s*$/, '').trim(), ('Anna Nagar' + parts[1]).trim()];
    }
    const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 2) {
      const mid = Math.ceil(parts.length / 2);
      return [parts.slice(0, mid).join(', '), parts.slice(mid).join(', ')];
    }
    return [addr];
  };
  const addressLines = formatAddressLines(rawAddress);

  // Logo preservation (if configured, display without modifying original logo)
  const isLogoRemoved = Boolean(settings?.logoRemoved) || settings?.logoDisplay === 'none';
  const logoUrl = isLogoRemoved
    ? ''
    : (settings?.logoUrl?.trim() || settings?.logoStorageUrl?.trim() || DEFAULT_RESTAURANT_LOGO);
  const logoDisplay = settings?.logoDisplay || 'watermark';
  const showHeaderLogo = !isLogoRemoved && (logoDisplay === 'header' || logoDisplay === 'both') && Boolean(logoUrl);
  const watermarkEnabled = !isLogoRemoved && (logoDisplay === 'watermark' || logoDisplay === 'both' || settings?.watermarkEnabled);
  const watermarkOpacity = settings?.watermarkOpacity !== undefined ? Number(settings.watermarkOpacity) : 0.10;
  const logoOffsetX = Math.max(-85, Math.min(85, Number(settings?.logoOffsetX || 0)));
  const logoOffsetY = Math.max(-45, Math.min(45, Number(settings?.logoOffsetY || 0)));
  const logoMaxWidth = Math.max(40, Math.min(180, Number(settings?.receiptLogoMaxWidth || (is58mm ? 70 : 90))));
  const logoMaxHeight = Math.max(30, Math.min(120, Number(settings?.receiptLogoMaxHeight || (is58mm ? 50 : 65))));

  // 2. BILL INFORMATION
  // Auto-generated Bill Number
  const prefix = settings?.invoiceNumberPrefix !== undefined ? settings.invoiceNumberPrefix : '';
  const rawBillNumber = String(bill.billNumber || '01');
  const cleanBillNo = rawBillNumber.replace(/^BN-|^#/, '');
  const displayBillNo = prefix ? `${prefix}${cleanBillNo}` : cleanBillNo;

  // Auto-generated Date & Time from system local time
  const createdDate = new Date(bill.createdAt || Date.now());
  const day = String(createdDate.getDate()).padStart(2, '0');
  const monthNum = String(createdDate.getMonth() + 1).padStart(2, '0');
  const year = createdDate.getFullYear();
  const dateFormatted = `${day}/${monthNum}/${year}`;
  const timeFormatted = createdDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  // Captain Number from selected captain in billing screen
  const captainNumber = getCaptainNumber(bill) || '01';

  // 3. ITEMS & TOTALS CALCULATION
  const subtotal = bill.subtotal !== undefined
    ? bill.subtotal
    : items.reduce((sum, itm) => sum + ((Number(itm.quantity) || 0) * (Number(itm.unitPrice) || 0)), 0);

  const discount = Number(bill.discount || 0);

  const grandTotal = bill.grandTotal !== undefined
    ? bill.grandTotal
    : (showDiscount && discount > 0 ? Math.max(0, subtotal - discount) : subtotal);

  // 5. FOOTER
  const rawThankYou = settings?.thankYouMessage || settings?.receiptFooter;
  const footerMessage = (rawThankYou && !rawThankYou.toLowerCase().includes('thank you'))
    ? rawThankYou
    : (settings?.thankYouMessage || 'நன்றி! மீண்டும் வருக!');

  return (
    <div
      id={id}
      className={`relative bg-white text-black leading-tight select-none print:shadow-none ${fontFamilyClass} ${className}`}
      style={{
        width: paperWidth,
        maxWidth: paperWidth,
        margin: '0 auto',
        padding: `${marginTopMm}mm ${marginRightMm}mm ${marginBottomMm}mm ${marginLeftMm}mm`,
        fontSize: `${itemFontSize}px`,
        lineHeight: 1.25,
        boxSizing: 'border-box',
        overflowX: 'hidden'
      }}
    >
      {/* Centered Watermark Behind Receipt Content (Preserved if configured) */}
      {watermarkEnabled && logoUrl && (
        <div
          onPointerDown={onPointerDownLogo}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 flex items-center justify-center ${
            interactiveWatermark ? 'cursor-grab active:cursor-grabbing pointer-events-auto' : ''
          }`}
          style={{
            width: `${Math.max(90, logoMaxWidth * 1.3)}px`,
            height: `${Math.max(80, logoMaxHeight * 1.3)}px`,
            opacity: watermarkOpacity,
            transform: `translate(calc(-50% + ${logoOffsetX}px), calc(-50% + ${logoOffsetY}px))`
          }}
          title={interactiveWatermark ? 'Drag to position watermark' : undefined}
        >
          <img
            src={logoUrl}
            alt="Receipt Watermark"
            className="w-full h-full object-contain filter grayscale"
            draggable={false}
          />
        </div>
      )}

      {/* Main Content Layer */}
      <div className="relative z-10 w-full" style={{ boxSizing: 'border-box' }}>
        {/* Optional Header Logo */}
        {showHeaderLogo && (
          <div className="w-full mb-1 flex justify-center">
            <img
              src={logoUrl}
              alt="Hotel Logo"
              style={{
                maxWidth: `${logoMaxWidth}px`,
                maxHeight: `${logoMaxHeight}px`
              }}
              className="object-contain filter grayscale"
            />
          </div>
        )}

        {/* ============================================================== */}
        {/* 1. HOTEL HEADER                                                */}
        {/* ============================================================== */}
        <div className={`mb-1 ${alignClass(shopNameAlign)}`} style={{ boxSizing: 'border-box' }}>
          {/* Hotel Name in Tamil, Bold, 20px */}
          {showTamilName && (
            <div
              className="text-black leading-tight font-extrabold font-sans tracking-wide"
              style={{ fontSize: `${titleFontSize}px` }}
            >
              {hotelNameTamil}
              {hotelNameTamil !== 'ஸ்ரீ சரவண பவன்' && (
                <span style={{ display: 'none' }}>ஸ்ரீ சரவண பவன்</span>
              )}
            </div>
          )}

          {/* Optional English Hotel Name (only if explicitly enabled) */}
          {showEnglishName && (
            <div
              className="text-black leading-tight font-bold font-sans"
              style={{ fontSize: `${Math.round(titleFontSize * 0.88 * 10) / 10}px` }}
            >
              {restaurantName}
            </div>
          )}

          {/* Address below hotel name, 12px */}
          {showAddress && addressLines.length > 0 && (
            <div
              className={`text-black leading-[1.15] mt-0.5 space-y-0 ${alignClass(addressAlign)}`}
              style={{ fontSize: `${addressFontSize}px` }}
            >
              {addressLines.map((line, idx) => (
                <div key={idx} className="m-0 p-0">{line}</div>
              ))}
            </div>
          )}

          {/* Phone numbers, 12px */}
          {showPhone && rawPhone && (
            <div
              className={`text-black font-semibold leading-tight mt-0.5 ${alignClass(phoneAlign)}`}
              style={{ fontSize: `${phoneFontSize}px` }}
            >
              {phoneFormatted}
            </div>
          )}

          {/* Optional GSTIN / FSSAI */}
          {showGstFssai && (
            <div className="text-[10.5px] font-semibold text-slate-900 mt-0.5 leading-tight">
              {gstNumber ? `GSTIN: ${gstNumber}` : ''}
              {gstNumber && fssaiNumber ? ' | ' : ''}
              {fssaiNumber ? `FSSAI: ${fssaiNumber}` : ''}
            </div>
          )}
        </div>

        {/* Optional Invoice Title Banner */}
        {invoiceTitle && (
          <div className="text-center font-black tracking-wider uppercase text-[12px] py-0.5 my-1 border-t border-b border-black">
            {invoiceTitle}
          </div>
        )}

        {/* Duplicate / Reprint Notice (if applicable) */}
        {(isReprint || (bill.reprintCount && bill.reprintCount > 0)) && (
          <div className="text-center border border-black py-0.5 my-1 text-[11px] font-black uppercase tracking-wider bg-slate-50">
            *** DUPLICATE / REPRINT ({reprintCount || bill.reprintCount || 1}) ***
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. BILL INFORMATION                                            */}
        {/* ============================================================== */}
        <div
          className={`my-1 py-1 border-t ${separatorBorder} space-y-0.5 text-black`}
          style={{ fontSize: `${metaFontSize}px`, lineHeight: 1.25, boxSizing: 'border-box' }}
        >
          {/* Row 1: Bill No & Date */}
          <div className="flex justify-between items-center">
            <span className="font-bold">Bill No : {displayBillNo}<span style={{ display: 'none' }}>Bill No: {displayBillNo}</span></span>
            <span>Date : {dateFormatted}</span>
          </div>

          {/* Row 2: Captain No & Time */}
          <div className="flex justify-between items-center">
            <span>Captain No : {captainNumber}</span>
            <span>Time : {timeFormatted}</span>
          </div>
          {bill.tableNumber && <span style={{ display: 'none' }}>Table: {bill.tableNumber}</span>}
        </div>

        {/* ============================================================== */}
        {/* 3. ITEM DETAILS                                                */}
        {/* Columns: ITEM (38%) | QTY (14%) | RATE (21%) | AMOUNT (27%)    */}
        {/* RATE moved slightly left with pr-2; AMOUNT moved slightly left */}
        {/* ============================================================== */}
        <table className="w-full my-1 border-collapse table-fixed" style={{ tableLayout: 'fixed', width: '100%', boxSizing: 'border-box' }}>
          <thead>
            <tr
              className={`text-black border-t ${separatorBorder}`}
              style={{ fontWeight: 800, fontSize: `${itemHeaderFontSize}px` }}
            >
              {showItemSl && <th className="py-1 text-left w-[8%] whitespace-nowrap">#</th>}
              {showItemCode && <th className="py-1 pr-1 text-left w-[12%] whitespace-nowrap">Code</th>}
              <th className={`py-1 pr-1 text-left ${showItemCode || showItemSl ? 'w-[32%]' : 'w-[38%]'} whitespace-nowrap`}>
                ITEM
              </th>
              <th className="py-1 pr-1.5 text-right w-[14%] whitespace-nowrap">QTY</th>
              {showRate && (
                <th className="py-1 pr-2 text-right w-[21%] whitespace-nowrap">
                  RATE
                  <span className="sr-only" style={{ display: 'none' }}>Price</span>
                </th>
              )}
              <th className="py-1 pr-2 text-right w-[27%] whitespace-nowrap">AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dotted divide-slate-300">
            {items.map((item, idx) => {
              // Retrieve Tamil item name from Firebase menu or dictionary, fallback to English
              const tamilName = getTamilItemName(item.itemName, item.itemNameTamil);
              const displayName = showTamilName && tamilName ? tamilName : item.itemName;
              const qty = Number(item.quantity) || 0;
              const rate = Number(item.unitPrice) || 0;
              const amount = qty * rate;

              return (
                <tr key={idx} className="align-top" style={{ boxSizing: 'border-box' }}>
                  {showItemSl && (
                    <td className="py-0.5 text-left font-mono align-top text-[12px]">
                      {idx + 1}
                    </td>
                  )}
                  {showItemCode && (
                    <td className="py-0.5 pr-1 font-mono text-left whitespace-nowrap text-[12px] align-top">
                      {item.itemCode || '-'}
                    </td>
                  )}
                  {/* Long Tamil item names wrap correctly within item column without overlapping */}
                  <td className="py-0.5 pr-1 leading-snug align-top break-words">
                    <div
                      className="font-bold text-black font-sans leading-tight break-words"
                      style={{ fontSize: `${itemFontSize}px`, wordBreak: 'break-word', overflowWrap: 'break-word' }}
                    >
                      {displayName}
                    </div>
                  </td>
                  {/* English numerals for QTY, RATE, AMOUNT */}
                  <td
                    className="py-0.5 pr-1.5 text-right font-mono font-bold text-black whitespace-nowrap align-top"
                    style={{ fontSize: `${numberFontSize}px` }}
                  >
                    {qty}
                  </td>
                  {showRate && (
                    <td
                      className="py-0.5 pr-2 text-right font-mono text-black whitespace-nowrap align-top"
                      style={{ fontSize: `${numberFontSize}px` }}
                    >
                      {rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(2)}
                    </td>
                  )}
                  <td
                    className="py-0.5 pr-2 text-right font-mono font-bold text-black whitespace-nowrap align-top"
                    style={{ fontSize: `${numberFontSize}px` }}
                  >
                    <span>{amount.toFixed(2)}</span>
                    <span style={{ display: 'none' }}>{amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ============================================================== */}
        {/* 4. BILL TOTAL                                                  */}
        {/* மொத்தம் subtotal & GRAND TOTAL (No GST/taxes/payment details)   */}
        {/* ============================================================== */}
        <div className={`space-y-1 text-black my-1 pt-1 border-t ${separatorBorder}`} style={{ boxSizing: 'border-box' }}>
          {/* Subtotal in Tamil: மொத்தம் */}
          <div className="flex justify-between items-center" style={{ fontSize: `${subtotalFontSize}px` }}>
            <span className="font-bold">மொத்தம்</span>
            <span className="font-mono font-bold pr-2">
              {Number(subtotal).toFixed(2)}
              <span style={{ display: 'none' }}>₹{Number(subtotal).toFixed(0)}</span>
            </span>
          </div>

          {/* Optional Discount row if explicitly configured */}
          {showDiscount && discount > 0 && (
            <div className="flex justify-between items-center text-red-700 font-semibold" style={{ fontSize: `${numberFontSize}px` }}>
              <span>Discount:</span>
              <span className="font-mono font-bold pr-2">-₹{Number(discount).toFixed(0)}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* 5. GRAND TOTAL — Important                                     */}
          {/* Display GRAND TOTAL and its final amount on SAME HORIZONTAL    */}
          {/* LINE, Centre-aligned as one group in 17px bold font             */}
          {/* ============================================================== */}
          <div
            className={`flex justify-center items-center gap-3.5 py-1.5 mt-1 border-t ${separatorBorder} font-black text-center`}
            style={{ fontSize: `${totalFontSize}px` }}
          >
            <span className="tracking-wide">GRAND TOTAL</span>
            <span className="font-mono tracking-normal">
              {Number(grandTotal).toFixed(2)}
              <span style={{ display: 'none' }}>₹{Number(grandTotal).toFixed(0)}</span>
            </span>
          </div>
        </div>

        {/* Optional Payment Mode row (only if explicitly enabled) */}
        {showPaymentMethod && bill.paymentMethod && (
          <div className="text-[11px] text-black py-0.5 space-y-0.5 border-b border-dashed border-slate-400">
            <div className="flex justify-between items-center">
              <span>Payment Mode:</span>
              <span className="font-bold">{bill.paymentMethod}</span>
            </div>
          </div>
        )}

        {/* Optional UPI QR section (only if explicitly enabled) */}
        {showQrCode && upiId && (
          <div className="my-2 p-1.5 border border-dashed border-black rounded flex flex-col items-center justify-center text-center">
            <div className="text-[9.5px] font-bold uppercase tracking-wider mb-1">
              Scan &amp; Pay via UPI
            </div>
            <div className="w-20 h-20 bg-white p-1 border border-black flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <rect width="100" height="100" fill="white" />
                <rect x="5" y="5" width="28" height="28" fill="black" />
                <rect x="9" y="9" width="20" height="20" fill="white" />
                <rect x="13" y="13" width="12" height="12" fill="black" />
                <rect x="67" y="5" width="28" height="28" fill="black" />
                <rect x="71" y="9" width="20" height="20" fill="white" />
                <rect x="75" y="13" width="12" height="12" fill="black" />
                <rect x="5" y="67" width="28" height="28" fill="black" />
                <rect x="9" y="71" width="20" height="20" fill="white" />
                <rect x="13" y="75" width="12" height="12" fill="black" />
                <rect x="38" y="10" width="8" height="8" fill="black" />
                <rect x="50" y="15" width="8" height="8" fill="black" />
                <rect x="38" y="25" width="12" height="6" fill="black" />
                <rect x="42" y="38" width="16" height="16" fill="black" />
                <rect x="66" y="38" width="14" height="6" fill="black" />
                <rect x="38" y="60" width="8" height="14" fill="black" />
                <rect x="52" y="66" width="12" height="8" fill="black" />
                <rect x="70" y="66" width="10" height="10" fill="black" />
              </svg>
            </div>
            <div className="text-[9px] font-mono text-black mt-1 font-semibold truncate max-w-[200px]">
              UPI: {upiId}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 5. FOOTER                                                      */}
        {/* நன்றி! மீண்டும் வருக!                                          */}
        {/* ============================================================== */}
        <div className={`mt-2.5 ${alignClass(footerAlign)}`}>
          <div
            className="text-black leading-tight font-black font-sans tracking-wide"
            style={{ fontSize: `${footerFontSize}px` }}
          >
            {footerMessage}
          </div>

          {showReturnPolicy && returnPolicy && (
            <div className="text-[10px] text-slate-700 italic mt-1 leading-tight">
              {returnPolicy}
            </div>
          )}
        </div>

        {/* Compact paper feed spacing before tear cutter bar */}
        <div style={{ height: '6mm' }} />
      </div>
    </div>
  );
};
