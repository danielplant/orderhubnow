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
 * - `sortValue`: Optional function to extract sortable value (enables client-side sorting)
 * - `sortable`: Optional flag for manual/server-side sorting (if true, header is clickable)
 * - `minWidth`: Optional minimum width in pixels (default: 50)
 */
export type DataTableColumn<T> = {
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number | null | undefined
  sortable?: boolean
  minWidth?: number
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

  // --- Column resizing ---
  /** Enable column resizing via drag handles */
  enableColumnResizing?: boolean
  /** Controlled column widths (columnId -> width in px). Falls back to auto if not specified. */
  columnWidths?: Record<string, number>
  /** Callback when column width(s) change. Receives a record of columnId -> width updates. */
  onColumnWidthChange?: (updates: Record<string, number>) => void

  // --- Sticky header ---
  /** Enable sticky header that stays visible when scrolling. Requires maxHeight to be effective. */
  stickyHeader?: boolean
  /** Max height of the table body (e.g., "calc(100vh - 300px)" or "600px"). Enables vertical scrolling. */
  maxHeight?: string
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
  // Column resizing props
  enableColumnResizing = false,
  columnWidths,
  onColumnWidthChange,
  // Sticky header props
  stickyHeader = false,
  maxHeight,
  size,
  variant,
  className,
  ...props
}: DataTableProps<T>) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [internalSort, setInternalSort] = React.useState<{ columnId: string; direction: SortDirection } | null>(null)
  const [internalPage, setInternalPage] = React.useState(1)

  // Resizing state - tracks both left and right columns for linked resize
  const [resizing, setResizing] = React.useState<{
    leftColumnId: string
    rightColumnId: string | null // null if resizing last column
    startX: number
    leftStartWidth: number
    rightStartWidth: number
    leftMinWidth: number
    rightMinWidth: number
  } | null>(null)

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

  // Handle column resize mouse events (linked resize - Airtable-style)
  React.useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX

      // Calculate new widths for linked resize
      let leftNewWidth = resizing.leftStartWidth + delta
      let rightNewWidth = resizing.rightStartWidth - delta

      // Clamp left column to minWidth
      if (leftNewWidth < resizing.leftMinWidth) {
        leftNewWidth = resizing.leftMinWidth
        // Recalculate right width based on clamped left
        rightNewWidth = resizing.leftStartWidth + resizing.rightStartWidth - leftNewWidth
      }

      // Clamp right column to minWidth (if exists)
      if (resizing.rightColumnId && rightNewWidth < resizing.rightMinWidth) {
        rightNewWidth = resizing.rightMinWidth
        // Recalculate left width based on clamped right
        leftNewWidth = resizing.leftStartWidth + resizing.rightStartWidth - rightNewWidth
      }

      // Build updates object
      const updates: Record<string, number> = {
        [resizing.leftColumnId]: leftNewWidth,
      }
      if (resizing.rightColumnId) {
        updates[resizing.rightColumnId] = rightNewWidth
      }

      onColumnWidthChange?.(updates)
    }

    const handleMouseUp = () => {
      setResizing(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Add cursor style to body during resize
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing, onColumnWidthChange])

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
    // For manual sorting, require explicit sortable flag
    if (manualSorting && !col?.sortable) return
    // For client-side sorting, require sortValue function
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

  const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault()
    e.stopPropagation()

    // Find this column and its right neighbor for linked resize
    const colIndex = columns.findIndex((c) => c.id === columnId)
    const leftCol = columns[colIndex]
    const rightCol = columns[colIndex + 1] // may be undefined for last column

    const leftWidth = columnWidths?.[columnId] ?? 100
    const rightWidth = rightCol ? (columnWidths?.[rightCol.id] ?? 100) : 0

    setResizing({
      leftColumnId: columnId,
      rightColumnId: rightCol?.id ?? null,
      startX: e.clientX,
      leftStartWidth: leftWidth,
      rightStartWidth: rightWidth,
      leftMinWidth: leftCol?.minWidth ?? 50,
      rightMinWidth: rightCol?.minWidth ?? 50,
    })
  }

  return (
    <div className="w-full">
      <div
        className={cn(
          'w-full overflow-x-auto rounded-md border border-border bg-background',
          maxHeight && 'overflow-y-auto'
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          className={cn(
            dataTableVariants({ size, variant }),
            'relative',
            enableColumnResizing && 'table-fixed',
            className
          )}
          {...props}
        >
          <thead
            className={cn(
              'bg-muted/30',
              stickyHeader && 'sticky top-0 z-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)]'
            )}
          >
            <tr className="border-b border-border">
              {enableRowSelection ? (
                <th className="w-10 p-3 px-4 text-left bg-muted/30">
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
                // Column is sortable if: has sortValue (client-side) OR (manualSorting + sortable flag)
                const isSortable = col.sortValue || (manualSorting && col.sortable)
                const width = columnWidths?.[col.id]

                return (
                  <th
                    key={col.id}
                    className={cn(
                      'relative p-3 px-4 text-left text-sm font-semibold text-muted-foreground bg-muted/30',
                      enableColumnResizing && 'pr-2 overflow-hidden text-ellipsis whitespace-nowrap'
                    )}
                    style={width ? { width, minWidth: col.minWidth ?? 50 } : undefined}
                  >
                    <div className="flex items-center">
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
                    </div>

                    {/* Resize handle - wider hit area (12px) with centered visual indicator */}
                    {enableColumnResizing && (
                      <div
                        className={cn(
                          'absolute right-0 top-0 h-full w-3 cursor-col-resize group',
                          'hover:bg-primary/20 active:bg-primary/30',
                          resizing?.leftColumnId === col.id && 'bg-primary/30'
                        )}
                        onMouseDown={(e) => handleResizeStart(e, col.id)}
                      >
                        <div className="absolute right-0.5 top-1/4 h-1/2 w-[2px] rounded-full bg-border group-hover:bg-primary/50" />
                      </div>
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
                <tr key={id} className="border-b border-border/50 hover:bg-muted/20">
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

                  {columns.map((col) => {
                    const width = columnWidths?.[col.id]
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          "p-4 px-4 align-middle",
                          enableColumnResizing && "overflow-hidden text-ellipsis whitespace-nowrap"
                        )}
                        style={width ? { width, minWidth: col.minWidth ?? 50 } : undefined}
                      >
                        {col.cell(row)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3 border border-t-0 border-border rounded-b-md bg-background p-3 text-sm text-muted-foreground -mt-[1px]">
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
  )
}

export { dataTableVariants }
