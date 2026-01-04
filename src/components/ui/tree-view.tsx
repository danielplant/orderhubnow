'use client'

import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface TreeNode {
  id: string
  label: string
  children?: TreeNode[]
  data?: Record<string, unknown>
}

export interface TreeViewProps {
  nodes: TreeNode[]
  onNodeClick?: (node: TreeNode) => void
  renderNode?: (node: TreeNode, depth: number) => React.ReactNode
  draggable?: boolean
  onReorder?: (parentId: string | null, orderedIds: string[]) => void
  className?: string
}

type DragPayload = { parentId: string | null; draggedId: string }

function collectChildrenIds(nodes: TreeNode[]): string[] {
  return nodes.map((n) => n.id)
}

export function TreeView({
  nodes,
  onNodeClick,
  renderNode,
  draggable,
  onReorder,
  className,
}: TreeViewProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const rootIds = useMemo(() => collectChildrenIds(nodes), [nodes])

  function toggle(id: string) {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function renderList(list: TreeNode[], depth: number, parentId: string | null) {
    return (
      <ul className={cn('flex flex-col gap-0.5', depth === 0 ? '' : 'ml-6 border-l border-border pl-2')}>
        {list.map((node) => {
          const hasChildren = !!node.children?.length
          const isOpen = open[node.id] ?? true

          return (
            <li key={node.id}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5',
                  'hover:bg-muted motion-fast',
                  draggable ? 'cursor-grab' : '',
                  dragOverId === node.id ? 'bg-muted' : ''
                )}
                draggable={!!draggable}
                onDragStart={(e) => {
                  if (!draggable) return
                  const payload: DragPayload = { parentId, draggedId: node.id }
                  e.dataTransfer.setData('application/json', JSON.stringify(payload))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  if (!draggable) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverId(node.id)
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => {
                  if (!draggable || !onReorder) return
                  e.preventDefault()
                  setDragOverId(null)
                  const raw = e.dataTransfer.getData('application/json')
                  if (!raw) return
                  const payload = JSON.parse(raw) as DragPayload
                  if (payload.parentId !== parentId) return
                  if (payload.draggedId === node.id) return

                  const current = parentId === null ? rootIds : collectChildrenIds(list)
                  const without = current.filter((id) => id !== payload.draggedId)
                  const targetIdx = without.indexOf(node.id)
                  const next = [
                    ...without.slice(0, targetIdx),
                    payload.draggedId,
                    ...without.slice(targetIdx),
                  ]

                  onReorder(parentId, next)
                }}
              >
                {hasChildren ? (
                  <button
                    type="button"
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(node.id)
                    }}
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <span className="h-6 w-6" />
                )}

                <div
                  className="flex-1"
                  onClick={() => onNodeClick?.(node)}
                >
                  {renderNode ? renderNode(node, depth) : (
                    <span className="text-sm text-foreground">{node.label}</span>
                  )}
                </div>
              </div>

              {hasChildren && isOpen ? renderList(node.children!, depth + 1, node.id) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return <div className={cn('w-full', className)}>{renderList(nodes, 0, null)}</div>
}
