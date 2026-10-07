import { collection, query, where, Firestore, Query, DocumentData } from 'firebase/firestore';
import { MenuItem, Category } from '../types';

export type ServicePeriod = 'ALL' | 'TIFFIN' | 'LUNCH' | 'DINNER';

/**
 * Returns all unique category IDs assigned to a menu item.
 * Supports both the `categoryIds: string[]` schema and legacy `categoryId: string`.
 */
export function getItemCategoryIds(item?: Partial<MenuItem> | null): string[] {
  if (!item) return [];
  const set = new Set<string>();
  if (Array.isArray(item.categoryIds)) {
    for (const id of item.categoryIds) {
      if (typeof id === 'string' && id.trim()) {
        set.add(id.trim());
      }
    }
  }
  if (typeof item.categoryId === 'string' && item.categoryId.trim()) {
    set.add(item.categoryId.trim());
  }
  return Array.from(set);
}

/**
 * Resolves human-readable category names for all categories assigned to an item.
 */
export function getItemCategoryNames(item?: Partial<MenuItem> | null, categories: Category[] = []): string[] {
  if (!item) return [];
  const catIds = getItemCategoryIds(item);
  const names: string[] = [];
  for (const cid of catIds) {
    const found = categories.find((c) => c.id === cid || c.id.toLowerCase() === cid.toLowerCase());
    if (found && (found.categoryName || found.name)) {
      names.push((found.categoryName || found.name)!);
    }
  }
  if (names.length === 0) {
    if (Array.isArray(item.categoryNames) && item.categoryNames.length > 0) {
      return item.categoryNames.filter(Boolean);
    }
    if (item.categoryName) {
      return [item.categoryName];
    }
  }
  return Array.from(new Set(names));
}

/**
 * Normalizes a menu item document from Firestore or localStorage so `categoryIds` is always populated.
 */
export function normalizeMenuItem(item: Partial<MenuItem>, categories: Category[] = []): MenuItem {
  const catIds = getItemCategoryIds(item);
  const catNames = getItemCategoryNames({ ...item, categoryIds: catIds }, categories);
  const primaryCatId = catIds[0] || item.categoryId || '';
  const primaryCatName = catNames[0] || item.categoryName || 'General';
  const englishName = item.itemName || item.itemNameEnglish || '';

  return {
    id: item.id || `item_${item.itemCode || Date.now()}`,
    itemCode: String(item.itemCode || '').trim(),
    itemName: englishName,
    itemNameEnglish: englishName,
    itemNameTamil: item.itemNameTamil || '',
    categoryIds: catIds,
    categoryNames: catNames,
    categoryId: primaryCatId,
    categoryName: catNames.join(', ') || primaryCatName,
    description: item.description,
    imageUrl: item.imageUrl,
    acPrice: Number(item.acPrice) || 0,
    nonAcPrice: Number(item.nonAcPrice) || 0,
    active: item.active !== false,
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || Date.now()
  };
}

/**
 * Groups menu items by their unique `itemCode` (falling back to `id` if `itemCode` is absent)
 * so that selecting the 'ALL' category or combining category results never produces duplicates.
 * If multiple records share the same `itemCode`, their `categoryIds` and `categoryNames` are merged.
 */
export function groupMenuItemsByItemCode(items: MenuItem[]): MenuItem[] {
  const groupedByCode = new Map<string, MenuItem>();

  for (const item of items) {
    if (!item) continue;
    const rawCode = String(item.itemCode || '').trim();
    const rawId = String(item.id || '').trim();
    const groupKey = rawCode ? `code:${rawCode.toLowerCase()}` : `id:${rawId.toLowerCase()}`;
    if (!groupKey || groupKey === 'id:') continue;

    const incomingCatIds = getItemCategoryIds(item);
    const incomingCatNames = Array.isArray(item.categoryNames)
      ? item.categoryNames.filter(Boolean)
      : item.categoryName
      ? [item.categoryName]
      : [];

    const existing = groupedByCode.get(groupKey);
    if (!existing) {
      groupedByCode.set(groupKey, {
        ...item,
        categoryIds: incomingCatIds,
        categoryId: item.categoryId || incomingCatIds[0] || ''
      });
    } else {
      const mergedCatIds = Array.from(new Set([...getItemCategoryIds(existing), ...incomingCatIds]));
      const existingCatNames = Array.isArray(existing.categoryNames)
        ? existing.categoryNames.filter(Boolean)
        : existing.categoryName
        ? [existing.categoryName]
        : [];
      const mergedCatNames = Array.from(new Set([...existingCatNames, ...incomingCatNames]));

      groupedByCode.set(groupKey, {
        ...existing,
        categoryIds: mergedCatIds,
        categoryNames: mergedCatNames.length > 0 ? mergedCatNames : existing.categoryNames,
        categoryId: existing.categoryId || mergedCatIds[0] || '',
        categoryName: mergedCatNames.length > 0 ? mergedCatNames.join(', ') : existing.categoryName
      });
    }
  }

  return Array.from(groupedByCode.values());
}

/**
 * Deduplicates menu items by grouping them by their unique `itemCode`
 * so an item assigned to multiple categories never appears twice in the ALL category or search results.
 */
export function deduplicateMenuItems(items: MenuItem[]): MenuItem[] {
  return groupMenuItemsByItemCode(items);
}

/**
 * Builds the Firestore query for POS item retrieval:
 * - When a specific category ID is selected, uses a single Firestore `where('categoryIds', 'array-contains', categoryId)` clause.
 * - When 'ALL' (or 'all' / consolidated shortcut) is selected, performs a query without this filter.
 */
export function buildPosMenuItemsQuery(dbInstance: Firestore, selectedCategory: string): Query<DocumentData> {
  const normCategory = (selectedCategory || 'all').trim();
  const lowerCategory = normCategory.toLowerCase();
  const isAllOrConsolidated =
    !normCategory ||
    lowerCategory === 'all' ||
    lowerCategory === 'cat_dosa' ||
    lowerCategory === 'cat_idly' ||
    lowerCategory === 'dosa' ||
    lowerCategory === 'idly' ||
    lowerCategory === 'cat_dosa_idly';

  if (isAllOrConsolidated) {
    return query(collection(dbInstance, 'menu_items'));
  }

  return query(
    collection(dbInstance, 'menu_items'),
    where('categoryIds', 'array-contains', normCategory)
  );
}

/**
 * Checks if a menu item is a Dosa item:
 * Matches items containing Dosa, Dosai, Roast, Uthappam, Rava, or Tamil equivalents.
 */
export function isDosaItem(item: Partial<MenuItem>): boolean {
  if (!item) return false;
  const name = (item.itemName || item.itemNameEnglish || '').toLowerCase();
  const tamil = item.itemNameTamil || '';
  const cat = (item.categoryName || '').toLowerCase();
  const catIds = getItemCategoryIds(item).map((c) => c.toLowerCase());
  const code = (item.itemCode || '').toLowerCase();
  return (
    name.includes('dosa') ||
    name.includes('dosai') ||
    name.includes('roast') ||
    name.includes('uthappam') ||
    name.includes('rava') ||
    cat.includes('dosa') ||
    cat.includes('dosai') ||
    catIds.some((cid) => cid.includes('dosa') || cid.includes('dosai')) ||
    code.includes('dosa') ||
    tamil.includes('தோசை') ||
    tamil.includes('ரோஸ்ட்') ||
    tamil.includes('ஊத்தப்பம்')
  );
}

/**
 * Checks if a menu item is an Idly item:
 * Matches items containing Idly, Idli, or Tamil equivalent.
 */
export function isIdlyItem(item: Partial<MenuItem>): boolean {
  if (!item) return false;
  const name = (item.itemName || item.itemNameEnglish || '').toLowerCase();
  const tamil = item.itemNameTamil || '';
  const cat = (item.categoryName || '').toLowerCase();
  const catIds = getItemCategoryIds(item).map((c) => c.toLowerCase());
  const code = (item.itemCode || '').toLowerCase();
  return (
    name.includes('idly') ||
    name.includes('idli') ||
    cat.includes('idly') ||
    cat.includes('idli') ||
    catIds.some((cid) => cid.includes('idly') || cid.includes('idli')) ||
    code.includes('idly') ||
    code.includes('idli') ||
    tamil.includes('இட்லி')
  );
}

/**
 * Checks if an item is available across Tiffin and Dinner service periods (Dosa & Idly only in Tiffin, Dinner).
 */
export function isTiffinAndDinnerSharedItem(item: Partial<MenuItem>): boolean {
  return isDosaItem(item) || isIdlyItem(item);
}

/**
 * Alias for shared service item (Dosa and Idly shared across Tiffin and Dinner only).
 */
export function isGlobalServiceItem(item: Partial<MenuItem>): boolean {
  return isTiffinAndDinnerSharedItem(item);
}

/**
 * Identifies if a category represents Tiffin / Breakfast
 */
export function isTiffinCategory(category?: Partial<Category> | string | null): boolean {
  if (!category) return false;
  const str = typeof category === 'string' ? category.toLowerCase() : '';
  const id = (typeof category === 'object' ? category.id || '' : str).toLowerCase();
  const name = (typeof category === 'object' ? category.categoryName || category.name || '' : str).toLowerCase();
  const code = (typeof category === 'object' ? category.categoryCode || '' : str).toLowerCase();
  return (
    id === 'cat_tiffin' ||
    id.includes('tiff') ||
    name.includes('tiffin') ||
    name.includes('tiffen') ||
    name.includes('breakfast') ||
    code.includes('tif') ||
    str.includes('tif') ||
    str.includes('breakf')
  );
}

/**
 * Identifies if a category represents Dinner / Evening Service
 */
export function isDinnerCategory(category?: Partial<Category> | string | null): boolean {
  if (!category) return false;
  const str = typeof category === 'string' ? category.toLowerCase() : '';
  const id = (typeof category === 'object' ? category.id || '' : str).toLowerCase();
  const name = (typeof category === 'object' ? category.categoryName || category.name || '' : str).toLowerCase();
  const code = (typeof category === 'object' ? category.categoryCode || '' : str).toLowerCase();
  return (
    id === 'cat_dinner' ||
    id.includes('dinn') ||
    name.includes('dinner') ||
    name.includes('parotta') ||
    code.includes('din') ||
    str.includes('din')
  );
}

/**
 * Identifies if a category represents Lunch / Meals
 */
export function isLunchCategory(category?: Partial<Category> | string | null): boolean {
  if (!category) return false;
  const str = typeof category === 'string' ? category.toLowerCase() : '';
  const id = (typeof category === 'object' ? category.id || '' : str).toLowerCase();
  const name = (typeof category === 'object' ? category.categoryName || category.name || '' : str).toLowerCase();
  const code = (typeof category === 'object' ? category.categoryCode || '' : str).toLowerCase();
  return (
    id === 'cat_meals' ||
    id.includes('lunc') ||
    name.includes('lunch') ||
    name.includes('meal') ||
    code.includes('lunc') ||
    code.includes('mls') ||
    str.includes('lunc') ||
    str.includes('meal')
  );
}

/**
 * Checks if a category is a meal / service period category (Tiffin, Lunch, Dinner, etc.)
 */
export function isServicePeriodCategory(category?: Partial<Category> | string | null): boolean {
  if (!category) return false;
  const str = typeof category === 'string' ? category.toLowerCase() : '';
  const id = (typeof category === 'object' ? category.id || '' : str).toLowerCase();
  const name = (typeof category === 'object' ? category.categoryName || category.name || '' : str).toLowerCase();
  const code = (typeof category === 'object' ? category.categoryCode || '' : str).toLowerCase();

  if (
    id.includes('beve') ||
    name.includes('beverage') ||
    name.includes('drink') ||
    code.includes('bev') ||
    code.includes('hot') ||
    code.includes('col') ||
    id.includes('ice') ||
    name.includes('ice cream') ||
    code.includes('ice')
  ) {
    return false;
  }

  return (
    isTiffinCategory(category) ||
    isDinnerCategory(category) ||
    isLunchCategory(category) ||
    id === 'cat_snacks' ||
    name.includes('snack') ||
    code.includes('snk') ||
    name.includes('rice') ||
    name.includes('noodel') ||
    name.includes('noodle') ||
    name.includes('starter') ||
    name.includes('bread') ||
    name.includes('gravy') ||
    str.includes('din') ||
    str.includes('tif') ||
    str.includes('lunc') ||
    str.includes('meal')
  );
}

/**
 * Checks if a menu item belongs to a specific category ID, code, or name (supporting multi-category `categoryIds: []`).
 */
export function itemBelongsToCategory(
  item: Partial<MenuItem>,
  targetCategory: string,
  categories: Category[] = []
): boolean {
  if (!item) return false;
  const normTarget = (targetCategory || 'all').trim();
  const lowerTarget = normTarget.toLowerCase();
  if (lowerTarget === 'all') return true;

  if (lowerTarget === 'cat_dosa' || lowerTarget === 'dosa') {
    return isDosaItem(item);
  }
  if (lowerTarget === 'cat_idly' || lowerTarget === 'idly') {
    return isIdlyItem(item);
  }

  const itemCatIds = getItemCategoryIds(item);
  const currentCategoryObj = categories.find(
    (c) =>
      c.id === normTarget ||
      c.id.toLowerCase() === lowerTarget ||
      (c.categoryName && c.categoryName.toLowerCase() === lowerTarget) ||
      (c.name && c.name.toLowerCase() === lowerTarget) ||
      (c.categoryCode && c.categoryCode.toLowerCase() === lowerTarget)
  );

  for (const cid of itemCatIds) {
    const lowerCid = cid.toLowerCase();
    if (cid === normTarget || lowerCid === lowerTarget) return true;
    if (currentCategoryObj && (cid === currentCategoryObj.id || lowerCid === currentCategoryObj.id.toLowerCase())) {
      return true;
    }
    const catObj = categories.find((c) => c.id === cid || c.id.toLowerCase() === lowerCid);
    if (catObj) {
      if (
        (catObj.categoryName && catObj.categoryName.toLowerCase() === lowerTarget) ||
        (catObj.name && catObj.name.toLowerCase() === lowerTarget) ||
        (catObj.categoryCode && catObj.categoryCode.toLowerCase() === lowerTarget)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Consolidated POS category shortcuts
 */
export const CONSOLIDATED_POS_CATEGORIES = [
  { id: 'cat_dosa', categoryName: 'Dosa', categoryCode: 'DOSA', displayOrder: -2, active: true },
  { id: 'cat_idly', categoryName: 'Idly', categoryCode: 'IDLY', displayOrder: -1, active: true }
];

/**
 * Filters items for the POS Screen:
 * - Supports multi-category `categoryIds: string[]` assignment so an item assigned to multiple categories
 *   appears in every selected category screen.
 * - Ensures the `ALL` category displays each item only ONCE (deduplicated by item id / itemCode).
 * - Preserves Dosa & Idly service period behavior for legacy single-category items.
 */
export function filterPosMenuItems(
  menuItems: MenuItem[],
  selectedCategory: string,
  categories: Category[],
  searchQuery = '',
  activeServicePeriod: ServicePeriod = 'ALL'
): MenuItem[] {
  const normSelected = (selectedCategory || 'all').trim();
  const lowerSelected = normSelected.toLowerCase();

  // Deduplicate input items so no item ever appears twice
  const uniqueItems = deduplicateMenuItems(menuItems);

  const currentCategoryObj = categories.find(
    (c) =>
      c.id === normSelected ||
      c.id.toLowerCase() === lowerSelected ||
      (c.categoryName && c.categoryName.toLowerCase() === lowerSelected) ||
      (c.categoryCode && c.categoryCode.toLowerCase() === lowerSelected)
  );

  const isTiffin = isTiffinCategory(currentCategoryObj) || isTiffinCategory(normSelected);
  const isDinner = isDinnerCategory(currentCategoryObj) || isDinnerCategory(normSelected);
  const isLunch = isLunchCategory(currentCategoryObj) || isLunchCategory(normSelected);

  const q = searchQuery.toLowerCase().trim();

  const filtered = uniqueItems.filter((item) => {
    const isDosa = isDosaItem(item);
    const isIdly = isIdlyItem(item);
    const isTiffinDinnerItem = isDosa || isIdly;
    const itemCatIds = getItemCategoryIds(item);
    const hasExplicitMultiArray = Array.isArray(item.categoryIds) && item.categoryIds.length > 0;
    const matchesDirectCategory = itemBelongsToCategory(item, normSelected, categories);

    // Helper: check if any of the item's assigned categories matches a period predicate
    const itemMatchesPeriodPredicate = (pred: (cat?: Partial<Category> | string | null) => boolean): boolean => {
      return itemCatIds.some((cid) => {
        const catObj = categories.find((c) => c.id === cid || c.id.toLowerCase() === cid.toLowerCase());
        return pred(catObj || cid);
      });
    };

    // 1. Consolidated Category Selection:
    if (lowerSelected === 'cat_dosa' || lowerSelected === 'dosa') {
      if (!isDosa) return false;
      if (activeServicePeriod === 'LUNCH' && !itemMatchesPeriodPredicate(isLunchCategory)) return false;
    } else if (lowerSelected === 'cat_idly' || lowerSelected === 'idly') {
      if (!isIdly) return false;
      if (activeServicePeriod === 'LUNCH' && !itemMatchesPeriodPredicate(isLunchCategory)) return false;
    } else if (lowerSelected === 'cat_dosa_idly') {
      if (!isTiffinDinnerItem) return false;
      if (activeServicePeriod === 'LUNCH' && !itemMatchesPeriodPredicate(isLunchCategory)) return false;
    } else if (lowerSelected === 'all') {
      if (activeServicePeriod === 'TIFFIN') {
        const matchesTiffinPeriod =
          itemMatchesPeriodPredicate(isTiffinCategory) || isTiffinDinnerItem;
        if (!matchesTiffinPeriod) return false;
      } else if (activeServicePeriod === 'DINNER') {
        const matchesDinnerPeriod =
          itemMatchesPeriodPredicate(isDinnerCategory) || isTiffinDinnerItem;
        if (!matchesDinnerPeriod) return false;
      } else if (activeServicePeriod === 'LUNCH') {
        const matchesLunchPeriod =
          itemMatchesPeriodPredicate(isLunchCategory) && !isTiffinDinnerItem;
        if (!matchesLunchPeriod) return false;
      }
    } else if (isTiffin) {
      const matchesPeriodOrShared =
        matchesDirectCategory ||
        itemMatchesPeriodPredicate(isTiffinCategory) ||
        isTiffinDinnerItem;
      if (!matchesPeriodOrShared) return false;
    } else if (isDinner) {
      const matchesPeriodOrShared =
        matchesDirectCategory ||
        itemMatchesPeriodPredicate(isDinnerCategory) ||
        isTiffinDinnerItem;
      if (!matchesPeriodOrShared) return false;
    } else if (isLunch) {
      const matchesLunch =
        (matchesDirectCategory || itemMatchesPeriodPredicate(isLunchCategory)) && !isTiffinDinnerItem;
      if (!matchesLunch) return false;
    } else {
      if (!matchesDirectCategory) return false;
    }

    // 2. Search Query Matching
    if (!q) return true;
    return (
      (item.itemCode && item.itemCode.toLowerCase().includes(q)) ||
      (item.itemName && item.itemName.toLowerCase().includes(q)) ||
      (item.itemNameEnglish && item.itemNameEnglish.toLowerCase().includes(q)) ||
      (item.itemNameTamil && item.itemNameTamil.includes(q))
    );
  });

  // Sort items numerically by itemCode where possible for clean cashier scanning
  return filtered.sort((a, b) => {
    const codeA = parseInt(a.itemCode, 10);
    const codeB = parseInt(b.itemCode, 10);
    if (!isNaN(codeA) && !isNaN(codeB)) {
      return codeA - codeB;
    }
    return (a.itemCode || '').localeCompare(b.itemCode || '');
  });
}

/**
 * Computes category dish count for POS pills, supporting multi-category `categoryIds: []`
 * and deduplicating items.
 */
export function getPosCategoryDishCount(
  category: Category | { id: string; categoryName?: string; categoryCode?: string },
  menuItems: MenuItem[],
  allCategories: Category[] = []
): number {
  const uniqueItems = deduplicateMenuItems(menuItems);

  if (category.id === 'cat_dosa' || category.id === 'dosa') {
    return uniqueItems.filter(isDosaItem).length;
  }
  if (category.id === 'cat_idly' || category.id === 'idly') {
    return uniqueItems.filter(isIdlyItem).length;
  }
  if (category.id === 'all') {
    return uniqueItems.length;
  }

  return uniqueItems.filter((item) => {
    const directMatch = itemBelongsToCategory(item, category.id, allCategories);
    if (directMatch) {
      if (isLunchCategory(category) && (isDosaItem(item) || isIdlyItem(item))) {
        return false;
      }
      return true;
    }
    if (isTiffinCategory(category) || isDinnerCategory(category)) {
      return isDosaItem(item) || isIdlyItem(item);
    }
    return false;
  }).length;
}
