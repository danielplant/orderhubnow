"use client"

import { useState, useCallback } from "react"
import { ProductOrderCard } from "@/components/buyer/product-order-card"
import { CollectionFilterBar } from "@/components/buyer/collection-filter-bar"
import type { Product } from "@/lib/types/inventory"

interface CollectionProductsGridProps {
  products: Product[]
  isPreOrder?: boolean
}

export function CollectionProductsGrid({ products, isPreOrder = false }: CollectionProductsGridProps) {
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(products)

  const handleFilteredChange = useCallback((filtered: Product[]) => {
    setFilteredProducts(filtered)
  }, [])

  return (
    <>
      {/* Filter Bar */}
      <CollectionFilterBar 
        products={products} 
        onFilteredChange={handleFilteredChange} 
      />

      {/* Products Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <ProductOrderCard 
              key={product.id} 
              product={product} 
              isPreOrder={isPreOrder}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">
            No products match your filters.
          </p>
        </div>
      )}
    </>
  )
}
