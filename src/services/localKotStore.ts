import { Kot, KotItem, KotStatus, KotItemStatus } from '../types';

const LOCAL_KOTS_KEY = 'pos_local_kots';

export interface StoredKotData {
  kot: Kot;
  items: KotItem[];
}

/**
 * Saves a KOT and its items immediately to local storage (0ms latency).
 * Dispatches a custom window event so all active views (KOT Management, Dashboard, POS)
 * update instantaneously without waiting for network round-trips.
 */
export function saveKotLocally(kot: Kot, items: KotItem[]): void {
  try {
    const existing = getLocalKots();
    const filtered = existing.filter((k) => k.kot.id !== kot.id);
    const updated: StoredKotData[] = [{ kot, items }, ...filtered].slice(0, 300); // Retain latest 300 KOTs

    localStorage.setItem(LOCAL_KOTS_KEY, JSON.stringify(updated));

    // Also persist last created KOT for quick reference
    localStorage.setItem('pos_last_created_kot', JSON.stringify({ kot, items }));

    // Notify all active component listeners in current and other windows
    window.dispatchEvent(new CustomEvent('pos_kots_updated', { detail: { kot, items } }));
  } catch (err) {
    console.warn('LocalStorage save KOT notice:', err);
  }
}

/**
 * Retrieves all locally cached KOTs (sorted newest first)
 */
export function getLocalKots(): StoredKotData[] {
  try {
    const raw = localStorage.getItem(LOCAL_KOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: any) => {
      // Support legacy format where item was directly Kot or wrapper { kot, items }
      if (item.kot) {
        return item as StoredKotData;
      }
      return {
        kot: item as Kot,
        items: (item.items || []) as KotItem[]
      };
    });
  } catch (e) {
    console.warn('Error reading local KOTs:', e);
    return [];
  }
}

/**
 * Updates a KOT's status in local storage immediately.
 */
export function updateLocalKotStatus(kotId: string, status: KotStatus): void {
  try {
    const existing = getLocalKots();
    const now = Date.now();
    let updatedKot: Kot | null = null;
    let updatedItems: KotItem[] = [];

    const updated = existing.map((entry) => {
      if (entry.kot.id === kotId) {
        updatedKot = {
          ...entry.kot,
          status,
          updatedAt: now
        };
        updatedItems = entry.items;
        return {
          kot: updatedKot,
          items: updatedItems
        };
      }
      return entry;
    });

    localStorage.setItem(LOCAL_KOTS_KEY, JSON.stringify(updated));

    if (updatedKot) {
      window.dispatchEvent(new CustomEvent('pos_kots_updated', { detail: { kot: updatedKot, items: updatedItems } }));
    }
  } catch (e) {
    console.warn('Error updating local KOT status:', e);
  }
}

/**
 * Updates an individual KOT item's status in local storage immediately.
 */
export function updateLocalKotItemStatus(
  kotId: string, 
  itemId: string, 
  status: KotItemStatus
): { kot: Kot; items: KotItem[] } | null {
  try {
    const existing = getLocalKots();
    const now = Date.now();
    let resultKot: Kot | null = null;
    let resultItems: KotItem[] = [];

    const updated = existing.map((entry) => {
      if (entry.kot.id === kotId) {
        resultItems = (entry.items || []).map((i) => {
          if (i.id === itemId || i.itemId === itemId) {
            return {
              ...i,
              status,
              updatedAt: now
            };
          }
          return i;
        });
        resultKot = {
          ...entry.kot,
          items: resultItems,
          updatedAt: now
        };
        return {
          kot: resultKot,
          items: resultItems
        };
      }
      return entry;
    });

    localStorage.setItem(LOCAL_KOTS_KEY, JSON.stringify(updated));

    if (resultKot) {
      window.dispatchEvent(new CustomEvent('pos_kots_updated', { detail: { kot: resultKot, items: resultItems } }));
      return { kot: resultKot, items: resultItems };
    }
  } catch (e) {
    console.warn('Error updating local KOT item status:', e);
  }
  return null;
}

/**
 * Appends new items to an existing KOT in local storage.
 */
export function appendItemsToLocalKot(kotId: string, newItems: KotItem[]): Kot | null {
  try {
    const existing = getLocalKots();
    const now = Date.now();
    let resultKot: Kot | null = null;

    const updated = existing.map((entry) => {
      if (entry.kot.id === kotId) {
        const combinedItems = [...(entry.items || []), ...newItems];
        resultKot = {
          ...entry.kot,
          items: combinedItems,
          itemsCount: combinedItems.reduce((sum, i) => sum + i.quantity, 0),
          updatedAt: now
        };
        return {
          kot: resultKot,
          items: combinedItems
        };
      }
      return entry;
    });

    localStorage.setItem(LOCAL_KOTS_KEY, JSON.stringify(updated));

    if (resultKot) {
      window.dispatchEvent(new CustomEvent('pos_kots_updated', { detail: { kot: resultKot, items: newItems } }));
    }

    return resultKot;
  } catch (e) {
    console.warn('Error appending items to local KOT:', e);
    return null;
  }
}

/**
 * Merges remote Firestore KOTs with local KOTs.
 * Guarantees that freshly created local KOTs that have not yet reached Firestore
 * are never wiped out or hidden by an incoming Firestore snapshot.
 */
export function mergeKots(
  remoteKots: StoredKotData[],
  localKots: StoredKotData[]
): StoredKotData[] {
  const map = new Map<string, StoredKotData>();

  // 1. Prime map with remote KOTs
  remoteKots.forEach((r) => {
    map.set(r.kot.id, r);
  });

  // 2. Add or prioritize local KOTs if newer or not yet present in remote
  localKots.forEach((l) => {
    const existing = map.get(l.kot.id);
    if (!existing) {
      map.set(l.kot.id, l);
    } else {
      // If local has newer timestamp or more items, keep local
      const localUpdated = l.kot.updatedAt || l.kot.createdAt || 0;
      const remoteUpdated = existing.kot.updatedAt || existing.kot.createdAt || 0;
      if (localUpdated >= remoteUpdated) {
        map.set(l.kot.id, {
          kot: { ...existing.kot, ...l.kot },
          items: l.items && l.items.length >= (existing.items?.length || 0) ? l.items : existing.items
        });
      }
    }
  });

  // 3. Sort newest first
  return Array.from(map.values()).sort((a, b) => (b.kot.createdAt || 0) - (a.kot.createdAt || 0));
}

/**
 * Subscribes to local KOT updates (both in-window CustomEvent and cross-window storage event).
 */
export function subscribeToLocalKots(callback: () => void): () => void {
  const handleCustomEvent = () => callback();
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === LOCAL_KOTS_KEY) {
      callback();
    }
  };

  window.addEventListener('pos_kots_updated', handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener('pos_kots_updated', handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

/**
 * Clears all locally stored KOTs
 */
export function clearLocalKots(): void {
  try {
    localStorage.removeItem(LOCAL_KOTS_KEY);
    localStorage.removeItem('pos_last_created_kot');
    window.dispatchEvent(new CustomEvent('pos_kots_updated', { detail: { cleared: true } }));
  } catch (err) {
    console.warn('Error clearing local KOTs:', err);
  }
}

