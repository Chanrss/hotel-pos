import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StockThresholdBarChart } from './StockThresholdBarChart';
import { InventoryItem } from '../../types';

// Mock recharts ResponsiveContainer for JSDOM testing
vi.mock('recharts', async () => {
  const original = await vi.importActual('recharts');
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const mockInventory: InventoryItem[] = [
  {
    id: 'item-1',
    itemCode: 'IC-01',
    itemName: 'Vanilla Cup Ice Cream',
    category: 'Ice Cream',
    unit: 'Cups',
    minimumStock: 20,
    currentStock: 5, // Low stock: deficit of 15
    active: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  },
  {
    id: 'item-2',
    itemCode: 'IC-02',
    itemName: 'Chocolate Cone Ice Cream',
    category: 'Ice Cream',
    unit: 'Cones',
    minimumStock: 15,
    currentStock: 0, // Out of stock
    active: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  },
  {
    id: 'item-3',
    itemCode: 'CD-01',
    itemName: 'Coke 500ml',
    category: 'Cool Drinks',
    unit: 'Bottles',
    minimumStock: 10,
    currentStock: 25, // Healthy stock
    active: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  }
];

describe('StockThresholdBarChart', () => {
  it('renders the header and title of the visualizer', () => {
    render(<StockThresholdBarChart inventory={mockInventory} />);

    expect(screen.getByText('Stock vs Minimum Threshold Visualizer')).toBeDefined();
    expect(screen.getByText('Safety Stock')).toBeDefined();
  });

  it('correctly calculates metrics for healthy, low stock, and out of stock items', () => {
    render(<StockThresholdBarChart inventory={mockInventory} />);

    // 1 Healthy, 1 Below Min, 1 Out of Stock
    expect(screen.getByText('1 Healthy')).toBeDefined();
    expect(screen.getByText('1 Below Min')).toBeDefined();
    expect(screen.getByText('1 Out of Stock')).toBeDefined();
  });

  it('filters items when category filter button is clicked', () => {
    render(<StockThresholdBarChart inventory={mockInventory} />);

    const coolDrinksBtn = screen.getByRole('button', { name: /Cool Drinks/i });
    fireEvent.click(coolDrinksBtn);

    // After filtering to Cool Drinks, we should see 1 item in legend footer
    expect(screen.getByText(/Showing 1 items/)).toBeDefined();
  });

  it('filters items when Low Only toggle is selected', () => {
    render(<StockThresholdBarChart inventory={mockInventory} />);

    const lowOnlyBtn = screen.getByRole('button', { name: /Low Only/i });
    fireEvent.click(lowOnlyBtn);

    // Vanilla Cup (5 < 20) and Chocolate Cone (0 < 15) are low/out
    expect(screen.getByText(/Showing 2 items/)).toBeDefined();
  });
});
