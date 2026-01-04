'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MainCategory, SubCategory, CategoryWithProducts } from '@/lib/types'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TreeView,
  type TreeNode,
  InlineEdit,
} from '@/components/ui'
import {
  createMainCategory,
  createSubCategory,
  deleteMainCategory,
  deleteSubCategory,
  removeSubCategoryFromMain,
  reorderCategories,
  updateMainCategory,
  updateSubCategory,
} from '@/lib/data/actions/categories'
import { CategoryImageModal } from './category-image-modal'
import { ProductOrderModal } from './product-order-modal'
import { MoreHorizontal, Plus, ImageIcon, ListOrdered, Trash2, Unlink } from 'lucide-react'

export interface CategoryTreeProps {
  categories: MainCategory[]
}

export function CategoryTree({ categories }: CategoryTreeProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [imageModal, setImageModal] = useState<SubCategory | null>(null)
  const [orderModal, setOrderModal] = useState<CategoryWithProducts | null>(null)
  const [loadingProducts, setLoadingProducts] = useState(false)

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleOpenProductOrder(sub: SubCategory) {
    setLoadingProducts(true)
    try {
      const res = await fetch(`/api/categories/${sub.id}/products`)
      if (res.ok) {
        const full = await res.json()
        setOrderModal(full)
      }
    } finally {
      setLoadingProducts(false)
    }
  }

  const nodes: TreeNode[] = useMemo(() => {
    return categories.map((main) => ({
      id: String(main.id),
      label: main.name,
      data: { type: 'main', main },
      children: main.subCategories.map((sub) => ({
        id: `sub:${sub.id}:main:${main.id}`,
        label: sub.name,
        data: { type: 'sub', sub, main },
      })),
    }))
  }, [categories])

  async function handleCreateMainCategory() {
    const result = await createMainCategory('New Main Category')
    if (result.success) refresh()
  }

  async function handleCreateSubCategory(mainId: number) {
    const result = await createSubCategory(String(mainId), 'New Subcategory')
    if (result.success) refresh()
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-foreground">Categories</h2>
        <Button onClick={() => void handleCreateMainCategory()} disabled={isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add Main Category
        </Button>
      </div>

      <div className="p-4">
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No categories yet. Click &quot;Add Main Category&quot; to create one.
          </p>
        ) : (
          <TreeView
            nodes={nodes}
            draggable
            onReorder={(parentId, orderedIds) => {
              if (parentId === null) {
                // Reorder main categories
                void reorderCategories('main', orderedIds).then(() => refresh())
                return
              }

              // parentId is main category id, orderedIds contain composite ids for sub nodes.
              // Convert composite ids back to category Int ids.
              const subIds = orderedIds
                .map((x) => {
                  const match = x.match(/^sub:(\d+):/)
                  return match ? match[1] : null
                })
                .filter((x): x is string => x !== null)

              void reorderCategories('sub', subIds).then(() => refresh())
            }}
            renderNode={(node, depth) => {
              const data = node.data as { type: string; main?: MainCategory; sub?: SubCategory }

              if (data?.type === 'main' && data.main) {
                const main = data.main

                return (
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <InlineEdit
                        value={main.name}
                        type="text"
                        onSave={async (v) => {
                          await updateMainCategory(String(main.id), v)
                          refresh()
                        }}
                      />
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        ({main.subCategories.length} subs)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleCreateSubCategory(main.id)
                        }}
                        disabled={isPending}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Sub
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label="Main category actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-background">
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete "${main.name}"? This removes all subcategory relationships under it.`
                                )
                              ) {
                                void deleteMainCategory(String(main.id)).then(() => refresh())
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              }

              if (data?.type === 'sub' && data.sub) {
                const sub = data.sub

                return (
                  <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex flex-col flex-1 min-w-0">
                      <InlineEdit
                        value={sub.name}
                        type="text"
                        onSave={async (v) => {
                          await updateSubCategory(String(sub.id), { name: v })
                          refresh()
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Sort: {sub.sortOrder}</span>
                        <span>Products: {sub.productCount}</span>
                        <span
                          className={sub.isPreOrder ? 'text-preorder' : ''}
                        >
                          PreOrder: {sub.isPreOrder ? 'Yes' : 'No'}
                        </span>
                        <span>
                          Shopify Images: {sub.useShopifyImages ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label="Subcategory actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-background">
                        <DropdownMenuItem
                          onClick={() => setImageModal(sub)}
                        >
                          <ImageIcon className="h-4 w-4 mr-2" />
                          Manage Images
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void handleOpenProductOrder(sub)}
                          disabled={loadingProducts}
                        >
                          <ListOrdered className="h-4 w-4 mr-2" />
                          {loadingProducts ? 'Loading...' : 'Reorder Products'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (confirm('Remove subcategory from this main category?')) {
                              void removeSubCategoryFromMain(
                                String(sub.mainCategoryId),
                                String(sub.id)
                              ).then(() => refresh())
                            }
                          }}
                        >
                          <Unlink className="h-4 w-4 mr-2" />
                          Remove from Main
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (
                              confirm(
                                `Delete "${sub.name}" globally? This will fail if products are assigned.`
                              )
                            ) {
                              void deleteSubCategory(String(sub.id)).then((res) => {
                                if (!res.success && res.error) {
                                  alert(res.error)
                                }
                                refresh()
                              })
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete (global)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              }

              return <span className="text-sm text-foreground">{node.label}</span>
            }}
          />
        )}
      </div>

      {imageModal ? (
        <CategoryImageModal
          category={imageModal}
          open={!!imageModal}
          onClose={() => setImageModal(null)}
          onImageUploaded={() => refresh()}
        />
      ) : null}

      {orderModal ? (
        <ProductOrderModal
          category={orderModal}
          open={!!orderModal}
          onClose={() => setOrderModal(null)}
          onSave={() => refresh()}
        />
      ) : null}
    </div>
  )
}
