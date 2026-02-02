'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, type DataTableColumn, Button, SearchInput, FilterPill } from '@/components/ui'
import { useTableSearch } from '@/lib/hooks'
import { InlineEdit } from '@/components/ui/inline-edit'
import { FilterChips, type FilterChip } from '@/components/admin/filter-chips'
import type { InventoryListItem, InventorySortField, SortDirection, InventoryFacets } from '@/lib/data/queries/inventory'
import { updateInventoryQuantity, updateInventoryOnRoute } from '@/lib/data/actions/inventory'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/format'
import { AlertTriangle } from 'lucide-react'
import type { AvailabilitySettingsRecord } from '@/lib/types/availability-settings'
import { AVAILABILITY_LEGEND_TEXT } from '@/lib/availability/settings'

// ============================================================================
// Types
// ============================================================================

export interface InventoryTableProps {
  initialItems: InventoryListItem[]
  total: number
  statusCounts: { all: number; low: number; out: number; onroute: number }
  lowThreshold: number
  facets: InventoryFacets
  sortBy?: InventorySortField
  sortDir?: SortDirection
  availabilitySettings?: AvailabilitySettingsRecord
}

// ============================================================================
// Constants
// ============================================================================

const TABS = [
  { label: 'All', value: 'all' },
  { label: 'Low Stock', value: 'low' },
  { label: 'Out of Stock', value: 'out' },
  { label: 'On Route', value: 'onroute' },
] as const

// ============================================================================
// Component
// ============================================================================

export function InventoryTable({
  initialItems,
  total,
  statusCounts,
  lowThreshold,
  facets,
  sortBy,
  sortDir = 'asc',
  availabilitySettings,
}: InventoryTableProps) {
  // Use shared table search hook
  const { q, page, pageSize, setParam, setPage, setSort, getParam } = useTableSearch()
  const router = useRouter()

  const onRouteEnabled = availabilitySettings?.showOnRouteInventory ?? true
  const onRouteLabel = availabilitySettings?.onRouteLabelInventory ?? 'On Route'

  const availableLabel = React.useMemo(() => {
    if (!availabilitySettings) return 'Available'
    const types = initialItems
      .map((item) => item.collectionType)
      .filter(Boolean) as Array<'ATS' | 'PreOrder'>
    const uniqueTypes = new Set(types)
    if (uniqueTypes.size === 1) {
      const onlyType = Array.from(uniqueTypes)[0]
      if (onlyType === 'PreOrder') {
        return availabilitySettings.matrix.preorder_incoming.admin_inventory.label
      }
      if (onlyType === 'ATS') {
        return availabilitySettings.matrix.ats.admin_inventory.label
      }
    }
    return availabilitySettings.matrix.ats.admin_inventory.label
  }, [availabilitySettings, initialItems])

  const tabs = React.useMemo(
    () => (onRouteEnabled ? TABS : TABS.filter((t) => t.value !== 'onroute')),
    [onRouteEnabled]
  )

  // Parse additional filter state from URL
  const status = (getParam('status') || 'all') as (typeof TABS)[number]['value']
  const collectionId = getParam('collectionId') || ''
  const color = getParam('color') || ''
  const fabric = getParam('fabric') || ''
  const size = getParam('size') || ''

  // Handle sort change with custom field name
  const handleSortChange = React.useCallback(
    (newSort: { columnId: string; direction: 'asc' | 'desc' }) => {
      setSort(newSort)
    },
    [setSort]
  )

  // Clear all filters
  const clearAllFilters = React.useCallback(() => {
    router.push('/admin/inventory', { scroll: false })
  }, [router])

  // Find collection name for display in filter chips
  const getCollectionName = React.useCallback(
    (id: string) => facets.collections.find((c) => c.value === id)?.label ?? id,
    [facets.collections]
  )

  // Build filter chips
  const filterChips = React.useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = []
    if (collectionId) {
      chips.push({
        key: 'collection',
        label: 'Collection',
        value: getCollectionName(collectionId),
        onRemove: () => setParam('collectionId', null),
      })
    }
    if (color) {
      chips.push({
        key: 'color',
        label: 'Color',
        value: color,
        onRemove: () => setParam('color', null),
      })
    }
    if (fabric) {
      chips.push({
        key: 'fabric',
        label: 'Fabric',
        value: fabric.length > 20 ? fabric.slice(0, 20) + '...' : fabric,
        onRemove: () => setParam('fabric', null),
      })
    }
    if (size) {
      chips.push({
        key: 'size',
        label: 'Size',
        value: size,
        onRemove: () => setParam('size', null),
      })
    }
    if (q) {
      chips.push({
        key: 'search',
        label: 'Search',
        value: q,
        onRemove: () => setParam('q', null),
      })
    }
    return chips
  }, [collectionId, color, fabric, size, q, setParam, getCollectionName])

  // Table columns - IDs match sort field names for sortable columns
  const columns = React.useMemo<Array<DataTableColumn<InventoryListItem>>>(
    () => {
      const cols: Array<DataTableColumn<InventoryListItem>> = [
      {
        id: 'sku', // Matches InventorySortField
        header: 'SKU',
        sortable: true,
        cell: (r) => <span className="font-medium font-mono text-sm">{r.skuId}</span>,
      },
      {
        id: 'description',
        header: 'Description',
        cell: (r) => (
          <span className="text-muted-foreground max-w-xs truncate block">
            {r.description ?? '—'}
          </span>
        ),
      },
      {
        id: 'collection',
        header: 'Collection',
        cell: (r) => (
          <span className="text-sm text-muted-foreground truncate block max-w-[120px]">
            {r.collection ?? '—'}
          </span>
        ),
      },
      {
        id: 'qty', // Matches InventorySortField
        header: (
          <div className="flex items-center gap-1">
            <span>{availableLabel}</span>
            <span className="text-xs text-muted-foreground" title={AVAILABILITY_LEGEND_TEXT}>ⓘ</span>
          </div>
        ),
        sortable: true,
        cell: (r) => (
          <div className="flex items-center gap-2">
            <InlineEdit
              value={r.quantity}
              displayValue={r.availableDisplay}
              type="number"
              disabled={r.availabilityScenario !== 'ats'}
              placeholder=""
              onSave={async (v) => {
                const n = Number(v)
                if (!Number.isFinite(n) || n < 0) throw new Error('Invalid quantity')
                const result = await updateInventoryQuantity({ skuId: r.skuId, newQuantity: n })
                if (!result.success) throw new Error(result.error)
                router.refresh()
              }}
            />
            {r.availabilityScenario === 'ats' && r.isLowStock && (
              <AlertTriangle className="h-4 w-4 text-warning" aria-label="Low stock" />
            )}
          </div>
        ),
      },
      ...(onRouteEnabled
        ? [
            {
              id: 'onRoute',
              header: onRouteLabel,
              sortable: true,
              cell: (r: InventoryListItem) => (
                <InlineEdit
                  value={r.onRoute}
                  type="number"
                  onSave={async (v) => {
                    const n = Number(v)
                    if (!Number.isFinite(n) || n < 0) throw new Error('Invalid on-route')
                    const result = await updateInventoryOnRoute({ skuId: r.skuId, onRoute: n })
                    if (!result.success) throw new Error(result.error)
                    router.refresh()
                  }}
                />
              ),
            },
          ]
        : []),
      {
        id: 'effectiveQuantity',
        header: 'Effective',
        cell: (r) => (
          <span
            className={cn(
              r.isOutOfStock
                ? 'text-muted-foreground'
                : r.isLowStock
                  ? 'text-warning'
                  : 'text-foreground'
            )}
          >
            {r.effectiveQuantity}
            {r.prepackMultiplier !== 1 && (
              <span className="text-muted-foreground ml-1">(×{r.prepackMultiplier})</span>
            )}
          </span>
        ),
      },
      {
        id: 'units',
        header: 'Units',
        cell: (r) => (
          <span
            className={cn(
              'text-sm tabular-nums',
              r.prepackMultiplier > 1 ? 'text-purple-600 font-medium' : 'text-muted-foreground'
            )}
          >
            {r.prepackMultiplier > 1 ? `${r.prepackMultiplier}pc` : '1'}
          </span>
        ),
      },
      {
        id: 'unitPrice',
        header: 'Unit Price',
        cell: (r) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {r.unitPriceCad != null
              ? `$${r.unitPriceCad.toFixed(2)}`
              : '—'}
          </span>
        ),
      },
      {
        id: 'lastUpdated',
        header: 'Last Updated',
        cell: (r) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(r.lastUpdated)}
          </span>
        ),
      },
      ]

      return cols
    },
    [router, availableLabel, onRouteEnabled, onRouteLabel]
  )

  return (
    <div className="space-y-4">
      {/* Tabs + Filters Container */}
      <div className="rounded-md border border-border bg-background">
        {/* Status Tabs */}
        <div className="flex gap-6 overflow-x-auto border-b border-border px-4">
          {tabs.map((t) => {
            const active = status === t.value
            const count = statusCounts[t.value]
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setParam('status', t.value === 'all' ? null : t.value)}
                className={cn(
                  'py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}{' '}
                <span className="text-muted-foreground font-normal">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 p-4 items-center">
          <SearchInput
            value={q}
            onValueChange={(v) => setParam('q', v || null)}
            placeholder="Search by SKU or description..."
            className="h-10 w-full max-w-xs"
          />

          {/* Filter Pills */}
          <FilterPill
            label="Collection"
            value={collectionId || null}
            options={facets.collections}
            onChange={(v) => setParam('collectionId', v)}
          />
          <FilterPill
            label="Color"
            value={color || null}
            options={facets.colors}
            onChange={(v) => setParam('color', v)}
          />
          <FilterPill
            label="Fabric"
            value={fabric || null}
            options={facets.fabrics}
            onChange={(v) => setParam('fabric', v)}
          />
          <FilterPill
            label="Size"
            value={size || null}
            options={facets.sizes}
            onChange={(v) => setParam('size', v)}
          />

          <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span>Low stock threshold: ≤{lowThreshold}</span>
            <Button variant="outline" size="sm" onClick={() => router.refresh()}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Filter Chips */}
        {filterChips.length > 0 && (
          <div className="px-4 pb-3">
            <FilterChips filters={filterChips} onClearAll={clearAllFilters} />
          </div>
        )}
      </div>

      {/* Data Table */}
      <DataTable
        data={initialItems}
        columns={columns}
        getRowId={(r) => r.id}
        enableRowSelection={false}
        pageSize={pageSize}
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={setPage}
        manualSorting
        sort={sortBy ? { columnId: sortBy, direction: sortDir } : null}
        onSortChange={handleSortChange}
      />
    </div>
  )
}
