import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChefHat, 
  Plus, 
  Trash2, 
  Printer, 
  ArrowRight, 
  ArrowLeft,
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw,
  Search,
  Filter,
  Check,
  Sparkles,
  Utensils,
  PlusCircle,
  XCircle,
  Eye,
  ShoppingBag,
  Send,
  Flame,
  CheckCircle,
  CheckSquare,
  Square,
  ListChecks
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  Kot, 
  KotItem, 
  KotStatus, 
  MenuItem, 
  OrderType, 
  PriceType, 
  RestaurantSettings 
} from '../../types';
import { allocateNextKotNumber, getBusinessDate } from '../../services/billNumberEngine';
import { BillingEngine } from '../../services/billingEngine';
import { PrintService } from '../../services/PrintService';
import { 
  collection, 
  doc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  setDoc, 
  updateDoc, 
  writeBatch 
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../../services/firebase';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { ThermalKotModal } from '../common/ThermalKotModal';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { getItemCategoryIds, itemBelongsToCategory, deduplicateMenuItems } from '../../utils/menuItemHelpers';
import { 
  saveKotLocally, 
  getLocalKots, 
  updateLocalKotStatus, 
  appendItemsToLocalKot, 
  mergeKots, 
  subscribeToLocalKots 
} from '../../services/localKotStore';

interface KotManagementProps {
  settings?: RestaurantSettings;
  initialSubTab?: 'running' | 'create';
  onTabChange?: (tab: 'running' | 'create') => void;
}

interface DraftKotItem {
  item: MenuItem;
  quantity: number;
  notes?: string;
}

const COMMON_TABLES = [
  'T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 
  'T-7', 'T-8', 'T-9', 'T-10', 'T-11', 'T-12', 
  'Take Away', 'Room 101', 'Room 102'
];

const KITCHEN_NOTES_PRESETS = [
  'Less Spicy',
  'No Onion/Garlic',
  'Extra Crispy',
  'Separate Sambar',
  'Parcel / Pack',
  'Sugar Less',
  'Extra Hot',
  'Without Ghee'
];

export const KotManagement: React.FC<KotManagementProps> = ({ settings, initialSubTab, onTabChange }) => {
  const { currentUser } = useAuth();

  // Active View Tab
  const [activeTab, setActiveTab] = useState<'running' | 'create'>(initialSubTab || 'running');

  useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);
  const [runningKots, setRunningKots] = useState<{ kot: Kot; items: KotItem[] }[]>([]);
  const [firestoreMenuItems, setFirestoreMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE'); // ACTIVE, ALL, OPEN, SENT, PREPARING, READY, COMPLETED, BILLED, CANCELLED

  // Multi-selection state for kitchen bulk operations
  const [selectedKotIds, setSelectedKotIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Create / Edit KOT Draft State
  const [tableNumber, setTableNumber] = useState('T-1');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [priceType, setPriceType] = useState<PriceType>('NON_AC');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<DraftKotItem[]>([]);
  const [searchItem, setSearchItem] = useState('');
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [createMobileTab, setCreateMobileTab] = useState<'menu' | 'ticket'>('menu');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Append items to existing KOT state
  const [appendingKot, setAppendingKot] = useState<Kot | null>(null);

  // Modals for Printing & Receipts
  const [billedReceipt, setBilledReceipt] = useState<{ bill: any; items: any[] } | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [previewKotData, setPreviewKotData] = useState<{ kot: Kot; items: KotItem[] } | null>(null);
  const [isKotModalOpen, setIsKotModalOpen] = useState(false);

  // Quick item code input ref
  const itemCodeRef = useRef<HTMLInputElement>(null);

  // Visual touch feedback & virtual keyboard management without layout shifts
  const [lastAddedItemId, setLastAddedItemId] = useState<string | null>(null);
  const addedTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastAddClickTimestampRef = useRef<{ [itemId: string]: number }>({});

  // Cleanup feedback timeout on unmount
  useEffect(() => {
    return () => {
      if (addedTimeoutRef.current) {
        clearTimeout(addedTimeoutRef.current);
      }
    };
  }, []);

  // Real-time listener for KOTs + Local Storage synchronization
  useEffect(() => {
    // 1. Prime immediately with locally cached KOTs (0ms latency)
    const loadFromLocal = () => {
      const local = getLocalKots();
      if (local.length > 0) {
        setRunningKots((prev) => mergeKots(prev, local));
        setLoading(false);
      }
    };
    loadFromLocal();

    // 2. Subscribe to local store events (updates across any tab or component)
    const unsubLocal = subscribeToLocalKots(() => {
      loadFromLocal();
    });

    // 3. Firestore snapshot listener
    const qKots = query(collection(db, 'kots'), orderBy('createdAt', 'desc'));
    const unsubKots = onSnapshot(qKots, async (snapshot) => {
      const kotList: Kot[] = [];
      snapshot.forEach((d) => kotList.push({ id: d.id, ...d.data() } as Kot));

      // Attempt to load kot_items
      let allKotItems: KotItem[] = [];
      try {
        const itemsSnapshot = await getDocs(collection(db, 'kot_items'));
        itemsSnapshot.forEach((d) => allKotItems.push({ id: d.id, ...d.data() } as KotItem));
      } catch (err) {
        console.warn('kot_items snapshot note:', err);
      }

      const remoteCombined = kotList.map((kot) => {
        const matchedItems = (kot.items && kot.items.length > 0) 
          ? kot.items 
          : allKotItems.filter((i) => i.kotId === kot.id);
        return {
          kot,
          items: matchedItems
        };
      });

      // Merge remote KOTs with local store so freshly created local KOTs are NEVER wiped out
      const local = getLocalKots();
      const merged = mergeKots(remoteCombined, local);
      setRunningKots(merged);
      setLoading(false);
    }, (err) => {
      console.warn('KOT snapshot error, using local store:', err);
      loadFromLocal();
      setLoading(false);
    });

    // Menu items listener
    const unsubMenu = onSnapshot(
      collection(db, 'menu_items'),
      (snapshot) => {
        const list: MenuItem[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.active !== false) {
            list.push({ id: d.id, ...data } as MenuItem);
          }
        });
        setFirestoreMenuItems(list);
      },
      (err) => {
        console.warn('Menu listener error:', err);
      }
    );

    return () => {
      unsubLocal();
      unsubKots();
      unsubMenu();
    };
  }, []);

  // Effective Menu items (Respects manual menu management and cleared state)
  const menuItems = useMemo(() => {
    try {
      const stored = localStorage.getItem('pos_local_menu_items');
      if (stored !== null) return JSON.parse(stored);
    } catch (e) {}
    return firestoreMenuItems;
  }, [firestoreMenuItems]);

  // Active occupied tables calculation
  const occupiedTables = useMemo(() => {
    const map = new Set<string>();
    runningKots.forEach(({ kot }) => {
      if (kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && kot.tableNumber) {
        map.add(kot.tableNumber.trim());
      }
    });
    return map;
  }, [runningKots]);

  // Categories list (supports multi-category categoryIds: string[])
  const categories = useMemo(() => {
    const distinct = new Map<string, string>();
    DEFAULT_CATEGORIES.forEach((c) => {
      if (c.active !== false) {
        distinct.set(c.id, c.categoryName || c.name || c.id);
      }
    });
    menuItems.forEach((m) => {
      const catIds = getItemCategoryIds(m);
      catIds.forEach((cid, idx) => {
        if (!distinct.has(cid)) {
          const name = (Array.isArray(m.categoryNames) && m.categoryNames[idx]) || m.categoryName || cid;
          distinct.set(cid, name);
        }
      });
    });

    return Array.from(distinct.entries()).map(([id, name]) => ({ id, name }));
  }, [menuItems]);

  // Filtered menu items for creating KOT (supports multi-category categoryIds and deduplicates ALL)
  const filteredMenuItems = useMemo(() => {
    const uniqueItems = deduplicateMenuItems(menuItems);
    return uniqueItems.filter((item) => {
      const matchesCat =
        selectedCategory === 'all' ||
        itemBelongsToCategory(item, selectedCategory, DEFAULT_CATEGORIES);
      const q = searchItem.trim().toLowerCase();
      const matchesSearch = 
        !q || 
        item.itemCode.toLowerCase().includes(q) || 
        item.itemName.toLowerCase().includes(q) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  }, [menuItems, selectedCategory, searchItem]);

  // Helper to detect touch or mobile viewport
  const isTouchDeviceOrMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.innerWidth < 1024
    );
  };

  // Helper to get total draft quantity for an item
  const getItemDraftQuantity = (itemId: string): number => {
    return selectedItems
      .filter((s) => s.item.id === itemId)
      .reduce((sum, s) => sum + s.quantity, 0);
  };

  // Add Item to Draft KOT with mobile virtual keyboard conflict check
  const handleAddItemToKot = (item: MenuItem, notes?: string) => {
    // Guard against rapid duplicate synthetic event trigger on touch screens (within 150ms)
    const now = Date.now();
    const lastClickTime = lastAddClickTimestampRef.current[item.id] || 0;
    if (now - lastClickTime < 150) {
      return;
    }
    lastAddClickTimestampRef.current[item.id] = now;

    // CONDITIONAL CHECK: Ensure touch-friendly interaction on mobile/touch screens
    // without virtual keyboard conflicts or unnecessary layout shifts
    if (isTouchDeviceOrMobile() && typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        // Dismiss virtual keyboard cleanly so it does not obscure KOT draft,
        // and prevent viewport height recalculation layout shifts
        activeEl.blur();
      }
    }

    // Trigger brief visual feedback without altering layout dimensions
    setLastAddedItemId(item.id);
    if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    addedTimeoutRef.current = setTimeout(() => setLastAddedItemId(null), 700);

    // PURE IMMUTABLE STATE UPDATE:
    // Ensures exactly 1 item and 1 quantity is added per single click,
    // preventing in-place object mutation that causes React StrictMode / double-render
    // to increment quantity by 2 instead of 1.
    setSelectedItems((prev) => {
      const existingIdx = prev.findIndex((p) => p.item.id === item.id && (p.notes || '') === (notes || ''));
      if (existingIdx >= 0) {
        return prev.map((entry, idx) =>
          idx === existingIdx ? { ...entry, quantity: entry.quantity + 1 } : entry
        );
      }
      return [...prev, { item, quantity: 1, notes: notes || '' }];
    });
  };

  // Quick inline quantity adjuster directly on menu catalog cards
  const handleQuickAdjustItemQty = (item: MenuItem, delta: number, e?: React.SyntheticEvent) => {
    if (e) {
      e.stopPropagation();
    }

    const now = Date.now();
    const lastClickTime = lastAddClickTimestampRef.current[item.id] || 0;
    if (now - lastClickTime < 150) {
      return;
    }
    lastAddClickTimestampRef.current[item.id] = now;

    // Dismiss virtual keyboard on touch/mobile to prevent viewport layout shifts
    if (isTouchDeviceOrMobile() && typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        activeEl.blur();
      }
    }

    setSelectedItems((prev) => {
      const existingIdx = prev.findIndex((p) => p.item.id === item.id);
      if (existingIdx === -1) {
        if (delta > 0) {
          return [...prev, { item, quantity: 1, notes: '' }];
        }
        return prev;
      }

      const newQty = prev[existingIdx].quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== existingIdx);
      }
      return prev.map((entry, idx) =>
        idx === existingIdx ? { ...entry, quantity: newQty } : entry
      );
    });

    if (delta > 0) {
      setLastAddedItemId(item.id);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => setLastAddedItemId(null), 600);
    }
  };

  // Fast code input (e.g. type '101' and press Enter to add)
  const handleCodeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = itemCodeInput.trim().toUpperCase();
      if (!code) return;

      const found = menuItems.find(
        (m) => m.itemCode.toUpperCase() === code || m.itemName.toUpperCase() === code
      );

      if (found) {
        handleAddItemToKot(found);
        setItemCodeInput('');
        // Dismiss mobile virtual keyboard on enter
        if (isTouchDeviceOrMobile() && itemCodeRef.current) {
          itemCodeRef.current.blur();
        }
      } else {
        setNotification({ type: 'error', message: `Item code "${code}" not found.` });
        setTimeout(() => setNotification(null), 3000);
      }
    }
  };

  const handleUpdateItemQty = (index: number, delta: number) => {
    setSelectedItems((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = prev[index].quantity + delta;
      if (next <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      return prev.map((entry, i) =>
        i === index ? { ...entry, quantity: next } : entry
      );
    });
  };

  const handleUpdateItemNote = (index: number, note: string) => {
    setSelectedItems((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.map((entry, i) =>
        i === index ? { ...entry, notes: note } : entry
      );
    });
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Start appending to an existing KOT
  const handleStartAppendToKot = (kot: Kot) => {
    setAppendingKot(kot);
    setTableNumber(kot.tableNumber);
    setOrderType(kot.orderType);
    setSelectedItems([]);
    setActiveTab('create');
    if (onTabChange) onTabChange('create');
  };

  // Cancel appending mode
  const handleCancelAppend = () => {
    setAppendingKot(null);
    setSelectedItems([]);
  };

  // Create or Append KOT
  const handleCreateKot = async (printSlip = true) => {
    if (selectedItems.length === 0) {
      setNotification({ type: 'error', message: 'Please add at least one item to create KOT.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setSubmitting(true);
    try {
      const businessDate = getBusinessDate(settings?.businessDayStart || '04:00');
      const now = Date.now();

      // If appending to an existing KOT
      if (appendingKot) {
        const newKotItems: KotItem[] = selectedItems.map((sel, idx) => ({
          id: `${appendingKot.id}_item_app_${now}_${idx + 1}`,
          kotId: appendingKot.id,
          itemId: sel.item.id,
          itemCode: sel.item.itemCode,
          itemName: sel.item.itemName,
          itemNameTamil: sel.item.itemNameTamil,
          quantity: sel.quantity,
          priceType,
          unitPrice: BillingEngine.getApplicablePrice(sel.item, priceType),
          notes: sel.notes || '',
          createdAt: now,
          updatedAt: now
        }));

        const existingItems = appendingKot.items || [];
        const combinedItems = [...existingItems, ...newKotItems];

        const updatedKot: Kot = {
          ...appendingKot,
          items: combinedItems,
          itemsCount: combinedItems.reduce((sum, i) => sum + i.quantity, 0),
          updatedAt: now
        };

        // 1. Immediately persist locally (0ms latency)
        saveKotLocally(updatedKot, combinedItems);

        // 2. Local state update
        setRunningKots((prev) => 
          prev.map((k) => k.kot.id === appendingKot.id ? { kot: updatedKot, items: combinedItems } : k)
        );

        // 3. Safe non-blocking print
        if (printSlip) {
          void PrintService.printKot(updatedKot, newKotItems, settings);
        }

        setNotification({
          type: 'success',
          message: `Added ${selectedItems.length} items to ${appendingKot.kotNumber} (${appendingKot.tableNumber})!`
        });

        setAppendingKot(null);
        setSelectedItems([]);
        setActiveTab('running');
        if (onTabChange) onTabChange('running');
        setTimeout(() => setNotification(null), 3500);

        // 4. Background Firestore commit
        try {
          const batch = writeBatch(db);
          batch.update(doc(db, 'kots', appendingKot.id), sanitizeForFirestore({
            items: combinedItems,
            itemsCount: updatedKot.itemsCount,
            updatedAt: now
          }));
          newKotItems.forEach((ki) => {
            batch.set(doc(db, 'kot_items', ki.id), sanitizeForFirestore(ki));
          });
          batch.commit().catch((dbErr) => console.warn('Firestore append notice:', dbErr));
        } catch (dbErr) {
          console.warn('Firestore update warning, saved locally:', dbErr);
        }

        return;
      }

      // Brand New KOT
      const { kotNumber } = await allocateNextKotNumber(businessDate);
      const kotId = `kot_${now}_${Math.random().toString(36).substring(2, 6)}`;

      const kotItems: KotItem[] = selectedItems.map((sel, idx) => ({
        id: `${kotId}_item_${idx + 1}`,
        kotId,
        itemId: sel.item.id,
        itemCode: sel.item.itemCode,
        itemName: sel.item.itemName,
        itemNameTamil: sel.item.itemNameTamil,
        quantity: sel.quantity,
        priceType,
        unitPrice: BillingEngine.getApplicablePrice(sel.item, priceType),
        notes: sel.notes || '',
        createdAt: now,
        updatedAt: now
      }));

      const newKot: Kot = {
        id: kotId,
        kotNumber,
        businessDate,
        orderType,
        tableNumber: orderType === 'DINE_IN' ? (tableNumber.trim() || 'T-1') : 'Take Away',
        waiterId: currentUser?.uid || 'staff',
        waiterName: currentUser?.name || 'Waiter',
        status: 'OPEN',
        items: kotItems,
        itemsCount: kotItems.reduce((sum, i) => sum + i.quantity, 0),
        createdBy: currentUser?.name || 'Staff',
        createdAt: now,
        updatedAt: now
      };

      // 1. Immediately persist locally (0ms latency) - bulletproof against network delays
      saveKotLocally(newKot, kotItems);

      // 2. Update Local State Optimistically
      setRunningKots((prev) => [{ kot: newKot, items: kotItems }, ...prev.filter(k => k.kot.id !== newKot.id)]);

      // 3. Safe non-blocking direct ESC/POS KOT print via PrintService
      if (printSlip) {
        void PrintService.printKot(newKot, kotItems, settings);
      }

      // 4. UI Transition
      setNotification({ type: 'success', message: `KOT ${kotNumber} generated for ${newKot.tableNumber}!` });
      setSelectedItems([]);
      setActiveTab('running');
      if (onTabChange) onTabChange('running');
      setTimeout(() => setNotification(null), 3500);

      // 5. Write to Firestore in background
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'kots', kotId), sanitizeForFirestore(newKot));
        kotItems.forEach((ki) => {
          batch.set(doc(db, 'kot_items', ki.id), sanitizeForFirestore(ki));
        });
        batch.commit().catch((err) => console.warn('Background KOT batch sync notice:', err));
      } catch (err) {
        console.warn('Offline KOT creation notice:', err);
      }
    } catch (e: any) {
      console.error('Error creating KOT:', e);
      setNotification({ type: 'error', message: e.message || 'Failed to create KOT.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Status progression
  const handleUpdateKotStatus = async (kotId: string, newStatus: KotStatus) => {
    try {
      // 1. Update locally immediately
      updateLocalKotStatus(kotId, newStatus);

      // 2. Update local state
      setRunningKots((prev) => 
        prev.map((k) => k.kot.id === kotId ? { ...k, kot: { ...k.kot, status: newStatus, updatedAt: Date.now() } } : k)
      );

      // 3. Update Firestore in background
      try {
        await updateDoc(doc(db, 'kots', kotId), {
          status: newStatus,
          updatedAt: Date.now()
        });
      } catch (err) {
        console.warn('Offline status update (preserved locally):', err);
      }

      setNotification({ type: 'success', message: `KOT status updated to ${newStatus}` });
      setTimeout(() => setNotification(null), 2500);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Failed to update KOT status' });
    }
  };

  // Push Running KOT to finalized Bill
  const handlePushKotToBilling = async (kot: Kot, items: KotItem[]) => {
    try {
      setSubmitting(true);
      const effectiveItems = (items && items.length > 0) ? items : (kot.items || []);

      if (effectiveItems.length === 0) {
        setNotification({ type: 'error', message: 'Cannot bill an empty KOT.' });
        return;
      }

      const result = await BillingEngine.convertKotToBill(
        kot,
        effectiveItems,
        effectiveItems[0]?.priceType || priceType,
        currentUser?.uid || 'cashier_1',
        currentUser?.name || 'Cashier'
      );

      // Local store update
      updateLocalKotStatus(kot.id, 'BILLED');

      // Local state update
      setRunningKots((prev) => 
        prev.map((k) => k.kot.id === kot.id ? { ...k, kot: { ...k.kot, status: 'BILLED', updatedAt: Date.now() } } : k)
      );

      setBilledReceipt(result);
      setNotification({
        type: 'success',
        message: 'Printing...'
      });

      void PrintService.printReceipt({
        bill: result.bill,
        items: result.items,
        settings,
        forcePrint: true
      }).then((printRes) => {
        if (printRes.success) {
          setNotification({
            type: 'success',
            message: `Bill ${result.bill.billNumber} Printed`
          });
        } else {
          setNotification({
            type: 'error',
            message: `Bill ${result.bill.billNumber} saved. Printing failed.`
          });
        }
        setTimeout(() => setNotification(null), 4500);
      });
    } catch (e: any) {
      console.error('Push to billing error:', e);
      setNotification({ type: 'error', message: e.message || 'Failed to convert KOT to Bill' });
    } finally {
      setSubmitting(false);
    }
  };

  // Filter running KOTs
  const filteredKots = useMemo(() => {
    return runningKots.filter(({ kot }) => {
      if (statusFilter === 'ACTIVE') {
        return kot.status !== 'BILLED' && kot.status !== 'CANCELLED';
      }
      if (statusFilter === 'ALL') return true;
      return kot.status === statusFilter;
    });
  }, [runningKots, statusFilter]);

  // KOTs in current view that can be marked as Completed (active and not already completed)
  const eligibleVisibleKots = useMemo(() => {
    return filteredKots.filter(({ kot }) => 
      kot.status !== 'BILLED' && 
      kot.status !== 'CANCELLED' && 
      kot.status !== 'COMPLETED'
    );
  }, [filteredKots]);

  const isAllEligibleSelected = 
    eligibleVisibleKots.length > 0 && 
    eligibleVisibleKots.every(({ kot }) => selectedKotIds.includes(kot.id));

  const handleToggleSelectKot = (kotId: string) => {
    setSelectedKotIds((prev) => 
      prev.includes(kotId) ? prev.filter((id) => id !== kotId) : [...prev, kotId]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllEligibleSelected) {
      setSelectedKotIds([]);
    } else {
      setSelectedKotIds(eligibleVisibleKots.map(({ kot }) => kot.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedKotIds([]);
  };

  // Bulk mark selected KOTs as Completed simultaneously
  const handleBulkMarkCompleted = async () => {
    if (selectedKotIds.length === 0) return;

    setBulkUpdating(true);
    const now = Date.now();
    const count = selectedKotIds.length;
    const targetIds = [...selectedKotIds];

    try {
      // 1. Batch update in Firestore
      try {
        const batch = writeBatch(db);
        targetIds.forEach((kotId) => {
          batch.update(doc(db, 'kots', kotId), {
            status: 'COMPLETED',
            updatedAt: now
          });
        });
        await batch.commit();
      } catch (dbErr) {
        console.warn('Firestore bulk status update notice:', dbErr);
      }

      // 2. Optimistic local state & store update
      targetIds.forEach((id) => updateLocalKotStatus(id, 'COMPLETED'));
      setRunningKots((prev) =>
        prev.map((k) =>
          targetIds.includes(k.kot.id)
            ? { ...k, kot: { ...k.kot, status: 'COMPLETED', updatedAt: now } }
            : k
        )
      );

      // 3. Clear selection
      setSelectedKotIds([]);

      setNotification({
        type: 'success',
        message: `Marked ${count} Kitchen Order Ticket${count > 1 ? 's' : ''} as Completed!`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (e: any) {
      console.error('Error bulk completing KOTs:', e);
      setNotification({
        type: 'error',
        message: 'Failed to update selected KOTs'
      });
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setBulkUpdating(false);
    }
  };

  const getStatusBadge = (status: KotStatus) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/40';
      case 'SENT':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/40';
      case 'PREPARING':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
      case 'READY':
      case 'COMPLETED':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'BILLED':
        return 'bg-slate-800 text-slate-400 border-slate-700';
      case 'CANCELLED':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      default:
        return 'bg-slate-800 text-slate-300';
    }
  };

  const getElapsedTimeInfo = (createdAt: number) => {
    const diffMin = Math.floor((Date.now() - createdAt) / (1000 * 60));
    let text = 'Just now';
    if (diffMin >= 1 && diffMin < 60) text = `${diffMin}m ago`;
    else if (diffMin >= 60) {
      const diffHours = Math.floor(diffMin / 60);
      text = `${diffHours}h ${diffMin % 60}m ago`;
    }
    const isUrgent = diffMin >= 30;
    const isWarning = diffMin >= 15 && diffMin < 30;
    return { text, diffMin, isUrgent, isWarning };
  };

  const getElapsedTime = (createdAt: number) => {
    return getElapsedTimeInfo(createdAt).text;
  };

  // Rush Hour Kitchen Aggregator: compute count of all items across currently active KOTs
  const rushDemandSummary = useMemo(() => {
    const active = runningKots.filter(({ kot }) => kot.status !== 'BILLED' && kot.status !== 'CANCELLED');
    const counts: Record<string, { name: string; tamil?: string; qty: number }> = {};
    active.forEach(({ items, kot }) => {
      const srcItems = (items && items.length > 0) ? items : (kot.items || []);
      srcItems.forEach((it) => {
        const key = it.itemName;
        if (!counts[key]) {
          counts[key] = { name: it.itemName, tamil: it.itemNameTamil, qty: 0 };
        }
        counts[key].qty += it.quantity;
      });
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty);
  }, [runningKots]);

  return (
    <div className="flex flex-col min-h-full lg:h-full bg-slate-950 text-slate-100 p-1.5 sm:p-3.5 gap-1.5 sm:gap-3 overflow-y-auto lg:overflow-hidden pb-2 sm:pb-4">
      
      {/* Top Header & Tab Switcher - Ultra Compact on Mobile */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 bg-slate-900 border border-slate-800 p-1.5 sm:p-3 rounded-xl shadow-xs shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <ChefHat className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-bold text-xs sm:text-base tracking-wide text-slate-100 leading-tight truncate">
              Kitchen Orders (KOT)
            </h2>
            <span className="hidden sm:inline text-[11px] text-slate-400">
              Live Kitchen Dispatch & Table Order Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={() => {
              setAppendingKot(null);
              setActiveTab('running');
              if (onTabChange) onTabChange('running');
            }}
            className={`h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 touch-manipulation active:scale-[0.98] ${
              activeTab === 'running'
                ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Running ({runningKots.filter(k => k.kot.status !== 'BILLED' && k.kot.status !== 'CANCELLED').length})</span>
          </button>

          <button
            onClick={() => {
              setAppendingKot(null);
              setSelectedItems([]);
              setActiveTab('create');
              if (onTabChange) onTabChange('create');
            }}
            className={`h-8 sm:h-10 px-2.5 sm:px-4 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 touch-manipulation active:scale-[0.98] ${
              activeTab === 'create' && !appendingKot
                ? 'bg-emerald-600 text-white shadow-xs font-black'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New KOT</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-lg text-xs flex items-center gap-2 shadow-md animate-in fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-200'
            : 'bg-red-950/90 border border-red-500/40 text-red-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* TAB 1: RUNNING KOTS VIEW */}
      {activeTab === 'running' && (
        <div className="flex flex-col flex-1 gap-3 overflow-hidden">
          
          {/* Rush Hour Kitchen Item Demand Aggregator */}
          {rushDemandSummary.length > 0 && (
            <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-2.5 shadow-md shrink-0">
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[11px] font-black tracking-wider uppercase text-amber-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                  Rush Hour Kitchen Demand (All Active Tables)
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {rushDemandSummary.reduce((acc, i) => acc + i.qty, 0)} items to prepare
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                {rushDemandSummary.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs shrink-0 font-medium"
                  >
                    <span className="text-white font-bold">{item.name}</span>
                    <span className="bg-amber-500/20 text-amber-300 font-mono font-black px-1.5 py-0.2 rounded text-xs border border-amber-500/30">
                      ×{item.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Filter Bar & Select All Control */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 bg-slate-900 p-1.5 sm:p-2 rounded-xl border border-slate-800 text-xs shrink-0">
            <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto max-w-full no-scrollbar">
              <span className="text-slate-400 font-bold px-1.5 text-[11px] sm:text-xs flex items-center gap-1 shrink-0">
                <Filter className="w-3 h-3 text-amber-400" /> Filter:
              </span>
              {[
                { id: 'ACTIVE', label: 'Active Kitchen', count: runningKots.filter(k => k.kot.status !== 'BILLED' && k.kot.status !== 'CANCELLED').length },
                { id: 'ALL', label: 'All KOTs', count: runningKots.length },
                { id: 'OPEN', label: 'Open', count: runningKots.filter(k => k.kot.status === 'OPEN').length },
                { id: 'SENT', label: 'Sent', count: runningKots.filter(k => k.kot.status === 'SENT').length },
                { id: 'PREPARING', label: 'Preparing', count: runningKots.filter(k => k.kot.status === 'PREPARING').length },
                { id: 'READY', label: 'Ready', count: runningKots.filter(k => k.kot.status === 'READY').length },
                { id: 'COMPLETED', label: 'Completed', count: runningKots.filter(k => k.kot.status === 'COMPLETED').length },
                { id: 'BILLED', label: 'Billed', count: runningKots.filter(k => k.kot.status === 'BILLED').length },
                { id: 'CANCELLED', label: 'Cancelled', count: runningKots.filter(k => k.kot.status === 'CANCELLED').length }
              ].map((st) => (
                <button
                  key={st.id}
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1 h-7 sm:h-8 rounded-lg text-[11px] sm:text-xs font-semibold cursor-pointer transition-colors shrink-0 flex items-center gap-1 ${
                    statusFilter === st.id
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
                  }`}
                >
                  <span>{st.label}</span>
                  {st.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      statusFilter === st.id
                        ? 'bg-slate-950/20 text-slate-950'
                        : 'bg-slate-900 text-slate-300 border border-slate-700'
                    }`}>
                      {st.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Select All Toggle for active KOTs */}
            {eligibleVisibleKots.length > 0 && (
              <div className="flex items-center gap-1.5 ml-auto shrink-0">
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className={`px-2.5 py-1 h-7 sm:h-8 rounded-lg text-[11px] sm:text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer shrink-0 ${
                    isAllEligibleSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                      : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                  }`}
                  title="Select or deselect all active kitchen orders in view"
                >
                  {isAllEligibleSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                  <span>{isAllEligibleSelected ? 'Deselect All' : `Select All (${eligibleVisibleKots.length})`}</span>
                </button>
              </div>
            )}
          </div>

          {/* Multi-Select Bulk Action Bar for Kitchen Staff */}
          {selectedKotIds.length > 0 && (
            <div className="bg-emerald-950/90 border-2 border-emerald-500/80 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xl shadow-emerald-950/50 animate-in fade-in slide-in-from-top-2 duration-150 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-slate-950 font-black text-sm shadow-xs">
                  {selectedKotIds.length}
                </span>
                <div>
                  <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <ListChecks className="w-4 h-4 text-emerald-400" />
                    <span>{selectedKotIds.length} {selectedKotIds.length === 1 ? 'KOT' : 'KOTs'} Selected</span>
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    Kitchen staff bulk dispatch: mark multiple orders as Completed simultaneously
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2.5 py-1 h-7 rounded-md bg-slate-900/90 hover:bg-slate-900 text-slate-300 hover:text-white text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
                >
                  Cancel Selection
                </button>
                <button
                  type="button"
                  onClick={handleBulkMarkCompleted}
                  disabled={bulkUpdating}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>{bulkUpdating ? 'Marking Completed...' : `Mark Completed (${selectedKotIds.length})`}</span>
                </button>
              </div>
            </div>
          )}

          {/* Running KOTs Cards Grid - Responsive CSS grid optimized for mobile and kitchen screens */}
          <div className="flex-1 overflow-y-auto pr-1">
            {filteredKots.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-slate-500 text-center p-8 space-y-3 bg-slate-900/40 rounded-xl border border-slate-800">
                <ChefHat className="w-14 h-14 text-slate-700 stroke-1" />
                <div>
                  <p className="font-bold text-sm text-slate-400">No Kitchen Orders Found</p>
                  <p className="text-xs text-slate-600 max-w-sm mt-1">
                    Click <b className="text-emerald-400">"New KOT"</b> in the top bar to dispatch an order ticket directly to the kitchen.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Create First KOT
                </button>
              </div>
            ) : (
              <div className="kot-card-grid w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6 min-[2560px]:grid-cols-7 gap-2.5 sm:gap-3.5">
                {filteredKots.map(({ kot, items }) => {
                  const effectiveItems = (items && items.length > 0) ? items : (kot.items || []);
                  const totalItemCount = effectiveItems.reduce((acc, i) => acc + i.quantity, 0);
                  const isSelected = selectedKotIds.includes(kot.id);
                  const elapsed = getElapsedTimeInfo(kot.createdAt);

                  return (
                    <div
                      key={kot.id}
                      className={`bg-slate-900 border rounded-xl p-3 sm:p-4 flex flex-col justify-between shadow-md space-y-2.5 sm:space-y-3 transition-all ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/80 bg-slate-900/95 shadow-emerald-950/40'
                          : elapsed.isUrgent && kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && kot.status !== 'COMPLETED' && kot.status !== 'READY'
                          ? 'border-rose-500/60 shadow-rose-950/20'
                          : kot.status === 'READY' || kot.status === 'COMPLETED'
                          ? 'border-emerald-500/60 shadow-emerald-950/20' 
                          : kot.status === 'PREPARING'
                          ? 'border-amber-500/50'
                          : kot.status === 'BILLED'
                          ? 'border-slate-800 opacity-75'
                          : 'border-slate-800'
                      }`}
                    >
                      {/* Card Header: Table, KOT #, Status & Urgency Clock */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          {/* Kitchen multi-select checkbox (compact secondary control) */}
                          {kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectKot(kot.id);
                              }}
                              className={`mt-0.5 w-7 h-7 p-1 rounded-md border transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                                isSelected
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-xs'
                                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                              }`}
                              title={isSelected ? "Deselect this KOT" : "Select this KOT for bulk completion"}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-3.5 h-3.5" />
                              ) : (
                                <Square className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <span className="font-mono text-base sm:text-lg font-black text-amber-400 tracking-tight">
                                {kot.kotNumber}
                              </span>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border tracking-wider ${getStatusBadge(kot.status)}`}>
                                {kot.status}
                              </span>
                            </div>

                            <div className="text-xs text-slate-300 font-medium mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-700 font-black text-amber-300 text-xs sm:text-sm">
                                {kot.tableNumber || 'Take Away'}
                              </span>
                              <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded border ${
                                kot.orderType === 'DINE_IN' 
                                  ? 'bg-blue-950/60 text-blue-300 border-blue-800/40' 
                                  : 'bg-purple-950/60 text-purple-300 border-purple-800/40'
                              }`}>
                                {kot.orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Urgency and Staff Metadata */}
                        <div className="text-right text-[11px] font-mono space-y-0.5 shrink-0">
                          <div className={`font-semibold flex items-center justify-end gap-1 px-1.5 py-0.5 rounded text-[10.5px] sm:text-xs ${
                            elapsed.isUrgent && kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && kot.status !== 'COMPLETED'
                              ? 'text-rose-300 bg-rose-950/80 border border-rose-500/50 animate-pulse' 
                              : elapsed.isWarning && kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && kot.status !== 'COMPLETED'
                              ? 'text-amber-300 bg-amber-950/60 border border-amber-500/40' 
                              : 'text-slate-300'
                          }`}>
                            <Clock className={`w-3 h-3 ${elapsed.isUrgent && kot.status !== 'BILLED' ? 'text-rose-400' : 'text-amber-400'}`} />
                            <span>{elapsed.text}</span>
                          </div>
                          <div className="text-slate-400 text-[10px] sm:text-[11px]">By: {kot.waiterName || 'Staff'}</div>
                        </div>
                      </div>

                      {/* Items List Table with increased font size & padding, showing 3-4 items clearly */}
                      <div className="bg-slate-950/80 p-3 sm:p-3.5 rounded-lg border border-slate-800/80 space-y-2.5 text-xs font-mono max-h-64 sm:max-h-56 overflow-y-auto">
                        <div className="flex justify-between text-xs text-slate-400 font-sans uppercase font-bold border-b border-slate-800 pb-1.5">
                          <span>Dishes ({totalItemCount})</span>
                          <span>Qty</span>
                        </div>
                        {effectiveItems.map((itm, idx) => (
                          <div key={idx} className="flex justify-between items-start text-slate-200 border-b border-slate-900/60 pb-2 last:border-0 last:pb-0 gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-100 text-sm sm:text-[13px] leading-snug break-words">
                                {idx + 1}. {itm.itemName}
                              </div>
                              {itm.notes && (
                                <span className="inline-flex items-center gap-1 text-xs sm:text-[11px] text-amber-300 font-sans bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded mt-1 font-medium">
                                  <span>⚡</span>
                                  <span>{itm.notes}</span>
                                </span>
                              )}
                            </div>
                            <span className="font-black text-amber-400 text-base font-mono bg-slate-900 px-2.5 py-0.5 rounded border border-slate-800 shrink-0 ml-1.5 shadow-xs">
                              ×{itm.quantity}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Status Workflow Progress Controls */}
                      {kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && (
                        <div className="flex items-center gap-1.5 pt-1">
                          {kot.status === 'OPEN' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateKotStatus(kot.id, 'PREPARING')}
                                className="flex-1 py-1.5 sm:py-1.5 bg-amber-500/20 hover:bg-amber-500/30 active:bg-amber-500/40 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                              >
                                <Flame className="w-3.5 h-3.5" /> Start Preparing
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateKotStatus(kot.id, 'COMPLETED')}
                                className="py-1.5 sm:py-1.5 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shrink-0"
                                title="Directly mark this KOT as Completed"
                              >
                                <CheckCircle className="w-3.5 h-3.5" /> Done
                              </button>
                            </>
                          )}

                          {(kot.status === 'PREPARING' || kot.status === 'SENT') && (
                            <button
                              type="button"
                              onClick={() => handleUpdateKotStatus(kot.id, 'COMPLETED')}
                              className="flex-1 py-1.5 sm:py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 active:bg-emerald-500/40 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Mark Completed
                            </button>
                          )}

                          {(kot.status === 'READY' || kot.status === 'COMPLETED') && (
                            <div className="flex-1 py-1.5 px-2 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 rounded-lg text-center text-xs font-bold flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>✓ Ready for Service</span>
                            </div>
                          )}

                          {/* Append Items Button (Reduced secondary button size) */}
                          <button
                            type="button"
                            onClick={() => handleStartAppendToKot(kot)}
                            className="px-2 py-1 h-7 sm:h-7.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 text-slate-300 rounded-md text-[11px] sm:text-xs font-semibold border border-slate-700 flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                            title="Add more items to this running table KOT"
                          >
                            <PlusCircle className="w-3 h-3 text-blue-400" />
                            <span>+ Items</span>
                          </button>
                        </div>
                      )}

                      {/* Action Footer Bar */}
                      <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-slate-800">
                        
                        {/* Status Select dropdown (Reduced secondary control size) */}
                        {kot.status !== 'BILLED' && (
                          <select
                            value={kot.status || 'OPEN'}
                            aria-label="Update KOT Status"
                            onChange={(e) => handleUpdateKotStatus(kot.id, e.target.value as KotStatus)}
                            className="bg-slate-800 text-[10px] sm:text-[11px] font-semibold text-slate-300 border border-slate-700 rounded-md px-1.5 py-1 h-7 focus:outline-none cursor-pointer"
                          >
                            <option value="OPEN">Status: OPEN</option>
                            <option value="SENT">Status: SENT</option>
                            <option value="PREPARING">Status: PREPARING</option>
                            <option value="READY">Status: READY</option>
                            <option value="COMPLETED">Status: COMPLETED</option>
                            <option value="CANCELLED">CANCEL KOT</option>
                          </select>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          
                          {/* Direct Print KOT Slip (Reduced secondary button size) */}
                          <button
                            type="button"
                            onClick={() => {
                              void PrintService.printKot(kot, effectiveItems, settings);
                              setNotification({
                                type: 'success',
                                message: `KOT #${kot.kotNumber} sent to kitchen printer!`
                              });
                              setTimeout(() => setNotification(null), 3000);
                            }}
                            className="w-7 h-7 p-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 text-slate-300 rounded-md border border-slate-700 cursor-pointer transition-colors flex items-center justify-center shrink-0"
                            title={`Direct Print KOT #${kot.kotNumber} to Kitchen Printer`}
                          >
                            <Printer className="w-3.5 h-3.5 text-amber-400" />
                          </button>

                          {/* Direct Convert to Bill Button */}
                          {kot.status !== 'BILLED' && kot.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => handlePushKotToBilling(kot, effectiveItems)}
                              disabled={submitting}
                              className="px-3 py-1.5 h-7 sm:h-8 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-black flex items-center gap-1 shadow-md shadow-emerald-600/20 transition-colors cursor-pointer"
                              title="Settle order and convert to finalized Bill"
                            >
                              <span>Bill Now</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: CREATE / APPEND KOT FORM */}
      {activeTab === 'create' && (
        <div className="flex flex-col flex-1 overflow-hidden gap-1.5 sm:gap-2">
          
          {/* Mobile Tab Switcher for Create KOT: Catalog vs Ticket */}
          <div className="lg:hidden flex items-center bg-slate-900 border border-slate-800 p-1 rounded-lg shrink-0 gap-1">
            <button
              onClick={() => setCreateMobileTab('menu')}
              className={`flex-1 py-1.5 h-8 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer ${
                createMobileTab === 'menu'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Menu Items</span>
            </button>
            <button
              onClick={() => setCreateMobileTab('ticket')}
              className={`flex-1 py-1.5 h-8 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer ${
                createMobileTab === 'ticket'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'text-slate-400 hover:text-white bg-slate-950/60 border border-slate-800'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>KOT Draft</span>
              {selectedItems.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                  createMobileTab === 'ticket' ? 'bg-slate-950 text-amber-300' : 'bg-amber-500 text-slate-950'
                }`}>
                  {selectedItems.reduce((sum, i) => sum + i.quantity, 0)}
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 flex-1 overflow-hidden relative">
            
            {/* Left Column: Menu Catalog & Search (7 Cols) */}
            <div className={`lg:col-span-7 flex-col bg-slate-900 border border-slate-800 rounded-xl p-2 sm:p-3.5 gap-2 overflow-hidden ${
              createMobileTab === 'menu' ? 'flex' : 'hidden lg:flex'
            }`}>
            
            {/* Quick Code & Search Input - Combined single row on mobile */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              
              {/* Direct Code Input Box */}
              <div className="w-24 sm:w-36 shrink-0 relative">
                <input
                  ref={itemCodeRef}
                  type="text"
                  inputMode="numeric"
                  enterKeyHint="done"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="# Code"
                  value={itemCodeInput || ''}
                  onChange={(e) => setItemCodeInput(e.target.value)}
                  onKeyDown={handleCodeInputKeyDown}
                  className="w-full bg-slate-950 border-2 border-amber-400 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-300 h-8 sm:h-9"
                />
              </div>

              {/* Text Search Bar */}
              <div className="flex-1 relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  enterKeyHint="search"
                  placeholder="Search item (Dosa, Idly, Coffee)..."
                  value={searchItem || ''}
                  onChange={(e) => setSearchItem(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 h-8 sm:h-9"
                />
                {searchItem && (
                  <button
                    type="button"
                    onClick={() => setSearchItem('')}
                    className="absolute right-2 p-1 text-slate-400 hover:text-white rounded-md cursor-pointer touch-manipulation"
                    title="Clear search"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs shrink-0 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 h-7 rounded-md font-bold shrink-0 cursor-pointer transition-colors touch-manipulation text-[11px] sm:text-xs ${
                  selectedCategory === 'all'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                All ({menuItems.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 h-7 rounded-md font-semibold shrink-0 cursor-pointer transition-colors touch-manipulation text-[11px] sm:text-xs ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid - High density responsive CSS grid to show many items clearly on mobile */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-2.5 pr-0.5 pb-16 lg:pb-1">
              {filteredMenuItems.map((item) => {
                const price = BillingEngine.getApplicablePrice(item, priceType);
                const inDraftQty = getItemDraftQuantity(item.id);
                const isRecentlyAdded = lastAddedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleAddItemToKot(item)}
                    className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-950 border text-left transition-all flex flex-col justify-between cursor-pointer group shadow-xs min-h-[72px] sm:min-h-[85px] touch-manipulation active:scale-[0.99] select-none ${
                      isRecentlyAdded
                        ? 'border-emerald-400 ring-2 ring-emerald-400/40 bg-slate-900'
                        : inDraftQty > 0
                        ? 'border-amber-500/60 bg-slate-900/80 shadow-amber-950/20'
                        : 'border-slate-800 hover:border-amber-500/50 hover:bg-slate-850'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-bold text-amber-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                          #{item.itemCode}
                        </span>
                        {inDraftQty > 0 ? (
                          <span className="text-[10px] font-mono font-bold bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded-full animate-in fade-in shrink-0">
                            ×{inDraftQty}
                          </span>
                        ) : (
                          <span className="text-[9.5px] text-slate-500 font-medium truncate">
                            {item.categoryName?.split(' ')[0]}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-xs sm:text-[13px] text-slate-100 mt-1 line-clamp-1 sm:line-clamp-2 leading-tight group-hover:text-amber-200">
                        {item.itemName}
                      </h4>
                    </div>

                    <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-slate-900/80 gap-1">
                      <span className="text-xs sm:text-sm font-mono text-emerald-400 font-black">
                        ₹{price}
                      </span>

                      {inDraftQty > 0 ? (
                        /* Fast in-catalog stepper for touch devices */
                        <div
                          className="flex items-center gap-0.5 bg-slate-900 rounded-md border border-amber-500/40 p-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleQuickAdjustItemQty(item, -1, e)}
                            className="w-5 h-5 flex items-center justify-center font-bold text-slate-300 hover:text-white active:bg-slate-800 rounded touch-manipulation cursor-pointer text-xs"
                            title="Decrease quantity"
                          >
                            -
                          </button>
                          <span className="font-mono font-black text-amber-300 px-1 text-xs">
                            {inDraftQty}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleQuickAdjustItemQty(item, 1, e)}
                            className="w-5 h-5 flex items-center justify-center font-bold text-emerald-400 hover:text-emerald-300 active:bg-slate-800 rounded touch-manipulation cursor-pointer text-xs"
                            title="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-900 group-hover:bg-amber-500 group-hover:text-slate-950 px-1.5 py-0.5 rounded flex items-center gap-0.5 font-bold transition-colors">
                          <Plus className="w-3 h-3" /> Add
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Sticky View Ticket & Send Bar on Mobile in Catalog view */}
            {selectedItems.length > 0 && (
              <div className="lg:hidden fixed bottom-2 left-2 right-2 sm:left-auto sm:right-4 sm:w-96 z-40">
                <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 p-1.5 rounded-xl shadow-2xl flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCreateMobileTab('ticket')}
                    className="flex-1 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-amber-300 px-2.5 py-2 h-9 rounded-lg font-bold text-xs flex items-center justify-between border border-slate-700 cursor-pointer transition-colors touch-manipulation"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <ChefHat className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{selectedItems.reduce((sum, i) => sum + i.quantity, 0)} Items ({tableNumber.trim() || 'T-1'})</span>
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0 ml-1">Draft →</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateKot(false)}
                    disabled={submitting}
                    className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white px-3.5 py-2 h-9 rounded-lg font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-600/30 cursor-pointer shrink-0 transition-all active:scale-[0.98] touch-manipulation"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submitting ? '...' : 'Send KOT'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Right Column: New KOT Ticket Draft & Controls (5 Cols) */}
          <div className={`lg:col-span-5 flex-col bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-4 gap-2 sm:gap-3 overflow-hidden shadow-xl ${
            createMobileTab === 'ticket' ? 'flex' : 'hidden lg:flex'
          }`}>
            
            {/* Header / Mode Indicator */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateMobileTab('menu')}
                  className="lg:hidden px-2.5 py-1 h-7 bg-slate-800 hover:bg-slate-700 active:bg-slate-650 text-amber-300 rounded-md text-xs font-bold cursor-pointer mr-1 touch-manipulation flex items-center gap-1"
                  title="Back to menu"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Menu</span>
                </button>
                <ChefHat className="w-4 h-4 text-amber-400" />
                <h3 className="font-black text-sm text-slate-100">
                  {appendingKot ? `Append to ${appendingKot.kotNumber}` : 'New KOT Ticket'}
                </h3>
              </div>

              {appendingKot ? (
                <button
                  type="button"
                  onClick={handleCancelAppend}
                  className="text-[11px] text-red-400 hover:bg-red-950/40 px-2 py-1 h-7 rounded-md flex items-center gap-1 cursor-pointer touch-manipulation transition-colors"
                >
                  <XCircle className="w-3 h-3" /> Cancel Append
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedItems([])}
                  disabled={selectedItems.length === 0}
                  className="text-[11px] text-slate-400 hover:text-red-400 disabled:opacity-30 px-2 py-1 h-7 rounded-md flex items-center gap-1 cursor-pointer touch-manipulation transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {/* Step 1: Table & Order Type Selection */}
            {!appendingKot && (
              <div className="space-y-1.5 bg-slate-950 p-2 sm:p-3 rounded-xl border border-slate-800 text-xs shrink-0">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] sm:text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Select Table / Order Type
                  </label>
                  
                  {/* Price Type Toggle (Compact secondary control) */}
                  <div className="flex items-center bg-slate-900 p-0.5 rounded border border-slate-700 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPriceType('NON_AC')}
                      className={`px-2 py-0.5 h-6 rounded font-bold cursor-pointer touch-manipulation ${
                        priceType === 'NON_AC' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      NON-AC
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceType('AC')}
                      className={`px-2 py-0.5 h-6 rounded font-bold cursor-pointer touch-manipulation ${
                        priceType === 'AC' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      AC
                    </button>
                  </div>
                </div>

                {/* Quick Table Selection Pills - Single scrollable row on mobile with compact secondary buttons */}
                <div className="flex overflow-x-auto gap-1.5 py-0.5 no-scrollbar sm:flex-wrap sm:max-h-24">
                  {COMMON_TABLES.map((t) => {
                    const isOccupied = occupiedTables.has(t);
                    const isSelected = tableNumber === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTableNumber(t);
                          if (t === 'Take Away') setOrderType('TAKE_AWAY');
                          else setOrderType('DINE_IN');
                        }}
                        className={`px-2 py-0.5 h-7 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer flex items-center gap-1 shrink-0 touch-manipulation active:scale-[0.98] ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-400 shadow-xs'
                            : isOccupied
                            ? 'bg-amber-950/60 text-amber-300 border-amber-600/50 hover:bg-amber-900/60'
                            : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {isOccupied && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>}
                        <span>{t}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Table Input */}
                <div className="flex gap-1.5 pt-0.5">
                  <input
                    type="text"
                    value={tableNumber || ''}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="Custom Table / Location"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 h-7 sm:h-8"
                  />
                  <select
                    value={orderType || 'DINE_IN'}
                    onChange={(e) => setOrderType(e.target.value as OrderType)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none h-7 sm:h-8 cursor-pointer"
                  >
                    <option value="DINE_IN">Dine In</option>
                    <option value="TAKE_AWAY">Take Away</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 2: Selected KOT Items List Container - Increased font size & padding, clearly displaying at least 3-4 items */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800 bg-slate-950 p-3 sm:p-4 rounded-xl border border-slate-800 min-h-[220px] sm:min-h-[180px] space-y-2">
              {selectedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6 space-y-2">
                  <Utensils className="w-8 h-8 text-slate-700 stroke-1" />
                  <p className="font-semibold text-slate-400">KOT Draft is Empty</p>
                  <p className="text-slate-600 max-w-xs">
                    Select dishes from the left menu or type code above to build kitchen ticket.
                  </p>
                </div>
              ) : (
                selectedItems.map((sel, idx) => (
                  <div key={idx} className="py-2 space-y-1.5 text-xs first:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-amber-400 text-xs bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 shrink-0 font-bold">
                            #{sel.item.itemCode}
                          </span>
                          <span className="text-sm sm:text-base font-bold text-slate-100 truncate">
                            {sel.item.itemName}
                          </span>
                        </div>
                      </div>

                      {/* Quantity & Delete Secondary Action Controls (Reduced size for mobile ergonomics) */}
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="flex items-center bg-slate-900 rounded-md border border-slate-700 font-mono">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, -1)}
                            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center text-slate-300 hover:text-white font-bold text-sm active:bg-slate-800 rounded cursor-pointer touch-manipulation"
                            title="Decrease quantity"
                          >
                            -
                          </button>
                          <span className="font-black text-white px-1.5 text-xs sm:text-sm min-w-[20px] text-center">
                            {sel.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(idx, 1)}
                            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center text-slate-300 hover:text-white font-bold text-sm active:bg-slate-800 rounded cursor-pointer touch-manipulation"
                            title="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center text-slate-400 hover:text-red-400 active:bg-red-500/20 active:text-red-400 rounded-md cursor-pointer touch-manipulation"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quick Kitchen Cooking Instruction Chips (Reduced secondary button size) */}
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {KITCHEN_NOTES_PRESETS.slice(0, 4).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const newNote = sel.notes ? `${sel.notes}, ${preset}` : preset;
                            handleUpdateItemNote(idx, newNote);
                          }}
                          className="text-[10px] sm:text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-300 px-2 py-0.5 h-6 rounded-md border border-slate-800 cursor-pointer touch-manipulation active:bg-amber-500 active:text-slate-950"
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>

                    {/* Custom Note input (Compact height) */}
                    <input
                      type="text"
                      placeholder="Kitchen instruction (e.g. less oil, extra chutney)..."
                      value={sel.notes || ''}
                      onChange={(e) => handleUpdateItemNote(idx, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-amber-200 placeholder-slate-600 focus:outline-none focus:border-amber-400 h-7 sm:h-8"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Total Items Summary & Dispatch Buttons */}
            <div className="bg-slate-950 p-2.5 sm:p-3 rounded-xl border border-slate-800 space-y-2 pb-16 sm:pb-3 shrink-0">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold">TOTAL DISHES TO DISPATCH:</span>
                <span className="font-mono text-sm font-black text-amber-400">
                  {selectedItems.reduce((sum, i) => sum + i.quantity, 0)} Items
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Secondary action: Send KOT Only */}
                <button
                  type="button"
                  onClick={() => handleCreateKot(false)}
                  disabled={selectedItems.length === 0 || submitting}
                  className="py-2 px-2.5 min-h-[38px] sm:min-h-[44px] rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-650 disabled:opacity-50 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-[0.98] touch-manipulation"
                >
                  <Send className="w-3.5 h-3.5 text-blue-400" />
                  <span>Send KOT Only</span>
                </button>

                {/* Primary action: Send & Print KOT */}
                <button
                  type="button"
                  onClick={() => handleCreateKot(true)}
                  disabled={selectedItems.length === 0 || submitting}
                  className="py-2 px-2.5 min-h-[38px] sm:min-h-[44px] rounded-lg text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition-all active:scale-[0.98] touch-manipulation"
                >
                  <Printer className="w-4 h-4" />
                  <span>Send & Print KOT</span>
                </button>
              </div>
            </div>

          </div>

        </div>
        </div>
      )}

      {/* Printable Thermal KOT Slip Modal */}
      <ThermalKotModal
        kot={previewKotData?.kot || null}
        items={previewKotData?.items || []}
        settings={settings}
        isOpen={isKotModalOpen}
        onClose={() => setIsKotModalOpen(false)}
      />

      {/* Printable Thermal Receipt Modal (when KOT converted to bill) */}
      {isReceiptOpen && billedReceipt?.bill && (
        <ThermalReceiptModal
          bill={billedReceipt.bill}
          items={billedReceipt?.items || []}
          settings={settings}
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
        />
      )}

    </div>
  );
};
