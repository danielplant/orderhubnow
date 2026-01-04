'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import type { POSoldRow } from '@/lib/data/mappers/dashboard';

interface POSoldWidgetProps {
  data: POSoldRow[];
  grandTotal: number;
}

export function POSoldWidget({ data, grandTotal }: POSoldWidgetProps) {
  const skuCount = data.length;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium">Shopify Committed</h3>
          </div>
          <Link
            href="/admin/reports?type=po-sold"
            className="text-sm text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="text-2xl font-bold tabular-nums">
          {formatNumber(grandTotal)} units
        </div>
        <div className="text-sm text-muted-foreground">
          {formatNumber(skuCount)} SKUs
        </div>
      </CardContent>
    </Card>
  );
}
