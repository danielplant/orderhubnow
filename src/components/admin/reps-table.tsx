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
import type { RepWithLogin, UserStatus } from '@/lib/types/rep'
import {
  createRep,
  updateRep,
  deleteRep,
  resendInvite,
  forcePasswordReset,
  disableRep,
  enableRep,
  getInviteLink,
} from '@/lib/data/actions/reps'
import {
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Mail,
  Link2,
  ShieldOff,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface RepsTableProps {
  items: RepWithLogin[]
}

type ModalMode = 'add' | 'edit' | 'delete' | 'invite-success' | null

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: UserStatus }) {
  const config: Record<UserStatus, { label: string; className: string }> = {
    invited: {
      label: 'Invited',
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    active: {
      label: 'Active',
      className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    legacy: {
      label: 'Needs Reset',
      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    },
    disabled: {
      label: 'Disabled',
      className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    },
  }

  const c = config[status] ?? { label: status, className: 'bg-gray-100 text-gray-500' }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  )
}

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
  })

  // Invite success state
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null)
  const [copySuccess, setCopySuccess] = React.useState(false)

  const openModal = (mode: ModalMode, rep?: RepWithLogin) => {
    setModalMode(mode)
    setSelectedRep(rep ?? null)
    setError(null)
    setInviteUrl(null)
    setCopySuccess(false)

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
      })
    }
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedRep(null)
    setError(null)
    setInviteUrl(null)
    setCopySuccess(false)
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
        })
        if (!result.success) {
          setError(result.error ?? 'Failed to add rep')
          return
        }
        // Show success modal with invite URL
        setInviteUrl(result.inviteUrl ?? null)
        setModalMode('invite-success')
        router.refresh()
        return
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

  const handleAction = React.useCallback(
    async (
      action: 'resend' | 'reset' | 'disable' | 'enable' | 'copyLink',
      rep: RepWithLogin
    ) => {
      if (!rep.userId) return

      setIsSubmitting(true)
      setError(null)

      try {
        let result: { success: boolean; inviteUrl?: string; resetUrl?: string; error?: string }

        switch (action) {
          case 'resend':
            result = await resendInvite(rep.userId)
            break
          case 'reset':
            result = await forcePasswordReset(rep.userId)
            break
          case 'disable':
            result = await disableRep(rep.userId)
            break
          case 'enable':
            result = await enableRep(rep.userId)
            break
          case 'copyLink':
            result = await getInviteLink(rep.userId)
            if (result.success && result.inviteUrl) {
              await navigator.clipboard.writeText(result.inviteUrl)
            }
            break
          default:
            return
        }

        if (!result.success) {
          setError(result.error ?? 'Action failed')
          return
        }

        // Show success with invite URL if available
        if ((action === 'resend' || action === 'enable') && result.inviteUrl) {
          setSelectedRep(rep)
          setInviteUrl(result.inviteUrl)
          setModalMode('invite-success')
        } else if (action === 'reset' && result.resetUrl) {
          setSelectedRep(rep)
          setInviteUrl(result.resetUrl)
          setModalMode('invite-success')
        }

        router.refresh()
      } finally {
        setIsSubmitting(false)
      }
    },
    [router]
  )

  const copyToClipboard = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = inviteUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
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
        id: 'status',
        header: 'Status',
        cell: (r) => <StatusBadge status={r.status} />,
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
        cell: (r) => <span className="text-sm">{r.country || '—'}</span>,
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

              {/* Status-specific actions */}
              {r.status === 'invited' && (
                <>
                  <DropdownMenuItem onClick={() => handleAction('resend', r)}>
                    <Mail className="h-4 w-4 mr-2" />
                    Resend Invite
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAction('copyLink', r)}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Copy Invite Link
                  </DropdownMenuItem>
                </>
              )}

              {r.status === 'active' && (
                <DropdownMenuItem onClick={() => handleAction('reset', r)}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Force Password Reset
                </DropdownMenuItem>
              )}

              {r.status === 'legacy' && (
                <>
                  <DropdownMenuItem onClick={() => handleAction('resend', r)}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Reset Link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAction('copyLink', r)}>
                    <Link2 className="h-4 w-4 mr-2" />
                    Copy Reset Link
                  </DropdownMenuItem>
                </>
              )}

              {r.status === 'disabled' && (
                <DropdownMenuItem onClick={() => handleAction('enable', r)}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Enable Account
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onClick={() => router.push(`/admin/orders?rep=${encodeURIComponent(r.name)}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Orders
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {(r.status === 'active' || r.status === 'invited' || r.status === 'legacy') && (
                <DropdownMenuItem
                  onClick={() => handleAction('disable', r)}
                  className="text-destructive"
                >
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Disable Account
                </DropdownMenuItem>
              )}

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
    [router, handleAction]
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

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

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
            {modalMode === 'add' && (
              <p className="text-sm text-muted-foreground">
                An invite email will be sent to set up their password.
              </p>
            )}

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
              <label className="block text-sm font-medium mb-1">Email *</label>
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting
                  ? 'Saving...'
                  : modalMode === 'add'
                    ? 'Add Rep & Send Invite'
                    : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Success Modal */}
      <Dialog open={modalMode === 'invite-success'} onOpenChange={closeModal}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Sent</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <p className="text-muted-foreground">
              An invite email has been sent to{' '}
              <strong>{selectedRep?.email1 || 'the rep'}</strong>.
            </p>

            {inviteUrl && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  If the email does not arrive, you can copy the invite link:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteUrl}
                    readOnly
                    className="flex-1 h-10 rounded-md border border-input bg-muted px-3 text-sm"
                  />
                  <Button variant="secondary" onClick={copyToClipboard}>
                    {copySuccess ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={closeModal}>Done</Button>
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
