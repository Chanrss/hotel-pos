import { doc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
import { db, getDeviceId } from './firebase';

/**
 * Calculates the current business date string (YYYY-MM-DD) based on configured businessDayStart.
 * E.g., if businessDayStart is "04:00", any time before 4:00 AM belongs to previous calendar day.
 */
export function getBusinessDate(businessDayStart = '04:00', now = new Date()): string {
  const [startHourStr, startMinStr] = (businessDayStart || '04:00').split(':');
  const startHour = parseInt(startHourStr, 10) || 4;
  const startMin = parseInt(startMinStr, 10) || 0;

  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  // If current time is before the business day start time, attribute to yesterday
  if (currentHour < startHour || (currentHour === startHour && currentMin < startMin)) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return formatDate(yesterday);
  }
  return formatDate(now);
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatBillNumber(num: number): string {
  if (num < 10) return `0${num}`;
  return String(num);
}

export function formatKotNumber(num: number): string {
  if (num < 10) return `KOT-0${num}`;
  return `KOT-${num}`;
}

// Memory cache for instantaneous sequence allocation
const sequenceCache: { [businessDate: string]: { lastBill: number; lastKot: number; initialized: boolean } } = {};

/**
 * Ensures sequence cache is primed from local storage or remote
 */
function getCachedSequence(businessDate: string, startingNumber = 1) {
  if (!sequenceCache[businessDate]) {
    const localBillKey = `pos_last_bill_${businessDate}`;
    const localKotKey = `pos_last_kot_${businessDate}`;
    const storedBill = parseInt(localStorage.getItem(localBillKey) || '0', 10);
    const storedKot = parseInt(localStorage.getItem(localKotKey) || '0', 10);

    sequenceCache[businessDate] = {
      lastBill: Math.max(storedBill, startingNumber - 1),
      lastKot: storedKot,
      initialized: true
    };
  }
  return sequenceCache[businessDate];
}

/**
 * Prime the sequence cache asynchronously from Firestore in background
 */
export async function syncBusinessDaySequence(businessDate: string): Promise<void> {
  try {
    const dayRef = doc(db, 'business_days', businessDate);
    const snap = await getDoc(dayRef);
    if (snap.exists()) {
      const data = snap.data();
      const seq = getCachedSequence(businessDate);
      if (data.lastBillNumber && data.lastBillNumber > seq.lastBill) {
        seq.lastBill = data.lastBillNumber;
        localStorage.setItem(`pos_last_bill_${businessDate}`, String(data.lastBillNumber));
      }
      if (data.lastKotNumber && data.lastKotNumber > seq.lastKot) {
        seq.lastKot = data.lastKotNumber;
        localStorage.setItem(`pos_last_kot_${businessDate}`, String(data.lastKotNumber));
      }
    }
  } catch (err) {
    console.debug('Background sequence sync notice:', err);
  }
}

/**
 * Allocates the next sequential bill number instantly (0ms latency).
 * Updates local sequence immediately and synchronizes with Firestore in the background.
 */
export async function allocateNextBillNumber(businessDate: string, startingNumber = 1): Promise<{ billNumber: string; numericValue: number }> {
  const seq = getCachedSequence(businessDate, startingNumber);
  seq.lastBill += 1;
  const nextNumber = seq.lastBill;

  // Persist locally for instant offline recovery
  localStorage.setItem(`pos_last_bill_${businessDate}`, String(nextNumber));

  // Sync to Firestore in background without blocking billing pipeline
  const dayRef = doc(db, 'business_days', businessDate);
  setDoc(dayRef, {
    businessDate,
    lastBillNumber: nextNumber,
    updatedAt: Date.now()
  }, { merge: true }).catch((err) => {
    console.warn('Firestore bill counter sync queued:', err);
  });

  return {
    billNumber: formatBillNumber(nextNumber),
    numericValue: nextNumber
  };
}

/**
 * Allocates the next sequential KOT number for a business day instantly.
 */
export async function allocateNextKotNumber(businessDate: string): Promise<{ kotNumber: string; numericValue: number }> {
  const seq = getCachedSequence(businessDate);
  seq.lastKot += 1;
  const nextNumber = seq.lastKot;

  localStorage.setItem(`pos_last_kot_${businessDate}`, String(nextNumber));

  const dayRef = doc(db, 'business_days', businessDate);
  setDoc(dayRef, {
    businessDate,
    lastKotNumber: nextNumber,
    updatedAt: Date.now()
  }, { merge: true }).catch((err) => {
    console.warn('Firestore KOT counter sync queued:', err);
  });

  return {
    kotNumber: formatKotNumber(nextNumber),
    numericValue: nextNumber
  };
}

/**
 * Resets the daily bill numbering sequence back to 0.
 * If businessDate is provided, resets that date; otherwise resets all dates.
 */
export function resetBillSequence(businessDate?: string): void {
  if (businessDate) {
    if (sequenceCache[businessDate]) {
      sequenceCache[businessDate].lastBill = 0;
    }
    try {
      localStorage.removeItem(`pos_last_bill_${businessDate}`);
    } catch (_) {}
  } else {
    for (const key of Object.keys(sequenceCache)) {
      sequenceCache[key].lastBill = 0;
    }
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('pos_last_bill_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (_) {}
  }
}
