import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Plus, 
  Trash2, 
  Printer, 
  RotateCcw, 
  CheckCircle, 
  AlertCircle,
  Tag,
  Cloud,
  Utensils,
  X,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { 
  CartItem, 
  Category, 
  MenuItem, 
  OrderType, 
  PriceType, 
  RestaurantSettings, 
  Bill, 
  BillItem 
} from '../../types';
import { safeStorage } from '../../utils/safeStorage';
import { BillingEngine } from '../../services/billingEngine';
import { PrintService } from '../../services/PrintService';
import { getBusinessDate, syncBusinessDaySequence } from '../../services/billNumberEngine';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { saveBillingDraft, getBillingDraft, clearBillingDraft } from '../../services/billingDraftService';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { DEFAULT_RESTAURANT_LOGO } from '../../data/defaultLogo';
import { 
  filterPosMenuItems, 
  getPosCategoryDishCount, 
  isDinnerCategory, 
  isTiffinCategory, 
  isLunchCategory, 
  CONSOLIDATED_POS_CATEGORIES, 
  ServicePeriod,
  deduplicateMenuItems,
  groupMenuItemsByItemCode,
  buildPosMenuItemsQuery,
  itemBelongsToCategory
} from '../../utils/menuItemHelpers';

interface PosScreenProps {
  settings?: RestaurantSettings;
}

interface HeldOrder {
  id: string;
  name: string;
  items: CartItem[];
  orderType: OrderType;
  priceType: PriceType;
  tableNumber: string;
  createdAt: number;
}

interface DeleteConfirmItemState {
  index: number;
  itemCode: string;
  name: string;
  quantity: number;
  price: number;
}

export const PosScreen: React.FC<PosScreenProps> = ({ settings }) => {
  const { currentUser } = useAuth();

  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const stored = localStorage.getItem('pos_local_categories');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_CATEGORIES;
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    try {
      const stored = localStorage.getItem('pos_local_menu_items');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.length > 0) return groupMenuItemsByItemCode(parsed);
      }
    } catch (e) {}
    return groupMenuItemsByItemCode(DEFAULT_FALLBACK_MENU_ITEMS);
  });

  // Category-scoped items retrieved via Firestore `where('categoryIds', 'array-contains', selectedCategory)` or clean ALL fetch
  const [categoryScopedItems, setCategoryScopedItems] = useState<MenuItem[]>(() => menuItems);

  const [activeServicePeriod, setActiveServicePeriod] = useState<ServicePeriod>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemCodeInput, setItemCodeInput] = useState('');
  const itemCodeInputRef = useRef<HTMLInputElement>(null);

  const [priceType, setPriceType] = useState<PriceType>('NON_AC');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [tableNumber, setTableNumber] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialMount = useRef(true);
  const autoSaveTimerRef = useRef<any>(null);

  const [lastPrintedBill, setLastPrintedBill] = useState<{ bill: Bill; items: BillItem[] } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Delete Confirmation States
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<DeleteConfirmItemState | null>(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);
  const [deleteConfirmHeldId, setDeleteConfirmHeldId] = useState<string | null>(null);

  const [showHeldBillsModal, setShowHeldBillsModal] = useState(false);

  // Held Bills
  const [heldBills, setHeldBills] = useState<HeldOrder[]>(() => {
    try {
      const stored = safeStorage.getItem('pos_touch_held_bills');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [];
  });

  // Saved receipt preview modal
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [savedBillItems, setSavedBillItems] = useState<BillItem[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [printFailureModal, setPrintFailureModal] = useState<{ bill: Bill; items: BillItem[]; error: string; jobId?: string } | null>(null);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Fetch Categories and Full Active Menu Catalog from Firestore (grouped by unique itemCode)
  useEffect(() => {
    const bDate = getBusinessDate(settings?.businessDayStart || '04:00');
    syncBusinessDaySequence(bDate);

    const unsubCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats: Category[] = [];
      snapshot.forEach((doc) => cats.push({ id: doc.id, ...doc.data() } as Category));
      const activeCats = cats.filter((c) => c.active !== false).sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      setCategories(activeCats);
      localStorage.setItem('pos_local_categories', JSON.stringify(activeCats));
    }, (err) => {
      console.warn('Categories Firestore notice:', err?.message || err);
    });

    const unsubAllItems = onSnapshot(
      query(collection(db, 'menu_items')),
      (snapshot) => {
        const items: MenuItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.active !== false) {
            items.push({ id: doc.id, ...data } as MenuItem);
          }
        });
        const groupedUnique = groupMenuItemsByItemCode(items);
        setMenuItems(groupedUnique);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(groupedUnique));
      },
      (err) => {
        console.warn('Menu items Firestore notice:', err?.message || err);
      }
    );

    return () => {
      unsubCats();
      unsubAllItems();
    };
  }, [settings?.businessDayStart]);

  // Category-specific Firestore item retrieval using a single `where('categoryIds', 'array-contains', selectedCategory)`
  // and an unfiltered query for `ALL` deduplicated by unique `itemCode`
  useEffect(() => {
    const normCategory = (selectedCategory || 'all').trim();
    const lowerCategory = normCategory.toLowerCase();
    const isAllOrShortcut =
      !normCategory ||
      lowerCategory === 'all' ||
      lowerCategory === 'cat_dosa' ||
      lowerCategory === 'cat_idly' ||
      lowerCategory === 'dosa' ||
      lowerCategory === 'idly' ||
      lowerCategory === 'cat_dosa_idly';

    const firestoreQuery = isAllOrShortcut
      ? query(collection(db, 'menu_items'))
      : query(collection(db, 'menu_items'), where('categoryIds', 'array-contains', normCategory));

    const unsubCategoryQuery = onSnapshot(
      firestoreQuery,
      (snapshot) => {
        const fetchedItems: MenuItem[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.active !== false) {
            fetchedItems.push({ id: doc.id, ...data } as MenuItem);
          }
        });

        if (isAllOrShortcut) {
          // Selecting 'ALL' performs a query without the categoryIds filter and deduplicates by itemCode
          const source = fetchedItems.length > 0 ? fetchedItems : menuItems;
          setCategoryScopedItems(groupMenuItemsByItemCode(source));
        } else {
          // Combine Firestore single `where('categoryIds', 'array-contains', selectedCategory)` results
          // with any legacy/offline items matching the category, then deduplicate by unique itemCode
          const fallbackMatches = menuItems.filter((item) =>
            itemBelongsToCategory(item, normCategory, categories)
          );
          setCategoryScopedItems(groupMenuItemsByItemCode([...fetchedItems, ...fallbackMatches]));
        }
      },
      (err) => {
        console.warn('POS category query fallback notice:', err?.message || err);
        setCategoryScopedItems(groupMenuItemsByItemCode(menuItems));
      }
    );

    return () => unsubCategoryQuery();
  }, [selectedCategory, menuItems, categories]);

  // Restore in-progress draft from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const restoreDraft = async () => {
      try {
        const draft = await getBillingDraft('pos', currentUser?.uid);
        if (draft && isMounted && draft.items && draft.items.length > 0) {
          setCart(draft.items);
          if (draft.orderType) setOrderType(draft.orderType);
          if (draft.priceType) setPriceType(draft.priceType);
          if (draft.tableNumber) setTableNumber(draft.tableNumber);
          if (draft.discount !== undefined) setDiscount(draft.discount);
          setAutoSaveStatus('saved');
          setNotification({
            type: 'success',
            message: `Restored ${draft.items.length} bill-in-progress item${draft.items.length > 1 ? 's' : ''}.`
          });
          setTimeout(() => setNotification(null), 3000);
        }
      } catch (err) {
        console.warn('POS Draft restoration notice:', err);
      } finally {
        if (isMounted) {
          setTimeout(() => {
            isInitialMount.current = false;
          }, 400);
        }
      }
    };

    restoreDraft();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.uid]);

  // Add Item to Cart immediately on click
  const handleAddToCart = (item: MenuItem) => {
    const applicablePrice = BillingEngine.getApplicablePrice(item, priceType);
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.itemId === item.id && i.priceType === priceType);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + 1;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          totalPrice: BillingEngine.calculateItemTotal(applicablePrice, newQty)
        };
        return updated;
      }
      const newItem: CartItem = {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.itemName,
        itemNameTamil: item.itemNameTamil,
        quantity: 1,
        unitPrice: applicablePrice,
        totalPrice: applicablePrice,
        priceType
      };
      return [...prev, newItem];
    });
  };

  // Fast Item Code Search & Add (Enter key)
  const handleItemCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = itemCodeInput.trim();
    if (!code) return;
    const match = menuItems.find(
      (m) => m.itemCode.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      handleAddToCart(match);
      setItemCodeInput('');
      setNotification({
        type: 'success',
        message: `Added #${match.itemCode} - ${match.itemName}`
      });
      setTimeout(() => setNotification(null), 1800);
    } else {
      setNotification({
        type: 'error',
        message: `Item code #${code} not found.`
      });
      setTimeout(() => setNotification(null), 2200);
    }
  };

  // Handle Qty Update with Delete Confirmation if decreasing to 0
  const handleUpdateQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      const targetItem = cart[index];
      if (targetItem) {
        setDeleteConfirmItem({
          index,
          itemCode: targetItem.itemCode,
          name: targetItem.itemName,
          quantity: targetItem.quantity,
          price: targetItem.totalPrice
        });
      }
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        quantity: newQty,
        totalPrice: BillingEngine.calculateItemTotal(updated[index].unitPrice, newQty)
      };
      return updated;
    });
  };

  // Trigger Delete Confirmation for Cart Item
  const handleRequestRemoveFromCart = (index: number) => {
    const targetItem = cart[index];
    if (targetItem) {
      setDeleteConfirmItem({
        index,
        itemCode: targetItem.itemCode,
        name: targetItem.itemName,
        quantity: targetItem.quantity,
        price: targetItem.totalPrice
      });
    }
  };

  // Confirm Item Deletion
  const handleConfirmRemoveItem = () => {
    if (deleteConfirmItem !== null) {
      const idx = deleteConfirmItem.index;
      setCart((prev) => prev.filter((_, i) => i !== idx));
      setDeleteConfirmItem(null);
      setNotification({
        type: 'success',
        message: `Removed ${deleteConfirmItem.name} from bill.`
      });
      setTimeout(() => setNotification(null), 1800);
    }
  };

  // Trigger Clear Cart Confirmation
  const handleRequestClearCart = () => {
    if (cart.length > 0) {
      setShowClearCartConfirm(true);
    }
  };

  // Confirm Clear Cart
  const handleConfirmClearCart = () => {
    setCart([]);
    setDiscount(0);
    setTableNumber('');
    setAutoSaveStatus('idle');
    clearBillingDraft('pos', currentUser?.uid);
    setShowClearCartConfirm(false);
    setNotification({
      type: 'success',
      message: 'Cart cleared.'
    });
    setTimeout(() => setNotification(null), 1800);
  };

  // Hold Order
  const handleHoldOrder = () => {
    if (cart.length === 0) {
      setNotification({ type: 'error', message: 'Cart is empty. Nothing to hold.' });
      setTimeout(() => setNotification(null), 2000);
      return;
    }
    const newHeld: HeldOrder = {
      id: `held_${Date.now()}`,
      name: tableNumber ? `Table ${tableNumber}` : `${orderType === 'TAKE_AWAY' ? 'Take Away' : 'Dine In'} #${heldBills.length + 1}`,
      items: [...cart],
      orderType,
      priceType,
      tableNumber,
      createdAt: Date.now()
    };
    const updated = [...heldBills, newHeld];
    setHeldBills(updated);
    safeStorage.setItem('pos_touch_held_bills', JSON.stringify(updated));
    setCart([]);
    setDiscount(0);
    setTableNumber('');
    setAutoSaveStatus('idle');
    clearBillingDraft('pos', currentUser?.uid);
    setNotification({ type: 'success', message: `Order held as "${newHeld.name}"` });
    setTimeout(() => setNotification(null), 2500);
  };

  // Restore Held Order
  const handleRestoreHeldBill = (id: string) => {
    const target = heldBills.find((h) => h.id === id);
    if (!target) return;
    setCart(target.items);
    setOrderType(target.orderType);
    setPriceType(target.priceType);
    setTableNumber(target.tableNumber || '');
    const updated = heldBills.filter((h) => h.id !== id);
    setHeldBills(updated);
    safeStorage.setItem('pos_touch_held_bills', JSON.stringify(updated));
    setShowHeldBillsModal(false);
    setNotification({ type: 'success', message: `Restored "${target.name}"` });
    setTimeout(() => setNotification(null), 2500);
  };

  // Confirm Delete Held Order
  const handleConfirmDeleteHeldOrder = () => {
    if (deleteConfirmHeldId) {
      const updated = heldBills.filter((h) => h.id !== deleteConfirmHeldId);
      setHeldBills(updated);
      safeStorage.setItem('pos_touch_held_bills', JSON.stringify(updated));
      setDeleteConfirmHeldId(null);
      setNotification({ type: 'success', message: 'Held order removed.' });
      setTimeout(() => setNotification(null), 2000);
    }
  };

  // Save Order (without printing)
  const handleSaveOrder = async () => {
    if (cart.length === 0) {
      setNotification({ type: 'error', message: 'Cart is empty. Add items before saving.' });
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    setSaving(true);
    try {
      const prepared = await BillingEngine.prepareBill({
        items: cart,
        orderType,
        priceType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
        discount,
        userId: currentUser?.uid || 'pos_user',
        userName: currentUser?.name || currentUser?.username || 'Staff Cashier',
        businessDayStart: settings?.businessDayStart || '04:00'
      });

      prepared.bill.paymentMethod = 'CASH';

      clearBillingDraft('pos', currentUser?.uid);
      setAutoSaveStatus('idle');

      setLastPrintedBill({ bill: prepared.bill, items: prepared.items });
      setSavedBill(prepared.bill);
      setSavedBillItems(prepared.items);

      setNotification({
        type: 'success',
        message: `Order #${prepared.bill.billNumber} Saved (₹${prepared.bill.grandTotal})`
      });
      setTimeout(() => setNotification(null), 3500);

      setCart([]);
      setDiscount(0);
      setTableNumber('');
      setMobileTab('catalog');

      BillingEngine.persistBillAsync(
        prepared.bill,
        prepared.items,
        undefined,
        currentUser?.uid || 'pos_user'
      ).catch((err) => {
        console.warn('POS background persist notice:', err);
      });
    } catch (err: any) {
      console.error('POS Bill Error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to save order' });
    } finally {
      setSaving(false);
    }
  };

  const focusPosBillingInput = () => {
    if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== itemCodeInputRef.current
    ) {
      document.activeElement.blur();
    }
    itemCodeInputRef.current?.focus();
    setTimeout(() => {
      itemCodeInputRef.current?.focus();
    }, 30);
  };

  // Print Bill (Save & Print asynchronously without preview or minimizing)
  const handlePrintBill = async () => {
    if (cart.length === 0) {
      setNotification({ type: 'error', message: 'Cart is empty. Add items before printing.' });
      setTimeout(() => setNotification(null), 2500);
      return;
    }

    setSaving(true);
    try {
      const prepared = await BillingEngine.prepareBill({
        items: cart,
        orderType,
        priceType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
        discount,
        userId: currentUser?.uid || 'pos_user',
        userName: currentUser?.name || currentUser?.username || 'Staff Cashier',
        businessDayStart: settings?.businessDayStart || '04:00'
      });

      prepared.bill.paymentMethod = 'CASH';

      clearBillingDraft('pos', currentUser?.uid);
      setAutoSaveStatus('idle');

      setLastPrintedBill({ bill: prepared.bill, items: prepared.items });
      setSavedBill(prepared.bill);
      setSavedBillItems(prepared.items);

      BillingEngine.persistBillAsync(
        prepared.bill,
        prepared.items,
        undefined,
        currentUser?.uid || 'pos_user'
      ).catch((err) => {
        console.warn('POS background persist notice:', err);
      });

      setCart([]);
      setDiscount(0);
      setTableNumber('');
      setMobileTab('catalog');
      focusPosBillingInput();

      const cleanBillNum = String(prepared.bill.billNumber).replace(/^BN-|^#/, '');
      setNotification({
        type: 'success',
        message: 'Printing...'
      });

      void PrintService.printReceipt({
        bill: prepared.bill,
        items: prepared.items,
        settings,
        forcePrint: true
      }).then((printRes) => {
        if (printRes.success) {
          setNotification({
            type: 'success',
            message: `Bill #${cleanBillNum} Printed`
          });
          setTimeout(() => setNotification(null), 3000);
        } else {
          const errMsg = printRes.error || 'Receipt could not be sent to the print system.';
          setNotification({
            type: 'error',
            message: `Bill #${cleanBillNum} Saved - Printing Failed`
          });
          setPrintFailureModal({
            bill: prepared.bill,
            items: prepared.items,
            error: errMsg,
            jobId: printRes.jobId
          });
        }
        focusPosBillingInput();
      });
    } catch (err: any) {
      console.error('POS Bill Error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to print bill' });
    } finally {
      setSaving(false);
    }
  };

  // Keyboard Shortcuts: Ctrl+Enter to Print, F8 Hold, F10 Save, Escape to Cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (cart.length > 0 && !saving) {
          handlePrintBill();
        }
      }
      if (e.key === 'F8') {
        e.preventDefault();
        handleHoldOrder();
      }
      if (e.key === 'F10') {
        e.preventDefault();
        handleSaveOrder();
      }
      if (e.key === 'Escape') {
        if (showClearCartConfirm) {
          setShowClearCartConfirm(false);
        } else if (deleteConfirmItem !== null) {
          setDeleteConfirmItem(null);
        } else if (deleteConfirmHeldId !== null) {
          setDeleteConfirmHeldId(null);
        } else if (showHeldBillsModal) {
          setShowHeldBillsModal(false);
        } else if (cart.length > 0) {
          setShowClearCartConfirm(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, saving, showClearCartConfirm, deleteConfirmItem, deleteConfirmHeldId, showHeldBillsModal]);

  // Menu items filter supporting multi-category assignment and deduplication by unique itemCode
  const filteredItems = useMemo(() => {
    const sourceItems = categoryScopedItems.length > 0 ? categoryScopedItems : menuItems;
    return groupMenuItemsByItemCode(
      filterPosMenuItems(sourceItems, selectedCategory, categories, searchQuery, activeServicePeriod)
    );
  }, [categoryScopedItems, menuItems, selectedCategory, categories, searchQuery, activeServicePeriod]);

  const subtotal = BillingEngine.calculateSubtotal(cart);
  const grandTotal = BillingEngine.calculateGrandTotal(subtotal, discount);

  // Debounced Auto-save to Firestore & LocalStorage
  useEffect(() => {
    if (isInitialMount.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (cart.length === 0) {
      setAutoSaveStatus('idle');
      clearBillingDraft('pos', currentUser?.uid);
      return;
    }

    setAutoSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveBillingDraft({
          screen: 'pos',
          userId: currentUser?.uid,
          userName: currentUser?.name,
          orderType,
          priceType,
          tableNumber,
          items: cart,
          discount,
          subtotal,
          grandTotal
        });
        setAutoSaveStatus('saved');
      } catch (e) {
        console.warn('Auto-save draft note:', e);
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [cart, orderType, priceType, tableNumber, discount, subtotal, grandTotal, currentUser?.uid, currentUser?.name]);

  const isDosaIdlyPeriodAvailable = activeServicePeriod === 'TIFFIN' || activeServicePeriod === 'DINNER' || activeServicePeriod === 'ALL';
  const heldTarget = heldBills.find((h) => h.id === deleteConfirmHeldId);
  const totalUniqueItemsCount = useMemo(() => groupMenuItemsByItemCode(menuItems).length, [menuItems]);

  return (
    <div className="w-full h-full max-w-full flex flex-col overflow-hidden bg-slate-100 select-none">
      
      {/* 1. TOP CATEGORY BAR: Visible across top of POS screen with native horizontal scroll & snap-mandatory */}
      <div className="w-full bg-white border-b border-slate-200 px-2.5 py-1.5 flex items-center gap-1.5 overflow-x-auto snap-x snap-mandatory scroll-smooth touch-pan-x no-scrollbar shrink-0">
        <button
          type="button"
          onClick={(e) => {
            setSelectedCategory('all');
            setActiveServicePeriod('ALL');
            e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
          }}
          className={`snap-start h-8 px-3 rounded text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors cursor-pointer border shrink-0 flex items-center gap-1.5 touch-manipulation ${
            selectedCategory === 'all'
              ? 'bg-slate-900 text-amber-400 border-slate-900 font-black'
              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
          }`}
        >
          <span>ALL</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
            selectedCategory === 'all' ? 'bg-amber-500 text-slate-950' : 'bg-white text-slate-600'
          }`}>
            {totalUniqueItemsCount}
          </span>
        </button>

        {/* Active Food Availability Categories */}
        {categories.map((cat) => {
          const count = getPosCategoryDishCount(cat, menuItems, categories);
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={(e) => {
                setSelectedCategory(cat.id);
                if (isTiffinCategory(cat)) setActiveServicePeriod('TIFFIN');
                else if (isDinnerCategory(cat)) setActiveServicePeriod('DINNER');
                else if (isLunchCategory(cat)) setActiveServicePeriod('LUNCH');
                else setActiveServicePeriod('ALL');
                e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
              }}
              className={`snap-start h-8 px-3 rounded text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors cursor-pointer border shrink-0 flex items-center gap-1.5 touch-manipulation ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-600 font-black'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{cat.categoryName}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                isSelected ? 'bg-slate-950 text-amber-400' : 'bg-slate-100 text-slate-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Quick Dosa & Idly Shortcut Tabs (only if not already provided by categories) */}
        {isDosaIdlyPeriodAvailable &&
          !categories.some((c) => c.id === 'cat_dosa' || c.id === 'cat_idly') &&
          CONSOLIDATED_POS_CATEGORIES.map((cCat) => {
            const count = getPosCategoryDishCount(cCat, menuItems, categories);
            const isSelected = selectedCategory === cCat.id;
            return (
              <button
                key={cCat.id}
                type="button"
                onClick={(e) => {
                  setSelectedCategory(cCat.id);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                }}
                className={`snap-start h-8 px-2.5 rounded text-xs font-bold uppercase tracking-wide whitespace-nowrap transition-colors cursor-pointer border shrink-0 flex items-center gap-1 touch-manipulation ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 border-amber-600 font-black'
                    : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>{cCat.categoryName}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-mono font-bold ${
                  isSelected ? 'bg-slate-950 text-amber-400' : 'bg-amber-200/80 text-amber-950'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
      </div>

      {/* 2. COMPACT SEARCH & ORDER CONTROLS BAR */}
      <div className="w-full bg-slate-50 border-b border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        
        {/* Left: Search Item & Fast Item Code Input */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Search item name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-7 bg-white border border-slate-300 rounded pl-8 pr-6 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <form onSubmit={handleItemCodeSubmit} className="flex items-center gap-1 shrink-0">
            <input
              ref={itemCodeInputRef}
              type="text"
              placeholder="Item Code (e.g. 17)"
              value={itemCodeInput}
              onChange={(e) => setItemCodeInput(e.target.value)}
              className="w-28 sm:w-32 h-7 bg-white border border-slate-300 rounded px-2 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-amber-500 placeholder-slate-400"
            />
            <button
              type="submit"
              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              title="Enter item code & press Enter to add"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Add</span>
            </button>
          </form>
        </div>

        {/* Right: AC/Non-AC, Dine-In/Takeaway, Table #, Status Toast */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {notification && (
            <div className={`h-7 px-2.5 rounded text-2xs font-bold flex items-center gap-1.5 ${
              notification.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {notification.type === 'success' ? <CheckCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate max-w-[200px]">{notification.message}</span>
            </div>
          )}

          {/* AC / Non-AC Switcher */}
          <div className="flex items-center bg-slate-200 p-0.5 rounded border border-slate-300 h-7 shrink-0">
            <button
              type="button"
              onClick={() => setPriceType('NON_AC')}
              className={`h-full px-2.5 rounded-xs text-xs font-bold transition-colors cursor-pointer ${
                priceType === 'NON_AC'
                  ? 'bg-slate-900 text-amber-400 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Non-AC
            </button>
            <button
              type="button"
              onClick={() => setPriceType('AC')}
              className={`h-full px-2.5 rounded-xs text-xs font-bold transition-colors cursor-pointer ${
                priceType === 'AC'
                  ? 'bg-amber-500 text-slate-950 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              AC
            </button>
          </div>

          {/* Dine-In / Takeaway Switcher */}
          <div className="flex items-center bg-slate-200 p-0.5 rounded border border-slate-300 h-7 shrink-0">
            <button
              type="button"
              onClick={() => setOrderType('DINE_IN')}
              className={`h-full px-2.5 rounded-xs text-xs font-bold transition-colors cursor-pointer ${
                orderType === 'DINE_IN'
                  ? 'bg-blue-600 text-white font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dine-In
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderType('TAKE_AWAY');
                setTableNumber('');
              }}
              className={`h-full px-2.5 rounded-xs text-xs font-bold transition-colors cursor-pointer ${
                orderType === 'TAKE_AWAY'
                  ? 'bg-blue-600 text-white font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Takeaway
            </button>
          </div>

          {/* Mobile View Switcher (Catalog vs Bill) */}
          <div className="lg:hidden flex items-center bg-slate-200 p-0.5 rounded border border-slate-300 h-7">
            <button
              type="button"
              onClick={() => setMobileTab('catalog')}
              className={`h-full px-2 rounded-xs text-2xs font-bold cursor-pointer ${
                mobileTab === 'catalog' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-700'
              }`}
            >
              Menu ({filteredItems.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('cart')}
              className={`h-full px-2 rounded-xs text-2xs font-bold cursor-pointer ${
                mobileTab === 'cart' ? 'bg-amber-500 text-slate-950 font-black' : 'text-slate-700'
              }`}
            >
              Bill ({cart.reduce((s, i) => s + i.quantity, 0)})
            </button>
          </div>
        </div>
      </div>

      {/* 3. MAIN POS SPLIT AREA: LEFT PRODUCT MENU (72%) + RIGHT CURRENT BILL / CART (28%) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden w-full">
        
        {/* LEFT / MAIN: PRODUCT MENU (70-75%) */}
        <div className={`flex-1 flex flex-col min-h-0 min-w-0 bg-slate-100 overflow-hidden ${
          mobileTab === 'catalog' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {menuItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Utensils className="w-8 h-8 text-amber-500 mb-1.5" />
                <h4 className="font-bold text-sm text-slate-800">Menu is Empty</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add items in Menu Management to start billing.
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
                No items found matching {searchQuery ? `"${searchQuery}"` : 'selected category'}.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2">
                {filteredItems.map((item) => {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddToCart(item)}
                      className="bg-white hover:bg-amber-50/50 active:bg-amber-100/60 border border-slate-200 hover:border-amber-400 rounded-lg p-2 flex flex-col justify-between text-left transition-colors group cursor-pointer"
                    >
                      <div>
                        {/* Compact Top Row: Thumbnail Image + Item Code */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="w-9 h-9 rounded bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.itemName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = DEFAULT_RESTAURANT_LOGO;
                                }}
                              />
                            ) : (
                              <Utensils className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="inline-block font-mono text-2xs text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                              Code: {item.itemCode}
                            </span>
                          </div>
                        </div>

                        {/* Item Name (English only on POS screen) - Only item name in bold */}
                        <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug group-hover:text-amber-950 min-h-[2.1rem]">
                          {item.itemName}
                        </div>
                      </div>

                      {/* Selected Pricing Row: Clean display without black box, non-bold price */}
                      <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1 font-mono text-2xs w-full">
                        <span className={priceType === 'AC' ? 'text-amber-800 font-medium' : 'text-slate-400'}>
                          AC ₹{item.acPrice}
                        </span>
                        <span className={priceType === 'NON_AC' ? 'text-slate-700 font-medium' : 'text-slate-400'}>
                          Non-AC ₹{item.nonAcPrice}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Mobile Sticky Cart Bar */}
          {cart.length > 0 && mobileTab === 'catalog' && (
            <div className="lg:hidden p-2 bg-white border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setMobileTab('cart')}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg flex items-center justify-between font-bold text-xs cursor-pointer"
              >
                <span>{cart.reduce((s, i) => s + i.quantity, 0)} Items in Bill</span>
                <span className="font-mono text-sm font-black">View Bill (₹{grandTotal}) →</span>
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: CURRENT BILL / CART (25-30%) */}
        <div className={`w-full lg:w-[320px] xl:w-[360px] 2xl:w-[390px] shrink-0 flex flex-col h-full bg-white border-l border-slate-200 overflow-hidden ${
          mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Cart Header */}
          <div className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShoppingBag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="font-extrabold text-xs uppercase tracking-wider truncate">Current Bill</span>
              <span className="text-2xs font-mono font-bold bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5">
              {orderType === 'DINE_IN' && (
                <input
                  type="text"
                  placeholder="Table #"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-16 h-6 bg-slate-800 border border-slate-700 rounded px-1.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-amber-400 placeholder-slate-400"
                  title="Table Number"
                />
              )}
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleRequestClearCart}
                  className="p-1 text-slate-400 hover:text-red-400 rounded cursor-pointer"
                  title="Clear Bill"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Cart Column Headers */}
          <div className="grid grid-cols-[2.6rem_1fr_4.6rem_3.2rem_3.6rem_1.4rem] items-center px-2.5 py-1.5 bg-slate-100 border-b border-slate-200 text-2xs font-bold text-slate-600 uppercase tracking-wider shrink-0 font-mono">
            <span>Code</span>
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amt</span>
            <span></span>
          </div>

          {/* Cart Items Scrollable List */}
          <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-slate-100 px-2.5 scrollbar-thin">
            {cart.length === 0 ? (
              <div className="h-full min-h-[140px] flex flex-col items-center justify-center text-slate-400 text-center p-4">
                <ShoppingBag className="w-7 h-7 text-slate-300 mb-1" />
                <p className="text-xs font-bold text-slate-600">No items in bill</p>
                <p className="text-2xs text-slate-400">Tap any dish or enter code</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.itemId}_${item.priceType}_${idx}`} className="grid grid-cols-[2.6rem_1fr_4.6rem_3.2rem_3.6rem_1.4rem] items-center py-1.5 gap-1 text-xs">
                  <span className="font-mono font-bold text-slate-700 text-2xs">#{item.itemCode}</span>
                  <div className="min-w-0 pr-1">
                    <span className="font-bold text-slate-900 truncate block text-xs leading-tight">{item.itemName}</span>
                    <span className="text-[10px] text-slate-400 font-mono block leading-none">{item.priceType}</span>
                  </div>
                  
                  {/* Compact Qty Controls */}
                  <div className="flex items-center justify-center gap-0.5 bg-slate-100 rounded border border-slate-200 h-6">
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(idx, item.quantity - 1)}
                      className="w-4 h-full flex items-center justify-center text-slate-700 hover:bg-slate-200 font-bold cursor-pointer text-xs"
                    >
                      -
                    </button>
                    <span className="font-mono font-black text-xs min-w-[16px] text-center text-slate-900">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateQty(idx, item.quantity + 1)}
                      className="w-4 h-full flex items-center justify-center text-slate-700 hover:bg-slate-200 font-bold cursor-pointer text-xs"
                    >
                      +
                    </button>
                  </div>

                  <span className="font-mono text-right text-2xs text-slate-600">₹{item.unitPrice}</span>
                  <span className="font-mono text-right text-xs font-black text-slate-900">₹{item.totalPrice}</span>
                  
                  <button
                    type="button"
                    onClick={() => handleRequestRemoveFromCart(idx)}
                    className="text-slate-300 hover:text-red-600 flex justify-center cursor-pointer"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Bill Summary & Actions Footer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 shrink-0 space-y-2">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} qty):</span>
                <span className="font-mono font-bold text-slate-900">₹{subtotal}</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                <span className="font-black text-xs text-slate-900 uppercase">Grand Total:</span>
                <span className="font-mono text-xl font-black text-emerald-700">₹{grandTotal}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={handleHoldOrder}
                disabled={cart.length === 0}
                className="h-9 px-2 rounded-lg text-2xs font-bold bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-300 flex flex-col items-center justify-center cursor-pointer"
                title="Hold Order (F8)"
              >
                <span>Hold [F8]</span>
              </button>

              <button
                type="button"
                onClick={handleSaveOrder}
                disabled={cart.length === 0 || saving}
                className="h-9 px-2 rounded-lg text-2xs font-bold bg-blue-50 hover:bg-blue-100 disabled:opacity-40 text-blue-800 border border-blue-200 flex flex-col items-center justify-center cursor-pointer"
                title="Save Order (F10)"
              >
                <span>{saving ? '...' : 'Save [F10]'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintBill}
                disabled={cart.length === 0 || saving}
                className="col-span-2 h-9 px-3 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-40 text-white flex items-center justify-center gap-1.5 cursor-pointer"
                title="Save & Print Bill (Ctrl + Enter)"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="truncate">{saving ? 'Printing...' : 'Print Bill (Ctrl+↵)'}</span>
              </button>
            </div>

            {/* Bottom Utility Row */}
            <div className="flex justify-between items-center text-2xs pt-0.5">
              <button
                type="button"
                onClick={handleRequestClearCart}
                disabled={cart.length === 0}
                className="text-red-600 hover:text-red-700 disabled:opacity-30 cursor-pointer font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Cancel [Esc]</span>
              </button>
              {heldBills.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHeldBillsModal(true)}
                  className="text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 px-2 py-0.5 rounded font-bold text-2xs cursor-pointer flex items-center gap-1"
                >
                  <Layers className="w-3 h-3 text-amber-700" />
                  <span>Held ({heldBills.length})</span>
                </button>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Held Orders Modal */}
      {showHeldBillsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 max-w-md w-full space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase">Held Orders ({heldBills.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldBillsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {heldBills.map((hb) => (
                <div key={hb.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-xs text-slate-900">{hb.name}</h4>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {hb.items.length} items • {hb.priceType} • {new Date(hb.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleRestoreHeldBill(hb.id)}
                      className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-xs cursor-pointer"
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmHeldId(hb.id)}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* On-screen Thermal Receipt Preview Modal */}
      {isReceiptModalOpen && savedBill && (
        <ThermalReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          bill={savedBill}
          items={savedBillItems}
          settings={settings}
        />
      )}

      {/* Delete Cart Item Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmItem !== null}
        onClose={() => setDeleteConfirmItem(null)}
        onConfirm={handleConfirmRemoveItem}
        title="Remove Item from Bill"
        itemName={deleteConfirmItem?.name || ''}
        itemSubtitle={deleteConfirmItem ? `Code #${deleteConfirmItem.itemCode} • Qty: ${deleteConfirmItem.quantity} • Total: ₹${deleteConfirmItem.price}` : undefined}
        description="Remove this item from the current bill?"
        warningNote="Order total will be updated immediately."
        confirmButtonText="Remove Item"
      />

      {/* Clear Entire Cart Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showClearCartConfirm}
        onClose={() => setShowClearCartConfirm(false)}
        onConfirm={handleConfirmClearCart}
        title="Clear Current Bill"
        itemName={`All ${cart.length} item(s) in bill`}
        itemSubtitle={`Total: ₹${grandTotal}`}
        description="Clear all items from the current bill?"
        warningNote="This will reset the current cart."
        confirmButtonText="Clear Bill"
      />

      {/* Delete Held Order Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteConfirmHeldId !== null}
        onClose={() => setDeleteConfirmHeldId(null)}
        onConfirm={handleConfirmDeleteHeldOrder}
        title="Delete Held Order"
        itemName={heldTarget?.name || 'Held Order'}
        itemSubtitle={heldTarget ? `${heldTarget.items.length} items • ${heldTarget.priceType}` : undefined}
        description="Discard this held order?"
        warningNote="This held order will be permanently removed."
        confirmButtonText="Delete Held Order"
      />

      {/* Non-Blocking Print Retry Banner */}
      {printFailureModal && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-3 right-3 z-50 max-w-xs w-full bg-slate-900 border border-red-500/50 rounded-xl p-3 shadow-xl space-y-2 text-slate-100"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <div className="font-bold text-2xs text-emerald-400">
                Bill #{printFailureModal.bill.billNumber} saved.
              </div>
              <div className="font-bold text-xs text-white">
                Printing failed
              </div>
              <p className="text-[10px] text-slate-300 mt-0.5">
                {printFailureModal.error}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={async () => {
                const target = printFailureModal;
                setNotification({ type: 'success', message: 'Printing...' });
                focusPosBillingInput();
                const res = await PrintService.printReceipt({
                  bill: target.bill,
                  items: target.items,
                  settings,
                  forcePrint: true,
                  isRetry: true,
                  jobId: target.jobId
                });
                if (res.success) {
                  const billNo = target.bill.billNumber;
                  setPrintFailureModal(null);
                  setNotification({
                    type: 'success',
                    message: `Bill #${billNo} Printed`
                  });
                  setTimeout(() => setNotification(null), 3000);
                } else {
                  setPrintFailureModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          error: res.error || 'Receipt could not be sent to the print system.',
                          jobId: res.jobId || prev.jobId
                        }
                      : null
                  );
                }
                focusPosBillingInput();
              }}
              className="flex-1 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-2xs rounded flex items-center justify-center gap-1 cursor-pointer"
            >
              <Printer className="w-3 h-3" />
              <span>Retry Print</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPrintFailureModal(null);
                focusPosBillingInput();
              }}
              className="flex-1 py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-2xs rounded cursor-pointer border border-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
