import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { clearLocalBills } from './localBillStore';
import { resetBillSequence } from './billNumberEngine';

export interface PurgeResult {
  billsDeleted: number;
  itemsDeleted: number;
  businessDaysReset: number;
  success: boolean;
  error?: string;
}

/**
 * Completely erases all bills and bill items from both Firestore cloud storage
 * and browser local storage, and resets bill sequence numbering back to 0.
 *
 * This provides a clean slate where the next generated bill starts from #01.
 */
export async function purgeAllBills(): Promise<PurgeResult> {
  let billsDeleted = 0;
  let itemsDeleted = 0;
  let businessDaysReset = 0;

  try {
    // 1. Delete all Firestore bill documents in batches of up to 400
    try {
      const billsSnap = await getDocs(collection(db, 'bills'));
      let batch = writeBatch(db);
      let count = 0;
      for (const d of billsSnap.docs) {
        batch.delete(doc(db, 'bills', d.id));
        count++;
        billsDeleted++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) {
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore bills collection purge notice:', e);
    }

    // 2. Delete all Firestore bill_items documents
    try {
      const itemsSnap = await getDocs(collection(db, 'bill_items'));
      let batch = writeBatch(db);
      let count = 0;
      for (const d of itemsSnap.docs) {
        batch.delete(doc(db, 'bill_items', d.id));
        count++;
        itemsDeleted++;
        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
        }
      }
      if (count % 400 !== 0) {
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore bill_items collection purge notice:', e);
    }

    // 3. Delete or reset all business_days records in Firestore
    try {
      const bdaysSnap = await getDocs(collection(db, 'business_days'));
      if (!bdaysSnap.empty) {
        const batch = writeBatch(db);
        for (const d of bdaysSnap.docs) {
          batch.delete(doc(db, 'business_days', d.id));
          businessDaysReset++;
        }
        await batch.commit();
      }
    } catch (e) {
      console.warn('Firestore business_days purge notice:', e);
    }

    // 4. Delete all daily_backups sales records from Firestore
    try {
      const backupsSnap = await getDocs(collection(db, 'daily_backups'));
      if (!backupsSnap.empty) {
        let batch = writeBatch(db);
        let bCount = 0;
        for (const d of backupsSnap.docs) {
          batch.delete(doc(db, 'daily_backups', d.id));
          bCount++;
          if (bCount % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
        if (bCount % 400 !== 0) {
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn('Firestore daily_backups purge notice:', e);
    }

    // 5. Reset soldCount on inventory items
    try {
      const invSnap = await getDocs(collection(db, 'inventory_items'));
      if (!invSnap.empty) {
        const batch = writeBatch(db);
        for (const d of invSnap.docs) {
          batch.update(doc(db, 'inventory_items', d.id), {
            soldCount: 0,
            updatedAt: Date.now()
          });
        }
        await batch.commit();
      }
    } catch (e) {
      console.warn('Inventory sold count reset notice:', e);
    }

    // 6. Reset in-memory and local sequence cache so next bill starts at #01
    resetBillSequence();

    // 7. Clear all local storage caches (completed bills, items map, last printed bill, pending sync)
    clearLocalBills();

    // 8. Broadcast event across active components and browser tabs
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pos_bills_erased', {
          detail: { billsDeleted, itemsDeleted, timestamp: Date.now() }
        }));
      }
    } catch (_) {}

    return {
      billsDeleted,
      itemsDeleted,
      businessDaysReset,
      success: true
    };
  } catch (err: any) {
    console.error('Failed to purge all bills:', err);
    // Still clear local caches even if Firestore encounters network issues
    resetBillSequence();
    clearLocalBills();

    return {
      billsDeleted,
      itemsDeleted,
      businessDaysReset,
      success: false,
      error: err?.message || 'Unknown error purging bills'
    };
  }
}
