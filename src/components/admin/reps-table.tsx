'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
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
} from '@/components/ui'
import type { RepWithLogin } from '@/lib/types/rep'
import { createRep, updateRep, updateRepPassword, deleteRep } from '@/lib/data/actions/reps'
import { MoreHorizontal, Plus, Pencil, Key, Trash2, ExternalLink } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface RepsTableProps {
  items: RepWithLogin[]
}

type ModalMode = 'add' | 'edit' | 'password' | 'delete' | null

// ============================================================================
// Component
// ============================================================================

export function RepsTable({ items }: RepsTableProps) {
  const router = useRouter()

  const [modalMode, setModalMode] = React.useState<ModalMode>(null)
  const [selectedRep, setSelectedRep] = React.useState<RepWithLogin | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Form state for add/edit
  const [formData, setFormData] = React.useState({
    name: '',
    code: '',
    email1: '',
    email2: '',
    email3: '',
    phone: '',
    cell: '',
    fax: '',
    address: '',
    country: '',
    password: '',
  })

  // Password form state
  const [newPassword, setNewPassword] = React.useState('')

  const openModal = (mode: ModalMode, rep?: RepWithLogin) => {
    setModalMode(mode)
    setSelectedRep(rep ?? null)
    setError(null)

    if (mode === 'edit' && rep) {
      setFormData({
        name: rep.name,
        code: rep.code,
        email1: rep.email1,
        email2: rep.email2,
        email3: rep.email3,
        phone: rep.phone,
        cell: rep.cell,
        fax: rep.fax,
        address: rep.address,
        country: rep.country,
        password: '',
      })
    } else if (mode === 'add') {
      setFormData({
        name: '',
        code: '',
        email1: '',
        email2: '',
        email3: '',
        phone: '',
        cell: '',
        fax: '',
        address: '',
        country: 'CA',
        password: '',
      })
    } else if (mode === 'password') {
      setNewPassword('')
    }
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedRep(null)
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    setIsSubmitting(true)

    try {
      if (modalMode === 'add') {
        const result = await createRep({
          name: formData.name,
          code: formData.code,
          email1: formData.email1,
          email2: formData.email2,
          email3: formData.email3,
          phone: formData.phone,
          cell: formData.cell,
          fax: formData.fax,
          address: formData.address,
          country: formData.country,
          password: formData.password,
        })
        if (!result.success) {
          setError(result.error ?? 'Failed to add rep')
          return
        }
      } else if (modalMode === 'edit' && selectedRep) {
        const result = await updateRep(String(selectedRep.id), {
          name: formData.name,
          code: formData.code,
          email1: formData.email1,
          email2: formData.email2,
          email3: formData.email3,
          phone: formData.phone,
          cell: formData.cell,
          fax: formData.fax,
          address: formData.address,
          country: formData.country,
        })
        if (!result.success) {
          setError(result.error ?? 'Failed to update rep')
          return
        }
      } else if (modalMode === 'password' && selectedRep) {
        const result = await updateRepPassword({
          repId: String(selectedRep.id),
          newPassword,
        })
        if (!result.success) {
          setError(result.error ?? 'Failed to update password')
          return
        }
      } else if (modalMode === 'delete' && selectedRep) {
        const result = await deleteRep(String(selectedRep.id))
        if (!result.success) {
          setError(result.error ?? 'Failed to delete rep')
          return
        }
      }

      closeModal()
      router.refresh()
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns = React.useMemo<Array<DataTableColumn<RepWithLogin>>>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: (r) => <span className="font-medium">{r.name}</span>,
      },
      {
        id: 'code',
        header: 'Code',
        cell: (r) => <span className="font-mono text-sm">{r.code}</span>,
      },
      {
        id: 'email1',
        header: 'Email',
        cell: (r) => <span className="text-muted-foreground">{r.email1}</span>,
      },
      {
        id: 'phone',
        header: 'Phone',
        cell: (r) => <span className="text-muted-foreground">{r.phone || '—'}</span>,
      },
      {
        id: 'country',
        header: 'Country',
        cell: (r) => (
          <span className="text-sm">
            {r.country === 'CA' ? '🇨🇦' : r.country === 'US' ? '🇺🇸' : r.country || '—'}
          </span>
        ),
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
              <DropdownMenuItem onClick={() => openModal('password', r)}>
                <Key className="h-4 w-4 mr-2" />
                Update Password
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/admin/orders?rep=${encodeURIComponent(r.name)}`)}
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
    [router]
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-end">
        <Button onClick={() => openModal('add')}>
          <Plus className="h-4 w-4 mr-2" />
          Add Rep
        </Button>
      </div>

      {/* Table */}
      <DataTable
        data={items}
        columns={columns}
        getRowId={(r) => String(r.id)}
        enableRowSelection={false}
        pageSize={50}
      />

      {/* Add/Edit Modal */}
      <Dialog open={modalMode === 'add' || modalMode === 'edit'} onOpenChange={closeModal}>
        <DialogContent className="bg-background sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modalMode === 'add' ? 'Add Rep' : 'Edit Rep'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Code *</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData((f) => ({ ...f, code: e.target.value }))}
                  placeholder="e.g., JS"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email 1 *</label>
              <input
                type="email"
                value={formData.email1}
                onChange={(e) => setFormData((f) => ({ ...f, email1: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email 2</label>
                <input
                  type="email"
                  value={formData.email2}
                  onChange={(e) => setFormData((f) => ({ ...f, email2: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email 3</label>
                <input
                  type="email"
                  value={formData.email3}
                  onChange={(e) => setFormData((f) => ({ ...f, email3: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
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
                <label className="block text-sm font-medium mb-1">Cell</label>
                <input
                  type="tel"
                  value={formData.cell}
                  onChange={(e) => setFormData((f) => ({ ...f, cell: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fax</label>
                <input
                  type="tel"
                  value={formData.fax}
                  onChange={(e) => setFormData((f) => ({ ...f, fax: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Country *</label>
              <select
                value={formData.country}
                onChange={(e) => setFormData((f) => ({ ...f, country: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="CA">Canada</option>
                <option value="US">United States</option>
                <option value="BOTH">Both</option>
              </select>
            </div>

            {modalMode === 'add' && (
              <div>
                <label className="block text-sm font-medium mb-1">Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : modalMode === 'add' ? 'Add Rep' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Modal */}
      <Dialog open={modalMode === 'password'} onOpenChange={closeModal}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Password — {selectedRep?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={modalMode === 'delete'} onOpenChange={closeModal}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Rep</DialogTitle>
          </DialogHeader>

          <p className="text-muted-foreground mt-2">
            Are you sure you want to delete <strong>{selectedRep?.name}</strong>? This will also
            remove their login credentials. This action cannot be undone.
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
    </div>
  )
}
