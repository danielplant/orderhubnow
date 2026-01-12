'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { MapValueModal } from './map-value-modal'
import { Check, Clock, AlertCircle } from 'lucide-react'
import type {
  ShopifyValueMappingWithCollection,
  CollectionWithCount,
  MappingStats,
  MappingStatus,
} from '@/lib/types/collection'

interface ShopifyMappingTableProps {
  mappings: ShopifyValueMappingWithCollection[]
  collections: CollectionWithCount[]
  stats: MappingStats
}

type FilterTab = 'all' | MappingStatus

export function ShopifyMappingTable({
  mappings,
  collections,
  stats,
}: ShopifyMappingTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<FilterTab>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<ShopifyValueMappingWithCollection | null>(null)

  const filteredMappings =
    filter === 'all'
      ? mappings
      : mappings.filter((m) => m.status === filter)

  function handleMap(mapping: ShopifyValueMappingWithCollection) {
    setSelectedMapping(mapping)
    setModalOpen(true)
  }

  function handleModalClose() {
    setModalOpen(false)
    setSelectedMapping(null)
  }

  function handleModalSave() {
    setModalOpen(false)
    setSelectedMapping(null)
    router.refresh()
  }

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'unmapped', label: 'Unmapped', count: stats.unmapped },
    { id: 'mapped', label: 'Mapped', count: stats.mapped },
    { id: 'deferred', label: 'Deferred', count: stats.deferred },
  ]

  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden">
      {/* Filter Tabs */}
      <div className="flex gap-1 p-2 bg-muted/30 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            <span className="ml-2 text-xs opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">
                SKUs
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Raw Shopify Value
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-48">
                Collection
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredMappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No {filter === 'all' ? '' : filter} mappings found
                </td>
              </tr>
            ) : (
              filteredMappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span
                      className={`font-bold text-sm ${
                        mapping.status === 'unmapped' && mapping.skuCount >= 50
                          ? 'text-destructive'
                          : ''
                      }`}
                    >
                      {mapping.skuCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono max-w-md truncate block">
                      {mapping.rawValue}
                    </code>
                    {mapping.note && (
                      <div className="text-xs text-muted-foreground mt-1 italic">
                        Note: {mapping.note}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={mapping.status} />
                  </td>
                  <td className="px-4 py-3">
                    {mapping.collection ? (
                      <span className="text-sm">{mapping.collection.name}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={mapping.status === 'mapped' ? 'ghost' : 'secondary'}
                      onClick={() => handleMap(mapping)}
                      disabled={isPending}
                    >
                      {mapping.status === 'mapped' ? 'Change' : 'Map'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Map Modal */}
      <MapValueModal
        open={modalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        mapping={selectedMapping}
        collections={collections}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: MappingStatus }) {
  switch (status) {
    case 'mapped':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs font-medium rounded">
          <Check className="h-3 w-3" />
          Mapped
        </span>
      )
    case 'unmapped':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs font-medium rounded">
          <AlertCircle className="h-3 w-3" />
          Unmapped
        </span>
      )
    case 'deferred':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs font-medium rounded">
          <Clock className="h-3 w-3" />
          Deferred
        </span>
      )
  }
}
