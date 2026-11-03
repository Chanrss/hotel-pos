import { Bill, BillItem } from '../types';

const LOCAL_BILLS_KEY = 'pos_local_completed_bills';
const LOCAL_ITEMS_KEY = 'pos_local_completed_items';
const PENDING_SYNC_KEY_PREFIX = 'pos_pending_bills_';

/**
 * Saves a completed bill and its snapshot items to resilient local storage.
 * Dispatches a custom window event so all active views (Dashboard, History, Reports)
 * update instantaneously without needing an external network round-trip.
 */
export function saveBillLocally(bill: Bill, items: BillItem[], kotId?: string): void {
  try {
    // 1. Save Bill record
    const existingBills = getLocalBills();
    const filtered = existingBills.filter((b) => b.id !== bill.id);
    const updatedBills = [bill, ...filtered].slice(0, 500); // Retain latest 500 bills
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(updatedBills));

    // 2. Save Bill Items
    const existingItemsMap = getLocalItemsMap();
    existingItemsMap[bill.id] = items;
    // Clean up old items to manage storage
    const validBillIds = new Set(updatedBills.map((b) => b.id));
    for (const key of Object.keys(existingItemsMap)) {
      if (!validBillIds.has(key)) {
        delete existingItemsMap[key];
      }
    }
    localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(existingItemsMap));

    // 3. Track last printed bill for 0ms instant reprint
    localStorage.setItem('pos_last_printed_bill', JSON.stringify({ bill, items }));

    // 4. Also store in pending queue for background sync
    try {
      const pendingKey = `${PENDING_SYNC_KEY_PREFIX}${bill.businessDate}`;
      const pending = JSON.parse(localStorage.getItem(pendingKey) || '[]');
      if (!pending.some((p: any) => p.bill?.id === bill.id)) {
        pending.push({ bill, items, kotId, timestamp: Date.now() });
        localStorage.setItem(pendingKey, JSON.stringify(pending));
      }
    } catch (e) {
      console.warn('Could not queue bill for remote sync:', e);
    }

    // 5. Notify all listeners in current tab and other tabs
    window.dispatchEvent(new CustomEvent('pos_bills_updated', { detail: { bill, items } }));
  } catch (err) {
    console.warn('LocalStorage save bill notice:', err);
  }
}

/**
 * Retrieves all locally cached bills (sorted newest first)
 */
export function getLocalBills(): Bill[] {
  try {
    const raw = localStorage.getItem(LOCAL_BILLS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Bill[];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/**
 * Retrieves items map from local storage
 */
export function getLocalItemsMap(): Record<string, BillItem[]> {
  try {
    const raw = localStorage.getItem(LOCAL_ITEMS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Retrieves all items for a given bill ID from local storage
 */
export function getLocalBillItems(billId: string): BillItem[] {
  try {
    const map = getLocalItemsMap();
    return map[billId] || [];
  } catch (e) {
    return [];
  }
}

/**
 * Finds a bill by ID, billNumber (with or without leading zero), or transaction ID
 */
export function getLocalBillByIdOrNumber(identifier: string, businessDate?: string): { bill: Bill; items: BillItem[] } | null {
  const trimmed = (identifier || '').trim();
  if (!trimmed) return null;

  const numVal = parseInt(trimmed, 10);
  const searchBillNum = !isNaN(numVal) && numVal < 10 && !trimmed.startsWith('0') ? `0${numVal}` : trimmed;

  const bills = getLocalBills();
  const matched = bills.find((b) => {
    if (businessDate && b.businessDate !== businessDate) return false;
    return (
      b.id === trimmed ||
      b.billNumber === trimmed ||
      b.billNumber === searchBillNum ||
      b.transactionId === trimmed
    );
  });

  if (matched) {
    const items = matched.items && matched.items.length > 0 ? matched.items : getLocalBillItems(matched.id);
    return { bill: matched, items };
  }

  return null;
}

/**
 * Updates a local bill (e.g. status change to CANCELLED or increment reprint count)
 */
export function updateLocalBill(billId: string, updates: Partial<Bill>): boolean {
  try {
    const bills = getLocalBills();
    let updated = false;
    const next = bills.map((b) => {
      if (b.id === billId) {
        updated = true;
        return { ...b, ...updates, updatedAt: Date.now() };
      }
      return b;
    });

    if (updated) {
      localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('pos_bills_updated', { detail: { billId, updates } }));
    }
    return updated;
  } catch (e) {
    return false;
  }
}

/**
 * Merges remote Firestore bills with local bills, avoiding duplicates and preserving all records
 */
export function mergeBills(remote: Bill[], local: Bill[] = getLocalBills()): Bill[] {
  const map = new Map<string, Bill>();

  // Add local bills first
  for (const b of local) {
    if (b && b.id) {
      map.set(b.id, b);
    }
  }

  // Overlay remote bills (if updatedAt is newer or remote exists)
  for (const b of remote) {
    if (b && b.id) {
      const existing = map.get(b.id);
      if (!existing || (b.updatedAt && (!existing.updatedAt || b.updatedAt >= existing.updatedAt))) {
        map.set(b.id, b);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/**
 * Subscribes to local bills updates
 */
export function subscribeToLocalBills(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('pos_bills_updated', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('pos_bills_updated', handler);
    window.removeEventListener('storage', handler);
  };
}

/**
 * Clears all locally stored bills and cached items
 */
export function clearLocalBills(): void {
  try {
    localStorage.removeItem(LOCAL_BILLS_KEY);
    localStorage.removeItem(LOCAL_ITEMS_KEY);
    localStorage.removeItem('pos_last_printed_bill');

    // Remove pending sync bill queues and sequence counters
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(PENDING_SYNC_KEY_PREFIX) || k.startsWith('pos_last_bill_'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    window.dispatchEvent(new CustomEvent('pos_bills_updated', { detail: { cleared: true, bills: [] } }));
    window.dispatchEvent(new CustomEvent('pos_bills_erased'));
  } catch (err) {
    console.warn('Error clearing local bills:', err);
  }
}

