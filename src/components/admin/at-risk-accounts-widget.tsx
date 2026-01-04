/**
 * At-Risk Accounts Widget
 * ============================================================================
 * Dashboard widget showing customers who need attention.
 * Path: src/components/admin/at-risk-accounts-widget.tsx
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Users, Phone, Mail, ArrowRight, ChevronRight } from 'lucide-react';
import { cn, focusRing, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AtRiskAccount {
  customerId: number;
  storeName: string;
  segment: string;
  ltv: number;
  daysSinceLastOrder: number;
  usualOrderCycle: number | null;
  rep: string;
  riskReason: string;
}

interface AtRiskAccountsWidgetProps {
  accounts: AtRiskAccount[];
  maxItems?: number;
  className?: string;
}

const SEGMENT_COLORS: Record<string, string> = {
  Platinum: 'bg-slate-200 text-slate-900',
  Gold: 'bg-amber-100 text-amber-800',
  Silver: 'bg-gray-100 text-gray-700',
  Bronze: 'bg-orange-100 text-orange-800',
};

export function AtRiskAccountsWidget({
  accounts,
  maxItems = 5,
  className,
}: AtRiskAccountsWidgetProps) {
  const topAccounts = accounts.slice(0, maxItems);

  return (
    <Card className={cn('p-0', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-red-500" />
          <h3 className="font-semibold">At-Risk Accounts</h3>
          <Badge className="text-xs bg-muted">
            {accounts.length}
          </Badge>
        </div>
        <Link
          href="/admin/reports?type=exception&filters=%5B%7B%22fieldId%22%3A%22type%22%2C%22operator%22%3A%22eq%22%2C%22value%22%3A%22late-account%22%7D%5D"
          className={cn(
            'text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1',
            focusRing
          )}
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Account List */}
      {topAccounts.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Users className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm text-muted-foreground">
            All accounts are healthy
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {topAccounts.map((account) => (
            <li
              key={account.customerId}
              className="hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {account.storeName}
                    </span>
                    <Badge className={cn('text-xs', SEGMENT_COLORS[account.segment])}>
                      {account.segment}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>LTV: {formatCurrency(account.ltv)}</span>
                    <span>Rep: {account.rep}</span>
                  </div>
                  <p className="text-xs text-red-600 mt-1">
                    {account.riskReason}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="Send email"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="Schedule call"
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Link
                    href={`/admin/customers?id=${account.customerId}`}
                    className={cn(
                      'p-2 rounded-md hover:bg-muted',
                      focusRing
                    )}
                    title="View customer"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Footer */}
      {topAccounts.length > 0 && (
        <div className="flex items-center justify-between border-t p-3">
          <p className="text-xs text-muted-foreground">
            Total LTV at risk: {formatCurrency(accounts.reduce((sum, a) => sum + a.ltv, 0))}
          </p>
          <Button variant="outline" size="sm" className="gap-1" asChild>
            <Link href="/admin/reports?type=exception">
              <Mail className="h-3 w-3" />
              Send re-engagement
            </Link>
          </Button>
        </div>
      )}
    </Card>
  );
}
