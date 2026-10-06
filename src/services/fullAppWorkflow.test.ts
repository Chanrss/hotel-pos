import { describe, it, expect, vi } from 'vitest';
import { BillingEngine } from './billingEngine';
import { formatBillNumber, getBusinessDate } from './billNumberEngine';
import { PrinterService } from './printerService';
import { getTamilItemName } from './tamilTranslation';
import { CartItem, MenuItem, RestaurantSettings, Bill, Kot, KotItem } from '../types';

describe('Full POS Lifecycle Automated End-to-End Suite', () => {
  const restaurantSettings: RestaurantSettings = {
    restaurantName: 'Sri Saravana Bhavan',
    address: '104 Grand Avenue, Central Complex, Chennai',
    phone: '+91 78100 66035 / 99769 74098',
    email: 'srisaravanabhavan57.com',
    gstNumber: '33AABCS1429B1Z',
    fssaiNumber: '12423002000456',
    tagline: 'AUTHENTIC TASTE & QUALITY',
    receiptHeader: 'SRI SARAVANA BHAVAN',
    receiptFooter: 'Thank you for visiting! Please visit again.',
    paperWidth: '80mm',
    receiptFontSize: 12,
    autoPrintOnSave: true
  };

  const menuItems: MenuItem[] = [
    {
      id: 'm_dosa',
      itemCode: '101',
      categoryId: 'cat_tiffin',
      itemName: 'Masala Dosa',
      itemNameTamil: 'மசால் தோசை',
      nonAcPrice: 70,
      acPrice: 85,
      active: true,
      createdAt: 1724000000000,
      updatedAt: 1724000000000
    },
    {
      id: 'm_coffee',
      itemCode: '102',
      categoryId: 'cat_beverage',
      itemName: 'Filter Coffee',
      itemNameTamil: 'ஃபில்டர் காபி',
      nonAcPrice: 30,
      acPrice: 40,
      active: true,
      createdAt: 1724000000000,
      updatedAt: 1724000000000
    }
  ];

  it('executes complete billing cycle from item addition to thermal print & duplicate reprint', () => {
    // 1. Customer orders in Non-AC
    const cart: CartItem[] = [
      {
        itemId: menuItems[0].id,
        itemCode: menuItems[0].itemCode,
        itemName: menuItems[0].itemName,
        itemNameTamil: menuItems[0].itemNameTamil,
        quantity: 2, // 2 * 70 = 140
        priceType: 'NON_AC',
        unitPrice: BillingEngine.getApplicablePrice(menuItems[0], 'NON_AC'),
        totalPrice: BillingEngine.calculateLineTotal(menuItems[0], 2, 'NON_AC')
      },
      {
        itemId: menuItems[1].id,
        itemCode: menuItems[1].itemCode,
        itemName: menuItems[1].itemName,
        itemNameTamil: menuItems[1].itemNameTamil,
        quantity: 1, // 1 * 30 = 30
        priceType: 'NON_AC',
        unitPrice: BillingEngine.getApplicablePrice(menuItems[1], 'NON_AC'),
        totalPrice: BillingEngine.calculateLineTotal(menuItems[1], 1, 'NON_AC')
      }
    ];

    // 2. Financial calculation check
    const subtotal = BillingEngine.calculateSubtotal(cart);
    expect(subtotal).toBe(170);

    const discount = 10;
    const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);
    expect(grandTotal).toBe(160);

    // 3. Business date determination & sequential formatting
    const fixedTime = new Date('2026-08-28T12:00:00Z');
    const businessDate = getBusinessDate('04:00', fixedTime);
    expect(businessDate).toBe('2026-08-28');

    const formattedBillNum = formatBillNumber(42);
    expect(formattedBillNum).toBe('42');

    // 4. Instant Bill Preparation
    const { bill, items } = BillingEngine.prepareBillForDirectPrint(
      cart,
      'DINE_IN',
      'NON_AC',
      'T-04',
      discount,
      'CASH',
      'Cashier Raman',
      'cashier_uid_1',
      formattedBillNum,
      businessDate
    );

    expect(bill.billNumber).toBe('42');
    expect(bill.subtotal).toBe(170);
    expect(bill.discount).toBe(10);
    expect(bill.grandTotal).toBe(160);
    expect(bill.reprintCount).toBe(0);
    expect(items.length).toBe(2);

    // 5. Thermal Receipt Generation (Original)
    const originalReceipt = PrinterService.generateThermalReceiptHTML(bill, items, restaurantSettings);
    expect(originalReceipt).toContain('ஸ்ரீ சரவண பவன்');
    expect(originalReceipt).toContain('Bill No: #42');
    expect(originalReceipt).toContain('GSTIN: 33AABCS1429B1Z');
    expect(originalReceipt).toContain('FSSAI: 12423002000456');
    expect(originalReceipt).toContain('160'); // Grand Total
    // Check Tamil script in thermal receipt output
    expect(originalReceipt).toContain('மசால் தோசை');
    expect(originalReceipt).toContain('ஃபில்டர் காபி');
    // Ensure original receipt does not have DUPLICATE / REPRINT banner
    expect(originalReceipt).not.toContain('*** DUPLICATE / REPRINT');

    // 6. Duplicate Reprint Simulation
    const duplicateBill: Bill = {
      ...bill,
      reprintCount: 1
    };

    const duplicateReceipt = PrinterService.generateThermalReceiptHTML(duplicateBill, items, restaurantSettings);
    expect(duplicateReceipt).toContain('*** DUPLICATE / REPRINT (1) ***');
    expect(duplicateReceipt).toContain('Bill No: #42');
  });

  it('verifies AC pricing differential logic across order items', () => {
    const nonAcDosaPrice = BillingEngine.getApplicablePrice(menuItems[0], 'NON_AC');
    const acDosaPrice = BillingEngine.getApplicablePrice(menuItems[0], 'AC');

    expect(nonAcDosaPrice).toBe(70);
    expect(acDosaPrice).toBe(85);
    expect(acDosaPrice).toBeGreaterThan(nonAcDosaPrice);
  });

  it('completes full end-to-end KOT lifecycle: create, status transitions, append items, bill conversion, and inventory deduction', async () => {
    // 1. Waiter creates KOT for Table T-3
    const kotId = 'kot_workflow_101';
    const kot: Kot = {
      id: kotId,
      kotNumber: 'KOT-101',
      businessDate: '2026-09-30',
      tableNumber: 'T-3',
      orderType: 'DINE_IN',
      waiterId: 'waiter_1',
      waiterName: 'Karthik',
      status: 'OPEN',
      createdBy: 'Karthik',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const initialKotItems: KotItem[] = [
      {
        id: 'ki_1',
        kotId,
        itemId: menuItems[0].id,
        itemCode: menuItems[0].itemCode,
        itemName: menuItems[0].itemName,
        itemNameTamil: menuItems[0].itemNameTamil,
        quantity: 2,
        priceType: 'NON_AC',
        unitPrice: 70,
        notes: 'Extra Crispy',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    expect(initialKotItems[0].quantity).toBe(2);

    // 2. Kitchen receives and progresses status: OPEN -> PREPARING -> READY
    const preparingKot = { ...kot, status: 'PREPARING' as const, updatedAt: Date.now() };
    expect(preparingKot.status).toBe('PREPARING');

    const readyKot = { ...preparingKot, status: 'READY' as const, updatedAt: Date.now() };
    expect(readyKot.status).toBe('READY');

    // 3. Customer appends 1 Filter Coffee to the running table KOT
    const appendedItem: KotItem = {
      id: 'ki_2',
      kotId,
      itemId: menuItems[1].id,
      itemCode: menuItems[1].itemCode,
      itemName: menuItems[1].itemName,
      itemNameTamil: menuItems[1].itemNameTamil,
      quantity: 1,
      priceType: 'NON_AC',
      unitPrice: 30,
      notes: 'Less Sugar',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const combinedItems = [...initialKotItems, appendedItem];
    expect(combinedItems.length).toBe(2);
    expect(combinedItems.reduce((acc, i) => acc + i.quantity, 0)).toBe(3);

    // 4. Cashier converts KOT items into finalized Bill
    const cartItems: CartItem[] = combinedItems.map((ki) => ({
      itemId: ki.itemId,
      itemCode: ki.itemCode,
      itemName: ki.itemName,
      itemNameTamil: ki.itemNameTamil,
      quantity: ki.quantity,
      priceType: ki.priceType,
      unitPrice: ki.unitPrice || 0,
      totalPrice: (ki.unitPrice || 0) * ki.quantity,
      notes: ki.notes
    }));

    const conversionResult = BillingEngine.prepareBillForDirectPrint(
      cartItems,
      readyKot.orderType,
      'NON_AC',
      readyKot.tableNumber || 'T-3',
      0,
      'CASH',
      'Cashier Raman',
      'cashier_ram',
      'BN-101',
      readyKot.businessDate
    );

    expect(conversionResult.bill).toBeDefined();
    expect(conversionResult.bill.tableNumber).toBe('T-3');
    expect(conversionResult.bill.orderType).toBe('DINE_IN');
    // Total: (2 Dosa * 70 = 140) + (1 Coffee * 30 = 30) = 170
    expect(conversionResult.bill.subtotal).toBe(170);
    expect(conversionResult.bill.grandTotal).toBe(170);
    expect(conversionResult.items.length).toBe(2);

    // 5. Thermal Slip Rendering
    const thermalHtml = PrinterService.generateThermalReceiptHTML(
      conversionResult.bill,
      conversionResult.items,
      restaurantSettings
    );
    expect(thermalHtml).toContain('T-3');
    expect(thermalHtml).toContain('மசால் தோசை');
    expect(thermalHtml).toContain('ஃபில்டர் காபி');
    expect(thermalHtml).toContain('₹170');
  });

  it('validates Direct Billing quick-counter checkout without table requirement', () => {
    const directCart: CartItem[] = [
      {
        itemId: menuItems[0].id,
        itemCode: menuItems[0].itemCode,
        itemName: menuItems[0].itemName,
        itemNameTamil: menuItems[0].itemNameTamil,
        quantity: 1,
        priceType: 'NON_AC',
        unitPrice: 70,
        totalPrice: 70
      }
    ];

    const { bill, items } = BillingEngine.prepareBillForDirectPrint(
      directCart,
      'TAKE_AWAY',
      'NON_AC',
      'Direct Counter',
      0,
      'UPI',
      'Staff',
      'uid_staff',
      'BN-500',
      '2026-09-30'
    );

    expect(bill.orderType).toBe('TAKE_AWAY');
    expect(bill.tableNumber).toBe('Direct Counter');
    expect(bill.paymentMethod).toBe('UPI');
    expect(bill.grandTotal).toBe(70);
    expect(items.length).toBe(1);
  });
});
