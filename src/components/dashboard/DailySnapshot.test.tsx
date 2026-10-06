import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DailySnapshot } from './DailySnapshot';
import { Bill, BillItem } from '../../types';

describe('DailySnapshot Component', () => {
  const businessDate = '2026-09-18';

  const mockBills: Bill[] = [
    {
      id: 'bill-1',
      businessDate: '2026-09-18',
      billNumber: 'BILL-101',
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      subtotal: 350,
      discount: 0,
      grandTotal: 350,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: Date.now() - 3600000,
      items: [
        {
          id: 'bi-1',
          billId: 'bill-1',
          itemId: 'm-1',
          itemCode: '101',
          itemName: 'Ghee Roast',
          itemNameTamil: 'நெய் ரோஸ்ட்',
          quantity: 2,
          unitPrice: 100,
          totalPrice: 200,
          priceType: 'NON_AC',
          createdAt: Date.now() - 3600000
        },
        {
          id: 'bi-2',
          billId: 'bill-1',
          itemId: 'm-2',
          itemCode: '102',
          itemName: 'Filter Coffee',
          itemNameTamil: 'பில்டர் காபி',
          quantity: 3,
          unitPrice: 50,
          totalPrice: 150,
          priceType: 'NON_AC',
          createdAt: Date.now() - 3600000
        }
      ]
    },
    {
      id: 'bill-2',
      businessDate: '2026-09-18',
      billNumber: 'BILL-102',
      orderType: 'TAKE_AWAY',
      priceType: 'AC',
      subtotal: 600,
      discount: 0,
      grandTotal: 600,
      paymentMethod: 'UPI',
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: Date.now() - 1800000,
      items: [
        {
          id: 'bi-3',
          billId: 'bill-2',
          itemId: 'm-1',
          itemCode: '101',
          itemName: 'Ghee Roast',
          itemNameTamil: 'நெய் ரோஸ்ட்',
          quantity: 4,
          unitPrice: 110,
          totalPrice: 440,
          priceType: 'AC',
          createdAt: Date.now() - 1800000
        },
        {
          id: 'bi-4',
          billId: 'bill-2',
          itemId: 'm-3',
          itemCode: '103',
          itemName: 'Medu Vada',
          itemNameTamil: 'மெது வடை',
          quantity: 4,
          unitPrice: 40,
          totalPrice: 160,
          priceType: 'AC',
          createdAt: Date.now() - 1800000
        }
      ]
    },
    {
      // Cancelled bill (should NOT count toward revenue or bill count)
      id: 'bill-3',
      businessDate: '2026-09-18',
      billNumber: 'BILL-103',
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      subtotal: 200,
      discount: 0,
      grandTotal: 200,
      paymentMethod: 'CASH',
      status: 'CANCELLED',
      reprintCount: 0,
      createdAt: Date.now() - 600000,
      items: []
    },
    {
      // Previous business day bill (should NOT count)
      id: 'bill-yesterday',
      businessDate: '2026-09-17',
      billNumber: 'BILL-099',
      orderType: 'DINE_IN',
      priceType: 'NON_AC',
      subtotal: 1000,
      discount: 0,
      grandTotal: 1000,
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      reprintCount: 0,
      createdAt: Date.now() - 86400000,
      items: []
    }
  ];

  it('renders Daily Snapshot section title and live badge for current business day', () => {
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={mockBills}
      />
    );

    expect(screen.getByText('Daily Snapshot')).toBeDefined();
    expect(screen.getByText('Live')).toBeDefined();
    expect(screen.getByText(/2026-09-18/)).toBeDefined();
  });

  it('displays accurate Total Sales and payment breakdown for current business day', () => {
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={mockBills}
        canViewRevenue={true}
      />
    );

    // Bill 1: 350 (Cash) + Bill 2: 600 (UPI) = 950 (Cancelled bill ignored)
    expect(screen.getByText('Total Sales')).toBeDefined();
    expect(screen.getByText('950')).toBeDefined();
    expect(screen.getByText(/Cash: ₹350/)).toBeDefined();
    expect(screen.getByText(/UPI: ₹600/)).toBeDefined();
  });

  it('displays accurate Bill Count with order type split', () => {
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={mockBills}
      />
    );

    // 2 Completed bills today
    expect(screen.getByText('Bill Count')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Bills')).toBeDefined();
    expect(screen.getByText(/Dine: 1/)).toBeDefined();
    expect(screen.getByText(/Takeaway: 1/)).toBeDefined();
  });

  it('accurately computes and renders the Top-Selling Item and quantity sold', () => {
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={mockBills}
        canViewRevenue={true}
      />
    );

    // Ghee Roast has 2 + 4 = 6 sold, revenue 200 + 440 = 640
    // Medu Vada has 4 sold
    // Filter Coffee has 3 sold
    expect(screen.getByText('Top-Selling Item')).toBeDefined();
    expect(screen.getByText('Ghee Roast')).toBeDefined();
    expect(screen.queryByText('(நெய் ரோஸ்ட்)')).toBeNull();
    expect(screen.getByText('6 sold')).toBeDefined();
    expect(screen.getByText('₹640')).toBeDefined();

    // Also lists other popular items in runners-up
    expect(screen.getByText(/Also popular:/)).toBeDefined();
    expect(screen.getByText(/Medu Vada/)).toBeDefined();
  });

  it('renders graceful empty state when there are no completed bills today', () => {
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={[]}
      />
    );

    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No items sold yet')).toBeDefined();
    expect(screen.getByText(/Waiting for first order/)).toBeDefined();
  });

  it('respects financial permission hiding when canViewRevenue is false', () => {
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={mockBills}
        canViewRevenue={false}
      />
    );

    expect(screen.getByText('Protected')).toBeDefined();
    expect(screen.getByText('Requires financial report permission')).toBeDefined();
    // Bill count is still visible even if financial numbers are protected
    expect(screen.getByText('2')).toBeDefined();
  });

  it('triggers navigation callback when Detailed Reports is clicked', () => {
    const handleNavigate = vi.fn();
    render(
      <DailySnapshot
        businessDate={businessDate}
        bills={mockBills}
        onNavigate={handleNavigate}
      />
    );

    const reportsBtn = screen.getByText('Detailed Reports');
    fireEvent.click(reportsBtn);
    expect(handleNavigate).toHaveBeenCalledWith('reports');
  });
});
