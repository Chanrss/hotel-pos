import { useState, useEffect, useMemo } from 'react';
import { MenuItem, PriceType } from '../types';
import { BillingEngine } from '../services/billingEngine';

export interface MenuItemWithPrice extends MenuItem {
  applicablePrice: number;
}

export interface UseMenuSearchResult {
  debouncedQuery: string;
  matchingSuggestions: MenuItemWithPrice[];
  exactMatch: MenuItemWithPrice | null;
  topMatch: MenuItemWithPrice | null;
  totalMatches: number;
  isDebouncing: boolean;
}

export interface UseMenuSearchOptions {
  debounceMs?: number;
  maxResults?: number;
}

/**
 * Custom hook that provides memoized local search over menu items with debounced input.
 * Instantly displays matching items, ranks by relevance, and computes applicable prices for the active price type (AC / Non-AC).
 */
export function useMenuSearch(
  menuItems: MenuItem[],
  rawInput: string,
  priceType: PriceType,
  options: UseMenuSearchOptions = {}
): UseMenuSearchResult {
  const { debounceMs = 60, maxResults = 10 } = options;

  const [debouncedQuery, setDebouncedQuery] = useState(rawInput);
  const isDebouncing = rawInput !== debouncedQuery;

  // Debounce the raw input to prevent excessive computations while keeping typing snappy
  useEffect(() => {
    if (rawInput === debouncedQuery) {
      return;
    }

    const handler = setTimeout(() => {
      setDebouncedQuery(rawInput);
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [rawInput, debouncedQuery, debounceMs]);

  // Memoized search index mapping items with their search tokens and applicable prices
  const itemsWithSearchTokens = useMemo(() => {
    return menuItems.map((item) => {
      const codeUpper = (item.itemCode || '').trim().toUpperCase();
      const codeLower = (item.itemCode || '').trim().toLowerCase();
      const nameUpper = (item.itemName || '').trim().toUpperCase();
      const nameLower = (item.itemName || '').trim().toLowerCase();
      const catLower = (item.categoryName || '').trim().toLowerCase();
      const applicablePrice = BillingEngine.getApplicablePrice(item, priceType);

      return {
        item: { ...item, applicablePrice },
        codeUpper,
        codeLower,
        nameUpper,
        nameLower,
        catLower
      };
    });
  }, [menuItems, priceType]);

  // Memoized search filter and relevance ranking based on the debounced query
  const { matchingSuggestions, exactMatch, topMatch, totalMatches } = useMemo(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed) {
      return {
        matchingSuggestions: [],
        exactMatch: null,
        topMatch: null,
        totalMatches: 0
      };
    }

    const queryUpper = trimmed.toUpperCase();
    const queryLower = trimmed.toLowerCase();

    let foundExact: MenuItemWithPrice | null = null;
    const exactCodeMatches: MenuItemWithPrice[] = [];
    const prefixCodeMatches: MenuItemWithPrice[] = [];
    const prefixNameMatches: MenuItemWithPrice[] = [];
    const substringMatches: MenuItemWithPrice[] = [];

    for (let i = 0; i < itemsWithSearchTokens.length; i++) {
      const entry = itemsWithSearchTokens[i];
      const { item, codeUpper, codeLower, nameUpper, nameLower, catLower } = entry;

      // 1. Exact match by code or full name
      if (codeUpper === queryUpper || nameUpper === queryUpper) {
        if (!foundExact) foundExact = item;
        exactCodeMatches.push(item);
        continue;
      }

      // 2. Code starts with query (e.g. typing "10" matches "101", "102")
      if (codeUpper.startsWith(queryUpper)) {
        prefixCodeMatches.push(item);
        continue;
      }

      // 3. Name starts with query (e.g. typing "TE" matches "TEA")
      if (nameLower.startsWith(queryLower)) {
        prefixNameMatches.push(item);
        continue;
      }

      // 4. Substring in code, name, or category
      if (codeLower.includes(queryLower) || nameLower.includes(queryLower) || catLower.includes(queryLower)) {
        substringMatches.push(item);
      }
    }

    // Rank results by priority
    const allMatches = [
      ...exactCodeMatches,
      ...prefixCodeMatches,
      ...prefixNameMatches,
      ...substringMatches
    ];

    const top = foundExact || allMatches[0] || null;

    return {
      matchingSuggestions: allMatches.slice(0, maxResults),
      exactMatch: foundExact,
      topMatch: top,
      totalMatches: allMatches.length
    };
  }, [debouncedQuery, itemsWithSearchTokens, maxResults]);

  return {
    debouncedQuery,
    matchingSuggestions,
    exactMatch,
    topMatch,
    totalMatches,
    isDebouncing
  };
}
