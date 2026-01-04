'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn, focusRing } from '@/lib/utils'

type SortDirection = 'asc' | 'desc'

/**
 * Column definition for DataTable.
 * - `id`: Unique column identifier
 * - `header`: Column header content
 * - `cell`: Render function for cell content
 * - `sortValue`: Optional function to extract sortable value (enables sorting)
 */
export type DataTableColumn<T> = {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number | null | undefined
}

const dataTableVariants = cva('w-full border-collapse', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-base',
    },
    variant: {
      default: '',
      striped: '[&_tbody_tr:nth-child(odd)]:bg-muted/30',
    },
  },
  defaultVariants: {
    size: 'md',
    variant: 'default',
  },
})

export interface DataTableProps<T>
  extends React.HTMLAttributes<HTMLTableElement>,
    VariantProps<typeof dataTableVariants> {
  data: T[]
  columns: Array<DataTableColumn<T>>
  getRowId: (row: T) => string
  pageSize?: number
  enableRowSelection?: boolean
  /**
   * Callback when selection changes.
   * Note: Parent components should memoize this callback with useCallback
   * to prevent unnecessary re-renders.
   */
  onSelectionChange?: (selectedIds: string[]) => void
  
  // --- Manual/controlled pagination ---
  /** When true, pagination is controlled externally (server-side). Data is assumed pre-paged. */
  manualPagination?: boolean
  /** Current page number (1-indexed). Used when manualPagination is true. */
  page?: number
  /** Total number of rows across all pages. Used when manualPagination is true. */
  totalCount?: number
  /** Callback when page changes. Used when manualPagination is true. */
  onPageChange?: (page: number) => void
  
  // --- Manual/controlled sorting ---
  /** When true, sorting is controlled externally (server-side). Data is assumed pre-sorted. */
  manualSorting?: boolean
  /** Current sort state. Used when manualSorting is true. */
  sort?: { columnId: string; direction: SortDirection } | null
  /** Callback when sort changes. Used when manualSorting is true. */
  onSortChange?: (sort: { columnId: string; direction: SortDirection }) => void
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  pageSize = 25,
  enableRowSelection = true,
  onSelectionChange,
  // Manual pagination props
  manualPagination = false,
  page: controlledPage,
  totalCount,
  onPageChange,
  // Manual sorting props
  manualSorting = false,
  sort: controlledSort,
  onSortChange,
  size,
  variant,
  className,
  ...props
}: DataTableProps<T>) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [internalSort, setInternalSort] = React.useState<{ columnId: string; direction: SortDirection } | null>(null)
  const [internalPage, setInternalPage] = React.useState(1)

  // Use controlled or internal state
  const sort = manualSorting ? controlledSort ?? null : internalSort
  const page = manualPagination ? controlledPage ?? 1 : internalPage

  // Notify parent of selection changes
  React.useEffect(() => {
    onSelectionChange?.(selectedIds)
  }, [selectedIds, onSelectionChange])

  // Reset internal page when data changes (only for client-side pagination)
  React.useEffect(() => {
    if (!manualPagination) {
      setInternalPage(1)
    }
  }, [data, pageSize, internalSort, manualPagination])

  // Sort data (only for client-side sorting)
  const sorted = React.useMemo(() => {
    if (manualSorting) return data // Data is pre-sorted
    if (!sort) return data
    const col = columns.find((c) => c.id === sort.columnId)
    if (!col?.sortValue) return data

    const dir = sort.direction === 'asc' ? 1 : -1

    return [...data].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)

      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1

      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [data, columns, sort, manualSorting])

  // Pagination
  const totalItems = manualPagination ? (totalCount ?? data.length) : sorted.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  // For manual pagination, data is pre-paged, so use it directly
  const pageRows = manualPagination ? data : sorted.slice(start, start + pageSize)

  // Selection state
  const allVisibleSelected =
    enableRowSelection &&
    pageRows.length > 0 &&
    pageRows.every((r) => selectedIds.includes(getRowId(r)))

  const toggleAllVisible = () => {
    if (!enableRowSelection) return
    const visibleIds = pageRows.map(getRowId)
    setSelectedIds((prev) => {
      const prevSet = new Set(prev)
      const shouldClear = visibleIds.every((id) => prevSet.has(id))
      if (shouldClear) {
        visibleIds.forEach((id) => prevSet.delete(id))
      } else {
        visibleIds.forEach((id) => prevSet.add(id))
      }
      return Array.from(prevSet)
    })
  }

  const toggleOne = (id: string) => {
    if (!enableRowSelection) return
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onHeaderClick = (columnId: string) => {
    const col = columns.find((c) => c.id === columnId)
    // For manual sorting, allow click even without sortValue (parent handles it)
    if (!manualSorting && !col?.sortValue) return

    const newSort: { columnId: string; direction: SortDirection } =
      !sort || sort.columnId !== columnId
        ? { columnId, direction: 'desc' }
        : { columnId, direction: sort.direction === 'asc' ? 'desc' : 'asc' }

    if (manualSorting) {
      onSortChange?.(newSort)
    } else {
      setInternalSort(newSort)
    }
  }

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto rounded-md border border-border bg-background">
        <table
          className={cn(dataTableVariants({ size, variant }), className)}
          {...props}
        >
          <thead className="bg-muted/30">
            <tr className="border-b border-border">
              {enableRowSelection ? (
                <th className="w-10 p-3 px-4 text-left">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className={cn('h-[18px] w-[18px] cursor-pointer', focusRing)}
                    aria-label="Select all rows on this page"
                  />
                </th>
              ) : null}

              {columns.map((col) => {
                const isSorted = sort?.columnId === col.id
                const caret = isSorted ? (sort!.direction === 'desc' ? '▼' : '▲') : null
                // Column is sortable if: has sortValue (client-side) OR manualSorting is enabled
                const isSortable = col.sortValue || manualSorting

                return (
                  <th key={col.id} className="p-3 px-4 text-left text-sm font-semibold text-muted-foreground">
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => onHeaderClick(col.id)}
                        className={cn(
                          'inline-flex items-center gap-2 cursor-pointer select-none bg-transparent border-none hover:text-foreground',
                          focusRing
                        )}
                      >
                        <span>{col.header}</span>
                        {caret ? <span className="text-xs">{caret}</span> : null}
                      </button>
                    ) : (
                      <span>{col.header}</span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody>
            {pageRows.map((row) => {
              const id = getRowId(row)
              const checked = enableRowSelection && selectedIds.includes(id)

              return (
                <tr key={id} className="border-b border-border/50">
                  {enableRowSelection ? (
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOne(id)}
                        className={cn('h-[18px] w-[18px] cursor-pointer', focusRing)}
                        aria-label={`Select row ${id}`}
                      />
                    </td>
                  ) : null}

                  {columns.map((col) => (
                    <td key={col.id} className="p-4 px-4 align-middle">
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-sm text-muted-foreground">
          <div>
            Showing <span className="text-foreground">{totalItems === 0 ? 0 : start + 1}</span>–
            <span className="text-foreground">{Math.min(start + pageSize, totalItems)}</span> of{' '}
            <span className="text-foreground">{totalItems}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                'rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed',
                focusRing
              )}
              onClick={() => {
                const newPage = Math.max(1, safePage - 1)
                if (manualPagination) {
                  onPageChange?.(newPage)
                } else {
                  setInternalPage(newPage)
                }
              }}
              disabled={safePage <= 1}
            >
              Previous
            </button>
            <span>
              Page <span className="text-foreground">{safePage}</span> /{' '}
              <span className="text-foreground">{totalPages}</span>
            </span>
            <button
              type="button"
              className={cn(
                'rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed',
                focusRing
              )}
              onClick={() => {
                const newPage = Math.min(totalPages, safePage + 1)
                if (manualPagination) {
                  onPageChange?.(newPage)
                } else {
                  setInternalPage(newPage)
                }
              }}
              disabled={safePage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { dataTableVariants }
