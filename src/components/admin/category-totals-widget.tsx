'use client';

import Link from 'next/link';
import { Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import type { CategoryTotal } from '@/lib/data/mappers/dashboard';

interface CategoryTotalsWidgetProps {
  data: {
    items: CategoryTotal[];
    grandTotal: number;
  };
}

export function CategoryTotalsWidget({ data }: CategoryTotalsWidgetProps) {
  // Group items by main category and sort by total descending
  const groupedData = data.items.reduce((acc, item) => {
    if (!acc[item.mainCategory]) {
      acc[item.mainCategory] = {
        total: 0,
      };
    }
    acc[item.mainCategory].total += item.quantity;
    return acc;
  }, {} as Record<string, { total: number }>);

  // Get top 3 categories by quantity
  const sortedCategories = Object.entries(groupedData)
    .map(([name, { total }]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const topCategories = sortedCategories.slice(0, 3);
  const categoryCount = sortedCategories.length;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Inventory by Category</h3>
          </div>
          <Link
            href="/admin/reports?type=category-totals"
            className="text-sm text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="text-2xl font-bold tabular-nums">
          {formatNumber(data.grandTotal)} units
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          {formatNumber(categoryCount)} categories
        </div>

        <div className="space-y-2">
          {topCategories.map((cat) => (
            <div key={cat.name} className="flex items-center gap-2">
              <span className="w-24 text-sm truncate" title={cat.name}>
                {cat.name}
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(cat.total / data.grandTotal) * 100}%` }}
                />
              </div>
              <span className="w-16 text-sm text-right tabular-nums">
                {formatNumber(cat.total)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
