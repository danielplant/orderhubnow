'use client'

/**
 * StatusCascadePanel
 *
 * Tesla-inspired horizontal pipeline UI for configuring status filters.
 * Shows cascading flow: Available > Ingestion > SKU > Transfer
 * Each stage can only select a subset of the previous stage.
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ArrowRight, Circle, CheckCircle2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface StatusCascadeConfig {
  ingestionAllowed: string[]
  skuAllowed: string[]
  transferAllowed: string[]
}

interface StatusDistribution {
  [status: string]: number
}

interface StatusCascadePanelProps {
  distribution: StatusDistribution | null
  config: StatusCascadeConfig
  validStatuses: readonly string[]
  onChange: (config: StatusCascadeConfig) => void
  hasChanges: boolean
}

// ============================================================================
// Status Toggle Component
// ============================================================================

interface StatusToggleProps {
  status: string
  count?: number
  enabled: boolean
  disabled: boolean
  disabledReason?: string
  showCount?: boolean
  onClick: () => void
}

function StatusToggle({
  status,
  count,
  enabled,
  disabled,
  disabledReason,
  showCount = false,
  onClick,
}: StatusToggleProps) {
  const content = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all w-full',
        enabled && !disabled
          ? 'bg-info/10 border-info text-info'
          : disabled
            ? 'bg-muted/30 border-border text-muted-foreground opacity-40 cursor-not-allowed'
            : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted cursor-pointer'
      )}
    >
      {enabled ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 shrink-0" />
      )}
      <span className="text-sm font-medium">{status}</span>
      {showCount && count !== undefined && (
        <span className="text-xs opacity-70 ml-auto">{count.toLocaleString()}</span>
      )}
    </button>
  )

  if (disabled && disabledReason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent>
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}

// ============================================================================
// Stage Column Component
// ============================================================================

interface StageColumnProps {
  title: string
  subtitle?: string
  statuses: readonly string[]
  selectedStatuses: string[]
  distribution?: StatusDistribution | null
  parentSelected?: string[]
  showCounts?: boolean
  readOnly?: boolean
  onToggle?: (status: string) => void
}

function StageColumn({
  title,
  subtitle,
  statuses,
  selectedStatuses,
  distribution,
  parentSelected,
  showCounts = false,
  readOnly = false,
  onToggle,
}: StageColumnProps) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="text-center h-10 flex flex-col justify-center">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {statuses.map((status) => {
          const isEnabled = selectedStatuses.includes(status)
          const isDisabledByParent = parentSelected && !parentSelected.includes(status)

          return (
            <StatusToggle
              key={status}
              status={status}
              count={distribution?.[status]}
              enabled={isEnabled}
              disabled={readOnly || isDisabledByParent || false}
              disabledReason={
                isDisabledByParent
                  ? 'Not selected in previous stage'
                  : undefined
              }
              showCount={showCounts}
              onClick={() => onToggle?.(status)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Arrow Connector Component
// ============================================================================

function ArrowConnector() {
  return (
    <div className="flex items-center justify-center self-center mt-6">
      <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function StatusCascadePanel({
  distribution,
  config,
  validStatuses,
  onChange,
  hasChanges,
}: StatusCascadePanelProps) {
  // Toggle a status in a specific stage
  const handleToggle = (
    stage: 'ingestion' | 'sku' | 'transfer',
    status: string
  ) => {
    const newConfig = { ...config }

    switch (stage) {
      case 'ingestion': {
        const current = new Set(config.ingestionAllowed)
        if (current.has(status)) {
          current.delete(status)
          // Cascade: also remove from sku and transfer if no longer in ingestion
          newConfig.ingestionAllowed = Array.from(current)
          newConfig.skuAllowed = config.skuAllowed.filter((s) => current.has(s))
          newConfig.transferAllowed = config.transferAllowed.filter((s) =>
            newConfig.skuAllowed.includes(s)
          )
        } else {
          current.add(status)
          newConfig.ingestionAllowed = Array.from(current)
        }
        break
      }
      case 'sku': {
        const current = new Set(config.skuAllowed)
        if (current.has(status)) {
          current.delete(status)
          // Cascade: also remove from transfer if no longer in sku
          newConfig.skuAllowed = Array.from(current)
          newConfig.transferAllowed = config.transferAllowed.filter((s) =>
            current.has(s)
          )
        } else {
          // Can only add if in ingestion
          if (config.ingestionAllowed.includes(status)) {
            current.add(status)
            newConfig.skuAllowed = Array.from(current)
          }
        }
        break
      }
      case 'transfer': {
        const current = new Set(config.transferAllowed)
        if (current.has(status)) {
          current.delete(status)
          newConfig.transferAllowed = Array.from(current)
        } else {
          // Can only add if in sku
          if (config.skuAllowed.includes(status)) {
            current.add(status)
            newConfig.transferAllowed = Array.from(current)
          }
        }
        break
      }
    }

    onChange(newConfig)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Status Pipeline
          {hasChanges && (
            <span className="text-xs font-medium px-2 py-1 rounded-full border border-amber-600 text-amber-600">
              Unsaved
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Control which product statuses flow through each sync stage. Each stage can only include statuses from the previous stage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-start gap-2">
          {/* Available (read-only) */}
          <StageColumn
            title="Available"
            subtitle="From Shopify"
            statuses={validStatuses}
            selectedStatuses={validStatuses as unknown as string[]}
            distribution={distribution}
            showCounts={true}
            readOnly={true}
          />

          <ArrowConnector />

          {/* Ingestion */}
          <StageColumn
            title="Ingestion"
            subtitle="Shopify ? Raw"
            statuses={validStatuses}
            selectedStatuses={config.ingestionAllowed}
            onToggle={(status) => handleToggle('ingestion', status)}
          />

          <ArrowConnector />

          {/* SKU */}
          <StageColumn
            title="SKU"
            subtitle="Raw ? SKU"
            statuses={validStatuses}
            selectedStatuses={config.skuAllowed}
            parentSelected={config.ingestionAllowed}
            onToggle={(status) => handleToggle('sku', status)}
          />

          <ArrowConnector />

          {/* Transfer */}
          <StageColumn
            title="Transfer"
            subtitle="Orders ? Shopify"
            statuses={validStatuses}
            selectedStatuses={config.transferAllowed}
            parentSelected={config.skuAllowed}
            onToggle={(status) => handleToggle('transfer', status)}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-start gap-6 mt-6 pt-4 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-info" />
            <span>Enabled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Circle className="h-3.5 w-3.5" />
            <span>Disabled</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-50">
            <Circle className="h-3.5 w-3.5" />
            <span>Blocked by parent</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
