import { getCategoryTree } from '@/lib/data/queries/categories'
import { CategoryTree } from '@/components/admin/category-tree'

export default async function CategoriesPage() {
  const categories = await getCategoryTree()

  return (
    <main className="p-10 bg-muted/30 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-4xl font-bold">Categories</h2>
      </div>

      <div className="bg-background rounded-md overflow-hidden border border-border">
        <CategoryTree categories={categories} />
      </div>
    </main>
  )
}
