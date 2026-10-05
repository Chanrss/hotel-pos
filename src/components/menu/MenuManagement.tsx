import React, { useState, useEffect, useMemo } from 'react';
import { 
  Utensils, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  FolderPlus, 
  Layers, 
  Save, 
  X,
  RotateCcw,
  IndianRupee,
  LayoutGrid,
  List,
  Check,
  BookOpen,
  Clock
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Category, MenuItem } from '../../types';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../../services/firebase';
import { getTamilItemName, suggestTamilName } from '../../services/tamilTranslation';
import { DEFAULT_FALLBACK_MENU_ITEMS, DEFAULT_CATEGORIES } from '../../data/fallbackMenu';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import {
  getItemCategoryIds,
  getItemCategoryNames,
  itemBelongsToCategory,
  deduplicateMenuItems
} from '../../utils/menuItemHelpers';

export const MenuManagement: React.FC = () => {
  const { isOwner, isManager } = useAuth();

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
        if (parsed.length > 0) return deduplicateMenuItems(parsed);
      }
    } catch (e) {}
    return DEFAULT_FALLBACK_MENU_ITEMS;
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [clearingAll, setClearingAll] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  // Quick Price Edit inline state
  const [quickPriceEditingId, setQuickPriceEditingId] = useState<string | null>(null);
  const [inlinePriceForm, setInlinePriceForm] = useState({ nonAcPrice: '', acPrice: '' });

  // Menu Item Modal State with multi-category categoryIds: string[]
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState<{
    itemCode: string;
    itemName: string;
    itemNameTamil: string;
    categoryIds: string[];
    nonAcPrice: string;
    acPrice: string;
    imageUrl: string;
    active: boolean;
  }>({
    itemCode: '',
    itemName: '',
    itemNameTamil: '',
    categoryIds: [],
    nonAcPrice: '',
    acPrice: '',
    imageUrl: '',
    active: true
  });

  // Category Modal State
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    categoryName: '',
    categoryCode: '',
    displayOrder: '1',
    startTime: '',
    endTime: '',
    active: true
  });

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Deletion Confirmation Modal State
  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    itemSubtitle?: string;
    description?: string;
    warningNote?: string;
    confirmButtonText?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    onConfirm: () => {}
  });
  const [isExecutingDelete, setIsExecutingDelete] = useState(false);

  // Firestore listeners for Real-time sync
  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, 'categories'), (snap) => {
      const list: Category[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
      if (list.length > 0) {
        const sorted = list.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
        setCategories(sorted);
        localStorage.setItem('pos_local_categories', JSON.stringify(sorted));
      }
    }, (err) => {
      console.warn('Menu categories Firestore listener notice:', err?.message || err);
    });

    const unsubItems = onSnapshot(collection(db, 'menu_items'), (snap) => {
      const list: MenuItem[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as MenuItem));
      if (list.length > 0) {
        const unique = deduplicateMenuItems(list);
        setMenuItems(unique);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(unique));
      }
    }, (err) => {
      console.warn('Menu items Firestore listener notice:', err?.message || err);
    });

    return () => {
      unsubCats();
      unsubItems();
    };
  }, []);

  // Quick Inline Price Editing
  const startQuickPriceEdit = (item: MenuItem) => {
    setQuickPriceEditingId(item.id);
    setInlinePriceForm({
      nonAcPrice: item.nonAcPrice.toString(),
      acPrice: item.acPrice.toString()
    });
  };

  const cancelQuickPriceEdit = () => {
    setQuickPriceEditingId(null);
  };

  const saveQuickPriceEdit = async (item: MenuItem) => {
    const nonAc = parseFloat(inlinePriceForm.nonAcPrice);
    const ac = parseFloat(inlinePriceForm.acPrice);

    if (isNaN(nonAc) || isNaN(ac) || nonAc < 0 || ac < 0) {
      setNotification({ type: 'error', message: 'Please enter valid non-negative prices.' });
      return;
    }

    try {
      await updateDoc(doc(db, 'menu_items', item.id), {
        nonAcPrice: nonAc,
        acPrice: ac,
        updatedAt: Date.now()
      });
      setMenuItems((prev) => {
        const updated = prev.map((m) => m.id === item.id ? { ...m, nonAcPrice: nonAc, acPrice: ac, updatedAt: Date.now() } : m);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(updated));
        return updated;
      });
      setQuickPriceEditingId(null);
      setNotification({ 
        type: 'success', 
        message: `Updated price for "${item.itemName}": Non-AC ₹${nonAc}, AC ₹${ac}` 
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to update price.' });
    }
  };

  // Item Handlers
  const openNewItemModal = () => {
    setEditingItem(null);
    const codes = menuItems.map(i => parseInt(i.itemCode, 10)).filter(n => !isNaN(n));
    const nextCode = codes.length > 0 ? (Math.max(...codes) + 1).toString() : '1';
    const initialCatId = selectedCategory !== 'all' ? selectedCategory : (categories[0]?.id || '');

    setItemForm({
      itemCode: nextCode,
      itemName: '',
      itemNameTamil: '',
      categoryIds: initialCatId ? [initialCatId] : [],
      nonAcPrice: '',
      acPrice: '',
      imageUrl: '',
      active: true
    });
    setItemModalOpen(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    const existingCatIds = getItemCategoryIds(item);
    setItemForm({
      itemCode: item.itemCode,
      itemName: item.itemName || item.itemNameEnglish || '',
      itemNameTamil: item.itemNameTamil || '',
      categoryIds: existingCatIds.length > 0 ? existingCatIds : (categories[0]?.id ? [categories[0].id] : []),
      nonAcPrice: item.nonAcPrice.toString(),
      acPrice: item.acPrice.toString(),
      imageUrl: item.imageUrl || '',
      active: item.active !== false
    });
    setItemModalOpen(true);
  };

  const toggleCategorySelection = (catId: string) => {
    setItemForm((prev) => {
      const exists = prev.categoryIds.includes(catId);
      const next = exists
        ? prev.categoryIds.filter((id) => id !== catId)
        : [...prev.categoryIds, catId];
      return {
        ...prev,
        categoryIds: next
      };
    });
  };

  const handleItemNameChange = (val: string) => {
    setItemForm((prev) => {
      const suggested = suggestTamilName(val);
      return {
        ...prev,
        itemName: val,
        itemNameTamil: prev.itemNameTamil && prev.itemNameTamil !== '' ? prev.itemNameTamil : suggested
      };
    });
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.itemCode.trim() || !itemForm.itemName.trim() || !itemForm.nonAcPrice || !itemForm.acPrice) {
      setNotification({ type: 'error', message: 'Please fill in all required fields (Name, Code, Prices).' });
      return;
    }

    if (itemForm.categoryIds.length === 0 && categories.length > 0) {
      setNotification({ type: 'error', message: 'Please select at least one Food Availability Category.' });
      return;
    }

    const nonAc = parseFloat(itemForm.nonAcPrice);
    const ac = parseFloat(itemForm.acPrice);
    if (isNaN(nonAc) || isNaN(ac) || nonAc < 0 || ac < 0) {
      setNotification({ type: 'error', message: 'Please enter valid non-negative prices.' });
      return;
    }

    // Check unique code (never create duplicate records for the same itemCode)
    const existingCode = menuItems.find(
      (m) => m.itemCode.toUpperCase() === itemForm.itemCode.trim().toUpperCase() && m.id !== editingItem?.id
    );
    if (existingCode) {
      setNotification({ type: 'error', message: `Item code "${itemForm.itemCode}" is already used by "${existingCode.itemName}".` });
      return;
    }

    setSaving(true);
    try {
      const assignedIds: string[] = Array.from(new Set<string>(itemForm.categoryIds.length > 0 ? itemForm.categoryIds : [categories[0]?.id || 'general']));
      const assignedNames: string[] = assignedIds
        .map((cid) => categories.find((c) => c.id === cid)?.categoryName)
        .filter((n): n is string => Boolean(n));

      const itemId = editingItem ? editingItem.id : `item_${itemForm.itemCode.trim().toLowerCase()}_${Date.now()}`;
      const now = Date.now();
      const englishName = itemForm.itemName.trim();

      const itemData: MenuItem = {
        id: itemId,
        itemCode: itemForm.itemCode.trim().toUpperCase(),
        itemName: englishName,
        itemNameEnglish: englishName,
        itemNameTamil: itemForm.itemNameTamil.trim() || getTamilItemName(englishName),
        categoryIds: assignedIds,
        categoryNames: assignedNames,
        categoryId: assignedIds[0] || 'general',
        categoryName: assignedNames.join(', ') || 'General',
        nonAcPrice: nonAc,
        acPrice: ac,
        active: itemForm.active,
        createdAt: editingItem?.createdAt || now,
        updatedAt: now
      };

      if (itemForm.imageUrl && itemForm.imageUrl.trim()) {
        itemData.imageUrl = itemForm.imageUrl.trim();
      }

      await setDoc(doc(db, 'menu_items', itemId), sanitizeForFirestore(itemData));
      
      setMenuItems((prev) => {
        const updated = deduplicateMenuItems([...prev.filter((m) => m.id !== itemId), itemData]);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(updated));
        return updated;
      });

      setItemModalOpen(false);
      setNotification({
        type: 'success',
        message: `Dish "${itemData.itemName}" saved under ${assignedNames.join(', ') || 'selected categories'}.`
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to save dish.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = (item: MenuItem) => {
    setDeleteModalConfig({
      isOpen: true,
      title: 'Delete Menu Item',
      itemName: item.itemName,
      itemSubtitle: `Code: #${item.itemCode} • Non-AC ₹${item.nonAcPrice} / AC ₹${item.acPrice || item.nonAcPrice}`,
      description: `Are you sure you want to permanently remove "${item.itemName}" from your restaurant catalog?`,
      warningNote: 'This item will be removed immediately from POS and Direct Billing dish listings.',
      confirmButtonText: 'Delete Dish',
      onConfirm: async () => {
        setIsExecutingDelete(true);
        try {
          await deleteDoc(doc(db, 'menu_items', item.id));
          setMenuItems((prev) => {
            const updated = prev.filter((m) => m.id !== item.id);
            localStorage.setItem('pos_local_menu_items', JSON.stringify(updated));
            return updated;
          });
          setNotification({ type: 'success', message: `Dish "${item.itemName}" deleted.` });
          setTimeout(() => setNotification(null), 3000);
          setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          setNotification({ type: 'error', message: 'Failed to delete dish.' });
        } finally {
          setIsExecutingDelete(false);
        }
      }
    });
  };

  const handleToggleItemStatus = async (item: MenuItem) => {
    try {
      await updateDoc(doc(db, 'menu_items', item.id), {
        active: !item.active,
        updatedAt: Date.now()
      });
      setMenuItems((prev) => {
        const updated = prev.map((m) => m.id === item.id ? { ...m, active: !item.active, updatedAt: Date.now() } : m);
        localStorage.setItem('pos_local_menu_items', JSON.stringify(updated));
        return updated;
      });
      setNotification({
        type: 'success',
        message: `Dish "${item.itemName}" is now ${!item.active ? 'Active' : 'Disabled'}.`
      });
      setTimeout(() => setNotification(null), 2500);
    } catch (err) {
      setNotification({ type: 'error', message: 'Failed to update dish status.' });
    }
  };

  // Category Handlers
  const openNewCategoryModal = () => {
    setEditingCategory(null);
    setCategoryForm({
      categoryName: '',
      categoryCode: '',
      displayOrder: (categories.length + 1).toString(),
      startTime: '06:00 AM',
      endTime: '11:00 PM',
      active: true
    });
    setCategoryModalOpen(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({
      categoryName: cat.categoryName || '',
      categoryCode: cat.categoryCode || '',
      displayOrder: (cat.displayOrder !== undefined ? cat.displayOrder : 1).toString(),
      startTime: cat.startTime || '',
      endTime: cat.endTime || '',
      active: cat.active !== false
    });
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.categoryName.trim()) {
      setNotification({ type: 'error', message: 'Category name is required.' });
      return;
    }

    setSaving(true);
    try {
      const catId = editingCategory ? editingCategory.id : `cat_${Date.now()}`;
      const now = Date.now();

      const catData: Category = {
        id: catId,
        categoryCode: categoryForm.categoryCode.trim().toUpperCase() || categoryForm.categoryName.trim().toUpperCase().slice(0, 4),
        categoryName: categoryForm.categoryName.trim(),
        displayOrder: parseInt(categoryForm.displayOrder, 10) || 1,
        startTime: categoryForm.startTime.trim() || undefined,
        endTime: categoryForm.endTime.trim() || undefined,
        active: categoryForm.active,
        createdAt: editingCategory?.createdAt || now,
        updatedAt: now
      };

      await setDoc(doc(db, 'categories', catId), sanitizeForFirestore(catData));
      
      setCategories((prev) => {
        const updated = [...prev.filter((c) => c.id !== catId), catData].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
        localStorage.setItem('pos_local_categories', JSON.stringify(updated));
        return updated;
      });

      setCategoryModalOpen(false);
      setNotification({
        type: 'success',
        message: `Category "${catData.categoryName}" saved.`
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Failed to save category.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    const assignedItems = menuItems.filter((m) => itemBelongsToCategory(m, cat.id, categories));
    const hasAssigned = assignedItems.length > 0;

    setDeleteModalConfig({
      isOpen: true,
      title: 'Delete Category',
      itemName: cat.categoryName || 'Category',
      itemSubtitle: `Code: ${cat.categoryCode || 'N/A'} • ${assignedItems.length} dishes assigned`,
      description: hasAssigned 
        ? `Category "${cat.categoryName}" currently has ${assignedItems.length} dish${assignedItems.length > 1 ? 'es' : ''} assigned to it. Deleting this category will keep those dishes in your catalog.`
        : `Are you sure you want to permanently delete category "${cat.categoryName}"?`,
      warningNote: hasAssigned
        ? 'Assigned dishes will remain preserved in your menu.'
        : 'This action cannot be undone.',
      confirmButtonText: 'Delete Category',
      onConfirm: async () => {
        setIsExecutingDelete(true);
        try {
          await deleteDoc(doc(db, 'categories', cat.id));
          setCategories((prev) => {
            const updated = prev.filter((c) => c.id !== cat.id);
            localStorage.setItem('pos_local_categories', JSON.stringify(updated));
            return updated;
          });
          setNotification({ type: 'success', message: `Category "${cat.categoryName}" deleted.` });
          setTimeout(() => setNotification(null), 3000);
          setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (e) {
          setNotification({ type: 'error', message: 'Failed to delete category.' });
        } finally {
          setIsExecutingDelete(false);
        }
      }
    });
  };

  const handleClearAllMenuData = () => {
    setDeleteModalConfig({
      isOpen: true,
      title: 'Wipe All Dishes & Categories',
      itemName: `All Menu Items (${menuItems.length}) & Categories (${categories.length})`,
      itemSubtitle: 'Complete Catalog Reset',
      description: 'This will wipe all dishes and categories from both the cloud database and local storage so you can enter your restaurant menu manually from scratch.',
      warningNote: 'CRITICAL: This action is permanent and cannot be undone.',
      confirmButtonText: 'Wipe Entire Menu',
      onConfirm: async () => {
        setIsExecutingDelete(true);
        setClearingAll(true);
        try {
          const itemSnaps = await getDocs(collection(db, 'menu_items'));
          const batch1 = writeBatch(db);
          itemSnaps.forEach((d) => batch1.delete(d.ref));
          await batch1.commit();

          const catSnaps = await getDocs(collection(db, 'categories'));
          const batch2 = writeBatch(db);
          catSnaps.forEach((d) => batch2.delete(d.ref));
          await batch2.commit();

          localStorage.setItem('pos_local_menu_items', JSON.stringify([]));
          localStorage.setItem('pos_local_categories', JSON.stringify([]));

          setMenuItems([]);
          setCategories([]);
          setSelectedCategory('all');

          setNotification({ 
            type: 'success', 
            message: 'All dishes and categories cleared.' 
          });
          setTimeout(() => setNotification(null), 4000);
          setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          setNotification({ type: 'error', message: err.message || 'Error clearing menu.' });
        } finally {
          setClearingAll(false);
          setIsExecutingDelete(false);
        }
      }
    });
  };

  const handleLoadSampleMenu = async () => {
    setLoadingDefaults(true);
    try {
      for (const cat of DEFAULT_CATEGORIES) {
        await setDoc(doc(db, 'categories', cat.id), sanitizeForFirestore(cat));
      }
      for (const item of DEFAULT_FALLBACK_MENU_ITEMS) {
        await setDoc(doc(db, 'menu_items', item.id), sanitizeForFirestore(item));
      }
      setCategories(DEFAULT_CATEGORIES);
      setMenuItems(DEFAULT_FALLBACK_MENU_ITEMS);
      localStorage.setItem('pos_local_categories', JSON.stringify(DEFAULT_CATEGORIES));
      localStorage.setItem('pos_local_menu_items', JSON.stringify(DEFAULT_FALLBACK_MENU_ITEMS));

      setNotification({ 
        type: 'success', 
        message: `Loaded ${DEFAULT_FALLBACK_MENU_ITEMS.length} dishes and ${DEFAULT_CATEGORIES.length} categories.` 
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'Failed to load sample menu.' });
    } finally {
      setLoadingDefaults(false);
    }
  };

  // Filtered menu items supporting multi-category assignment and deduplication in ALL
  const filteredItems = useMemo(() => {
    const unique = deduplicateMenuItems(menuItems);
    return unique.filter((item) => {
      const matchesCat =
        selectedCategory === 'all' || itemBelongsToCategory(item, selectedCategory, categories);
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q || 
        item.itemCode.toLowerCase().includes(q) || 
        item.itemName.toLowerCase().includes(q) ||
        (item.itemNameTamil && item.itemNameTamil.includes(q));
      return matchesCat && matchesSearch;
    }).sort((a, b) => {
      const ca = parseInt(a.itemCode, 10);
      const cb = parseInt(b.itemCode, 10);
      if (!isNaN(ca) && !isNaN(cb)) return ca - cb;
      return (a.itemCode || '').localeCompare(b.itemCode || '');
    });
  }, [menuItems, selectedCategory, categories, searchQuery]);

  return (
    <div className="flex flex-col h-full bg-slate-100 text-slate-800 p-2.5 sm:p-3 gap-2.5 overflow-y-auto font-sans">
      
      {/* 1. Compact Header Bar */}
      <div className="flex flex-wrap items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded bg-amber-500 flex items-center justify-center text-slate-950 shrink-0">
            <Utensils className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-xs sm:text-sm tracking-tight text-slate-900 uppercase">
                Menu & Multi-Category Management
              </h2>
              <span className="hidden sm:inline-block text-[10px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded">
                Multi-Category Assignment
              </span>
            </div>
            <p className="text-2xs text-slate-500">
              Assign dishes to multiple availability categories (e.g. Tiffen &amp; Dinner) without duplicates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {(menuItems.length > 0 || categories.length > 0) && (
            <button
              type="button"
              onClick={handleClearAllMenuData}
              disabled={clearingAll}
              className="h-7 px-2.5 text-2xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >
              <RotateCcw className={`w-3 h-3 ${clearingAll ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{clearingAll ? 'Clearing...' : 'Clear All'}</span>
            </button>
          )}

          {menuItems.length === 0 && (
            <button
              type="button"
              onClick={handleLoadSampleMenu}
              disabled={loadingDefaults}
              className="h-7 px-2.5 text-2xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
            >
              <BookOpen className="w-3 h-3 text-amber-700" />
              <span>{loadingDefaults ? 'Loading...' : 'Load Default Menu'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={openNewCategoryModal}
            className="h-7 px-2.5 bg-slate-800 hover:bg-slate-900 text-white text-2xs font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>Add Category</span>
          </button>

          <button
            type="button"
            onClick={openNewItemModal}
            className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-2xs font-bold rounded flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Dish</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shrink-0 ${
          notification.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 2. Sub-tab Switcher & Search Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`h-7 px-3 rounded-xs text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'items'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>Dishes ({menuItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`h-7 px-3 rounded-xs text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Categories ({categories.length})</span>
          </button>
        </div>

        {activeTab === 'items' && (
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search dish by English name, Tamil name, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-7 bg-slate-50 border border-slate-300 rounded pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`h-6 px-2 rounded-xs text-2xs font-bold flex items-center gap-1 cursor-pointer ${
                  viewMode === 'cards' ? 'bg-slate-900 text-amber-400' : 'text-slate-600'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-6 px-2 rounded-xs text-2xs font-bold flex items-center gap-1 cursor-pointer ${
                  viewMode === 'table' ? 'bg-slate-900 text-amber-400' : 'text-slate-600'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. DISHES TAB */}
      {activeTab === 'items' && (
        <div className="flex flex-col gap-2.5">
          
          {/* Horizontal Category Filter Bar */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`h-7 px-3 rounded text-xs font-bold uppercase whitespace-nowrap cursor-pointer border transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-amber-400 border-slate-900 font-black'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                ALL ({deduplicateMenuItems(menuItems).length})
              </button>

              {categories.map((c) => {
                const count = menuItems.filter((m) => itemBelongsToCategory(m, c.id, categories)).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCategory(c.id)}
                    className={`h-7 px-3 rounded text-xs font-bold uppercase whitespace-nowrap cursor-pointer border transition-colors ${
                      selectedCategory === c.id
                        ? 'bg-amber-500 text-slate-950 border-amber-600 font-black'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {c.categoryName} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {menuItems.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center flex flex-col items-center justify-center">
              <Utensils className="w-8 h-8 text-amber-500 mb-2" />
              <h3 className="font-extrabold text-sm text-slate-900">Your Menu is Empty</h3>
              <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
                Add categories and dishes manually, or load the default restaurant menu template.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openNewCategoryModal}
                  className="h-8 px-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Add Category</span>
                </button>
                <button
                  type="button"
                  onClick={openNewItemModal}
                  className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Dish</span>
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-slate-500 text-xs">
              No dishes match selected category or search query "{searchQuery}".
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
              {filteredItems.map((item) => {
                const isQuickEditing = quickPriceEditingId === item.id;
                const catNames = getItemCategoryNames(item, categories);

                return (
                  <div
                    key={item.id}
                    className={`bg-white border rounded-lg p-2.5 flex flex-col justify-between transition-colors ${
                      item.active === false ? 'opacity-60 bg-slate-50 border-slate-200' : 'border-slate-200 hover:border-amber-400'
                    }`}
                  >
                    <div>
                      {/* Top: Item Code & Multi-Category Badges */}
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-mono font-black text-2xs text-amber-400 bg-slate-900 px-1.5 py-0.2 rounded shrink-0">
                          #{item.itemCode}
                        </span>
                        <div className="flex flex-wrap justify-end gap-1">
                          {catNames.map((cName) => (
                            <span
                              key={cName}
                              className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded truncate max-w-[110px]"
                            >
                              {cName}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Dish Names (English & Tamil visible in Menu Management) */}
                      <h4 className="font-extrabold text-xs text-slate-900 leading-snug">
                        {item.itemName}
                      </h4>
                      {item.itemNameTamil && (
                        <div className="text-2xs text-slate-500 font-semibold mt-0.5">
                          {item.itemNameTamil}
                        </div>
                      )}

                      {/* Prices */}
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        {isQuickEditing ? (
                          <div className="bg-amber-50/70 border border-amber-300 p-2 rounded space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">Non-AC (₹)</label>
                                <input
                                  type="number"
                                  autoFocus
                                  value={inlinePriceForm.nonAcPrice}
                                  onChange={(e) => setInlinePriceForm({ ...inlinePriceForm, nonAcPrice: e.target.value })}
                                  className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 block">AC (₹)</label>
                                <input
                                  type="number"
                                  value={inlinePriceForm.acPrice}
                                  onChange={(e) => setInlinePriceForm({ ...inlinePriceForm, acPrice: e.target.value })}
                                  className="w-full bg-white border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={cancelQuickPriceEdit}
                                className="px-2 py-0.5 text-[10px] bg-slate-200 text-slate-700 rounded font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveQuickPriceEdit(item)}
                                className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-bold flex items-center gap-0.5 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between font-mono text-2xs">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-800">
                                Non-AC: ₹{item.nonAcPrice}
                              </span>
                              <span className="bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold text-amber-900">
                                AC: ₹{item.acPrice}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => startQuickPriceEdit(item)}
                              className="px-1.5 py-0.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 rounded text-[10px] font-sans font-bold cursor-pointer"
                              title="Quick Edit Price"
                            >
                              ₹ Price
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-2xs">
                      <button
                        type="button"
                        onClick={() => handleToggleItemStatus(item)}
                        className={`font-bold px-1.5 py-0.2 rounded cursor-pointer ${
                          item.active !== false
                            ? 'text-emerald-700 bg-emerald-50'
                            : 'text-slate-500 bg-slate-100'
                        }`}
                      >
                        {item.active !== false ? '● Active' : '○ Disabled'}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditItemModal(item)}
                          className="px-2 py-0.5 text-slate-700 hover:bg-slate-100 rounded font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                          title="Delete dish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-900 text-slate-200 font-bold text-2xs uppercase tracking-wider">
                    <tr>
                      <th className="py-2 px-3">Code</th>
                      <th className="py-2 px-3">English Name</th>
                      <th className="py-2 px-3">Tamil Name</th>
                      <th className="py-2 px-3">Availability Categories</th>
                      <th className="py-2 px-3">Non-AC</th>
                      <th className="py-2 px-3">AC</th>
                      <th className="py-2 px-3 text-center">Status</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item) => {
                      const isQuickEditing = quickPriceEditingId === item.id;
                      const catNames = getItemCategoryNames(item, categories);

                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            #{item.itemCode}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">
                            {item.itemName}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {item.itemNameTamil || '-'}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {catNames.map((cn) => (
                                <span
                                  key={cn}
                                  className="text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.2 rounded"
                                >
                                  {cn}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono font-bold">
                            {isQuickEditing ? (
                              <input
                                type="number"
                                value={inlinePriceForm.nonAcPrice}
                                onChange={(e) => setInlinePriceForm({ ...inlinePriceForm, nonAcPrice: e.target.value })}
                                className="w-16 bg-white border border-slate-300 rounded px-1 py-0.5 text-xs"
                              />
                            ) : (
                              <span>₹{item.nonAcPrice}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-amber-900">
                            {isQuickEditing ? (
                              <input
                                type="number"
                                value={inlinePriceForm.acPrice}
                                onChange={(e) => setInlinePriceForm({ ...inlinePriceForm, acPrice: e.target.value })}
                                className="w-16 bg-white border border-slate-300 rounded px-1 py-0.5 text-xs"
                              />
                            ) : (
                              <span>₹{item.acPrice}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(item)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer ${
                                item.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {item.active !== false ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {isQuickEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => saveQuickPriceEdit(item)}
                                  className="px-2 py-0.5 bg-emerald-600 text-white rounded text-2xs font-bold cursor-pointer"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelQuickPriceEdit}
                                  className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded text-2xs font-bold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => startQuickPriceEdit(item)}
                                  className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded text-2xs font-bold cursor-pointer"
                                >
                                  Price
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditItemModal(item)}
                                  className="p-1 text-slate-600 hover:text-slate-900 rounded cursor-pointer"
                                  title="Edit Dish & Categories"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
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

      {/* 4. CATEGORIES TAB */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {categories.map((cat) => {
            const assignedItems = menuItems.filter((m) => itemBelongsToCategory(m, cat.id, categories));

            return (
              <div key={cat.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-2xs mb-1">
                    <span className="font-mono font-bold text-slate-400">Order #{cat.displayOrder || 1}</span>
                    <span className="font-mono font-black text-amber-400 bg-slate-900 px-1.5 py-0.2 rounded text-[10px]">
                      {cat.categoryCode || 'CAT'}
                    </span>
                  </div>
                  <h4 className="font-black text-sm text-slate-900">{cat.categoryName}</h4>
                  {(cat.startTime || cat.endTime) && (
                    <div className="flex items-center gap-1 text-2xs text-amber-800 font-mono mt-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>{cat.startTime || '06:00 AM'} – {cat.endTime || '11:00 PM'}</span>
                    </div>
                  )}
                  <div className="text-2xs text-slate-500 mt-1 font-semibold">
                    {assignedItems.length} dishes assigned
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.2 rounded ${
                    cat.active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {cat.active !== false ? 'Active' : 'Disabled'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditCategoryModal(cat)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-2xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Add / Edit Menu Item with Multi-Category Checkboxes */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl my-auto">
            <div className="px-4 py-3 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-amber-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider">
                  {editingItem ? `Edit Dish: ${editingItem.itemName}` : 'Add New Menu Item'}
                </h3>
              </div>
              <button onClick={() => setItemModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="col-span-1">
                  <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                    Item Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 101"
                    value={itemForm.itemCode}
                    onChange={(e) => setItemForm({ ...itemForm, itemCode: e.target.value })}
                    className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                    English Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Idly"
                    value={itemForm.itemName}
                    onChange={(e) => handleItemNameChange(e.target.value)}
                    className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                  Tamil Name (Menu Management Only)
                </label>
                <input
                  type="text"
                  placeholder="e.g. இட்லி"
                  value={itemForm.itemNameTamil}
                  onChange={(e) => setItemForm({ ...itemForm, itemNameTamil: e.target.value })}
                  className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              {/* Multi-Select Food Availability Categories */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-slate-800 text-2xs uppercase">
                    Food Availability Categories (Select One or More) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-2xs">
                    <button
                      type="button"
                      onClick={() => setItemForm((prev) => ({ ...prev, categoryIds: categories.map((c) => c.id) }))}
                      className="text-amber-800 hover:underline font-bold cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setItemForm((prev) => ({ ...prev, categoryIds: [] }))}
                      className="text-slate-500 hover:underline font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {categories.length === 0 ? (
                  <p className="text-2xs text-slate-500">No categories created yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {categories.map((cat) => {
                      const isChecked = itemForm.categoryIds.includes(cat.id);
                      return (
                        <label
                          key={cat.id}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs font-bold cursor-pointer transition-colors select-none ${
                            isChecked
                              ? 'bg-amber-500/15 border-amber-500 text-slate-950 font-black'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCategorySelection(cat.id)}
                            className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500"
                          />
                          <span className="truncate">{cat.categoryName}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Prices Section */}
              <div className="bg-amber-50/60 border border-amber-200 p-2.5 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-amber-950 text-2xs uppercase">AC &amp; Non-AC Pricing (₹)</span>
                  <button
                    type="button"
                    onClick={() => setItemForm((prev) => ({ ...prev, acPrice: prev.nonAcPrice }))}
                    className="text-2xs font-bold text-amber-800 underline cursor-pointer"
                  >
                    Copy Non-AC to AC
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-2xs">
                      NON-AC PRICE (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 35"
                      value={itemForm.nonAcPrice}
                      onChange={(e) => setItemForm({ ...itemForm, nonAcPrice: e.target.value })}
                      className="w-full h-8 bg-white border border-slate-300 rounded px-2.5 text-slate-900 font-mono text-sm font-black focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 text-2xs">
                      AC PRICE (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 40"
                      value={itemForm.acPrice}
                      onChange={(e) => setItemForm({ ...itemForm, acPrice: e.target.value })}
                      className="w-full h-8 bg-white border border-slate-300 rounded px-2.5 text-slate-900 font-mono text-sm font-black focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="checkbox"
                  id="item-active-check"
                  checked={itemForm.active}
                  onChange={(e) => setItemForm({ ...itemForm, active: e.target.checked })}
                  className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="item-active-check" className="font-bold text-slate-700 cursor-pointer text-xs">
                  Active and available for billing
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="h-8 px-3 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingItem ? 'Save Changes' : 'Save Dish'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Category */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-extrabold text-xs uppercase tracking-wider">
                {editingCategory ? `Edit Category: ${editingCategory.categoryName}` : 'Add Food Category'}
              </h3>
              <button onClick={() => setCategoryModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tiffen, Lunch, Dinner, Snacks"
                  value={categoryForm.categoryName}
                  onChange={(e) => setCategoryForm({ ...categoryForm, categoryName: e.target.value })}
                  className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                    Short Code
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="e.g. TIF"
                    value={categoryForm.categoryCode}
                    onChange={(e) => setCategoryForm({ ...categoryForm, categoryCode: e.target.value.toUpperCase() })}
                    className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={categoryForm.displayOrder}
                    onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: e.target.value })}
                    className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-mono font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                    Start Time
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 06:00 AM"
                    value={categoryForm.startTime}
                    onChange={(e) => setCategoryForm({ ...categoryForm, startTime: e.target.value })}
                    className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 text-2xs uppercase">
                    End Time
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 11:00 AM"
                    value={categoryForm.endTime}
                    onChange={(e) => setCategoryForm({ ...categoryForm, endTime: e.target.value })}
                    className="w-full h-8 bg-slate-50 border border-slate-300 rounded px-2.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="cat-active-check"
                  checked={categoryForm.active}
                  onChange={(e) => setCategoryForm({ ...categoryForm, active: e.target.checked })}
                  className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="cat-active-check" className="font-bold text-slate-700 cursor-pointer text-xs">
                  Category active in POS tabs
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="h-8 px-3 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-8 px-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded cursor-pointer disabled:opacity-50"
                >
                  {editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalConfig.onConfirm}
        title={deleteModalConfig.title}
        itemName={deleteModalConfig.itemName}
        itemSubtitle={deleteModalConfig.itemSubtitle}
        description={deleteModalConfig.description}
        warningNote={deleteModalConfig.warningNote}
        confirmButtonText={deleteModalConfig.confirmButtonText}
        isDeleting={isExecutingDelete}
      />

    </div>
  );
};
