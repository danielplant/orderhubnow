'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DataTable,
  type DataTableColumn,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  SearchInput,
} from '@/components/ui'
import type { Customer } from '@/lib/types/customer'
import type { CustomerSortField, SortDirection } from '@/lib/data/queries/customers'
import { createCustomer, updateCustomer, deleteCustomer } from '@/lib/data/actions/customers'
import {
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Download,
  Upload,
  CloudDownload,
} from 'lucide-react'
import { CustomerImportModal } from './customer-import-modal'
import { CustomerExcelImportModal } from './customer-excel-import-modal'

// ============================================================================
// Types
// ============================================================================

export interface CustomersTableProps {
  initialCustomers: Customer[]
  total: number
  reps: Array<{ id: number; name: string; code: string }>
  sortBy?: CustomerSortField
  sortDir?: SortDirection
}

type ModalMode = 'add' | 'edit' | 'delete' | null

// ============================================================================
// Component
// ============================================================================

export function CustomersTable({
  initialCustomers,
  total,
  reps,
  sortBy,
  sortDir = 'asc',
}: CustomersTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL params
  const q = searchParams.get('q') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '50')

  // Modal state
  const [modalMode, setModalMode] = React.useState<ModalMode>(null)
  const [selectedCustomer, setSelectedCustomer] = React.useState<Customer | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Import dropdown and modals
  const [showImportDropdown, setShowImportDropdown] = React.useState(false)
  const [showShopifyImport, setShowShopifyImport] = React.useState(false)
  const [showExcelImport, setShowExcelImport] = React.useState(false)

  // Form state - repId stores the selected rep's ID (as string)
  const [formData, setFormData] = React.useState({
    storeName: '',
    customerName: '',
    email: '',
    phone: '',
    repId: '',
    street1: '',
    street2: '',
    city: '',
    stateProvince: '',
    zipPostal: '',
    country: '',
    website: '',
  })

  // Helper to find rep by code first, then by name (for pre-selection in edit mode)
  const findRepByCodeOrName = React.useCallback(
    (repValue: string | null): string => {
      if (!repValue) return ''
      const lower = repValue.toLowerCase()
      // Try matching by code first
      const byCode = reps.find((r) => r.code.toLowerCase() === lower)
      if (byCode) return String(byCode.id)
      // Try matching by name
      const byName = reps.find((r) => r.name.toLowerCase() === lower)
      if (byName) return String(byName.id)
      return ''
    },
    [reps]
  )

  // Build code-to-name lookup for display
  const codeToName = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const r of reps) {
      map.set(r.code.toLowerCase(), r.name)
      map.set(r.name.toLowerCase(), r.name) // Also map name->name for bad OHN data
    }
    return map
  }, [reps])

  // URL helpers
  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value) params.delete(key)
      else params.set(key, value)
      if (key !== 'page') params.delete('page')
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const setPageParam = React.useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(Math.max(1, nextPage)))
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  // Handle sort change - update URL params
  const handleSortChange = React.useCallback(
    (newSort: { columnId: string; direction: 'asc' | 'desc' }) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('sortBy', newSort.columnId)
      params.set('sortDir', newSort.direction)
      params.delete('page') // Reset pagination on sort change
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const openModal = (mode: ModalMode, customer?: Customer) => {
    setModalMode(mode)
    setSelectedCustomer(customer ?? null)
    setError(null)

    if (mode === 'edit' && customer) {
      setFormData({
        storeName: customer.storeName,
        customerName: customer.customerName ?? '',
        email: customer.email ?? '',
        phone: customer.phone ?? '',
        repId: findRepByCodeOrName(customer.rep),
        street1: customer.address.street1 ?? '',
        street2: customer.address.street2 ?? '',
        city: customer.address.city ?? '',
        stateProvince: customer.address.stateProvince ?? '',
        zipPostal: customer.address.zipPostal ?? '',
        country: customer.address.country ?? '',
        website: customer.website ?? '',
      })
    } else if (mode === 'add') {
      setFormData({
        storeName: '',
        customerName: '',
        email: '',
        phone: '',
        repId: '',
        street1: '',
        street2: '',
        city: '',
        stateProvince: '',
        zipPostal: '',
        country: 'CA',
        website: '',
      })
    }
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedCustomer(null)
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      if (modalMode === 'add') {
        const result = await createCustomer({
          storeName: formData.storeName,
          customerName: formData.customerName || null,
          email: formData.email || null,
          phone: formData.phone || null,
          repId: formData.repId || null,
          street1: formData.street1 || null,
          street2: formData.street2 || null,
          city: formData.city || null,
          stateProvince: formData.stateProvince || null,
          zipPostal: formData.zipPostal || null,
          country: formData.country || null,
          website: formData.website || null,
        })
        if (!result.success) {
          setError(result.error ?? 'Failed to add customer')
          return
        }
      } else if (modalMode === 'edit' && selectedCustomer) {
        const result = await updateCustomer(String(selectedCustomer.id), {
          storeName: formData.storeName,
          customerName: formData.customerName || null,
          email: formData.email || null,
          phone: formData.phone || null,
          repId: formData.repId || null,
          street1: formData.street1 || null,
          street2: formData.street2 || null,
          city: formData.city || null,
          stateProvince: formData.stateProvince || null,
          zipPostal: formData.zipPostal || null,
          country: formData.country || null,
          website: formData.website || null,
        })
        if (!result.success) {
          setError(result.error ?? 'Failed to update customer')
          return
        }
      } else if (modalMode === 'delete' && selectedCustomer) {
        const result = await deleteCustomer(String(selectedCustomer.id))
        if (!result.success) {
          setError(result.error ?? 'Failed to delete customer')
          return
        }
      }

      closeModal()
      router.refresh()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExport = () => {
    window.location.href = '/api/customers/export'
  }

  const columns = React.useMemo<Array<DataTableColumn<Customer>>>(
    () => [
      {
        id: 'storeName',
        header: 'Store Name',
        cell: (r) => <span className="font-medium">{r.storeName}</span>,
      },
      {
        id: 'customerName',
        header: 'Contact',
        cell: (r) => <span className="text-muted-foreground">{r.customerName || '—'}</span>,
      },
      {
        id: 'email',
        header: 'Email',
        cell: (r) => <span className="text-muted-foreground">{r.email || '—'}</span>,
      },
      {
        id: 'phone',
        header: 'Phone',
        cell: (r) => <span className="text-muted-foreground">{r.phone || '—'}</span>,
      },
      {
        id: 'rep',
        header: 'Rep',
        cell: (r) => {
          // Display rep name (looked up from code), fallback to raw value
          const displayName = r.rep ? (codeToName.get(r.rep.toLowerCase()) || r.rep) : null
          return <span className="text-muted-foreground">{displayName || '—'}</span>
        },
      },
      {
        id: 'country',
        header: 'Country',
        cell: (r) => {
          const country = r.address.country
          return (
            <span className="text-sm">
              {country === 'CA'
                ? '🇨🇦'
                : country === 'US'
                  ? '🇺🇸'
                  : country || '—'}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        cell: (r) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openModal('edit', r)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`/admin/orders?q=${encodeURIComponent(r.storeName)}`)
                }
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Orders
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => openModal('delete', r)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [router, codeToName, openModal]
  )

  return (
    <div className="space-y-4">
      {/* Filters + Actions */}
      <div className="rounded-md border border-border bg-background">
        <div className="flex flex-wrap gap-3 p-4 items-center">
          <SearchInput
            value={q}
            onValueChange={(v) => setParam('q', v || null)}
            placeholder="Search by store name, email, or rep..."
            className="h-10 w-full max-w-md"
          />

          <div className="ml-auto flex gap-2 items-center">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>

            {/* Import Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportDropdown(!showImportDropdown)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              {showImportDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 min-w-[180px]">
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-muted/50 flex items-center gap-2"
                    onClick={() => {
                      setShowImportDropdown(false)
                      setShowExcelImport(true)
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    From Excel
                  </button>
                  <button
                    className="w-full px-4 py-2 text-left text-sm hover:bg-muted/50 flex items-center gap-2 border-t border-border"
                    onClick={() => {
                      setShowImportDropdown(false)
                      setShowShopifyImport(true)
                    }}
                  >
                    <CloudDownload className="h-4 w-4" />
                    From Shopify
                  </button>
                </div>
              )}
            </div>

            <Button onClick={() => openModal('add')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={initialCustomers}
        columns={columns}
        getRowId={(r) => String(r.id)}
        enableRowSelection={false}
        pageSize={pageSize}
        manualPagination
        page={page}
        totalCount={total}
        onPageChange={setPageParam}
        manualSorting
        sort={sortBy ? { columnId: sortBy, direction: sortDir } : null}
        onSortChange={handleSortChange}
      />

      {/* Add/Edit Modal */}
      <Dialog open={modalMode === 'add' || modalMode === 'edit'} onOpenChange={closeModal}>
        <DialogContent className="bg-background sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'add' ? 'Add Customer' : 'Edit Customer'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Store Name *</label>
              <input
                type="text"
                value={formData.storeName}
                onChange={(e) => setFormData((f) => ({ ...f, storeName: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Name</label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData((f) => ({ ...f, customerName: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rep</label>
                <select
                  value={formData.repId}
                  onChange={(e) => setFormData((f) => ({ ...f, repId: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select rep...</option>
                  {reps.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-2">
              <h4 className="font-medium mb-3">Address</h4>
              <div className="grid gap-3">
                <input
                  type="text"
                  placeholder="Street 1"
                  value={formData.street1}
                  onChange={(e) => setFormData((f) => ({ ...f, street1: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <input
                  type="text"
                  placeholder="Street 2"
                  value={formData.street2}
                  onChange={(e) => setFormData((f) => ({ ...f, street2: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="City"
                    value={formData.city}
                    onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    type="text"
                    placeholder="State/Province"
                    value={formData.stateProvince}
                    onChange={(e) => setFormData((f) => ({ ...f, stateProvince: e.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <input
                    type="text"
                    placeholder="Zip/Postal"
                    value={formData.zipPostal}
                    onChange={(e) => setFormData((f) => ({ ...f, zipPostal: e.target.value }))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <select
                  value={formData.country}
                  onChange={(e) => setFormData((f) => ({ ...f, country: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Select country...</option>
                  <option value="CA">Canada</option>
                  <option value="US">United States</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Website</label>
              <input
                type="url"
                value={formData.website}
                onChange={(e) => setFormData((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://..."
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting
                  ? 'Saving...'
                  : modalMode === 'add'
                    ? 'Add Customer'
                    : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={modalMode === 'delete'} onOpenChange={closeModal}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
          </DialogHeader>

          <p className="text-muted-foreground mt-2">
            Are you sure you want to delete <strong>{selectedCustomer?.storeName}</strong>? This
            action cannot be undone.
          </p>

          {error && <p className="text-sm text-destructive mt-2">{error}</p>}

          <div className="flex gap-2 justify-end mt-4">
            <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shopify Import Modal */}
      <CustomerImportModal
        open={showShopifyImport}
        onOpenChange={setShowShopifyImport}
        onComplete={() => router.refresh()}
      />

      {/* Excel Import Modal */}
      <CustomerExcelImportModal
        open={showExcelImport}
        onOpenChange={setShowExcelImport}
        onComplete={() => router.refresh()}
      />
    </div>
  )
}
