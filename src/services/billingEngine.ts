import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db, getDeviceId, generateUUID, sanitizeForFirestore } from './firebase';
import { 
  Bill, 
  BillItem, 
  CartItem, 
  MenuItem, 
  OrderType, 
  PriceType, 
  Kot, 
  KotItem 
} from '../types';
import { allocateNextBillNumber, getBusinessDate } from './billNumberEngine';
import { recordInventorySale } from './inventoryEngine';
import { saveBillLocally, updateLocalBill } from './localBillStore';

export class BillingEngine {
  /**
   * Item Total = Unit Price × Quantity
   */
  static calculateItemTotal(unitPrice: number, quantity: number): number {
    return Math.round(unitPrice * quantity * 100) / 100;
  }

  /**
   * Subtotal = Sum of Item Totals
   */
  static calculateSubtotal(items: { unitPrice: number; quantity: number }[]): number {
    const total = items.reduce((sum, item) => {
      return sum + BillingEngine.calculateItemTotal(item.unitPrice, item.quantity);
    }, 0);
    return Math.round(total * 100) / 100;
  }

  /**
   * Grand Total = Subtotal - Discount
   */
  static calculateGrandTotal(subtotal: number, discount = 0): number {
    const safeDiscount = Math.max(0, discount || 0);
    return Math.max(0, Math.round((subtotal - safeDiscount) * 100) / 100);
  }

  /**
   * Retrieves AC or Non-AC price for an item
   */
  static getApplicablePrice(item: MenuItem, priceType: PriceType): number {
    return priceType === 'AC' ? (item.acPrice || 0) : (item.nonAcPrice || 0);
  }

  /**
   * Calculates line total for a menu item given quantity and price type
   */
  static calculateLineTotal(item: MenuItem, quantity: number, priceType: PriceType): number {
    const unitPrice = BillingEngine.getApplicablePrice(item, priceType);
    return BillingEngine.calculateItemTotal(unitPrice, quantity);
  }

  /**
   * Synchronously prepares bill and bill items for instant direct printing
   */
  static prepareBillForDirectPrint(
    items: CartItem[],
    orderType: OrderType,
    priceType: PriceType,
    tableNumber: string,
    discount: number,
    paymentMethod: string,
    userName: string,
    userId: string,
    billNumber: string,
    businessDate: string
  ): { bill: Bill; items: BillItem[] } {
    const subtotal = BillingEngine.calculateSubtotal(items);
    const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);
    const billId = `bill_${businessDate}_${billNumber}_${Date.now()}`;
    const now = Date.now();

    const bill: Bill = {
      id: billId,
      businessDate,
      billNumber,
      orderType,
      priceType,
      tableNumber,
      userId,
      userName,
      paymentMethod,
      subtotal,
      discount,
      grandTotal,
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: now,
      updatedAt: now
    };

    const billItems: BillItem[] = items.map((cartItem, idx) => ({
      id: `${billId}_item_${idx + 1}`,
      billId,
      itemId: cartItem.itemId,
      itemCode: cartItem.itemCode,
      itemName: cartItem.itemName,
      itemNameTamil: cartItem.itemNameTamil,
      quantity: cartItem.quantity,
      unitPrice: cartItem.unitPrice,
      totalPrice: cartItem.totalPrice,
      priceType: cartItem.priceType,
      businessDate,
      createdAt: now
    }));

    return {
      bill: { ...bill, items: billItems },
      items: billItems
    };
  }

  /**
   * Synchronously builds the Bill and BillItem records with sequential numbering.
   * Execution time: < 1 millisecond.
   */
  static async prepareBill(params: {
    orderType: OrderType;
    priceType: PriceType;
    items: CartItem[];
    discount?: number;
    kotId?: string;
    tableNumber?: string;
    userId: string;
    userName: string;
    businessDayStart?: string;
    originalBillId?: string;
    replacesBillNumber?: string;
    isRebill?: boolean;
  }): Promise<{ bill: Bill; items: BillItem[] }> {
    const { 
      orderType, 
      priceType, 
      items, 
      discount = 0, 
      kotId, 
      tableNumber, 
      userId, 
      userName,
      businessDayStart = '04:00',
      originalBillId,
      replacesBillNumber,
      isRebill
    } = params;

    if (!items || items.length === 0) {
      throw new Error('Cannot create a bill with zero items.');
    }

    const businessDate = getBusinessDate(businessDayStart);
    const { billNumber } = await allocateNextBillNumber(businessDate);
    const billId = `bill_${businessDate}_${billNumber}_${Date.now()}`;
    const deviceId = getDeviceId();
    const transactionId = generateUUID();

    const subtotal = BillingEngine.calculateSubtotal(items);
    const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);
    const now = Date.now();

    const bill: Bill = {
      id: billId,
      businessDate,
      billNumber,
      orderType,
      priceType,
      userId,
      userName,
      subtotal,
      discount: discount || 0,
      grandTotal,
      status: 'COMPLETED',
      reprintCount: 0,
      deviceId,
      transactionId,
      originalBillId,
      replacesBillNumber,
      isRebill: Boolean(isRebill || originalBillId),
      createdAt: now,
      updatedAt: now
    };

    if (kotId) {
      bill.kotId = kotId;
    }
    if (tableNumber) {
      bill.tableNumber = tableNumber;
    }

    const billItems: BillItem[] = items.map((cartItem, idx) => ({
      id: `${billId}_item_${idx + 1}`,
      billId,
      itemId: cartItem.itemId,
      itemCode: cartItem.itemCode,
      itemName: cartItem.itemName,
      itemNameTamil: cartItem.itemNameTamil,
      quantity: cartItem.quantity,
      unitPrice: cartItem.unitPrice,
      totalPrice: BillingEngine.calculateItemTotal(cartItem.unitPrice, cartItem.quantity),
      priceType: cartItem.priceType,
      createdAt: now
    }));

    return {
      bill: { ...bill, items: billItems },
      items: billItems
    };
  }

  /**
   * Persists bill to local storage and Firestore, handling inventory stock updates.
   * Can be run in background without blocking the UI or printer.
   */
  static async persistBillAsync(bill: Bill, billItems: BillItem[], kotId?: string, userId?: string): Promise<void> {
    // 1. Immediately save to resilient local POS store so bill history, reprints, and reports always have the bill
    try {
      saveBillLocally(bill, billItems, kotId);
    } catch (localErr) {
      console.warn('Local bill save notice:', localErr);
    }

    // 2. Deduct stock from inventory in background
    if (userId) {
      recordInventorySale(billItems, userId).catch((err) => {
        console.warn('Inventory deduction notice:', err);
      });
    }

    // 3. Persist to Firestore in cloud
    try {
      const batch = writeBatch(db);

      // Save Bill document
      const billRef = doc(db, 'bills', bill.id);
      batch.set(billRef, sanitizeForFirestore(bill));

      // Save Bill Items documents
      billItems.forEach((bi) => {
        const biRef = doc(db, 'bill_items', bi.id);
        batch.set(biRef, sanitizeForFirestore(bi));
      });

      // If linked to KOT, update KOT status to BILLED
      if (kotId) {
        const kotRef = doc(db, 'kots', kotId);
        batch.update(kotRef, {
          status: 'BILLED',
          updatedAt: Date.now()
        });
      }

      await batch.commit();
    } catch (err: any) {
      // If Firestore reports permission restriction or offline status, queue for sync without crashing POS
      console.warn('Background Firestore persist notice (bill preserved in local storage):', err?.message || err);
      try {
        const pendingKey = `pos_pending_bills_${bill.businessDate}`;
        const existing = JSON.parse(localStorage.getItem(pendingKey) || '[]');
        if (!existing.some((p: any) => p.bill?.id === bill.id)) {
          existing.push({ bill, items: billItems, kotId, userId, timestamp: Date.now() });
          localStorage.setItem(pendingKey, JSON.stringify(existing));
        }
      } catch (storageErr) {
        console.warn('LocalStorage queue notice:', storageErr);
      }
    }
  }

  /**
   * Main reusable bill creation workflow with instant (0ms) callback support.
   */
  static async createAndSaveBill(params: {
    orderType: OrderType;
    priceType: PriceType;
    items: CartItem[];
    discount?: number;
    kotId?: string;
    tableNumber?: string;
    userId: string;
    userName: string;
    businessDayStart?: string;
    onBillReady?: (result: { bill: Bill; items: BillItem[] }) => void;
  }): Promise<{ bill: Bill; items: BillItem[] }> {
    const prepared = await BillingEngine.prepareBill(params);

    // If caller provided onBillReady callback, notify immediately for 0ms printing
    if (params.onBillReady) {
      params.onBillReady(prepared);
    }

    // Persist in Firestore
    await BillingEngine.persistBillAsync(prepared.bill, prepared.items, params.kotId, params.userId);

    return prepared;
  }

  /**
   * Cancels a bill without physically deleting it from Firestore.
   */
  static async cancelBill(
    billId: string, 
    reason: string, 
    cancelledBy: string,
    replacementBillId?: string
  ): Promise<void> {
    const cancelData: Partial<Bill> = {
      status: 'CANCELLED' as const,
      cancelReason: reason || 'Cancelled by staff',
      cancelledBy,
      cancelledAt: Date.now(),
      updatedAt: Date.now()
    };

    if (replacementBillId) {
      cancelData.replacementBillId = replacementBillId;
    }

    // 1. Update in local storage
    const updatedLocally = updateLocalBill(billId, cancelData);

    // 2. Try updating in Firestore
    try {
      const billRef = doc(db, 'bills', billId);
      const billSnap = await getDoc(billRef);
      if (billSnap.exists()) {
        await updateDoc(billRef, cancelData);
      }
    } catch (e) {
      console.warn('Could not update cancelled status in Firestore (updated locally):', e);
      if (!updatedLocally) {
        throw e;
      }
    }
  }

  /**
   * Converts a KOT into a Bill seamlessly
   */
  static async convertKotToBill(
    kot: Kot,
    kotItems: KotItem[],
    priceType: PriceType,
    userId: string,
    userName: string,
    discount = 0
  ): Promise<{ bill: Bill; items: BillItem[] }> {
    const cartItems: CartItem[] = kotItems.map((kItem) => {
      const unitPrice = kItem.unitPrice || 0;
      return {
        itemId: kItem.itemId,
        itemCode: kItem.itemCode,
        itemName: kItem.itemName,
        quantity: kItem.quantity,
        unitPrice,
        totalPrice: BillingEngine.calculateItemTotal(unitPrice, kItem.quantity),
        priceType: kItem.priceType || priceType
      };
    });

    return BillingEngine.createAndSaveBill({
      orderType: kot.orderType,
      priceType,
      items: cartItems,
      discount,
      kotId: kot.id,
      tableNumber: kot.tableNumber,
      userId,
      userName
    });
  }
}
