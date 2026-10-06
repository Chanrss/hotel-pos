import React, { useState, useEffect, useMemo } from 'react';
import { 
  Boxes, 
  Plus, 
  ArrowLeft, 
  Calendar, 
  History, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle, 
  Search, 
  Save, 
  Layers, 
  X, 
  ShoppingCart, 
  FileText, 
  RotateCcw,
  Sparkles,
  Droplets,
  CupSoda,
  IceCream,
  Package,
  ClipboardCheck,
  TrendingDown,
  TrendingUp,
  Receipt,
  DollarSign,
  Tag,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  CheckSquare,
  Square,
  Table as TableIcon,
  LayoutGrid,
  SlidersHorizontal,
  Check,
  FileSpreadsheet,
  Upload
} from 'lucide-react';
import { BulkUpdateModal, BulkItemRow } from './BulkUpdateModal';
import { useAuth } from '../../context/AuthContext';
import { 
  InventoryItem, 
  StockMovement, 
  MenuItem, 
  Category, 
  CountPurchaseRecord, 
  CountMissingRecord 
} from '../../types';
import { InventoryEngine } from '../../services/inventoryEngine';
import { 
  calculateStockMetrics, 
  initializeItemStock, 
  addCountPurchase, 
  addCountMissing, 
  getItemSalesHistory 
} from '../../services/countInventoryService';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  setDoc, 
  doc, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../../services/firebase';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';

// Standard Count-Based Default Categories
const COUNT_PRESET_CATEGORIES = [
  { id: 'cat_icecream', name: 'Ice Cream', icon: 'icecream', description: 'Vanilla, Chocolate, Cones, Amul Cups' },
  { id: 'cat_cool_drinks', name: 'Cool Drinks', icon: 'cooldrinks', description: 'Coke, Pepsi, Sprite, Fanta, Juices' },
  { id: 'cat_water', name: 'Water', icon: 'water', description: '1 Liter, 2 Liter, Aquafina, Kinley' },
  { id: 'cat_other_count', name: 'Other', icon: 'other', description: 'Chocolates, Wafers, Packaged Snacks' }
];

export const InventoryManagement: React.FC = () => {
  const { currentUser, isOwner, isManager } = useAuth();

  // Navigation Level: 'CATEGORIES' -> 'ITEMS' -> 'DETAIL'
  const [navLevel, setNavLevel] = useState<'CATEGORIES' | 'ITEMS' | 'DETAIL'>('CATEGORIES');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('Ice Cream');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // View Mode: Count-Based Simplified Screen vs Audit Movement Log
  const [activeTab, setActiveTab] = useState<'count-inventory' | 'movements'>('count-inventory');

  // Datasets
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const cached = localStorage.getItem('pos_local_inventory');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    try {
      const stored = localStorage.getItem('pos_local_menu_items');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return DEFAULT_FALLBACK_MENU_ITEMS;
  });

  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk Selection & View Mode States
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemsViewMode, setItemsViewMode] = useState<'GRID' | 'TABLE'>('GRID');
  const [itemsFilterStatus, setItemsFilterStatus] = useState<'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'SELECTED'>('ALL');
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkModalTab, setBulkModalTab] = useState<'PRICE' | 'STOCK' | 'MATRIX' | 'TEMPLATE'>('PRICE');

  // Modals
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [purchaseQuantity, setPurchaseQuantity] = useState('');
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState('');
  const [purchaseInvoice, setPurchaseInvoice] = useState('');
  const [purchaseSupplier, setPurchaseSupplier] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  const [missingModalOpen, setMissingModalOpen] = useState(false);
  const [missingMode, setMissingMode] = useState<'DIRECT' | 'PHYSICAL_AUDIT'>('DIRECT');
  const [missingDate, setMissingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [missingQuantity, setMissingQuantity] = useState('');
  const [physicalFoundInput, setPhysicalFoundInput] = useState('');
  const [missingReason, setMissingReason] = useState('Damaged / Broken / Melted');

  const [initialStockModalOpen, setInitialStockModalOpen] = useState(false);
  const [initInitialStock, setInitInitialStock] = useState('50');
  const [initMinimumStock, setInitMinimumStock] = useState('10');
  const [initUnit, setInitUnit] = useState('Pcs');

  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState('Ice Cream');
  const [newItemName, setNewItemName] = useState('');
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('Pcs');
  const [newItemInitialStock, setNewItemInitialStock] = useState('50');
  const [newItemMinStock, setNewItemMinStock] = useState('10');

  const [editMinStockModalOpen, setEditMinStockModalOpen] = useState(false);
  const [editMinStockValue, setEditMinStockValue] = useState('10');

  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Firestore Sync & Local Fallback
  useEffect(() => {
    // Inventory Items listener
    const unsubInv = onSnapshot(collection(db, 'inventory_items'), (snap) => {
      const list: InventoryItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as InventoryItem));
      if (list.length > 0) {
        setInventory(list);
        localStorage.setItem('pos_local_inventory', JSON.stringify(list));
      }
    }, (err) => {
      console.warn('Inventory items Firestore notice:', err?.message || err);
    });

    // Movements Log listener
    const qMov = query(collection(db, 'inventory_movements'), orderBy('createdAt', 'desc'), limit(150));
    const unsubMov = onSnapshot(qMov, (snap) => {
      const list: StockMovement[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as StockMovement));
      setMovements(list);
    }, (err) => {
      console.warn('Movements Firestore notice:', err?.message || err);
    });

    // Menu Items listener
    const unsubMenu = onSnapshot(collection(db, 'menu_items'), (snap) => {
      const list: MenuItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as MenuItem));
      if (list.length > 0) {
        setMenuItems(list);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(list));
      }
    }, (err) => {
      console.warn('Menu items Firestore notice:', err?.message || err);
    });

    return () => {
      unsubInv();
      unsubMov();
      unsubMenu();
    };
  }, []);

  // Listen to cross-component POS updates
  useEffect(() => {
    const handleStorageUpdate = () => {
      try {
        const raw = localStorage.getItem('pos_local_inventory');
        if (raw) setInventory(JSON.parse(raw));
      } catch (e) {}
    };

    window.addEventListener('pos_inventory_updated', handleStorageUpdate);
    window.addEventListener('pos_bills_updated', handleStorageUpdate);
    return () => {
      window.removeEventListener('pos_inventory_updated', handleStorageUpdate);
      window.removeEventListener('pos_bills_updated', handleStorageUpdate);
    };
  }, []);

  // Compute Active Item
  const activeItem = useMemo(() => {
    if (!selectedItemId) return null;
    // Check in inventory
    const foundInv = inventory.find((i) => i.id === selectedItemId);
    if (foundInv) return foundInv;

    // Check in menuItems to allow initializing stock for dishes
    const foundMenu = menuItems.find((m) => m.id === selectedItemId);
    if (foundMenu) {
      const fallbackItem: InventoryItem = {
        id: foundMenu.id,
        itemCode: foundMenu.itemCode || 'ITEM',
        itemName: foundMenu.itemName,
        itemNameTamil: foundMenu.itemNameTamil || '',
        category: foundMenu.categoryName?.includes('Ice Cream') 
          ? 'Ice Cream' 
          : foundMenu.categoryName?.includes('Beverage') || foundMenu.categoryName?.includes('Cold') 
          ? 'Cool Drinks' 
          : foundMenu.categoryName?.includes('Water') 
          ? 'Water' 
          : selectedCategoryName || 'Other',
        categoryId: foundMenu.categoryId,
        unit: 'Pcs',
        minimumStock: 10,
        currentStock: 0,
        active: true,
        isCountBased: true,
        isInitialized: false,
        initialStock: 0,
        purchasedCount: 0,
        soldCount: 0,
        missingCount: 0,
        remainingCount: 0,
        purchases: [],
        missingLogs: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      return fallbackItem;
    }

    return null;
  }, [selectedItemId, inventory, menuItems, selectedCategoryName]);

  // Active Item Metrics
  const activeMetrics = useMemo(() => {
    if (!activeItem) return null;
    return calculateStockMetrics(activeItem);
  }, [activeItem]);

  // Active Item Sales History from Finalized Bills
  const activeSalesAudit = useMemo(() => {
    if (!activeItem) return { totalSold: 0, salesList: [] };
    return getItemSalesHistory(activeItem.itemCode, activeItem.id);
  }, [activeItem]);

  // Categories Aggregation
  const categoriesList = useMemo(() => {
    // Unique category names from presets, inventory and menuItems
    const set = new Set<string>();
    COUNT_PRESET_CATEGORIES.forEach((c) => set.add(c.name));

    inventory.forEach((i) => {
      if (i.category) set.add(i.category);
    });

    menuItems.forEach((m) => {
      if (m.categoryName?.toLowerCase().includes('ice cream')) {
        set.add('Ice Cream');
      } else if (m.categoryName?.toLowerCase().includes('cold') || m.categoryName?.toLowerCase().includes('cool')) {
        set.add('Cool Drinks');
      } else if (m.categoryName?.toLowerCase().includes('water')) {
        set.add('Water');
      }
    });

    return Array.from(set);
  }, [inventory, menuItems]);

  // Items Belonging to Selected Category
  const categoryItems = useMemo(() => {
    if (!selectedCategoryName) return [];
    const catLower = selectedCategoryName.toLowerCase();

    // 1. Items in inventory matching category
    const invMatches = inventory.filter((item) => {
      const itemCat = (item.category || '').toLowerCase();
      if (catLower === 'ice cream') {
        return itemCat.includes('ice cream') || item.itemName.toLowerCase().includes('ice cream') || itemCat.includes('ice');
      }
      if (catLower === 'cool drinks') {
        return itemCat.includes('cool') || itemCat.includes('cold') || itemCat.includes('drink') || itemCat.includes('beverage');
      }
      if (catLower === 'water') {
        return itemCat.includes('water') || item.itemName.toLowerCase().includes('water') || item.itemName.toLowerCase().includes('bottle');
      }
      if (catLower === 'other') {
        return !itemCat.includes('ice') && !itemCat.includes('cool') && !itemCat.includes('cold') && !itemCat.includes('water');
      }
      return itemCat === catLower || itemCat.includes(catLower);
    });

    // 2. Menu items in this category that haven't been initialized yet
    const invIds = new Set(inventory.map((i) => i.id));
    const invCodes = new Set(inventory.map((i) => i.itemCode?.trim().toUpperCase()));

    const menuMatches: InventoryItem[] = [];
    menuItems.forEach((m) => {
      if (invIds.has(m.id) || (m.itemCode && invCodes.has(m.itemCode.trim().toUpperCase()))) {
        return; // Already in inventory
      }

      let matches = false;
      const mCat = (m.categoryName || '').toLowerCase();
      const mName = m.itemName.toLowerCase();

      if (catLower === 'ice cream') {
        matches = mCat.includes('ice cream') || mName.includes('ice cream') || mCat.includes('ice');
      } else if (catLower === 'cool drinks') {
        matches = (mCat.includes('cold') || mCat.includes('cool') || mCat.includes('drink')) && !mName.includes('water bottle');
      } else if (catLower === 'water') {
        matches = mName.includes('water') || mName.includes('bottle');
      }

      if (matches) {
        menuMatches.push({
          id: m.id,
          itemCode: m.itemCode || 'CODE',
          itemName: m.itemName,
          itemNameTamil: m.itemNameTamil || '',
          category: selectedCategoryName,
          categoryId: m.categoryId,
          unit: 'Pcs',
          minimumStock: 10,
          currentStock: 0,
          active: true,
          isCountBased: true,
          isInitialized: false,
          initialStock: 0,
          purchasedCount: 0,
          soldCount: 0,
          missingCount: 0,
          remainingCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    });

    // Combined unique list
    const combined = [...invMatches, ...menuMatches];

    if (!searchQuery) return combined;
    const q = searchQuery.toLowerCase().trim();
    return combined.filter(
      (item) => item.itemName.toLowerCase().includes(q) || item.itemCode.toLowerCase().includes(q)
    );
  }, [selectedCategoryName, inventory, menuItems, searchQuery]);

  // Overall Count Statistics
  const overallStats = useMemo(() => {
    const initializedItems = inventory.filter((i) => i.isInitialized);
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalRemainingUnits = 0;

    initializedItems.forEach((item) => {
      const remaining = item.remainingCount !== undefined ? item.remainingCount : item.currentStock;
      const minStock = item.minimumStock || 5;
      totalRemainingUnits += remaining;
      if (remaining <= 0) {
        outOfStockCount++;
      } else if (remaining <= minStock) {
        lowStockCount++;
      }
    });

    return {
      totalCountable: initializedItems.length,
      lowStockCount,
      outOfStockCount,
      totalRemainingUnits
    };
  }, [inventory]);

  // Filtered displayed items based on status tab (All / Low Stock / Out of Stock / Selected)
  const displayedCategoryItems = useMemo(() => {
    let items = categoryItems;
    if (itemsFilterStatus === 'LOW_STOCK') {
      items = items.filter((item) => {
        const metrics = calculateStockMetrics(item);
        return metrics.status === 'LOW_STOCK';
      });
    } else if (itemsFilterStatus === 'OUT_OF_STOCK') {
      items = items.filter((item) => {
        const metrics = calculateStockMetrics(item);
        return metrics.status === 'OUT_OF_STOCK';
      });
    } else if (itemsFilterStatus === 'SELECTED') {
      const set = new Set(selectedItemIds);
      items = items.filter((item) => set.has(item.id));
    }
    return items;
  }, [categoryItems, itemsFilterStatus, selectedItemIds]);

  // Bulk Selected Items mapped to BulkItemRow for price & stock updates
  const selectedBulkRows = useMemo<BulkItemRow[]>(() => {
    if (selectedItemIds.length === 0) return [];
    const selectedSet = new Set(selectedItemIds);

    // Collect all candidate items from inventory and menuItems
    const allPool: InventoryItem[] = [...inventory];
    menuItems.forEach((m) => {
      if (!allPool.some((i) => i.id === m.id || (i.itemCode && i.itemCode.toUpperCase() === m.itemCode.toUpperCase()))) {
        allPool.push({
          id: m.id,
          itemCode: m.itemCode || 'ITEM',
          itemName: m.itemName,
          itemNameTamil: m.itemNameTamil || '',
          category: m.categoryName || 'Other',
          unit: 'Pcs',
          minimumStock: 10,
          currentStock: 0,
          active: true,
          isCountBased: true,
          isInitialized: false,
          initialStock: 0,
          purchasedCount: 0,
          soldCount: 0,
          missingCount: 0,
          remainingCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    });

    return allPool
      .filter((i) => selectedSet.has(i.id))
      .map((item) => {
        const m = menuItems.find(
          (mi) => mi.id === item.id || (mi.itemCode && item.itemCode && mi.itemCode.trim().toUpperCase() === item.itemCode.trim().toUpperCase())
        );
        const metrics = calculateStockMetrics(item);
        return {
          id: item.id,
          itemCode: item.itemCode || 'ITEM',
          itemName: item.itemName,
          itemNameTamil: item.itemNameTamil,
          category: item.category || selectedCategoryName || 'Other',
          unit: item.unit || 'Pcs',
          currentStock: item.currentStock || 0,
          minimumStock: item.minimumStock || 10,
          isInitialized: !!item.isInitialized,
          initialStock: item.initialStock || 0,
          purchasedCount: item.purchasedCount || 0,
          soldCount: item.soldCount || 0,
          missingCount: item.missingCount || 0,
          remainingCount: metrics.remainingCount,
          nonAcPrice: m ? m.nonAcPrice : 0,
          acPrice: m ? m.acPrice : (m ? m.nonAcPrice : 0)
        };
      });
  }, [selectedItemIds, inventory, menuItems, selectedCategoryName]);

  // Complete catalog items mapped to BulkItemRow for template generation and spreadsheet lookup
  const allBulkRows = useMemo<BulkItemRow[]>(() => {
    const allPool: InventoryItem[] = [...inventory];
    menuItems.forEach((m) => {
      if (!allPool.some((i) => i.id === m.id || (i.itemCode && m.itemCode && i.itemCode.toUpperCase() === m.itemCode.toUpperCase()))) {
        allPool.push({
          id: m.id,
          itemCode: m.itemCode || 'ITEM',
          itemName: m.itemName,
          itemNameTamil: m.itemNameTamil || '',
          category: m.categoryName || 'Other',
          unit: 'Pcs',
          minimumStock: 10,
          currentStock: 0,
          active: true,
          isCountBased: true,
          isInitialized: false,
          initialStock: 0,
          purchasedCount: 0,
          soldCount: 0,
          missingCount: 0,
          remainingCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    });

    return allPool.map((item) => {
      const m = menuItems.find(
        (mi) => mi.id === item.id || (mi.itemCode && item.itemCode && mi.itemCode.trim().toUpperCase() === item.itemCode.trim().toUpperCase())
      );
      const metrics = calculateStockMetrics(item);
      return {
        id: item.id,
        itemCode: item.itemCode || 'ITEM',
        itemName: item.itemName,
        itemNameTamil: item.itemNameTamil,
        category: item.category || 'Other',
        unit: item.unit || 'Pcs',
        currentStock: item.currentStock || 0,
        minimumStock: item.minimumStock || 10,
        isInitialized: !!item.isInitialized,
        initialStock: item.initialStock || 0,
        purchasedCount: item.purchasedCount || 0,
        soldCount: item.soldCount || 0,
        missingCount: item.missingCount || 0,
        remainingCount: metrics.remainingCount,
        nonAcPrice: m ? m.nonAcPrice : 0,
        acPrice: m ? m.acPrice : (m ? m.nonAcPrice : 0)
      };
    });
  }, [inventory, menuItems]);

  // Bulk Selection Helper Handlers
  const isItemSelected = (id: string) => selectedItemIds.includes(id);

  const toggleSelectItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedItemIds((prev) => 
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = () => {
    const visibleIds = displayedCategoryItems.map((i) => i.id);
    setSelectedItemIds((prev) => {
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  };

  const handleDeselectAll = () => {
    setSelectedItemIds([]);
  };

  const handleSelectLowStockVisible = () => {
    const lowIds = categoryItems
      .filter((i) => {
        const metrics = calculateStockMetrics(i);
        return metrics.status === 'LOW_STOCK' || metrics.status === 'OUT_OF_STOCK';
      })
      .map((i) => i.id);
    setSelectedItemIds(lowIds);
  };

  const handleOpenBulkModal = (tab: 'PRICE' | 'STOCK' | 'MATRIX' | 'TEMPLATE') => {
    if (tab !== 'TEMPLATE' && selectedItemIds.length === 0) {
      // Auto-select all items in current view if none selected
      const visibleIds = displayedCategoryItems.map((i) => i.id);
      if (visibleIds.length > 0) {
        setSelectedItemIds(visibleIds);
      } else {
        setNotification({ type: 'error', message: 'No items available to update in this view.' });
        return;
      }
    }
    setBulkModalTab(tab);
    setBulkModalOpen(true);
  };

  // Handlers
  const handleSelectCategory = (catName: string) => {
    setSelectedCategoryName(catName);
    setSearchQuery('');
    setNavLevel('ITEMS');
  };

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItemId(item.id);
    setNavLevel('DETAIL');
  };

  // STEP 3: SAVE INITIAL STOCK COUNT (ONE-TIME ONLY)
  const handleSaveInitialStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    const initial = parseFloat(initInitialStock);
    const minStock = parseFloat(initMinimumStock);

    if (isNaN(initial) || initial < 0) {
      setNotification({ type: 'error', message: 'Please enter a valid Initial Stock Count (e.g. 50).' });
      return;
    }

    setSaving(true);
    try {
      const initialized = await initializeItemStock({
        itemId: activeItem.id,
        itemCode: activeItem.itemCode,
        itemName: activeItem.itemName,
        itemNameTamil: activeItem.itemNameTamil,
        category: selectedCategoryName || activeItem.category || 'Other',
        categoryId: activeItem.categoryId,
        unit: initUnit.trim() || 'Pcs',
        initialStock: initial,
        minimumStock: isNaN(minStock) ? 10 : minStock,
        userName: currentUser?.name || 'Staff'
      });

      // Update in state
      setInventory((prev) => {
        const filtered = prev.filter((i) => i.id !== initialized.id);
        return [initialized, ...filtered];
      });

      setInitialStockModalOpen(false);
      setNotification({
        type: 'success',
        message: `Initial stock of ${initial} ${initialized.unit} initialized for ${initialized.itemName}.`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to save initial stock.' });
    } finally {
      setSaving(false);
    }
  };

  // STEP 5: PURCHASE ENTRY
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    const qty = parseFloat(purchaseQuantity);
    if (isNaN(qty) || qty <= 0) {
      setNotification({ type: 'error', message: 'Please enter a valid purchase quantity (e.g. 20).' });
      return;
    }

    setSaving(true);
    try {
      const updated = await addCountPurchase({
        item: activeItem,
        quantity: qty,
        date: purchaseDate,
        unitPrice: parseFloat(purchaseUnitPrice) || 0,
        supplier: purchaseSupplier.trim(),
        invoiceNumber: purchaseInvoice.trim(),
        notes: purchaseNotes.trim(),
        userName: currentUser?.name || 'Staff'
      });

      setInventory((prev) => {
        const filtered = prev.filter((i) => i.id !== updated.id);
        return [updated, ...filtered];
      });

      setPurchaseModalOpen(false);
      setPurchaseQuantity('');
      setPurchaseUnitPrice('');
      setPurchaseInvoice('');
      setPurchaseSupplier('');
      setPurchaseNotes('');
      setNotification({
        type: 'success',
        message: `Purchased ${qty} ${updated.unit} added to stock. Total Purchased: ${updated.purchasedCount}.`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to record purchase.' });
    } finally {
      setSaving(false);
    }
  };

  // STEP 8: MISSING COUNT ENTRY
  const handleSaveMissing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;

    let qty = 0;
    let foundCount: number | undefined = undefined;

    if (missingMode === 'DIRECT') {
      qty = parseFloat(missingQuantity);
    } else {
      // Physical count audit: Expected - Physical found
      const initial = Number(activeItem.initialStock) || 0;
      const purchased = Number(activeItem.purchasedCount) || 0;
      const sold = Number(activeItem.soldCount) || 0;
      const currentMissing = Number(activeItem.missingCount) || 0;
      const expected = initial + purchased - sold - currentMissing;

      foundCount = parseFloat(physicalFoundInput);
      if (isNaN(foundCount) || foundCount < 0) {
        setNotification({ type: 'error', message: 'Please enter the physical quantity found.' });
        return;
      }
      qty = expected - foundCount;
      if (qty < 0) {
        setNotification({
          type: 'error',
          message: `Physical count (${foundCount}) is higher than expected (${expected}). Please use purchase entry instead.`
        });
        return;
      }
    }

    if (isNaN(qty) || qty <= 0) {
      setNotification({ type: 'error', message: 'Please specify a positive missing quantity.' });
      return;
    }

    setSaving(true);
    try {
      const updated = await addCountMissing({
        item: activeItem,
        quantity: qty,
        date: missingDate,
        reason: missingReason.trim() || 'Physical count discrepancy',
        physicalCountFound: foundCount,
        userName: currentUser?.name || 'Staff'
      });

      setInventory((prev) => {
        const filtered = prev.filter((i) => i.id !== updated.id);
        return [updated, ...filtered];
      });

      setMissingModalOpen(false);
      setMissingQuantity('');
      setPhysicalFoundInput('');
      setNotification({
        type: 'success',
        message: `Recorded ${qty} missing ${updated.unit}. New Remaining: ${updated.remainingCount}.`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to record missing count.' });
    } finally {
      setSaving(false);
    }
  };

  // CREATE NEW COUNT-BASED ITEM
  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      setNotification({ type: 'error', message: 'Item name is required.' });
      return;
    }

    const initial = parseFloat(newItemInitialStock);
    const minStock = parseFloat(newItemMinStock);

    setSaving(true);
    try {
      const id = `cnt_${Date.now()}`;
      const code = newItemCode.trim().toUpperCase() || `${inventory.length + 101}`;

      const created = await initializeItemStock({
        itemId: id,
        itemCode: code,
        itemName: newItemName.trim(),
        category: newItemCategory.trim() || selectedCategoryName || 'Other',
        unit: newItemUnit.trim() || 'Pcs',
        initialStock: isNaN(initial) ? 50 : initial,
        minimumStock: isNaN(minStock) ? 10 : minStock,
        userName: currentUser?.name || 'Staff'
      });

      setInventory((prev) => [created, ...prev]);
      setNewItemModalOpen(false);
      setNewItemName('');
      setNewItemCode('');
      setNotification({
        type: 'success',
        message: `Created count-based item "${created.itemName}" with initial stock ${created.initialStock}.`
      });
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to create item.' });
    } finally {
      setSaving(false);
    }
  };

  // EDIT MINIMUM STOCK
  const handleSaveMinStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) return;
    const val = parseFloat(editMinStockValue);
    if (isNaN(val) || val < 0) {
      setNotification({ type: 'error', message: 'Please enter a valid minimum stock threshold.' });
      return;
    }

    setSaving(true);
    try {
      const updated: InventoryItem = {
        ...activeItem,
        minimumStock: val,
        updatedAt: Date.now()
      };

      setInventory((prev) => {
        const filtered = prev.filter((i) => i.id !== updated.id);
        return [updated, ...filtered];
      });

      const ref = doc(db, 'inventory_items', activeItem.id);
      await setDoc(ref, sanitizeForFirestore(updated), { merge: true });

      setEditMinStockModalOpen(false);
      setNotification({ type: 'success', message: `Minimum stock updated to ${val} ${activeItem.unit}.` });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to update minimum stock.' });
    } finally {
      setSaving(false);
    }
  };

  // Helper for Category Icons
  const renderCategoryIcon = (catName: string) => {
    const lower = catName.toLowerCase();
    if (lower.includes('ice cream') || lower.includes('ice')) {
      return <IceCream className="w-6 h-6 text-pink-500" />;
    }
    if (lower.includes('cool') || lower.includes('drink') || lower.includes('beverage')) {
      return <CupSoda className="w-6 h-6 text-cyan-600" />;
    }
    if (lower.includes('water')) {
      return <Droplets className="w-6 h-6 text-blue-500" />;
    }
    return <Package className="w-6 h-6 text-amber-500" />;
  };

  return (
    <div className="flex flex-col min-h-full bg-slate-100 text-slate-800 p-2 sm:p-4 gap-3 sm:gap-4 overflow-y-auto pb-24 md:pb-8 font-sans">
      
      {/* 1. TOP HEADER BAR */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <Boxes className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-sm sm:text-base tracking-tight text-slate-900 uppercase leading-none">
                Count-Based Inventory
              </h1>
              <span className="text-[10px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Live POS Tally
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Initial Stock &rarr; Purchased &rarr; Sold &rarr; Missing &rarr; Remaining
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => handleOpenBulkModal('TEMPLATE')}
            className="px-3 py-1.5 sm:py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 shadow-2xs transition-colors cursor-pointer"
            title="Upload an Excel spreadsheet template to adjust stock levels for multiple items at once"
          >
            <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
            <span>Upload Stock Template</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenBulkModal('PRICE')}
            className={`px-3 py-1.5 sm:py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 border transition-all cursor-pointer ${
              selectedItemIds.length > 0
                ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-sm ring-2 ring-amber-400/40'
                : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 shadow-2xs'
            }`}
            title="Bulk update item prices or stock levels using checkbox selection"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-600" />
            <span>Bulk Update {selectedItemIds.length > 0 ? `(${selectedItemIds.length})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewItemCategory(selectedCategoryName || 'Ice Cream');
              setNewItemModalOpen(true);
            }}
            className="px-3 py-1.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Add Countable Item</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'count-inventory' ? 'movements' : 'count-inventory')}
            className={`px-3 py-1.5 sm:py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 border transition-colors cursor-pointer ${
              activeTab === 'movements'
                ? 'bg-amber-500 text-slate-950 border-amber-500 font-black shadow-xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>{activeTab === 'movements' ? 'Back to Inventory' : 'Audit Logs'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs shrink-0 animate-in fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Low Stock Banner Alert */}
      {overallStats.lowStockCount > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900 shadow-2xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <b>{overallStats.lowStockCount} countable items</b> are at or below their Minimum Stock safety threshold.
            </span>
          </div>
          <span className="text-[11px] font-bold text-amber-800 underline cursor-pointer" onClick={() => setNavLevel('CATEGORIES')}>
            Review Items
          </span>
        </div>
      )}

      {/* PRIMARY TAB: COUNT INVENTORY */}
      {activeTab === 'count-inventory' && (
        <div className="flex flex-col gap-3">

          {/* BREADCRUMB NAVIGATION BAR */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-2xs shrink-0 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-600 overflow-x-auto">
              <button 
                type="button" 
                onClick={() => setNavLevel('CATEGORIES')}
                className={`hover:text-amber-600 transition-colors cursor-pointer flex items-center gap-1 ${
                  navLevel === 'CATEGORIES' ? 'text-amber-600 font-black' : ''
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Categories</span>
              </button>

              {navLevel !== 'CATEGORIES' && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <button 
                    type="button"
                    onClick={() => setNavLevel('ITEMS')}
                    className={`hover:text-amber-600 transition-colors cursor-pointer truncate max-w-xs ${
                      navLevel === 'ITEMS' ? 'text-amber-600 font-black' : ''
                    }`}
                  >
                    <span>{selectedCategoryName}</span>
                  </button>
                </>
              )}

              {navLevel === 'DETAIL' && activeItem && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-slate-900 font-black truncate max-w-xs">
                    {activeItem.itemName}
                  </span>
                </>
              )}
            </div>

            {/* Back Button */}
            {navLevel !== 'CATEGORIES' && (
              <button
                type="button"
                onClick={() => {
                  if (navLevel === 'DETAIL') setNavLevel('ITEMS');
                  else if (navLevel === 'ITEMS') setNavLevel('CATEGORIES');
                }}
                className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          {/* ========================================================================= */}
          {/* LEVEL 1: CATEGORIES SCREEN                                               */}
          {/* ========================================================================= */}
          {navLevel === 'CATEGORIES' && (
            <div className="flex flex-col gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <h2 className="font-black text-sm text-slate-900 uppercase tracking-tight">
                  1. Select Count Category
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a category to view and count items (Ice Cream, Cool Drinks, Water Bottles, and more)
                </p>
              </div>

              {/* Grid of Categories */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {categoriesList.map((catName) => {
                  // Items in this category
                  const countInCat = inventory.filter((i) => {
                    const c = (i.category || '').toLowerCase();
                    const n = catName.toLowerCase();
                    if (n === 'ice cream') return c.includes('ice');
                    if (n === 'cool drinks') return c.includes('cool') || c.includes('cold') || c.includes('drink');
                    if (n === 'water') return c.includes('water');
                    return c === n;
                  });

                  const lowCount = countInCat.filter((i) => {
                    const rem = i.remainingCount !== undefined ? i.remainingCount : i.currentStock;
                    return rem <= (i.minimumStock || 5);
                  }).length;

                  return (
                    <div
                      key={catName}
                      onClick={() => handleSelectCategory(catName)}
                      className="bg-white border border-slate-200 hover:border-amber-400 hover:shadow-md rounded-2xl p-4 flex flex-col justify-between gap-3 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 group-hover:bg-amber-50 group-hover:border-amber-200 flex items-center justify-center transition-colors">
                          {renderCategoryIcon(catName)}
                        </div>
                        {lowCount > 0 ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            {lowCount} Low Stock
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            Active
                          </span>
                        )}
                      </div>

                      <div>
                        <h3 className="font-black text-base text-slate-900 group-hover:text-amber-700 transition-colors uppercase tracking-tight">
                          {catName}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {countInCat.length > 0 ? `${countInCat.length} tracked items` : 'Tap to manage & track'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-700">
                        <span>Open Category &rarr;</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* LEVEL 2: ITEMS IN CATEGORY LIST                                          */}
          {/* ========================================================================= */}
          {navLevel === 'ITEMS' && (
            <div className="flex flex-col gap-3">
              
              {/* Category Subheader & Search */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800">
                    {renderCategoryIcon(selectedCategoryName)}
                  </div>
                  <div>
                    <h2 className="font-extrabold text-sm sm:text-base text-slate-900 uppercase">
                      {selectedCategoryName} Items
                    </h2>
                    <span className="text-xs text-slate-500">
                      {categoryItems.length} products available for count tracking &amp; price management
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
                  <div className="relative w-full max-w-xs">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={`Search in ${selectedCategoryName}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => setItemsViewMode('GRID')}
                      className={`p-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                        itemsViewMode === 'GRID' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Cards Grid View"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemsViewMode('TABLE')}
                      className={`p-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                        itemsViewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Compact Table View"
                    >
                      <TableIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setNewItemCategory(selectedCategoryName);
                      setNewItemModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shrink-0 flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* FILTER CHIPS & BULK SELECTION TOOLBAR */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                
                {/* Left: Filter Status Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black text-slate-500 uppercase mr-1">Filter:</span>
                  {[
                    { id: 'ALL', label: `All (${categoryItems.length})` },
                    { 
                      id: 'LOW_STOCK', 
                      label: `Low Stock (${categoryItems.filter(i => {
                        const m = calculateStockMetrics(i);
                        return m.status === 'LOW_STOCK';
                      }).length})` 
                    },
                    { 
                      id: 'OUT_OF_STOCK', 
                      label: `Out of Stock (${categoryItems.filter(i => {
                        const m = calculateStockMetrics(i);
                        return m.status === 'OUT_OF_STOCK';
                      }).length})` 
                    },
                    { id: 'SELECTED', label: `Selected (${selectedItemIds.length})` }
                  ].map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setItemsFilterStatus(chip.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        itemsFilterStatus === chip.id
                          ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Right: Checkbox Selection Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-amber-600" />
                    <span>Select All Visible ({displayedCategoryItems.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSelectLowStockVisible}
                    className="px-2.5 py-1 text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Select Low Stock</span>
                  </button>

                  {selectedItemIds.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Clear Selection
                      </button>

                      <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                      <button
                        type="button"
                        onClick={() => handleOpenBulkModal('PRICE')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Update Prices ({selectedItemIds.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenBulkModal('STOCK')}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Boxes className="w-3.5 h-3.5" />
                        <span>Update Stock ({selectedItemIds.length})</span>
                      </button>
                    </>
                  )}
                </div>

              </div>

              {/* Items Display: Cards Grid or Compact Table */}
              {displayedCategoryItems.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
                    <Boxes className="w-6 h-6" />
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {categoryItems.length === 0 
                      ? `No Items Found in ${selectedCategoryName}` 
                      : 'No Items Match Current Filter or Search'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                    {categoryItems.length === 0 
                      ? 'Register countable items such as Vanilla Ice Cream, Coke, Pepsi, or 1L Water Bottle.' 
                      : 'Try resetting the status filter or clearing your search keywords.'}
                  </p>
                  {categoryItems.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNewItemCategory(selectedCategoryName);
                        setNewItemModalOpen(true);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-4 h-4 text-amber-400" />
                      <span>Add First {selectedCategoryName} Item</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setItemsFilterStatus('ALL');
                        setSearchQuery('');
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              ) : itemsViewMode === 'GRID' ? (
                /* 1. CARDS GRID VIEW */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {displayedCategoryItems.map((item) => {
                    const metrics = calculateStockMetrics(item);
                    const isInit = item.isInitialized;
                    const isSelected = isItemSelected(item.id);
                    const menuItem = menuItems.find(
                      (m) => m.id === item.id || (m.itemCode && item.itemCode && m.itemCode.trim().toUpperCase() === item.itemCode.trim().toUpperCase())
                    );
                    const nonAcPrice = menuItem ? menuItem.nonAcPrice : 0;
                    const acPrice = menuItem ? menuItem.acPrice : nonAcPrice;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className={`bg-white border rounded-2xl p-4 flex flex-col justify-between gap-3 transition-all cursor-pointer relative group ${
                          isSelected
                            ? 'ring-2 ring-amber-500 bg-amber-50/40 border-amber-500 shadow-sm'
                            : !isInit 
                            ? 'border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/20' 
                            : 'border-slate-200 hover:border-amber-400 hover:shadow-md'
                        }`}
                      >
                        {/* Card Top: Checkbox, Code & Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {/* Checkbox */}
                            <div
                              onClick={(e) => toggleSelectItem(item.id, e)}
                              className="mt-0.5 p-1 -m-1 rounded-lg hover:bg-slate-200/60 cursor-pointer shrink-0"
                              title={isSelected ? 'Deselect item' : 'Select item for bulk update'}
                            >
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 font-black shadow-2xs'
                                  : 'border-2 border-slate-300 hover:border-amber-400 bg-white'
                              }`}>
                                {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>

                            <div className="min-w-0">
                              <span className="font-mono text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                #{item.itemCode || 'ITEM'}
                              </span>
                              <h3 className="font-black text-sm text-slate-900 mt-1 truncate">
                                {item.itemName}
                              </h3>
                            </div>
                          </div>

                          {/* Status Badge */}
                          {isInit ? (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                              metrics.status === 'OUT_OF_STOCK'
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : metrics.status === 'LOW_STOCK'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {metrics.status === 'OUT_OF_STOCK' ? 'Out of Stock' : metrics.status === 'LOW_STOCK' ? 'Low Stock' : 'Optimal'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                              Setup Needed
                            </span>
                          )}
                        </div>

                        {/* Price Badge Banner */}
                        <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold text-slate-700 bg-slate-100/90 px-2.5 py-1 rounded-xl border border-slate-200/70">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600 -mr-0.5" />
                          <span>Non-AC: ₹{nonAcPrice}</span>
                          <span className="text-slate-300 mx-0.5">•</span>
                          <span>AC: ₹{acPrice}</span>
                        </div>

                        {/* Card Metric Display */}
                        {isInit ? (
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 space-y-2">
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-tight">Remaining</span>
                              <span className={`font-mono font-black text-lg ${
                                metrics.remainingCount <= (item.minimumStock || 5) ? 'text-red-600' : 'text-emerald-700'
                              }`}>
                                {metrics.remainingCount} <span className="text-xs font-semibold text-slate-500">{item.unit || 'units'}</span>
                              </span>
                            </div>

                            <div className="grid grid-cols-4 gap-1 text-[10px] font-bold text-center border-t border-slate-200/60 pt-2">
                              <div className="bg-white rounded p-1 border border-slate-100">
                                <div className="text-slate-400">INIT</div>
                                <div className="font-mono text-slate-800">{metrics.initialStock}</div>
                              </div>
                              <div className="bg-white rounded p-1 border border-slate-100">
                                <div className="text-emerald-600">PUR</div>
                                <div className="font-mono text-emerald-700">+{metrics.purchasedCount}</div>
                              </div>
                              <div className="bg-white rounded p-1 border border-slate-100">
                                <div className="text-blue-600">SOLD</div>
                                <div className="font-mono text-blue-700">-{metrics.soldCount}</div>
                              </div>
                              <div className="bg-white rounded p-1 border border-slate-100">
                                <div className="text-red-500">MISS</div>
                                <div className="font-mono text-red-600">-{metrics.missingCount}</div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                            <p className="text-xs font-bold text-amber-900">Initial Stock Not Set</p>
                            <p className="text-[11px] text-amber-700 mt-0.5">Click to enter physical start count</p>
                          </div>
                        )}

                        {/* Card Bottom Tally Status */}
                        <div className="flex items-center justify-between text-xs pt-1">
                          {isInit ? (
                            <span className="inline-flex items-center gap-1 font-bold text-[11px] text-emerald-700">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>STOCK TALLY: CORRECT &check;</span>
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-800">
                              &rarr; Click to initialize
                            </span>
                          )}
                          <span className="text-slate-400 group-hover:text-amber-600 transition-colors font-bold text-[11px]">
                            Open &rarr;
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 2. COMPACT TABLE VIEW */
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-3 w-10 text-center">
                            <div 
                              onClick={handleSelectAllVisible}
                              className="w-4 h-4 rounded border-2 border-slate-300 hover:border-amber-500 bg-white mx-auto cursor-pointer flex items-center justify-center"
                              title="Select All Visible"
                            >
                              {selectedItemIds.length > 0 && <Check className="w-3 h-3 text-amber-600 stroke-[3]" />}
                            </div>
                          </th>
                          <th className="py-3 px-3">Item Details</th>
                          <th className="py-3 px-3 text-center">Non-AC Price</th>
                          <th className="py-3 px-3 text-center">AC Price</th>
                          <th className="py-3 px-3 text-center">Remaining Stock</th>
                          <th className="py-3 px-3 text-center">Min Stock</th>
                          <th className="py-3 px-3 text-center">Status</th>
                          <th className="py-3 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {displayedCategoryItems.map((item) => {
                          const metrics = calculateStockMetrics(item);
                          const isInit = item.isInitialized;
                          const isSelected = isItemSelected(item.id);
                          const menuItem = menuItems.find(
                            (m) => m.id === item.id || (m.itemCode && item.itemCode && m.itemCode.trim().toUpperCase() === item.itemCode.trim().toUpperCase())
                          );
                          const nonAcPrice = menuItem ? menuItem.nonAcPrice : 0;
                          const acPrice = menuItem ? menuItem.acPrice : nonAcPrice;

                          return (
                            <tr
                              key={item.id}
                              onClick={() => toggleSelectItem(item.id)}
                              className={`transition-colors cursor-pointer ${
                                isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => toggleSelectItem(item.id, e)}>
                                <div className={`w-4 h-4 rounded mx-auto flex items-center justify-center transition-all ${
                                  isSelected ? 'bg-amber-500 text-slate-950 font-black' : 'border-2 border-slate-300 bg-white'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded">
                                    #{item.itemCode || 'ITEM'}
                                  </span>
                                  <div>
                                    <span className="font-bold text-slate-900">{item.itemName}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                                ₹{nonAcPrice}
                              </td>

                              <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                                ₹{acPrice}
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                {isInit ? (
                                  <span className={`font-mono font-black ${
                                    metrics.remainingCount <= (item.minimumStock || 5) ? 'text-red-600' : 'text-emerald-700'
                                  }`}>
                                    {metrics.remainingCount} <span className="text-[10px] font-normal text-slate-400">{item.unit}</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">Unset</span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                                {item.minimumStock || 10} {item.unit}
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                {isInit ? (
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    metrics.status === 'OUT_OF_STOCK'
                                      ? 'bg-red-100 text-red-800'
                                      : metrics.status === 'LOW_STOCK'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {metrics.status === 'OUT_OF_STOCK' ? 'Out' : metrics.status === 'LOW_STOCK' ? 'Low' : 'Optimal'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                    Setup
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectItem(item);
                                  }}
                                  className="px-2.5 py-1 text-slate-600 hover:text-amber-700 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  Open &rarr;
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ========================================================================= */}
          {/* LEVEL 3: SELECTED ITEM INVENTORY SCREEN                                  */}
          {/* ========================================================================= */}
          {navLevel === 'DETAIL' && activeItem && (
            <div className="flex flex-col gap-3">
              
              {/* CASE A: ITEM IS NOT INITIALIZED YET (REQUIREMENT 3 & 4) */}
              {!activeItem.isInitialized ? (
                <div className="bg-white border border-amber-300 rounded-2xl p-6 sm:p-8 max-w-xl mx-auto w-full shadow-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                      <Boxes className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <div>
                      <h2 className="font-black text-base sm:text-lg text-slate-900 uppercase">
                        Start Inventory Tracking
                      </h2>
                      <p className="text-xs font-bold text-amber-800">
                        {activeItem.itemName} (#{activeItem.itemCode})
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5 mb-5">
                    <p className="font-bold">Important Notice:</p>
                    <p>
                      The <b>Initial Stock Count</b> means the physical quantity currently available in the shop when starting inventory for this item.
                    </p>
                    <p className="font-medium text-amber-950">
                      &bull; Entered <b>only once</b> when starting inventory.<br />
                      &bull; It is <b>NOT</b> a daily purchase and must <b>NOT</b> be entered again tomorrow.<br />
                      &bull; Future sales and purchases will continue from this balance.
                    </p>
                  </div>

                  <form onSubmit={handleSaveInitialStock} className="space-y-4 text-xs">
                    <div>
                      <label className="block font-black text-slate-800 mb-1.5 text-xs uppercase tracking-wide">
                        Initial Stock Count <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        required
                        placeholder="e.g. 50"
                        value={initInitialStock}
                        onChange={(e) => setInitInitialStock(e.target.value)}
                        className="w-full bg-slate-50 border-2 border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-3.5 py-2.5 font-mono font-black text-base text-slate-900 focus:outline-none"
                      />
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Example: 50 means the shop currently has 50 {activeItem.itemName} items.
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-black text-slate-800 mb-1.5 text-xs uppercase tracking-wide">
                          Minimum Safe Stock
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          required
                          value={initMinimumStock}
                          onChange={(e) => setInitMinimumStock(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-3.5 py-2 font-mono font-bold text-slate-900 focus:outline-none"
                        />
                        <span className="text-[11px] text-slate-500 mt-0.5 block">Alerts at 8:00 AM if below this</span>
                      </div>

                      <div>
                        <label className="block font-black text-slate-800 mb-1.5 text-xs uppercase tracking-wide">
                          Unit of Measurement
                        </label>
                        <select
                          value={initUnit}
                          onChange={(e) => setInitUnit(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-3.5 py-2 font-bold text-slate-900 focus:outline-none cursor-pointer"
                        >
                          <option value="Pcs">Pieces (Pcs)</option>
                          <option value="Cups">Cups</option>
                          <option value="Bottles">Bottles</option>
                          <option value="Packets">Packets</option>
                          <option value="Units">Units</option>
                          <option value="Cones">Cones</option>
                          <option value="Cans">Cans</option>
                        </select>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => setNavLevel('ITEMS')}
                        className="px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        <span>SAVE INITIAL STOCK</span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* CASE B: ITEM IS INITIALIZED - FULL COUNT SCREEN (REQUIREMENTS 6, 9, 10) */
                <div className="flex flex-col gap-3">

                  {/* 1. Item Header & Status Banner */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
                        {renderCategoryIcon(activeItem.category || selectedCategoryName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            #{activeItem.itemCode || 'ITEM'}
                          </span>
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Category: {activeItem.category || selectedCategoryName}
                          </span>
                        </div>
                        <h2 className="font-black text-lg sm:text-xl text-slate-900 uppercase mt-0.5 tracking-tight">
                          {activeItem.itemName}
                        </h2>
                      </div>
                    </div>

                    {/* Stock Status & Tally Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Stock Health */}
                      <span className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                        activeMetrics?.status === 'OUT_OF_STOCK'
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : activeMetrics?.status === 'LOW_STOCK'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      }`}>
                        {activeMetrics?.status === 'OUT_OF_STOCK' ? 'OUT OF STOCK' : activeMetrics?.status === 'LOW_STOCK' ? 'LOW STOCK' : 'STOCK OPTIMAL'}
                      </span>

                      {/* Stock Tally Status (Requirement 9) */}
                      <div className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs ${
                        activeMetrics?.isTallyCorrect
                          ? 'bg-emerald-600 text-white'
                          : 'bg-amber-500 text-slate-950 font-black'
                      }`}>
                        {activeMetrics?.isTallyCorrect ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-white" />
                            <span>STOCK TALLY: CORRECT &check;</span>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-4 h-4 text-slate-950" />
                            <span>STOCK TALLY: CHECK REQUIRED</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. THE 6 PRIMARY COUNT METRICS (REQUIREMENT 6 & 10) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    
                    {/* 1. Initial Stock Count */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                      <div className="text-[11px] font-black text-slate-500 uppercase tracking-tight">
                        Initial Stock Count
                      </div>
                      <div className="my-2">
                        <span className="font-mono font-black text-2xl text-slate-900">
                          {activeMetrics?.initialStock}
                        </span>
                        <span className="text-xs text-slate-500 font-bold ml-1">{activeItem.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        Physical start count
                      </div>
                    </div>

                    {/* 2. Purchased Count */}
                    <div className="bg-white border border-emerald-200 bg-emerald-50/20 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                      <div className="text-[11px] font-black text-emerald-800 uppercase tracking-tight flex items-center justify-between">
                        <span>Purchased Count</span>
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="my-2">
                        <span className="font-mono font-black text-2xl text-emerald-700">
                          +{activeMetrics?.purchasedCount}
                        </span>
                        <span className="text-xs text-emerald-600 font-bold ml-1">{activeItem.unit}</span>
                      </div>
                      <div className="text-[10px] text-emerald-600 font-bold">
                        {activeItem.purchases?.length || 0} purchase entries
                      </div>
                    </div>

                    {/* 3. Total Stock */}
                    <div className="bg-white border border-slate-300 bg-slate-50/50 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                      <div className="text-[11px] font-black text-slate-700 uppercase tracking-tight">
                        Total Stock
                      </div>
                      <div className="my-2">
                        <span className="font-mono font-black text-2xl text-slate-900">
                          {activeMetrics?.totalStock}
                        </span>
                        <span className="text-xs text-slate-500 font-bold ml-1">{activeItem.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {activeMetrics?.initialStock} + {activeMetrics?.purchasedCount} = {activeMetrics?.totalStock}
                      </div>
                    </div>

                    {/* 4. Sold Count */}
                    <div className="bg-white border border-blue-200 bg-blue-50/20 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                      <div className="text-[11px] font-black text-blue-800 uppercase tracking-tight flex items-center justify-between">
                        <span>Sold Count</span>
                        <ShoppingCart className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <div className="my-2">
                        <span className="font-mono font-black text-2xl text-blue-700">
                          -{activeMetrics?.soldCount}
                        </span>
                        <span className="text-xs text-blue-600 font-bold ml-1">{activeItem.unit}</span>
                      </div>
                      <div className="text-[10px] text-blue-600 font-bold">
                        Auto-synced from bills
                      </div>
                    </div>

                    {/* 5. Missing Count */}
                    <div className="bg-white border border-red-200 bg-red-50/20 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                      <div className="text-[11px] font-black text-red-800 uppercase tracking-tight flex items-center justify-between">
                        <span>Missing Count</span>
                        <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <div className="my-2">
                        <span className="font-mono font-black text-2xl text-red-600">
                          -{activeMetrics?.missingCount}
                        </span>
                        <span className="text-xs text-red-500 font-bold ml-1">{activeItem.unit}</span>
                      </div>
                      <div className="text-[10px] text-red-500 font-bold">
                        Damage / breakage / loss
                      </div>
                    </div>

                    {/* 6. Remaining Count (Highlighted) */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-3.5 flex flex-col justify-between shadow-md">
                      <div className="text-[11px] font-black text-amber-400 uppercase tracking-tight flex items-center justify-between">
                        <span>Remaining Count</span>
                        <Boxes className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="my-2">
                        <span className="font-mono font-black text-2xl sm:text-3xl text-white">
                          {activeMetrics?.remainingCount}
                        </span>
                        <span className="text-xs text-slate-300 font-bold ml-1">{activeItem.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono">
                        Safe Min: {activeItem.minimumStock || 10}
                      </div>
                    </div>

                  </div>

                  {/* 3. TALLY VERIFICATION EQUATION BANNER (REQUIREMENT 9) */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 uppercase">Count Tally Verification:</span>
                      <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded text-slate-800">
                        Initial ({activeMetrics?.initialStock}) + Purchased ({activeMetrics?.purchasedCount}) = Sold ({activeMetrics?.soldCount}) + Missing ({activeMetrics?.missingCount}) + Remaining ({activeMetrics?.remainingCount})
                      </span>
                      <span className="font-mono font-black text-slate-900 bg-amber-100 px-2 py-1 rounded">
                        &rarr; {activeMetrics?.totalStock} = {Number(activeMetrics?.soldCount) + Number(activeMetrics?.missingCount) + Number(activeMetrics?.remainingCount)}
                      </span>
                    </div>

                    {activeMetrics?.isTallyCorrect ? (
                      <span className="font-black text-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>STOCK TALLY: CORRECT &check;</span>
                      </span>
                    ) : (
                      <span className="font-black text-red-600 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span>STOCK TALLY: CHECK REQUIRED</span>
                      </span>
                    )}
                  </div>

                  {/* 4. QUICK ACTION BUTTONS */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseDate(new Date().toISOString().split('T')[0]);
                        setPurchaseQuantity('');
                        setPurchaseUnitPrice('');
                        setPurchaseInvoice('');
                        setPurchaseSupplier('');
                        setPurchaseNotes('');
                        setPurchaseModalOpen(true);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Purchase Entry</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMissingDate(new Date().toISOString().split('T')[0]);
                        setMissingQuantity('');
                        setPhysicalFoundInput('');
                        setMissingReason('Damaged / Broken / Melted');
                        setMissingModalOpen(true);
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>+ Log Missing / Physical Count</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditMinStockValue(String(activeItem.minimumStock || 10));
                        setEditMinStockModalOpen(true);
                      }}
                      className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Tag className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit Min Stock ({activeItem.minimumStock || 10})</span>
                    </button>
                  </div>

                  {/* 5. TABBED AUDIT HISTORIES: PURCHASE HISTORY, SALES AUDIT, MISSING LOGS (REQUIREMENTS 10 & 11) */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    
                    {/* COLUMN 1: PURCHASE HISTORY */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                            <TrendingUp className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h3 className="font-black text-xs text-slate-900 uppercase">Purchase History</h3>
                            <span className="text-[11px] text-slate-500 font-bold">Total: {activeMetrics?.purchasedCount} {activeItem.unit}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPurchaseModalOpen(true)}
                          className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                        >
                          + Add
                        </button>
                      </div>

                      {/* Purchases List */}
                      <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
                        {(!activeItem.purchases || activeItem.purchases.length === 0) ? (
                          <p className="text-xs text-slate-400 py-6 text-center italic">
                            No purchases recorded yet.<br />Click "+ Purchase Entry" to add.
                          </p>
                        ) : (
                          activeItem.purchases.map((pur) => (
                            <div key={pur.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs">
                              <div className="flex items-baseline justify-between font-mono">
                                <span className="font-bold text-slate-800">{pur.date}</span>
                                <span className="font-black text-emerald-700 text-sm">+{pur.quantity} {activeItem.unit}</span>
                              </div>
                              {(pur.invoiceNumber || pur.supplier || pur.notes) && (
                                <div className="text-[11px] text-slate-500 mt-1 truncate">
                                  {pur.invoiceNumber && <span className="font-semibold text-slate-700">Inv: #{pur.invoiceNumber} </span>}
                                  {pur.supplier && <span>&bull; {pur.supplier} </span>}
                                  {pur.notes && <span>({pur.notes})</span>}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* COLUMN 2: SALES AUDIT (AUTO-SYNCED FROM BILLING) */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                            <ShoppingCart className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h3 className="font-black text-xs text-slate-900 uppercase">Sales Count History</h3>
                            <span className="text-[11px] text-slate-500 font-bold">Total Sold: {activeMetrics?.soldCount} {activeItem.unit}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Auto-Billing
                        </span>
                      </div>

                      {/* Sales List from Finalized Bills */}
                      <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
                        {activeSalesAudit.salesList.length === 0 ? (
                          <div className="text-xs text-slate-400 py-6 text-center italic">
                            <p>No finalized sales yet.</p>
                            <p className="text-[11px] mt-1 text-slate-500">
                              Sales from Direct Billing, POS, and KOT will automatically reflect here when bills are finalized.
                            </p>
                          </div>
                        ) : (
                          activeSalesAudit.salesList.slice(0, 30).map((sale, idx) => (
                            <div key={`${sale.billId}_${idx}`} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs">
                              <div className="flex items-baseline justify-between font-mono">
                                <span className="font-bold text-slate-800">
                                  {sale.date} <span className="text-slate-400 font-normal">{sale.time}</span>
                                </span>
                                <span className="font-black text-blue-700 text-sm">-{sale.quantity} {activeItem.unit}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                                <span>Bill #{sale.billNumber}</span>
                                <span className="font-semibold text-slate-700 uppercase text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                  {sale.orderType}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* COLUMN 3: MISSING COUNT HISTORY */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-red-100 text-red-800 flex items-center justify-center font-bold">
                            <TrendingDown className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <h3 className="font-black text-xs text-slate-900 uppercase">Missing Count Log</h3>
                            <span className="text-[11px] text-slate-500 font-bold">Total: {activeMetrics?.missingCount} {activeItem.unit}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMissingModalOpen(true)}
                          className="text-[11px] font-bold text-red-700 hover:underline cursor-pointer"
                        >
                          + Log
                        </button>
                      </div>

                      {/* Missing List */}
                      <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
                        {(!activeItem.missingLogs || activeItem.missingLogs.length === 0) ? (
                          <p className="text-xs text-slate-400 py-6 text-center italic">
                            No missing counts recorded.<br />All counts tally with expected balances.
                          </p>
                        ) : (
                          activeItem.missingLogs.map((log) => (
                            <div key={log.id} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-xs">
                              <div className="flex items-baseline justify-between font-mono">
                                <span className="font-bold text-slate-800">{log.date}</span>
                                <span className="font-black text-red-600 text-sm">-{log.quantity} {activeItem.unit}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                <span className="font-medium text-slate-700">{log.reason || 'Physical discrepancy'}</span>
                                {log.physicalCountFound !== undefined && (
                                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                                    Physical Found: {log.physicalCountFound} (Expected: {log.expectedCount})
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* SECONDARY TAB: AUDIT & MOVEMENT LOG */}
      {activeTab === 'movements' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-slate-900 uppercase">Live Stock Movement & Audit Log</h3>
              <p className="text-xs text-slate-500">Every opening balance, purchase, finalized sale, and missing adjustment</p>
            </div>
            <span className="text-xs font-bold text-slate-600">{movements.length} total entries</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Item Code</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Movement Type</th>
                  <th className="py-2.5 px-3 text-right">Quantity</th>
                  <th className="py-2.5 px-3">Reference / Notes</th>
                  <th className="py-2.5 px-3 text-right">Staff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => {
                    const isPositive = mov.type === 'OPENING' || mov.type === 'PURCHASE' || (mov.type === 'ADJUSTMENT' && mov.quantity > 0);
                    return (
                      <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                          {new Date(mov.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-amber-800">
                          #{mov.itemCode || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-black text-slate-900">
                          {mov.itemName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            mov.type === 'PURCHASE'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : mov.type === 'SALE'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : mov.type === 'WASTAGE'
                              ? 'bg-red-50 text-red-800 border border-red-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {mov.type}
                          </span>
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-black ${
                          isPositive ? 'text-emerald-700' : 'text-red-700'
                        }`}>
                          {isPositive ? `+${mov.quantity}` : `${mov.quantity}`}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 truncate max-w-xs">
                          {mov.reference || mov.notes || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-500 font-medium">
                          {mov.userName || 'Staff'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: PURCHASE ENTRY (REQUIREMENT 5 & 11)                               */}
      {/* ========================================================================= */}
      {purchaseModalOpen && activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 uppercase">Purchase Entry</h3>
                <p className="text-xs text-slate-500 font-bold">
                  {activeItem.itemName} (#{activeItem.itemCode})
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setPurchaseModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="p-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-black text-slate-700 mb-1 uppercase tracking-wide">
                    Purchase Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-1 uppercase tracking-wide">
                    Purchased Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 20"
                    value={purchaseQuantity}
                    onChange={(e) => setPurchaseQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-black text-base text-emerald-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit Cost (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 25"
                    value={purchaseUnitPrice}
                    onChange={(e) => setPurchaseUnitPrice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Invoice / Bill No.</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-9021"
                    value={purchaseInvoice}
                    onChange={(e) => setPurchaseInvoice(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier / Vendor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Amul Distributor, Cool Drinks Depot"
                  value={purchaseSupplier}
                  onChange={(e) => setPurchaseSupplier(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Regular restock"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600">
                Current Purchased: <b>{activeItem.purchasedCount || 0}</b> &rarr; New Purchased will be: <b>{(activeItem.purchasedCount || 0) + (parseFloat(purchaseQuantity) || 0)} {activeItem.unit}</b>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPurchaseModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>SAVE PURCHASE</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MISSING COUNT ENTRY (REQUIREMENT 8)                               */}
      {/* ========================================================================= */}
      {missingModalOpen && activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 uppercase">Log Physical Discrepancy / Missing</h3>
                <p className="text-xs text-slate-500 font-bold">
                  {activeItem.itemName} (#{activeItem.itemCode})
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setMissingModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="flex p-2 bg-slate-100 border-b border-slate-200 gap-1 text-xs">
              <button
                type="button"
                onClick={() => setMissingMode('DIRECT')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                  missingMode === 'DIRECT' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Direct Missing Quantity
              </button>
              <button
                type="button"
                onClick={() => setMissingMode('PHYSICAL_AUDIT')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                  missingMode === 'PHYSICAL_AUDIT' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Physical Audit Calculator
              </button>
            </div>

            <form onSubmit={handleSaveMissing} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-black text-slate-700 mb-1 uppercase tracking-wide">
                  Audit Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={missingDate}
                  onChange={(e) => setMissingDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:outline-none"
                />
              </div>

              {missingMode === 'DIRECT' ? (
                <div>
                  <label className="block font-black text-slate-700 mb-1 uppercase tracking-wide">
                    Missing Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 2"
                    value={missingQuantity}
                    onChange={(e) => setMissingQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 font-mono font-black text-base text-red-600 focus:outline-none focus:border-red-500"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Example: 2 broken bottles or 2 melted ice creams
                  </span>
                </div>
              ) : (
                <div className="space-y-3 bg-amber-50/60 border border-amber-200 rounded-xl p-3">
                  <div className="flex justify-between items-baseline text-slate-700">
                    <span className="font-bold">System Expected Remaining:</span>
                    <span className="font-mono font-black text-sm text-slate-900">
                      {activeMetrics?.remainingCount} {activeItem.unit}
                    </span>
                  </div>

                  <div>
                    <label className="block font-black text-amber-950 mb-1 uppercase tracking-wide">
                      Physical Count Found <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      required
                      placeholder={`e.g. ${(activeMetrics?.remainingCount || 2) - 2}`}
                      value={physicalFoundInput}
                      onChange={(e) => setPhysicalFoundInput(e.target.value)}
                      className="w-full bg-white border-2 border-amber-400 rounded-xl px-3.5 py-2 font-mono font-black text-base text-slate-900 focus:outline-none"
                    />
                  </div>

                  {physicalFoundInput && (
                    <div className="pt-2 border-t border-amber-200 flex justify-between items-baseline font-bold text-red-700">
                      <span>Calculated Missing:</span>
                      <span className="font-mono font-black text-base">
                        {Math.max(0, (activeMetrics?.remainingCount || 0) - parseFloat(physicalFoundInput || '0'))} {activeItem.unit}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Discrepancy</label>
                <select
                  value={missingReason}
                  onChange={(e) => setMissingReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value="Damaged / Broken / Melted">Damaged / Broken / Melted</option>
                  <option value="Counter discrepancy">Counter discrepancy</option>
                  <option value="Expired / Past safe date">Expired / Past safe date</option>
                  <option value="Storage temperature issue">Storage temperature issue</option>
                  <option value="Other discrepancy">Other discrepancy</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setMissingModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>RECORD MISSING COUNT</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE NEW COUNTABLE ITEM (REQUIREMENT 1 & 15)                   */}
      {/* ========================================================================= */}
      {newItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 uppercase">Add Countable Stock Item</h3>
                <p className="text-xs text-slate-500">Track ice cream, drinks, bottles, or portion products</p>
              </div>
              <button 
                type="button" 
                onClick={() => setNewItemModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewItem} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">CODE</label>
                  <input
                    type="text"
                    placeholder="e.g. 150"
                    value={newItemCode}
                    onChange={(e) => setNewItemCode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">CATEGORY</label>
                  <select
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Ice Cream">Ice Cream</option>
                    <option value="Cool Drinks">Cool Drinks</option>
                    <option value="Water">Water Bottles</option>
                    <option value="Other">Other Countable Items</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ITEM NAME <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vanilla Ice Cream, Coke, 1L Water Bottle"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">UNIT</label>
                  <select
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-900 focus:outline-none cursor-pointer"
                  >
                    <option value="Pcs">Pieces (Pcs)</option>
                    <option value="Cups">Cups</option>
                    <option value="Bottles">Bottles</option>
                    <option value="Packets">Packets</option>
                    <option value="Units">Units</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">INITIAL STOCK</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={newItemInitialStock}
                    onChange={(e) => setNewItemInitialStock(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">MIN STOCK</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={newItemMinStock}
                    onChange={(e) => setNewItemMinStock(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setNewItemModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-amber-400" />
                  <span>Register Item</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: EDIT MINIMUM STOCK                                              */}
      {/* ========================================================================= */}
      {editMinStockModalOpen && activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-black text-sm text-slate-900 uppercase">Set Minimum Stock</h3>
              <button onClick={() => setEditMinStockModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMinStock} className="p-4 space-y-3 text-xs">
              <p className="text-slate-600">
                If the remaining stock drops below this number, an automatic alert will pop up at 8:00 AM daily.
              </p>
              <div>
                <label className="block font-black text-slate-800 mb-1 uppercase">
                  Minimum Stock Threshold ({activeItem.unit})
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  required
                  value={editMinStockValue}
                  onChange={(e) => setEditMinStockValue(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-300 focus:border-amber-500 rounded-xl px-3 py-2 font-mono font-black text-slate-900"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditMinStockModalOpen(false)}
                  className="px-3 py-1.5 font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg cursor-pointer"
                >
                  Update Threshold
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLOATING BULK ACTIONS BAR (When 1 or more items selected)                 */}
      {/* ========================================================================= */}
      {selectedItemIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-2xl shadow-2xl px-4 sm:px-6 py-3 border border-amber-500/50 flex items-center justify-between gap-3 sm:gap-6 animate-in slide-in-from-bottom-5 w-[94%] max-w-2xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
              {selectedItemIds.length}
            </span>
            <div className="truncate">
              <span className="text-xs font-black tracking-tight text-white block truncate">
                {selectedItemIds.length} {selectedItemIds.length === 1 ? 'Item' : 'Items'} Selected
              </span>
              <span className="text-[10px] text-slate-400 hidden sm:block">
                Ready for bulk pricing or stock revision
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenBulkModal('PRICE')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Update Prices</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenBulkModal('STOCK')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Update Stock</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenBulkModal('TEMPLATE')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
              title="Upload an Excel template to adjust stock"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Upload Template</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenBulkModal('MATRIX')}
              className="hidden md:flex px-3 py-1.5 sm:px-3.5 sm:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-xs rounded-xl shadow-xs items-center gap-1.5 cursor-pointer transition-all"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Matrix</span>
            </button>

            <button
              type="button"
              onClick={handleDeselectAll}
              className="p-1.5 sm:px-2.5 sm:py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              title="Deselect All"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BULK UPDATE MODAL (PRICE, STOCK, MATRIX, TEMPLATE)                        */}
      {/* ========================================================================= */}
      <BulkUpdateModal
        isOpen={bulkModalOpen}
        selectedItems={selectedBulkRows}
        allItems={allBulkRows}
        initialTab={bulkModalTab}
        onClose={() => setBulkModalOpen(false)}
        onApplySuccess={(message) => {
          setNotification({ type: 'success', message });
          setSelectedItemIds([]);
          setTimeout(() => setNotification(null), 4000);
        }}
        currentUserName={currentUser?.name || 'Manager'}
      />

    </div>
  );
};
