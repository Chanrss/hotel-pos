import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReceiptTemplate } from '../common/ReceiptTemplate';
import { RestaurantSettings, Bill, BillItem } from '../../types';

describe('ReceiptTemplate & Receipt Settings Architecture', () => {
  const mockBill: Partial<Bill> = {
    id: 'test-bill-1',
    billNumber: '108',
    orderType: 'DINE_IN',
    tableNumber: 'T-02',
    captainNumber: '05',
    subtotal: 250,
    discount: 10,
    grandTotal: 240,
    paymentMethod: 'UPI',
    createdAt: new Date('2026-10-29T10:30:00Z').getTime()
  };

  const mockItems: BillItem[] = [
    {
      id: 'i-1',
      billId: 'test-bill-1',
      itemId: 'item-1',
      itemCode: 'DOS01',
      itemName: 'Masala Dosa',
      itemNameTamil: 'மசால் தோசை',
      quantity: 2,
      unitPrice: 80,
      totalPrice: 160,
      priceType: 'NON_AC',
      createdAt: Date.now()
    },
    {
      id: 'i-2',
      billId: 'test-bill-1',
      itemId: 'item-2',
      itemCode: 'COF01',
      itemName: 'Filter Coffee',
      itemNameTamil: 'காபி',
      quantity: 3,
      unitPrice: 30,
      totalPrice: 90,
      priceType: 'NON_AC',
      createdAt: Date.now()
    }
  ];

  it('renders store branding and customized invoice title', () => {
    const settings: RestaurantSettings = {
      restaurantName: 'SARAVANA BHAVAN TEST',
      restaurantNameTamil: 'ஸ்ரீ சரவண பவன்',
      address: 'Salem Main Rd',
      phone: '9876543210',
      invoiceTitle: 'SPECIAL TAX INVOICE',
      invoiceNumberPrefix: 'INV-',
      receiptShowEnglishName: true
    };

    render(<ReceiptTemplate bill={mockBill} items={mockItems} settings={settings} />);

    expect(screen.getByText('SARAVANA BHAVAN TEST')).toBeDefined();
    expect(screen.getByText('ஸ்ரீ சரவண பவன்')).toBeDefined();
    expect(screen.getByText('SPECIAL TAX INVOICE')).toBeDefined();
    expect(screen.getByText(/Bill No: INV-108/i)).toBeDefined();
  });

  it('respects column visibility toggles for SKU code and unit price', () => {
    const settingsWithCode: RestaurantSettings = {
      restaurantName: 'Test Store',
      address: 'Address',
      phone: '1234567890',
      receiptShowItemCode: true,
      receiptShowRate: true
    };

    const { rerender } = render(
      <ReceiptTemplate bill={mockBill} items={mockItems} settings={settingsWithCode} />
    );

    expect(screen.getByText('Code')).toBeDefined();
    expect(screen.getByText('DOS01')).toBeDefined();
    expect(screen.getByText('Price')).toBeDefined();

    // Rerender with item code hidden
    const settingsWithoutCode: RestaurantSettings = {
      ...settingsWithCode,
      receiptShowItemCode: false,
      receiptShowRate: false
    };

    rerender(<ReceiptTemplate bill={mockBill} items={mockItems} settings={settingsWithoutCode} />);
    expect(screen.queryByText('Code')).toBeNull();
    expect(screen.queryByText('Price')).toBeNull();
  });

  it('renders payment method and return policy note when configured and hides when disabled', () => {
    const settings: RestaurantSettings = {
      restaurantName: 'Test Store',
      address: 'Address',
      phone: '1234567890',
      receiptShowPaymentMethod: true,
      receiptShowReturnPolicy: true,
      thankYouMessage: 'THANK YOU COME AGAIN',
      returnPolicy: 'Goods once sold cannot be returned'
    };

    const { rerender } = render(<ReceiptTemplate bill={mockBill} items={mockItems} settings={settings} />);

    expect(screen.getByText(/Payment Mode:/i)).toBeDefined();
    expect(screen.getByText('UPI')).toBeDefined();
    expect(screen.getByText('THANK YOU COME AGAIN')).toBeDefined();
    expect(screen.getByText('Goods once sold cannot be returned')).toBeDefined();

    // Rerender with payment method and return policy disabled
    const settingsClean: RestaurantSettings = {
      restaurantName: 'Test Store',
      address: 'Address',
      phone: '1234567890',
      receiptShowPaymentMethod: false,
      receiptShowReturnPolicy: false,
      thankYouMessage: 'THANK YOU COME AGAIN',
      returnPolicy: 'Goods once sold cannot be returned'
    };
    rerender(<ReceiptTemplate bill={mockBill} items={mockItems} settings={settingsClean} />);
    expect(screen.queryByText(/Payment Mode:/i)).toBeNull();
    expect(screen.queryByText('Goods once sold cannot be returned')).toBeNull();
  });

  it('renders dynamic UPI QR section when UPI ID is configured and hides when disabled', () => {
    const settings: RestaurantSettings = {
      restaurantName: 'Test Store',
      address: 'Address',
      phone: '1234567890',
      receiptShowQrCode: true,
      upiId: 'testpay@upi'
    };

    const { rerender } = render(<ReceiptTemplate bill={mockBill} items={mockItems} settings={settings} />);

    expect(screen.getByText(/Scan & Pay via UPI/i)).toBeDefined();
    expect(screen.getByText(/UPI: testpay@upi/i)).toBeDefined();

    // Rerender with QR code disabled
    rerender(<ReceiptTemplate bill={mockBill} items={mockItems} settings={{ ...settings, receiptShowQrCode: false }} />);
    expect(screen.queryByText(/Scan & Pay via UPI/i)).toBeNull();
    expect(screen.queryByText(/UPI: testpay@upi/i)).toBeNull();
  });

  it('displays complete long item names and large monetary values for 80mm thermal receipt without truncation', () => {
    const longNameBill: Partial<Bill> = {
      id: 'test-bill-long',
      billNumber: '999',
      orderType: 'DINE_IN',
      tableNumber: 'VIP-01',
      subtotal: 125000,
      grandTotal: 125000,
      paymentMethod: 'CASH'
    };

    const longItems: BillItem[] = [
      {
        id: 'li-1',
        billId: 'test-bill-long',
        itemId: 'item-festive',
        itemCode: 'THA01',
        itemName: 'Special Grand Royal Festive Thali with Extra Sweets and Ghee Dosa',
        itemNameTamil: 'ஸ்பெஷல் ராயல் கல்யாண விருந்து சாப்பாடு மற்றும் மசால் தோசை',
        quantity: 50,
        unitPrice: 2500,
        totalPrice: 125000,
        priceType: 'AC',
        createdAt: Date.now()
      }
    ];

    const settings80mm: RestaurantSettings = {
      restaurantName: 'SRI SARAVANA BHAVAN',
      address: 'Salem Main Rd',
      phone: '7708159933',
      paperWidth: '80mm',
      receiptShowTamilName: true,
      receiptShowEnglishName: true
    };

    render(<ReceiptTemplate bill={longNameBill} items={longItems} settings={settings80mm} />);

    // Complete Tamil item name rendered
    expect(screen.getByText('ஸ்பெஷல் ராயல் கல்யாண விருந்து சாப்பாடு மற்றும் மசால் தோசை')).toBeDefined();
    // Complete price and total rendered
    expect(screen.getByText('2500')).toBeDefined();
    expect(screen.getByText('125000')).toBeDefined();
    // Complete grand total and subtotal rendered without clipping
    expect(screen.getAllByText('₹125000').length).toBeGreaterThanOrEqual(1);
  });

  it('hides English name, address, GSTIN and invoice title when disabled', () => {
    const cleanSettings: RestaurantSettings = {
      restaurantName: 'SRI SARAVANA BHAVAN',
      restaurantNameTamil: 'ஸ்ரீ சரவண பவன்',
      address: 'Salem Main Rd, Anna Nagar',
      phone: '7708159933',
      gstNumber: '33AAAAA0000A1Z5',
      receiptShowTamilName: true,
      receiptShowEnglishName: false,
      receiptShowAddress: false,
      receiptShowGstFssai: false,
      invoiceTitle: ''
    };

    render(<ReceiptTemplate bill={mockBill} items={mockItems} settings={cleanSettings} />);

    // Tamil name is present
    expect(screen.getByText('ஸ்ரீ சரவண பவன்')).toBeDefined();
    // English name, address, phone, GST, and invoice title are not rendered
    expect(screen.queryByText('SRI SARAVANA BHAVAN')).toBeNull();
    expect(screen.queryByText('Salem Main Rd, Anna Nagar')).toBeNull();
    expect(screen.queryByText(/PH:/i)).toBeNull();
    expect(screen.queryByText(/GSTIN:/i)).toBeNull();
    expect(screen.queryByText('RESTAURANT RECEIPT')).toBeNull();
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
  });

  it('hides discount row by default and does not render SAMPLE badge even in sampleMode', () => {
    const baseSettings: RestaurantSettings = {
      restaurantName: 'SRI SARAVANA BHAVAN',
      address: 'Address',
      phone: '1234567890'
    };

    const { rerender } = render(
      <ReceiptTemplate bill={mockBill} items={mockItems} settings={baseSettings} sampleMode={true} />
    );

    // No SAMPLE badge anywhere
    expect(screen.queryByText('SAMPLE')).toBeNull();
    // Discount is hidden by default
    expect(screen.queryByText('Discount:')).toBeNull();

    // When receiptShowDiscount is enabled, Discount: is visible
    rerender(
      <ReceiptTemplate bill={mockBill} items={mockItems} settings={{ ...baseSettings, receiptShowDiscount: true }} sampleMode={true} />
    );
    expect(screen.getByText('Discount:')).toBeDefined();
    expect(screen.queryByText('SAMPLE')).toBeNull();
  });
});
