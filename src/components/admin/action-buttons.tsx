/**
 * Action Buttons
 * ============================================================================
 * Clickable action buttons for exception report rows.
 * Path: src/components/admin/action-buttons.tsx
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Mail, Phone, Eye, Settings, MoreHorizontal } from 'lucide-react';

interface ExceptionAction {
  type: 'email' | 'call' | 'view' | 'custom';
  label: string;
  href?: string;
  onClick?: () => void;
}

interface ActionButtonsProps {
  actions: ExceptionAction[];
  entityId: string;
  entityType: 'customer' | 'sku' | 'rep';
  maxVisible?: number;
}

const ACTION_ICONS: Record<ExceptionAction['type'], React.ElementType> = {
  email: Mail,
  call: Phone,
  view: Eye,
  custom: Settings,
};

function ActionButton({ action, compact = false }: { action: ExceptionAction; compact?: boolean }) {
  const Icon = ACTION_ICONS[action.type];
  
  const buttonContent = (
    <>
      <Icon className="h-3.5 w-3.5" />
      {!compact && <span>{action.label}</span>}
    </>
  );

  const className = cn(
    'gap-1.5',
    compact && 'px-2'
  );

  // Handle different action types
  if (action.type === 'email' && action.href) {
    return (
      <Button variant="outline" size="sm" className={className} asChild>
        <a href={action.href}>{buttonContent}</a>
      </Button>
    );
  }

  if (action.type === 'call' && action.href) {
    return (
      <Button variant="outline" size="sm" className={className} asChild>
        <a href={action.href}>{buttonContent}</a>
      </Button>
    );
  }

  if (action.type === 'view' && action.href) {
    return (
      <Button variant="outline" size="sm" className={className} asChild>
        <Link href={action.href}>{buttonContent}</Link>
      </Button>
    );
  }

  if (action.onClick) {
    return (
      <Button variant="outline" size="sm" className={className} onClick={action.onClick}>
        {buttonContent}
      </Button>
    );
  }

  // Disabled state if no handler
  return (
    <Button variant="outline" size="sm" className={className} disabled title="Action not available">
      {buttonContent}
    </Button>
  );
}

export function ActionButtons({
  actions,
  entityId,
  entityType,
  maxVisible = 3,
}: ActionButtonsProps) {
  if (actions.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const visibleActions = actions.slice(0, maxVisible);
  const overflowActions = actions.slice(maxVisible);

  return (
    <div className="flex items-center justify-end gap-1">
      {visibleActions.map((action, index) => (
        <ActionButton
          key={`${action.type}-${index}`}
          action={action}
          compact={visibleActions.length > 2}
        />
      ))}

      {overflowActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="px-2">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflowActions.map((action, index) => {
              const Icon = ACTION_ICONS[action.type];
              
              return (
                <DropdownMenuItem
                  key={`${action.type}-${index}`}
                  onClick={() => {
                    if (action.onClick) {
                      action.onClick();
                    } else if (action.href) {
                      if (action.type === 'view') {
                        window.location.href = action.href;
                      } else {
                        window.open(action.href, '_blank');
                      }
                    }
                  }}
                  disabled={!action.href && !action.onClick}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Helper function to generate default actions for an entity
export function generateDefaultActions(
  entityType: 'customer' | 'sku' | 'rep',
  entityId: string,
  entityData?: { email?: string; phone?: string }
): ExceptionAction[] {
  const actions: ExceptionAction[] = [];

  // View action
  switch (entityType) {
    case 'customer':
      actions.push({
        type: 'view',
        label: 'View',
        href: `/admin/customers/${entityId}`,
      });
      break;
    case 'sku':
      actions.push({
        type: 'view',
        label: 'View',
        href: `/admin/products?search=${entityId}`,
      });
      break;
    case 'rep':
      actions.push({
        type: 'view',
        label: 'View',
        href: `/admin/reps/${entityId}`,
      });
      break;
  }

  // Email action
  if (entityData?.email) {
    actions.push({
      type: 'email',
      label: 'Email',
      href: `mailto:${entityData.email}`,
    });
  }

  // Call action
  if (entityData?.phone) {
    actions.push({
      type: 'call',
      label: 'Call',
      href: `tel:${entityData.phone}`,
    });
  }

  return actions;
}
