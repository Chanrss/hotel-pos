import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Plus, 
  Trash2, 
  Printer, 
  RotateCcw, 
  Search, 
  AlertCircle, 
  CheckCircle, 
  ArrowRight, 
  Keyboard, 
  Utensils, 
  Check, 
  Sparkles, 
  Database,
  RefreshCw,
  Clock,
  Banknote,
  Percent,
  SlidersHorizontal,
  Leaf,
  Beef,
  Coffee,
  Receipt,
  X,
  Cloud,
  ChefHat,
  FileText,
  Usb,
  Layers
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CartItem, MenuItem, OrderType, PriceType, RestaurantSettings, Bill, BillItem, Kot, KotItem } from '../../types';
import { BillingEngine } from '../../services/billingEngine';
import { PrinterService } from '../../services/printerService';
import { PrintService } from '../../services/PrintService';
import { getBusinessDate, syncBusinessDaySequence, allocateNextKotNumber } from '../../services/billNumberEngine';
import { ThermalReceiptModal } from '../common/ThermalReceiptModal';
import { DirectHardwarePrintModal } from '../common/DirectHardwarePrintModal';
import { PrinterConnectionService } from '../../services/printerConnectionService';
import { collection, onSnapshot, query, orderBy, limit, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../../services/firebase';
import { saveKotLocally, updateLocalKotStatus } from '../../services/localKotStore';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { getItemCategoryIds, itemBelongsToCategory, deduplicateMenuItems } from '../../utils/menuItemHelpers';
import { useMenuSearch } from '../../hooks/useMenuSearch';
import { saveBillingDraft, getBillingDraft, clearBillingDraft } from '../../services/billingDraftService';
import { ReprintEngine } from '../../services/reprintEngine';
import { safeStorage } from '../../utils/safeStorage';
import { DEFAULT_RESTAURANT_LOGO, SRI_SARAVANA_BHAVAN_SVG } from '../../data/defaultLogo';

interface DirectBillingProps {
  settings?: RestaurantSettings;
}

interface EnhancedCartItem extends CartItem {
  notes?: string;
}

const QUICK_MODIFIERS = [
  'Less Spicy 🌶️',
  'Extra Spicy 🔥',
  'No Onion/Garlic 🧅',
  'Extra Cheese 🧀',
  'Pack Separately 📦',
  'Crispy / Well Done ✨'
];

export const DirectBilling: React.FC<DirectBillingProps> = ({ settings }) => {
  const { currentUser, bootstrapSystem } = useAuth();

  // Menu items cache
  const [firestoreMenuItems, setFirestoreMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // High-Speed Rush Mode (Default: ON for instant printing and immediate next-customer reset)
  const [fastRushMode, setFastRushMode] = useState<boolean>(() => {
    return safeStorage.getItem('pos_fast_rush_mode') !== 'false';
  });
  
  // Hardware vs Mock Print Mode
  const [mockPrintMode, setMockPrintMode] = useState<boolean>(() => {
    return PrinterService.isMockPrintMode();
  });
  const [lastPrintedBill, setLastPrintedBill] = useState<{ bill: Bill; items: BillItem[] } | null>(() => {
    try {
      const cached = safeStorage.getItem('pos_last_printed_bill');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  });
  const isSavingRef = useRef(false);

  // Prefetch latest completed bill from Firestore if not in local storage so Reprint is immediately ready
  useEffect(() => {
    if (lastPrintedBill) return;
    const fetchLatest = async () => {
      try {
        const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const b = snap.docs[0].data() as Bill;
          const items = await ReprintEngine.getBillItems(b.id);
          setLastPrintedBill({ bill: b, items });
        }
      } catch (err) {
        console.warn('Could not prefetch latest bill for reprint:', err);
      }
    };
    fetchLatest();
  }, []);

  // Billing Flow State
  const [priceType, setPriceType] = useState<PriceType>('NON_AC');
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [priceTypeChoice, setPriceTypeChoice] = useState<'1' | '2'>('1');
  const [orderTypeChoice, setOrderTypeChoice] = useState<'1' | '2'>('1');
  const [tableNumber, setTableNumber] = useState('');
  const [activeKotId, setActiveKotId] = useState<string | undefined>(undefined);
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [customDiscount, setCustomDiscount] = useState<number>(0);
  const [cart, setCart] = useState<EnhancedCartItem[]>([]);
  const [heldBills, setHeldBills] = useState<{ id: string; name: string; items: EnhancedCartItem[]; orderType: OrderType; priceType: PriceType; tableNumber: string }[]>([]);

  // Fast Cash Tender / Return Change
  const [cashTendered, setCashTendered] = useState<string>('');
  
  // Category filter for Quick Dish Grid
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Current Item Entry state
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [quantityInput, setQuantityInput] = useState('1');
  const [inputError, setInputError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; message: string; billNumber?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialMount = useRef(true);
  const autoSaveTimerRef = useRef<any>(null);

  // Live Auto-complete & Suggestions State
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // Modals
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [savedBillItems, setSavedBillItems] = useState<BillItem[]>([]);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isHardwareModalOpen, setIsHardwareModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [printFailureModal, setPrintFailureModal] = useState<{ bill: Bill; items: BillItem[]; error: string; jobId?: string } | null>(null);
  const [connectedPrinter, setConnectedPrinter] = useState(PrinterConnectionService.getConnectedPrinter());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeItemNoteIdx, setActiveItemNoteIdx] = useState<number | null>(null);

  // Synchronize connected printer state periodically
  useEffect(() => {
    const updatePrinter = () => {
      setConnectedPrinter(PrinterConnectionService.getConnectedPrinter());
    };
    window.addEventListener('storage', updatePrinter);
    const interval = setInterval(updatePrinter, 2500);
    return () => {
      window.removeEventListener('storage', updatePrinter);
      clearInterval(interval);
    };
  }, []);

  // Active Focused Step Tracker for visual clarity
  const [focusedStep, setFocusedStep] = useState<'PRICE_TYPE' | 'ORDER_TYPE' | 'ITEM_CODE' | 'QUANTITY'>('PRICE_TYPE');

  // Refs for keyboard focus flow
  const priceTypeRef = useRef<HTMLInputElement>(null);
  const orderTypeRef = useRef<HTMLInputElement>(null);
  const itemCodeRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to Menu Items with real-time snapshot and sync sequence
  useEffect(() => {
    const bDate = getBusinessDate(settings?.businessDayStart || '04:00');
    syncBusinessDaySequence(bDate);

    const unsubscribe = onSnapshot(collection(db, 'menu_items'), (snapshot) => {
      const items: MenuItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.active !== false) {
          items.push({ id: doc.id, ...data } as MenuItem);
        }
      });
      setFirestoreMenuItems(items);
      setLoadingMenu(false);
    }, (err) => {
      console.warn('Menu load error:', err);
      setLoadingMenu(false);
    });

    return () => unsubscribe();
  }, [settings?.businessDayStart]);

  // Restore in-progress draft from Firestore on mount
  useEffect(() => {
    let isMounted = true;
    const restoreDraft = async () => {
      try {
        const draft = await getBillingDraft('direct_billing', currentUser?.uid);
        if (draft && isMounted && draft.items && draft.items.length > 0) {
          setCart(draft.items);
          if (draft.orderType) {
            setOrderType(draft.orderType);
            setOrderTypeChoice(draft.orderType === 'TAKE_AWAY' ? '2' : '1');
          }
          if (draft.priceType) {
            setPriceType(draft.priceType);
            setPriceTypeChoice(draft.priceType === 'AC' ? '2' : '1');
          }
          if (draft.tableNumber) {
            setTableNumber(draft.tableNumber);
          }
          if (draft.discountPercent !== undefined && draft.discountPercent !== null) {
            setDiscountPercent(draft.discountPercent);
          }
          if (draft.customDiscount !== undefined) {
            setCustomDiscount(draft.customDiscount);
          }
          if (draft.cashTendered) {
            setCashTendered(draft.cashTendered);
          }
          setAutoSaveStatus('saved');
          setNotification({
            type: 'success',
            message: `Restored ${draft.items.length} bill-in-progress item${draft.items.length > 1 ? 's' : ''} from cloud auto-save draft.`
          });
          setTimeout(() => setNotification(null), 4500);
        }
      } catch (err) {
        console.warn('Draft restoration notice:', err);
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

  // Effective Menu Items (Respects manual entry and empty state from Menu Management)
  const menuItems = useMemo(() => {
    try {
      const stored = localStorage.getItem('pos_local_menu_items');
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return firestoreMenuItems;
  }, [firestoreMenuItems]);

  // Available categories (strictly the 9 clean menu categories)
  const categories = useMemo(() => {
    let source = DEFAULT_CATEGORIES;
    try {
      const stored = localStorage.getItem('pos_local_categories');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          source = parsed;
        }
      }
    } catch (e) {}

    return source
      .filter((c) => c.active !== false)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((c) => ({
        id: c.id,
        name: c.categoryName || c.name || c.id
      }));
  }, []);

  // Filtered quick dishes (supports multi-category categoryIds and deduplicates ALL)
  const filteredQuickDishes = useMemo(() => {
    const uniqueItems = deduplicateMenuItems(menuItems);
    if (selectedCategory === 'ALL') return uniqueItems.slice(0, 16);
    return uniqueItems.filter((m) => itemBelongsToCategory(m, selectedCategory, DEFAULT_CATEGORIES));
  }, [menuItems, selectedCategory]);

  // Memoized search options to prevent recreated object references
  const searchOptions = useMemo(() => ({ debounceMs: 30, maxResults: 8 }), []);
  const modalSearchOptions = useMemo(() => ({ debounceMs: 30, maxResults: 100 }), []);

  // Memoized debounced local search hook
  const {
    matchingSuggestions,
    exactMatch,
    topMatch
  } = useMenuSearch(menuItems, itemCodeInput, priceType, searchOptions);

  // Memoized search hook for F4 modal search
  const modalSearchResults = useMenuSearch(menuItems, searchQuery, priceType, modalSearchOptions);

  // Live exact or close item match update as user types
  useEffect(() => {
    const trimmed = itemCodeInput.trim().toUpperCase();
    if (!trimmed) {
      setSelectedMenuItem((prev) => (prev !== null ? null : prev));
      setInputError((prev) => (prev !== null ? null : prev));
      setShowSuggestions((prev) => (prev !== false ? false : prev));
      return;
    }

    const target = exactMatch || (
      topMatch &&
      (topMatch.itemCode?.toUpperCase().startsWith(trimmed) ||
       topMatch.itemName?.toUpperCase().startsWith(trimmed))
        ? topMatch
        : null
    );

    setSelectedMenuItem((prev) => {
      if (!prev && !target) return prev;
      if (prev && target && prev.id === target.id && (prev as any).applicablePrice === (target as any).applicablePrice) {
        return prev;
      }
      return target;
    });
    setInputError((prev) => (prev !== null ? null : prev));
  }, [itemCodeInput, exactMatch, topMatch]);

  // Autofocus Item Code on initial mount for instant keyboard billing
  useEffect(() => {
    if (!loadingMenu) {
      if (itemCodeRef.current) {
        itemCodeRef.current.focus();
        setFocusedStep('ITEM_CODE');
      } else if (priceTypeRef.current) {
        priceTypeRef.current.focus();
        priceTypeRef.current.select();
        setFocusedStep('PRICE_TYPE');
      }
    }
  }, [loadingMenu]);

  // Global Keyboard shortcuts (Ctrl alone, Ctrl+Enter, Cmd+Enter, F2, F4, F7, F8, F9, F10, ESC)
  useEffect(() => {
    let ctrlPressedAlone = false;
    let ctrlPressStartTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Direct Hardware Print: Track if Ctrl or Cmd is tapped alone
      if ((e.key === 'Control' || e.key === 'Meta') && !e.repeat) {
        ctrlPressedAlone = true;
        ctrlPressStartTime = Date.now();
      } else if (e.key !== 'Control' && e.key !== 'Meta') {
        // Any other key pressed while holding Ctrl indicates a combo or typing
        ctrlPressedAlone = false;
      }

      // Step 14: Save & Print Combo: [CTRL + ENTER] / [CMD + ENTER] / [CTRL + P] / [CTRL + S]
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S');

      if (isSaveShortcut) {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length === 0) {
          setInputError('Cart is empty. Please add at least 1 item before saving (Ctrl alone or Ctrl+Enter).');
          setTimeout(() => setInputError(null), 3000);
          return;
        }
        handleSaveBill(true, 'CASH');
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        handleNewBill();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setSearchModalOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else if (e.key === 'F7' || (e.altKey && (e.key === 'r' || e.key === 'R'))) {
        // Instant Reprint Shortcut
        e.preventDefault();
        e.stopPropagation();
        handleReprintLastBill();
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleHoldBill();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleCreateKotFromBilling(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        handleSaveBill(true, 'CASH');
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        if (cart.length === 0) {
          setInputError('Cart is empty. Add at least 1 item before saving.');
          setTimeout(() => setInputError(null), 3000);
          return;
        }
        handleSaveBill(false, 'CASH');
      } else if (e.key === 'Escape') {
        if (showSuggestions) {
          setShowSuggestions(false);
        } else if (searchModalOpen) {
          setSearchModalOpen(false);
        } else if (isReceiptModalOpen) {
          setIsReceiptModalOpen(false);
        } else if (isHardwareModalOpen) {
          setIsHardwareModalOpen(false);
        } else if (activeItemNoteIdx !== null) {
          setActiveItemNoteIdx(null);
        } else if (selectedMenuItem || itemCodeInput) {
          setItemCodeInput('');
          setSelectedMenuItem(null);
          setInputError(null);
          itemCodeRef.current?.focus();
          setFocusedStep('ITEM_CODE');
        } else if (focusedStep === 'QUANTITY') {
          itemCodeRef.current?.focus();
          setFocusedStep('ITEM_CODE');
        } else if (focusedStep === 'ITEM_CODE' && cart.length === 0) {
          orderTypeRef.current?.focus();
          orderTypeRef.current?.select();
          setFocusedStep('ORDER_TYPE');
        } else if (focusedStep === 'ORDER_TYPE') {
          priceTypeRef.current?.focus();
          priceTypeRef.current?.select();
          setFocusedStep('PRICE_TYPE');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // If user tapped [Ctrl] or [Cmd] alone to immediately save and print
      if ((e.key === 'Control' || e.key === 'Meta') && ctrlPressedAlone) {
        ctrlPressedAlone = false;
        const duration = Date.now() - ctrlPressStartTime;
        // If released within 900ms without other keys pressed, execute instant hardware print
        if (duration < 900) {
          if (cart.length === 0) {
            setInputError('Cart is empty. Add items first, then tap [Ctrl] to print immediately.');
            setTimeout(() => setInputError(null), 3000);
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          handleSaveBill(true, 'CASH');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [cart, priceType, orderType, tableNumber, customDiscount, discountPercent, searchModalOpen, isReceiptModalOpen, isHardwareModalOpen, showSuggestions, activeItemNoteIdx, selectedMenuItem, itemCodeInput, focusedStep]);

  // Listen for restricted browser print dialogs if logged by system
  useEffect(() => {
    const handlePrintRestricted = () => {
      console.warn('Browser print restricted notice received.');
    };

    window.addEventListener('pos-print-restricted', handlePrintRestricted);
    return () => window.removeEventListener('pos-print-restricted', handlePrintRestricted);
  }, []);

  // STEP 2: Handle Price Type Input (1 = Non-AC, 2 = AC) -> Press Enter -> Moves to Order Type
  const handlePriceTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl+Enter / Ctrl+P / Ctrl+S save trigger
    const isSaveCombo = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S');
    if (isSaveCombo) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving (Ctrl+Enter or F10).');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === '1') {
      setPriceTypeChoice('1');
      setPriceType('NON_AC');
    } else if (e.key === '2') {
      setPriceTypeChoice('2');
      setPriceType('AC');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextChoice = priceTypeChoice === '1' ? '2' : '1';
      setPriceTypeChoice(nextChoice);
      setPriceType(nextChoice === '1' ? 'NON_AC' : 'AC');
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      const current = priceTypeChoice === '2' ? 'AC' : 'NON_AC';
      setPriceType(current);
      setFocusedStep('ORDER_TYPE');
      setTimeout(() => {
        orderTypeRef.current?.focus();
        orderTypeRef.current?.select();
      }, 30);
    }
  };

  // STEP 3: Handle Order Type Input (1 = Dine In, 2 = Take Away) -> Press Enter -> Moves to Item Code
  const handleOrderTypeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl+Enter / Ctrl+P / Ctrl+S save trigger
    const isSaveCombo = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S');
    if (isSaveCombo) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving (Ctrl+Enter or F10).');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === '1') {
      setOrderTypeChoice('1');
      setOrderType('DINE_IN');
    } else if (e.key === '2') {
      setOrderTypeChoice('2');
      setOrderType('TAKE_AWAY');
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextChoice = orderTypeChoice === '1' ? '2' : '1';
      setOrderTypeChoice(nextChoice);
      setOrderType(nextChoice === '1' ? 'DINE_IN' : 'TAKE_AWAY');
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      const current = orderTypeChoice === '2' ? 'TAKE_AWAY' : 'DINE_IN';
      setOrderType(current);
      setFocusedStep('ITEM_CODE');
      setTimeout(() => {
        itemCodeRef.current?.focus();
      }, 30);
    } else if (e.key === 'Backspace' && !orderTypeChoice) {
      priceTypeRef.current?.focus();
      priceTypeRef.current?.select();
      setFocusedStep('PRICE_TYPE');
    }
  };

  // Select an item from suggestions or direct search and move cursor to Quantity (STEP 8)
  const selectItemAndFocusQty = (item: MenuItem) => {
    setItemCodeInput(item.itemCode);
    setSelectedMenuItem(item);
    setShowSuggestions(false);
    setInputError(null);
    setQuantityInput('1');
    setFocusedStep('QUANTITY');
    setTimeout(() => {
      quantityRef.current?.focus();
      quantityRef.current?.select();
    }, 40);
  };

  // STEP 5: Handle Item Code Input KeyDown -> Enter -> Finds Item & Moves to Quantity (STEP 8)
  const handleItemCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl+Enter / Ctrl+P / Ctrl+S save trigger
    const isSaveCombo = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S');
    if (isSaveCombo) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving (Ctrl+Enter or F10).');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (matchingSuggestions.length > 0) {
        e.preventDefault();
        setShowSuggestions(true);
        setSelectedSuggestionIndex((prev) => 
          prev < matchingSuggestions.length - 1 ? prev + 1 : 0
        );
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      if (matchingSuggestions.length > 0) {
        e.preventDefault();
        setShowSuggestions(true);
        setSelectedSuggestionIndex((prev) => 
          prev > 0 ? prev - 1 : matchingSuggestions.length - 1
        );
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const code = itemCodeInput.trim().toUpperCase();
      if (!code) {
        // If code is empty and cart has items, trigger save or quick notification
        if (cart.length > 0) {
          handleSaveBill(true, 'CASH');
        } else {
          setInputError('Enter an item code or press Ctrl+Enter / F10 after adding items.');
          setTimeout(() => setInputError(null), 3000);
        }
        return;
      }

      // 1. If suggestions are open and index is valid, pick it
      if (showSuggestions && matchingSuggestions[selectedSuggestionIndex]) {
        selectItemAndFocusQty(matchingSuggestions[selectedSuggestionIndex]);
        return;
      }

      // 2. Look for exact match by code or name
      const found = menuItems.find(
        (m) => m.itemCode?.toUpperCase() === code || m.itemName?.toUpperCase() === code
      );

      if (found) {
        selectItemAndFocusQty(found);
        return;
      }

      // 3. If there's at least one matching suggestion, pick the first one
      if (matchingSuggestions.length > 0) {
        selectItemAndFocusQty(matchingSuggestions[0]);
        return;
      }

      setInputError(`Item code "${code}" not found. Enter a valid code or pick from dishes below.`);
      setSelectedMenuItem(null);
    }
  };

  // STEP 9 & 10: Handle Quantity Enter -> Add to Cart -> Return Focus to Item Code (STEP 12)
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Check for Ctrl+Enter / Ctrl+P / Ctrl+S save trigger
    const isSaveCombo = (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S');
    if (isSaveCombo) {
      e.preventDefault();
      e.stopPropagation();
      if (cart.length > 0) {
        handleSaveBill(true, 'CASH');
      } else {
        setInputError('Cart is empty. Please add items before saving (Ctrl+Enter or F10).');
        setTimeout(() => setInputError(null), 3000);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (!selectedMenuItem) {
        itemCodeRef.current?.focus();
        setFocusedStep('ITEM_CODE');
        return;
      }

      const qty = parseInt(quantityInput, 10);
      if (isNaN(qty) || qty <= 0) {
        setInputError('Please enter a valid quantity (1 or more).');
        return;
      }

      const unitPrice = BillingEngine.getApplicablePrice(selectedMenuItem, priceType);
      const newItem: EnhancedCartItem = {
        itemId: selectedMenuItem.id,
        itemCode: selectedMenuItem.itemCode,
        itemName: selectedMenuItem.itemName,
        itemNameTamil: selectedMenuItem.itemNameTamil,
        quantity: qty,
        unitPrice,
        totalPrice: BillingEngine.calculateItemTotal(unitPrice, qty),
        priceType
      };

      // Check if already in cart with same priceType -> update qty
      setCart((prev) => {
        const existingIdx = prev.findIndex((i) => i.itemId === newItem.itemId && i.priceType === newItem.priceType);
        if (existingIdx >= 0) {
          const updated = [...prev];
          const combinedQty = updated[existingIdx].quantity + qty;
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: combinedQty,
            totalPrice: BillingEngine.calculateItemTotal(unitPrice, combinedQty)
          };
          return updated;
        }
        return [...prev, newItem];
      });

      // Clear current item entry and immediately return focus to Item Code (STEP 12)
      setItemCodeInput('');
      setSelectedMenuItem(null);
      setQuantityInput('1');
      setInputError(null);
      setShowSuggestions(false);
      setFocusedStep('ITEM_CODE');
      
      setTimeout(() => {
        itemCodeRef.current?.focus();
      }, 40);
    } else if (e.key === 'Escape' || (e.key === 'Backspace' && !quantityInput)) {
      itemCodeRef.current?.focus();
      itemCodeRef.current?.select();
      setFocusedStep('ITEM_CODE');
    }
  };

  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    itemCodeRef.current?.focus();
    setFocusedStep('ITEM_CODE');
  };

  const handleUpdateCartQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveFromCart(index);
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

  const focusItemCodeInput = () => {
    setFocusedStep('ITEM_CODE');
    if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== itemCodeRef.current
    ) {
      document.activeElement.blur();
    }
    itemCodeRef.current?.focus();
    setTimeout(() => {
      itemCodeRef.current?.focus();
    }, 30);
  };

  const handleNewBill = () => {
    setCart([]);
    setItemCodeInput('');
    setSelectedMenuItem(null);
    setQuantityInput('1');
    setDiscountPercent(null);
    setCustomDiscount(0);
    setCashTendered('');
    setTableNumber('');
    setActiveKotId(undefined);
    setInputError(null);
    setShowSuggestions(false);
    setFocusedStep('ITEM_CODE');
    setAutoSaveStatus('idle');
    clearBillingDraft('direct_billing', currentUser?.uid);
    focusItemCodeInput();
  };

  const handleHoldBill = () => {
    if (cart.length === 0) {
      setInputError('Cart is empty. Nothing to hold.');
      return;
    }

    const holdId = `hold_${Date.now()}`;
    const holdName = tableNumber ? `Table ${tableNumber}` : `${orderType} (${cart.length} items)`;
    setHeldBills((prev) => [...prev, { id: holdId, name: holdName, items: [...cart], orderType, priceType, tableNumber }]);
    
    setNotification({ type: 'success', message: `Bill held successfully (${holdName}).` });
    handleNewBill();
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRestoreHeldBill = (holdId: string) => {
    const target = heldBills.find((b) => b.id === holdId);
    if (!target) return;

    setCart(target.items);
    setOrderType(target.orderType);
    setPriceType(target.priceType);
    setTableNumber(target.tableNumber);
    setHeldBills((prev) => prev.filter((b) => b.id !== holdId));
    itemCodeRef.current?.focus();
  };

  const handleSeedMenu = async () => {
    setSeeding(true);
    try {
      await bootstrapSystem();
      setNotification({ type: 'success', message: 'Sample menu items seeded successfully into database!' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      console.error('Seeding error:', err);
      setInputError('Failed to seed menu. Please check settings.');
    } finally {
      setSeeding(false);
    }
  };

  const handleReprintLastBill = async () => {
    let billToPrint = lastPrintedBill?.bill;
    let itemsToPrint = lastPrintedBill?.items;

    if (!billToPrint || !itemsToPrint || itemsToPrint.length === 0) {
      try {
        const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          billToPrint = snap.docs[0].data() as Bill;
          itemsToPrint = await ReprintEngine.getBillItems(billToPrint.id);
          setLastPrintedBill({ bill: billToPrint, items: itemsToPrint });
        }
      } catch (err) {
        console.warn('Failed to fetch last bill for reprint:', err);
      }
    }

    if (!billToPrint || !itemsToPrint || itemsToPrint.length === 0) {
      setNotification({ type: 'warning', message: 'No past bills available to reprint yet. Please generate a bill first.' });
      setTimeout(() => setNotification(null), 3500);
      return;
    }

    const nextCount = (billToPrint.reprintCount || 0) + 1;
    const updatedBill: Bill = { ...billToPrint, reprintCount: nextCount };

    // Record audit reprint in Firestore in background for real bills
    if (!billToPrint.id.startsWith('sample_')) {
      ReprintEngine.recordReprint(billToPrint.id, currentUser?.name || 'Cashier').catch((err) => {
        console.debug('Reprint audit log notice:', err);
      });
    }

    setSavedBill(updatedBill);
    setSavedBillItems(itemsToPrint);
    setLastPrintedBill({ bill: updatedBill, items: itemsToPrint });
    try {
      safeStorage.setItem('pos_last_printed_bill', JSON.stringify({ bill: updatedBill, items: itemsToPrint }));
    } catch (e) {}

    // Trigger direct thermal print via PrintService without opening preview or losing focus
    setNotification({
      type: 'info',
      message: 'Printing...',
      billNumber: updatedBill.billNumber
    });
    focusItemCodeInput();

    void PrintService.printReceipt({
      bill: updatedBill,
      items: itemsToPrint,
      settings,
      forcePrint: true,
      isReprint: true
    }).then((res) => {
      if (res.success) {
        setNotification({
          type: 'success',
          message: `Bill ${updatedBill.billNumber} Printed (Reprint #${nextCount})`,
          billNumber: updatedBill.billNumber
        });
        setTimeout(() => setNotification(null), 3500);
      } else {
        setSavedBill(updatedBill);
        setSavedBillItems(itemsToPrint);
        setIsReceiptModalOpen(true);
        setNotification({
          type: 'warning',
          message: `Reprint #${nextCount} Ready - ${res.restrictedInIframe ? 'On-Screen Receipt Opened' : 'Print Modal Opened'}`,
          billNumber: updatedBill.billNumber
        });
        setTimeout(() => setNotification(null), 4000);
      }
      focusItemCodeInput();
    });
  };

  // Calculations
  const subtotal = useMemo(() => BillingEngine.calculateSubtotal(cart), [cart]);
  
  const effectiveDiscount = useMemo(() => {
    if (discountPercent !== null) {
      return Math.round((subtotal * discountPercent) / 100);
    }
    return customDiscount;
  }, [subtotal, discountPercent, customDiscount]);

  const grandTotal = useMemo(() => BillingEngine.calculateGrandTotal(subtotal, effectiveDiscount), [subtotal, effectiveDiscount]);
  
  const tenderedNum = parseFloat(cashTendered) || 0;
  const returnChange = tenderedNum >= grandTotal ? tenderedNum - grandTotal : 0;
  const currentItemPrice = selectedMenuItem ? BillingEngine.getApplicablePrice(selectedMenuItem, priceType) : 0;

  // Debounced Auto-save to Firestore & LocalStorage whenever bill-in-progress state changes
  useEffect(() => {
    if (isInitialMount.current) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (cart.length === 0) {
      setAutoSaveStatus('idle');
      clearBillingDraft('direct_billing', currentUser?.uid);
      return;
    }

    setAutoSaveStatus('saving');
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveBillingDraft({
          screen: 'direct_billing',
          userId: currentUser?.uid,
          userName: currentUser?.name,
          orderType,
          priceType,
          tableNumber,
          items: cart,
          discount: effectiveDiscount,
          discountPercent,
          customDiscount,
          cashTendered,
          subtotal,
          grandTotal
        });
        setAutoSaveStatus('saved');
      } catch (err) {
        console.warn('Auto-save error:', err);
        setAutoSaveStatus('idle');
      }
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [
    cart,
    orderType,
    priceType,
    tableNumber,
    effectiveDiscount,
    discountPercent,
    customDiscount,
    cashTendered,
    subtotal,
    grandTotal,
    currentUser?.uid,
    currentUser?.name
  ]);

  // Synchronous emergency backup on beforeunload (browser refresh or session close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (cart.length > 0) {
        saveBillingDraft({
          screen: 'direct_billing',
          userId: currentUser?.uid,
          userName: currentUser?.name,
          orderType,
          priceType,
          tableNumber,
          items: cart,
          discount: effectiveDiscount,
          discountPercent,
          customDiscount,
          cashTendered,
          subtotal,
          grandTotal
        });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [
    cart,
    orderType,
    priceType,
    tableNumber,
    effectiveDiscount,
    discountPercent,
    customDiscount,
    cashTendered,
    subtotal,
    grandTotal,
    currentUser?.uid,
    currentUser?.name
  ]);

  // Create KOT directly from selected cart items in Billing screen
  const handleCreateKotFromBilling = async (andPrint = true) => {
    if (cart.length === 0) {
      setInputError('Cart is empty. Please add items before creating KOT.');
      setTimeout(() => setInputError(null), 3000);
      return;
    }

    setSaving(true);
    setInputError(null);

    try {
      const businessDate = getBusinessDate(settings?.businessDayStart || '04:00');
      const now = Date.now();
      const { kotNumber } = await allocateNextKotNumber(businessDate);
      const kotId = `kot_${now}_${Math.random().toString(36).substring(2, 6)}`;

      const kotItems: KotItem[] = cart.map((c, idx) => ({
        id: `${kotId}_item_${idx + 1}`,
        kotId,
        itemId: c.itemId,
        itemCode: c.itemCode,
        itemName: c.itemName,
        itemNameTamil: c.itemNameTamil,
        quantity: c.quantity,
        priceType: c.priceType || priceType,
        unitPrice: c.unitPrice,
        notes: c.notes || '',
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
        waiterName: currentUser?.name || 'Cashier',
        status: 'OPEN',
        items: kotItems,
        itemsCount: kotItems.reduce((sum, i) => sum + i.quantity, 0),
        createdBy: currentUser?.name || 'Cashier',
        createdAt: now,
        updatedAt: now
      };

      // 1. Immediately persist locally (0ms latency)
      saveKotLocally(newKot, kotItems);

      // 2. Direct thermal KOT print via PrintService (non-blocking, no preview)
      if (andPrint) {
        void PrintService.printKot(newKot, kotItems, settings);
      }

      // 3. Notify user
      setNotification({
        type: 'success',
        message: `KOT ${kotNumber} created & sent to kitchen for ${newKot.tableNumber}!`
      });

      // 4. Background sync to Firestore
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'kots', kotId), sanitizeForFirestore(newKot));
        kotItems.forEach((ki) => {
          batch.set(doc(db, 'kot_items', ki.id), sanitizeForFirestore(ki));
        });
        batch.commit().catch((dbErr) => console.warn('Firestore KOT background write notice:', dbErr));
      } catch (dbErr) {
        console.warn('Firestore KOT sync notice (preserved locally):', dbErr);
      }

      // 5. Reset bill draft
      handleNewBill();
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      console.error('Error creating KOT from billing:', e);
      setInputError(e.message || 'Failed to create KOT');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBill = async (andPrint = true, paymentMode: 'CASH' | 'UPI' | 'CARD' = 'CASH') => {
    if (isSavingRef.current) return;
    if (cart.length === 0) {
      setInputError('Cart is empty. Please add items before saving (Ctrl+Enter or F10).');
      setTimeout(() => setInputError(null), 3000);
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    setInputError(null);

    try {
      const kotIdToLink = activeKotId;

      // 1. Prepare bill & sequential numbering immediately
      const prepared = await BillingEngine.prepareBill({
        items: cart.map(c => ({
          ...c,
          itemName: c.notes ? `${c.itemName} (${c.notes})` : c.itemName
        })),
        orderType,
        priceType,
        tableNumber: orderType === 'DINE_IN' ? tableNumber : undefined,
        kotId: kotIdToLink,
        discount: effectiveDiscount,
        userId: currentUser?.uid || 'cashier_1',
        userName: currentUser?.name || 'Cashier',
        businessDayStart: settings?.businessDayStart || '04:00'
      });

      if (paymentMode === 'UPI') {
        prepared.bill.transactionId = `UPI-${Date.now().toString().slice(-6)}`;
      }

      setSavedBill(prepared.bill);
      setSavedBillItems(prepared.items);
      setLastPrintedBill({ bill: prepared.bill, items: prepared.items });

      // If linked to KOT, immediately free the table in local store
      if (kotIdToLink) {
        updateLocalKotStatus(kotIdToLink, 'BILLED');
      }

      // Cache in localStorage for instant reprint even across tab reload
      try {
        safeStorage.setItem('pos_last_printed_bill', JSON.stringify({
          bill: prepared.bill,
          items: prepared.items
        }));
      } catch (e) {}

      // 2. Persist bill & items asynchronously to Firestore BEFORE/INDEPENDENT OF printing
      BillingEngine.persistBillAsync(
        prepared.bill, 
        prepared.items, 
        kotIdToLink, 
        currentUser?.uid || 'cashier_1'
      ).catch((persistErr) => {
        console.warn('Background Firestore persist notice (queued in offline cache):', persistErr);
      });

      // 3. Clear completed cart immediately and move focus back to Item Code for the next bill
      handleNewBill();

      // 4. Asynchronous Direct Thermal Print via PrintService (no window.print, no preview, no minimize)
      const isAutoPrintEnabled = settings?.autoPrintOnSave !== false;
      const shouldTriggerPrint = andPrint || isAutoPrintEnabled;
      const cleanBillNum = String(prepared.bill.billNumber).replace(/^BN-|^#/, '');

      if (shouldTriggerPrint) {
        setNotification({
          type: 'info',
          message: 'Printing...',
          billNumber: cleanBillNum
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
              message: `Bill ${cleanBillNum} Printed`,
              billNumber: cleanBillNum
            });
            setTimeout(() => setNotification(null), 3500);
          } else {
            const errMsg = printRes.error || 'Receipt could not be sent to the print system.';
            // Automatically open receipt preview modal so the user immediately sees the thermal receipt
            setSavedBill(prepared.bill);
            setSavedBillItems(prepared.items);
            setIsReceiptModalOpen(true);

            setNotification({
              type: 'warning',
              message: `Bill ${cleanBillNum} Saved - ${printRes.restrictedInIframe ? 'On-Screen Receipt Opened' : 'Printing Failed'}`,
              billNumber: cleanBillNum
            });
            setTimeout(() => setNotification(null), 4500);

            setPrintFailureModal({
              bill: prepared.bill,
              items: prepared.items,
              error: errMsg,
              jobId: printRes.jobId
            });
          }
          focusItemCodeInput();
        });
      } else {
        setNotification({ 
          type: 'success', 
          message: `Bill ${cleanBillNum} Saved (₹${prepared.bill.grandTotal} via ${paymentMode})`,
          billNumber: cleanBillNum
        });
        setTimeout(() => setNotification(null), 3500);
      }

    } catch (err: any) {
      console.error('Failed to prepare or save bill:', err);
      setInputError(err.message || 'Failed to save bill. Please try again.');
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  };

  const toggleRushMode = () => {
    const next = !fastRushMode;
    setFastRushMode(next);
    safeStorage.setItem('pos_fast_rush_mode', String(next));
    setNotification({
      type: 'info',
      message: next 
        ? '⚡ Fast Billing Mode: On-screen preview skipped for high-speed checkout!' 
        : 'Standard Mode: On-screen receipt preview modal enabled.'
    });
    setTimeout(() => setNotification(null), 3500);
  };

  const toggleMockPrintMode = () => {
    const next = !mockPrintMode;
    setMockPrintMode(next);
    PrinterService.setMockPrintMode(next);
    setNotification({
      type: 'success',
      message: next 
        ? 'Printer Testing Mode: Silent Dev Print active.' 
        : 'Hardware Printer Mode: Physical thermal printer active.'
    });
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="flex flex-col w-full h-full max-w-full bg-slate-100/90 text-slate-800 p-1.5 sm:p-2 gap-1.5 sm:gap-2 overflow-y-auto lg:overflow-hidden font-sans box-border">
      
      {/* Top Header Bar */}
      <div
        className="flex items-center justify-between bg-[#0F172A] text-white border border-slate-800 rounded-xl px-2.5 sm:px-3.5 py-2 gap-2 text-xs shadow-sm shrink-0 w-full"
      >
        
        {/* Left: App Title & Shop Logo */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-full bg-white border border-emerald-400 shadow-2xs flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
            <img 
              src={settings?.logoUrl || DEFAULT_RESTAURANT_LOGO} 
              alt={settings?.restaurantName || 'SRI SARAVANA BHAVAN'} 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = SRI_SARAVANA_BHAVAN_SVG;
              }}
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white uppercase leading-none truncate">Direct Counter Billing</span>
              {autoSaveStatus === 'saving' && (
                <span className="hidden xs:flex items-center gap-1 text-[11px] font-bold text-sky-300 bg-sky-950/80 border border-sky-800 px-1.5 py-0.5 rounded-md animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
                  <span className="hidden sm:inline">Saving draft...</span>
                </span>
              )}
              {autoSaveStatus === 'saved' && cart.length > 0 && (
                <span className="hidden xs:flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded-md" title="Current bill-in-progress is auto-saved to Firestore">
                  <Cloud className="w-3 h-3 text-emerald-400" />
                  <span className="hidden sm:inline">Cloud Synced</span>
                </span>
              )}
            </div>
          </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {heldBills.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/90 border border-emerald-800 px-2 py-1 rounded-lg font-mono">
                Held: {heldBills.length}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleReprintLastBill}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
            title="Reprint last customer receipt (Shortcut: F7 or Alt+R)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline font-mono">
              {lastPrintedBill 
                ? `Reprint #${lastPrintedBill.bill.billNumber} (₹${lastPrintedBill.bill.grandTotal})` 
                : 'Reprint [F7]'}
            </span>
            <span className="sm:hidden">Reprint</span>
          </button>

          <button
            type="button"
            onClick={handleNewBill}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#EA580C] hover:bg-[#D97706] text-white border border-[#EA580C] flex items-center gap-1 transition-colors cursor-pointer shrink-0 shadow-xs"
            title="Start new customer bill / Clear current bill (F2)"
          >
            <Plus className="w-3.5 h-3.5 text-white stroke-[2.5]" />
            <span className="hidden xs:inline">New Bill [F2]</span>
            <span className="xs:hidden">New</span>
          </button>
        </div>
      </div>


      {/* Notifications */}
      {notification && (
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold shadow-xs animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span>{notification.message}</span>
          </div>
          {lastPrintedBill && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setSavedBill(lastPrintedBill.bill);
                  setSavedBillItems(lastPrintedBill.items);
                  setIsReceiptModalOpen(true);
                }}
                className="px-2.5 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-[11px] font-bold cursor-pointer"
                title="View on-screen receipt preview"
              >
                View
              </button>
              <button
                type="button"
                onClick={handleReprintLastBill}
                className="px-2.5 py-1 rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-bold cursor-pointer"
              >
                Reprint
              </button>
            </div>
          )}
        </div>
      )}

      {inputError && (
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold shadow-xs animate-in shake shrink-0">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{inputError}</span>
        </div>
      )}

      {/* Held Bills Bar */}
      {heldBills.length > 0 && (
        <div className="flex items-center gap-2 bg-slate-900 text-white border border-slate-800 p-2 rounded-xl overflow-x-auto text-xs shrink-0">
          <span className="font-bold text-amber-400 shrink-0 uppercase tracking-wider text-[11px]">Held Bills:</span>
          {heldBills.map((hb) => (
            <button
              key={hb.id}
              onClick={() => handleRestoreHeldBill(hb.id)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 font-medium shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{hb.name}</span>
              <span className="text-[10px] bg-[#2563EB] text-white px-1.5 py-0.5 rounded font-bold">Restore</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Layout: Top Direct Input Controls + Bottom Live Cart & Settlement */}
      <div className="flex flex-col gap-2.5 flex-1 min-h-0 lg:overflow-hidden">
        
        {/* TOP SECTION: DIRECT BILLING CONTROLS */}
        <div
          className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 shadow-2xs shrink-0"
        >
          
          {/* Full-Width Responsive Billing Input Controls with Clean Line Alignment */}
          <div className="flex flex-wrap items-start gap-2 sm:gap-2.5 w-full">
            
            {/* 1. Price Mode (AC / Non-AC) */}
            <div className="order-1 w-[calc(50%-4px)] sm:w-[162px] shrink-0">
              <div className="h-4 mb-1 flex items-center justify-between">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 truncate">
                  Hall / Tariff
                </label>
              </div>
              <div 
                className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-1 h-8 sm:h-9 w-full"
              >
                <input
                  ref={priceTypeRef}
                  type="text"
                  maxLength={1}
                  value={priceTypeChoice || '1'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '1' || val === '2') {
                      setPriceTypeChoice(val);
                      setPriceType(val === '1' ? 'NON_AC' : 'AC');
                    }
                  }}
                  onFocus={() => {
                    setFocusedStep('PRICE_TYPE');
                    priceTypeRef.current?.select();
                  }}
                  onKeyDown={handlePriceTypeKeyDown}
                  className="w-7 h-7 sm:h-7.5 bg-white border border-slate-300 rounded text-center font-mono font-bold text-base sm:text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB] shrink-0"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => {
                    setPriceTypeChoice('1');
                    setPriceType('NON_AC');
                    setFocusedStep('ITEM_CODE');
                    itemCodeRef.current?.focus();
                  }}
                  className={`flex-1 h-7 sm:h-7.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                    priceType === 'NON_AC'
                      ? 'bg-[#2563EB] text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Non-AC
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPriceTypeChoice('2');
                    setPriceType('AC');
                    setFocusedStep('ITEM_CODE');
                    itemCodeRef.current?.focus();
                  }}
                  className={`flex-1 h-7 sm:h-7.5 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                    priceType === 'AC'
                      ? 'bg-[#2563EB] text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AC
                </button>
              </div>
            </div>

            {/* 2. Order Type (Dine-In / Takeaway) */}
            <div className="order-2 w-[calc(50%-4px)] sm:w-[190px] shrink-0">
              <div className="h-4 mb-1 flex items-center justify-between">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700 truncate">
                  Service Type
                </label>
              </div>
              <div 
                className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-1 h-8 sm:h-9 w-full"
              >
                <input
                  ref={orderTypeRef}
                  type="text"
                  maxLength={1}
                  value={orderTypeChoice || '1'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '1' || val === '2') {
                      setOrderTypeChoice(val);
                      setOrderType(val === '1' ? 'DINE_IN' : 'TAKE_AWAY');
                    }
                  }}
                  onFocus={() => {
                    setFocusedStep('ORDER_TYPE');
                    orderTypeRef.current?.select();
                  }}
                  onKeyDown={handleOrderTypeKeyDown}
                  className="w-7 h-7 sm:h-7.5 bg-white border border-slate-300 rounded text-center font-mono font-bold text-base sm:text-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB] shrink-0"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOrderTypeChoice('1');
                    setOrderType('DINE_IN');
                    setFocusedStep('ITEM_CODE');
                    itemCodeRef.current?.focus();
                  }}
                  className={`w-[70px] h-[30px] pl-0 ml-0 whitespace-nowrap shrink-0 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                    orderType === 'DINE_IN'
                      ? 'bg-[#2563EB] text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Dine In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderTypeChoice('2');
                    setOrderType('TAKE_AWAY');
                    setFocusedStep('ITEM_CODE');
                    itemCodeRef.current?.focus();
                  }}
                  className={`flex-1 h-7 sm:h-7.5 whitespace-nowrap rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-0.5 ${
                    orderType === 'TAKE_AWAY'
                      ? 'bg-[#2563EB] text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3 h-3 hidden xs:inline" /> Takeaway
                </button>
              </div>
            </div>

            {/* 3. Item Code Input */}
            <div className="order-3 w-[calc(55%-4px)] sm:w-[165px] shrink-0 relative">
              <div className="h-4 mb-1 flex items-center justify-between">
                <label className="text-[11px] sm:text-xs font-bold text-slate-900">
                  Item Code
                </label>
                <button
                  type="button"
                  onClick={() => setSearchModalOpen(true)}
                  className="text-[11px] text-[#D97706] hover:text-[#B45309] flex items-center gap-0.5 font-bold cursor-pointer"
                  title="Search Items [F4]"
                >
                  <Search className="w-3 h-3" /> Find [F4]
                </button>
              </div>

              <div className="relative h-8 sm:h-9 w-full">
                <input
                  ref={itemCodeRef}
                  type="text"
                  value={itemCodeInput || ''}
                  onChange={(e) => {
                    setItemCodeInput(e.target.value);
                    setShowSuggestions(true);
                    setSelectedSuggestionIndex(0);
                  }}
                  onFocus={() => {
                    setFocusedStep('ITEM_CODE');
                    if (itemCodeInput.trim()) setShowSuggestions(true);
                  }}
                  onKeyDown={handleItemCodeKeyDown}
                  placeholder="Code (e.g. 101)"
                  className={`w-full h-8 sm:h-9 bg-slate-50 border rounded-lg px-2.5 text-base sm:text-lg font-mono font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#3B82F6] focus:ring-2 focus:ring-[#3B82F6]/25 transition-all text-center tracking-wider ${
                    focusedStep === 'ITEM_CODE' ? 'border-[#3B82F6] ring-2 ring-[#3B82F6]/25 bg-white' : 'border-slate-300'
                  }`}
                  autoComplete="off"
                />

                {itemCodeInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemCodeInput('');
                      setSelectedMenuItem(null);
                      setShowSuggestions(false);
                      itemCodeRef.current?.focus();
                      setFocusedStep('ITEM_CODE');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown Popup */}
              {showSuggestions && matchingSuggestions.length > 0 && (
                <div 
                  ref={suggestionsContainerRef}
                  className="absolute left-0 w-72 sm:w-80 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in"
                >
                  <div className="p-2 bg-[#0F172A] text-xs text-slate-200 font-mono flex justify-between uppercase px-3">
                    <span>Matching Dishes</span>
                    <span className="text-amber-400 font-bold">{matchingSuggestions.length} found</span>
                  </div>
                  {matchingSuggestions.map((item, idx) => {
                    const price = BillingEngine.getApplicablePrice(item, priceType);
                    const isSelected = idx === selectedSuggestionIndex;
                    return (
                      <div
                        key={item.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectItemAndFocusQty(item);
                        }}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 text-slate-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="font-mono font-bold text-slate-800 text-xs bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                            #{item.itemCode}
                          </span>
                          <span className="font-medium text-xs sm:text-sm text-slate-900 truncate">{item.itemName}</span>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          <span className="font-bold text-[#2563EB] text-xs sm:text-sm">₹{price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Quantity & Add Button */}
            <div className="order-4 w-[calc(45%-4px)] sm:w-auto md:order-5 shrink-0">
              <div className="h-4 mb-1 flex items-center justify-between gap-2">
                <label className="text-[11px] sm:text-xs font-bold text-slate-900">
                  Quantity
                </label>
                {selectedMenuItem && (
                  <span className="text-[11px] font-mono font-bold text-[#2563EB]">
                    Amt: ₹{currentItemPrice * Math.max(1, parseInt(quantityInput, 10) || 1)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={quantityRef}
                  type="number"
                  min="1"
                  value={quantityInput || ''}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  onFocus={() => setFocusedStep('QUANTITY')}
                  onKeyDown={handleQuantityKeyDown}
                  disabled={!selectedMenuItem}
                  placeholder="1"
                  className={`w-14 sm:w-16 h-8 sm:h-9 bg-slate-50 border rounded-lg text-center font-mono font-bold text-base sm:text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#3B82F6]/25 disabled:opacity-60 disabled:border-slate-200 ${
                    focusedStep === 'QUANTITY' ? 'border-[#3B82F6] ring-2 ring-[#3B82F6]/25 bg-white' : 'border-slate-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedMenuItem) {
                      itemCodeRef.current?.focus();
                      return;
                    }
                    const evt = { key: 'Enter', preventDefault: () => {} } as any;
                    handleQuantityKeyDown(evt);
                  }}
                  className="px-3.5 sm:px-4 h-8 sm:h-9 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                  title="Add item to bill (Enter)"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add</span>
                </button>
              </div>
            </div>

            {/* 5. Selected Item, Rate & Automatic Item Total Display */}
            <div className="order-5 w-full md:order-4 md:flex-1 md:min-w-[200px]">
              <div className="h-4 mb-1 flex items-center justify-between">
                <label className="text-[11px] sm:text-xs font-bold text-slate-700">
                  Item Name & Price
                </label>
                {selectedMenuItem && (
                  <span className="text-[11px] font-mono text-blue-800 bg-blue-100 px-1.5 py-0.2 rounded font-bold">
                    #{selectedMenuItem.itemCode} • {priceType}
                  </span>
                )}
              </div>
              
              <div 
                className={`h-8 sm:h-9 rounded-lg px-2.5 border transition-all flex items-center justify-between gap-2 w-full ${
                  selectedMenuItem 
                    ? 'bg-blue-50/90 border-blue-300 shadow-2xs' 
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                {selectedMenuItem ? (
                  <>
                    <div className="min-w-0 flex-1 flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {selectedMenuItem.itemName}
                      </span>
                    </div>
                    <div className="text-right shrink-0 font-mono pl-2.5 border-l border-blue-200 flex items-center gap-2">
                      <span className="text-xs text-slate-600 font-semibold">
                        ₹{currentItemPrice} × {Math.max(1, parseInt(quantityInput, 10) || 1)} =
                      </span>
                      <span className="text-sm sm:text-base font-black text-[#1D4ED8]">
                        ₹{currentItemPrice * Math.max(1, parseInt(quantityInput, 10) || 1)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 flex items-center gap-1.5" />
                )}
              </div>
            </div>

          </div>

        </div>

        {/* DOWN SECTION: LIVE BILL CART & SETTLEMENT */}
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          
          {/* Cart Header */}
          <div className="px-4 py-2.5 sm:py-3 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-sm sm:text-base text-slate-900">Customer Bill</span>
              <span className="text-xs sm:text-sm text-slate-500 font-mono">
                ({orderType === 'DINE_IN' ? 'Dine In' : 'Take Away'} • {priceType})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm bg-slate-100 text-slate-700 font-mono px-3 py-1 rounded-full font-bold border border-slate-200">
                {cart.reduce((s, i) => s + i.quantity, 0)} Items
              </span>

              {cart.length > 0 && (
                <button
                  onClick={handleNewBill}
                  className="px-3 py-1.5 text-xs sm:text-sm text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors border border-slate-200 font-semibold"
                  title="Clear current cart"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Cart Items Table */}
          <div className="flex-1 p-2 sm:p-3 overflow-y-auto min-h-[140px]">
            {/* Mobile View: Compact Cards with Swipe-to-Delete */}
                <div className="sm:hidden space-y-2 font-sans">
                  <AnimatePresence initial={false}>
                    {cart.map((item, idx) => (
                      <motion.div 
                        key={`${item.itemId}_${item.priceType}`} 
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0, scale: 0.9, transition: { duration: 0.18 } }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="relative overflow-hidden rounded-xl bg-red-600 select-none shadow-2xs"
                      >
                        {/* Swipe Reveal Action Layer */}
                        <div className="absolute inset-0 flex items-center justify-end px-4 text-white font-bold text-xs gap-1.5 pointer-events-none">
                          <Trash2 className="w-4 h-4 text-white animate-pulse" />
                          <span>Release to delete</span>
                        </div>

                        {/* Draggable Item Surface */}
                        <motion.div
                          drag="x"
                          dragDirectionLock
                          dragConstraints={{ left: -140, right: 0 }}
                          dragElastic={{ left: 0.5, right: 0.05 }}
                          onDragEnd={(_, info) => {
                            if (info.offset.x < -70 || info.velocity.x < -350) {
                              handleRemoveFromCart(idx);
                            }
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col gap-2 relative z-10 cursor-grab active:cursor-grabbing touch-pan-y"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-bold text-amber-700 text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                  #{item.itemCode}
                                </span>
                                <span className="font-bold text-slate-900 text-xs sm:text-sm">
                                  {item.itemName}
                                </span>
                              </div>
                              {item.notes && (
                                <span className="text-[10px] text-amber-700 font-medium mt-0.5 block">
                                  ⚡ {item.notes}
                                </span>
                              )}
                            </div>
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => handleRemoveFromCart(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer shrink-0"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                            <div className="flex items-center gap-2">
                              <div 
                                className="inline-flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs font-mono"
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => handleUpdateCartQty(idx, item.quantity - 1)}
                                  className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer text-sm"
                                >
                                  -
                                </button>
                                <span className="font-bold text-slate-900 text-sm min-w-[20px] text-center">{item.quantity}</span>
                                <button
                                  onClick={() => handleUpdateCartQty(idx, item.quantity + 1)}
                                  className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer text-sm"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => setActiveItemNoteIdx(idx)}
                                className="text-[10px] text-slate-600 hover:text-amber-800 font-mono flex items-center gap-0.5 cursor-pointer bg-white hover:bg-amber-50 px-2 py-1 rounded-lg border border-slate-200"
                                title="Add Cooking Note"
                              >
                                <SlidersHorizontal className="w-3 h-3 text-amber-600" />
                                <span>{item.notes ? 'Note' : '+ Note'}</span>
                              </button>
                            </div>

                            <div className="text-right font-mono">
                              <span className="text-[11px] text-slate-500 block">₹{item.unitPrice} each</span>
                              <span className="text-sm font-black text-slate-900">₹{item.totalPrice}</span>
                            </div>
                          </div>
                        </motion.div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Desktop View: Clean Table with Swipe-to-Delete Support */}
                <div className="w-full overflow-x-auto scrollbar-thin hidden sm:block">
                  <table className="w-full min-w-[640px] text-base sm:text-lg text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-xs sm:text-sm tracking-wider bg-slate-50">
                        <th className="py-2.5 pl-3 w-12 min-w-[44px] whitespace-nowrap">#</th>
                        <th className="py-2.5 w-24 min-w-[85px] whitespace-nowrap">Code</th>
                        <th className="py-2.5 min-w-[180px] whitespace-nowrap">Item Name</th>
                        <th className="py-2.5 text-center w-36 min-w-[130px] whitespace-nowrap">Quantity</th>
                        <th className="py-2.5 text-right w-24 min-w-[85px] whitespace-nowrap">Rate</th>
                        <th className="py-2.5 text-right w-28 min-w-[100px] whitespace-nowrap">Total</th>
                        <th className="py-2.5 text-center w-16 min-w-[64px] whitespace-nowrap" title="Swipe row left to remove">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      <AnimatePresence initial={false}>
                        {cart.map((item, idx) => (
                          <motion.tr 
                            key={`${item.itemId}_${item.priceType}`} 
                            layout
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: -140, right: 0 }}
                            dragElastic={{ left: 0.5, right: 0.05 }}
                            onDragEnd={(_, info) => {
                              if (info.offset.x < -70 || info.velocity.x < -350) {
                                handleRemoveFromCart(idx);
                              }
                            }}
                            initial={{ opacity: 0, y: -6, backgroundColor: 'rgba(254, 243, 199, 0.45)' }}
                            animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(255, 55, 255, 0)', x: 0 }}
                            exit={{ opacity: 0, x: -100, transition: { duration: 0.15 } }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            whileDrag={{ backgroundColor: 'rgba(254, 226, 226, 0.9)', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.15)' }}
                            className="hover:bg-slate-50/80 transition-colors cursor-grab active:cursor-grabbing touch-pan-y select-none"
                          >
                            <td className="py-2.5 pl-3 text-slate-400 text-xs sm:text-sm whitespace-nowrap">{idx + 1}</td>
                            <td className="py-2.5 font-bold text-amber-700 text-base sm:text-lg whitespace-nowrap">#{item.itemCode}</td>
                            <td className="py-2.5 font-sans">
                              <div className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2 whitespace-nowrap">
                                <span>{item.itemName}</span>
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => setActiveItemNoteIdx(idx)}
                                  className="text-xs text-slate-500 hover:text-amber-800 font-mono flex items-center gap-0.5 cursor-pointer bg-slate-100 hover:bg-amber-50 px-1.5 py-0.5 rounded border border-slate-200"
                                  title="Add Cooking Note"
                                >
                                  <SlidersHorizontal className="w-3 h-3 text-amber-600" />
                                  <span>{item.notes ? item.notes : '+ Note'}</span>
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 text-center whitespace-nowrap">
                              <div 
                                className="inline-flex items-center gap-2 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs"
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => handleUpdateCartQty(idx, item.quantity - 1)}
                                  className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors cursor-pointer text-base"
                                >
                                  -
                                </button>
                                <span className="font-bold text-slate-900 text-base sm:text-lg min-w-[22px] text-center">{item.quantity}</span>
                                <button
                                  onClick={() => handleUpdateCartQty(idx, item.quantity + 1)}
                                  className="text-slate-600 hover:text-amber-700 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 transition-colors cursor-pointer text-base"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 text-right text-slate-700 font-medium text-base sm:text-lg whitespace-nowrap">₹{item.unitPrice}</td>
                            <td className="py-2.5 text-right font-black text-slate-900 text-lg sm:text-xl whitespace-nowrap">₹{item.totalPrice}</td>
                            <td className="py-2.5 text-center whitespace-nowrap">
                              <button
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => handleRemoveFromCart(idx)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                title="Remove item (or swipe left)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
          </div>

          {/* Totals & Calculations Section */}
          <div className="bg-slate-50/70 border-t border-slate-200 p-3 sm:p-4 space-y-3 shrink-0">
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 items-stretch">
              
              {/* Subtotal */}
              <div 
                className="min-h-[54px] sm:min-h-[60px] bg-white border border-slate-200 rounded-xl px-3.5 py-2 flex justify-between items-center shadow-2xs"
              >
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Subtotal</div>
                  <div className="text-xs text-slate-500 leading-tight">{cart.reduce((s, i) => s + i.quantity, 0)} Items</div>
                </div>
                <div className="font-mono text-lg sm:text-xl font-black text-slate-900">
                  ₹{subtotal}
                </div>
              </div>

              {/* Discount Details */}
              <div 
                className="min-h-[54px] sm:min-h-[60px] bg-white border border-slate-200 rounded-xl px-3.5 py-2 flex justify-between items-center shadow-2xs"
              >
                <div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Discount</div>
                  <div className="text-xs text-slate-500 leading-tight">
                    {discountPercent !== null ? `${discountPercent}%` : 'Custom'}
                  </div>
                </div>
                {discountPercent !== null ? (
                  <div className="font-mono text-base sm:text-lg font-bold text-amber-600">
                    -₹{effectiveDiscount}
                  </div>
                ) : (
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    value={customDiscount > 0 ? customDiscount : ''}
                    onChange={(e) => setCustomDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0"
                    className="w-20 sm:w-24 h-9 bg-slate-100 border border-slate-200 rounded-lg px-2 text-right font-mono text-base sm:text-lg font-bold text-slate-700 focus:outline-none focus:border-[#2563EB]"
                  />
                )}
              </div>

              {/* Net Payable Grand Total */}
              <div 
                className="min-h-[54px] sm:min-h-[60px] col-span-2 sm:col-span-1 bg-[#0F172A] text-white rounded-xl border-l-4 border-l-[#F59E0B] px-4 py-2 flex justify-between items-center shadow-md"
              >
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider leading-tight">Net Payable</div>
                  <div className="text-xs text-white font-semibold leading-tight">
                    {tenderedNum > 0 ? `Change: ₹${returnChange}` : 'Grand Total'}
                  </div>
                </div>
                <div className="font-mono text-xl sm:text-2xl font-black text-[#FBBF24] tracking-tight">
                  ₹{grandTotal}
                </div>
              </div>

            </div>

            {/* Settle Action Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3 pt-0.5">
              
              {/* 1. New / Clear Bill (Soft Rose Pink) */}
              <button
                type="button"
                onClick={handleNewBill}
                className="py-3 sm:py-3.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold bg-[#FFE4E6] hover:bg-[#FECDD3] text-[#9F1239] border border-[#F43F5E]/60 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                title="Clear / New Bill (F2)"
              >
                <span>Clear Bill [F2]</span>
              </button>

              {/* 2. Hold Bill (Soft Warm Amber Cream) */}
              <button
                type="button"
                onClick={handleHoldBill}
                className="py-3 sm:py-3.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#78350F] border border-[#D97706]/60 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                title="Hold current bill (F8)"
              >
                <span>Hold [F8]</span>
              </button>

              {/* 3. Send to Kitchen as KOT (Vibrant Orange) */}
              <button
                type="button"
                onClick={() => handleCreateKotFromBilling(true)}
                disabled={saving}
                className="py-3 sm:py-3.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold bg-[#EA580C] hover:bg-[#C2410C] text-white border border-[#EA580C] flex items-center justify-center transition-all shadow-sm cursor-pointer active:scale-[0.99]"
                title="Send to Kitchen as KOT (F9)"
              >
                <span>Send KOT [F9]</span>
              </button>

              {/* 4. Save Bill Only (Vibrant Royal Blue) */}
              <button
                type="button"
                onClick={() => handleSaveBill(false, 'CASH')}
                disabled={saving}
                className="py-3 sm:py-3.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold bg-[#2563EB] hover:bg-[#1D4ED8] text-white border border-[#2563EB] flex items-center justify-center transition-all shadow-sm cursor-pointer active:scale-[0.99]"
                title="Save Bill without printing (Alt+S)"
              >
                <span>Save Bill [Alt+S]</span>
              </button>

              {/* 5. Print Bill (Rich Forest Green) */}
              <button
                type="button"
                onClick={() => handleSaveBill(true, 'CASH')}
                disabled={saving}
                className="col-span-2 sm:col-span-1 py-3 sm:py-3.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold bg-[#15803D] hover:bg-[#166534] text-white border border-[#15803D] flex items-center justify-center transition-all shadow-md cursor-pointer active:scale-[0.99]"
                title="Save and Print Bill (Tap [Ctrl] alone or [Ctrl+Enter])"
              >
                <span className="truncate">{saving ? 'Printing...' : `Print Bill [Ctrl+Enter] (₹${grandTotal})`}</span>
              </button>

            </div>

          </div>

        </div>

      </div>

      {/* Cooking Note / Modifiers Modal */}
      {activeItemNoteIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Cooking Note: {cart[activeItemNoteIdx]?.itemName}
                </h3>
              </div>
              <button
                onClick={() => setActiveItemNoteIdx(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_MODIFIERS.map((mod) => (
                <button
                  key={mod}
                  onClick={() => {
                    setCart((prev) => {
                      const updated = [...prev];
                      updated[activeItemNoteIdx] = {
                        ...updated[activeItemNoteIdx],
                        notes: mod
                      };
                      return updated;
                    });
                    setActiveItemNoteIdx(null);
                  }}
                  className="p-2 rounded-xl text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 text-left transition-all cursor-pointer"
                >
                  {mod}
                </button>
              ))}
            </div>

            <div className="pt-2 flex justify-between">
              <button
                onClick={() => {
                  setCart((prev) => {
                    const updated = [...prev];
                    updated[activeItemNoteIdx] = {
                      ...updated[activeItemNoteIdx],
                      notes: undefined
                    };
                    return updated;
                  });
                  setActiveItemNoteIdx(null);
                }}
                className="text-xs text-red-600 hover:underline cursor-pointer font-medium"
              >
                Clear Note
              </button>
              <button
                onClick={() => setActiveItemNoteIdx(null)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Search Modal [F4] */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="p-3.5 border-b border-slate-200 flex items-center gap-3 bg-slate-50">
              <Search className="w-5 h-5 text-amber-600" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by code, item name, or category..."
                className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none font-medium"
              />
              <button
                onClick={() => setSearchModalOpen(false)}
                className="text-xs bg-slate-200 hover:bg-slate-300 px-2.5 py-1 rounded-lg text-slate-700 cursor-pointer font-medium"
              >
                Close [Esc]
              </button>
            </div>

            <div className="p-3 overflow-y-auto space-y-1 divide-y divide-slate-100">
              {(searchQuery.trim() ? modalSearchResults.matchingSuggestions : menuItems).map((item) => {
                const acP = item.acPrice;
                const nonAcP = item.nonAcPrice;
                const activePrice = BillingEngine.getApplicablePrice(item, priceType);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      selectItemAndFocusQty(item);
                      setSearchModalOpen(false);
                    }}
                    className="p-2.5 rounded-xl hover:bg-amber-50/60 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-700 text-xs bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          #{item.itemCode}
                        </span>
                        <span className="font-medium text-sm text-slate-900">{item.itemName}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{item.categoryName}</span>
                    </div>
                    <div className="text-right font-mono text-xs">
                      <div className="text-slate-900 font-bold">Active ({priceType}): ₹{activePrice}</div>
                      <div className="text-[10px] text-slate-500">Non-AC: ₹{nonAcP} | AC: ₹{acP}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 80mm Thermal Receipt Preview Modal */}
      {isReceiptModalOpen && savedBill && (
        <ThermalReceiptModal
          bill={savedBill}
          items={savedBillItems}
          settings={settings}
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          isReprint={Boolean(savedBill && (savedBill.reprintCount || 0) > 0)}
        />
      )}

      {/* Direct Hardware (0-Click Silent Thermal Print) Modal */}
      <DirectHardwarePrintModal
        isOpen={isHardwareModalOpen}
        onClose={() => setIsHardwareModalOpen(false)}
        settings={settings}
      />

      {/* Non-Blocking Print Failure & Retry Toast Banner (Never blocks POS or creates duplicate bills) */}
      {printFailureModal && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-slate-900 border border-red-500/50 rounded-2xl p-4 shadow-2xl space-y-3 text-slate-100"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <div className="font-bold text-xs text-emerald-400">
                Receipt saved successfully.
              </div>
              <div className="font-bold text-sm text-white">
                Bill {printFailureModal.bill.billNumber} saved. Printing failed.
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                {printFailureModal.error}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSavedBill(printFailureModal.bill);
                setSavedBillItems(printFailureModal.items);
                setIsReceiptModalOpen(true);
              }}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>View Receipt</span>
            </button>

            <button
              type="button"
              onClick={() => setIsHardwareModalOpen(true)}
              className="py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Pair Hardware</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const target = printFailureModal;
                setNotification({
                  type: 'info',
                  message: 'Printing...',
                  billNumber: target.bill.billNumber
                });
                focusItemCodeInput();
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
                    message: `Bill ${billNo} Printed`,
                    billNumber: billNo
                  });
                  setTimeout(() => setNotification(null), 3500);
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
                focusItemCodeInput();
              }}
              className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Retry Print</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPrintFailureModal(null);
                focusItemCodeInput();
              }}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl cursor-pointer border border-slate-700 flex items-center justify-center"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
