"use client"

import { useState, useMemo, useEffect } from "react"
import { ChevronDown, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { normalizeProductType, normalizeColor, normalizeFabric, getFilterOptions } from "@/lib/filters/normalize"
import type { Product } from "@/lib/types/inventory"
import { cn } from "@/lib/utils"

interface CollectionFilterBarProps {
  products: Product[]
  onFilteredChange: (filtered: Product[]) => void
}

interface FilterState {
  category: string | null
  color: string | null
  fabric: string | null
  skuSearch: string
}

export function CollectionFilterBar({ products, onFilteredChange }: CollectionFilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    category: null,
    color: null,
    fabric: null,
    skuSearch: "",
  })

  // Extract unique normalized options from products
  const filterOptions = useMemo(() => {
    const categories = products.map(p => p.productType)
    const colors = products.map(p => p.color)
    const fabrics = products.map(p => p.fabric)
    
    return {
      categories: getFilterOptions(categories, normalizeProductType),
      colors: getFilterOptions(colors, normalizeColor),
      fabrics: getFilterOptions(fabrics, normalizeFabric),
    }
  }, [products])

  // Filter products based on current filter state
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // SKU search
      if (filters.skuSearch) {
        const search = filters.skuSearch.toLowerCase()
        const matchesSku = product.skuBase.toLowerCase().includes(search) ||
          product.variants.some(v => v.sku.toLowerCase().includes(search))
        if (!matchesSku) return false
      }

      // Category filter
      if (filters.category) {
        const normalizedCategory = normalizeProductType(product.productType)
        if (normalizedCategory !== filters.category) return false
      }

      // Color filter
      if (filters.color) {
        const normalizedColor = normalizeColor(product.color)
        if (normalizedColor !== filters.color) return false
      }

      // Fabric filter
      if (filters.fabric) {
        const normalizedFabric = normalizeFabric(product.fabric)
        if (normalizedFabric !== filters.fabric) return false
      }

      return true
    })
  }, [products, filters])

  // Notify parent of filtered results
  useEffect(() => {
    onFilteredChange(filteredProducts)
  }, [filteredProducts, onFilteredChange])

  const clearFilter = (key: keyof FilterState) => {
    setFilters(prev => ({ ...prev, [key]: key === 'skuSearch' ? '' : null }))
  }

  const clearAllFilters = () => {
    setFilters({ category: null, color: null, fabric: null, skuSearch: "" })
  }

  const hasActiveFilters = filters.category || filters.color || filters.fabric || filters.skuSearch

  return (
    <div className="bg-muted/50 border-y border-border py-4 mb-6">
      <div className="max-w-[1800px] mx-auto px-6 md:px-12 lg:px-16">
        {/* Filter pills row */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {/* Category filter */}
          {filterOptions.categories.length > 0 && (
            <FilterPill
              label="Category"
              value={filters.category}
              options={filterOptions.categories}
              onChange={(v) => setFilters(prev => ({ ...prev, category: v }))}
            />
          )}

          {/* Color filter */}
          {filterOptions.colors.length > 0 && (
            <FilterPill
              label="Color"
              value={filters.color}
              options={filterOptions.colors}
              onChange={(v) => setFilters(prev => ({ ...prev, color: v }))}
            />
          )}

          {/* Fabric filter */}
          {filterOptions.fabrics.length > 0 && (
            <FilterPill
              label="Fabric"
              value={filters.fabric}
              options={filterOptions.fabrics}
              onChange={(v) => setFilters(prev => ({ ...prev, fabric: v }))}
            />
          )}

          {/* SKU Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search SKU..."
              value={filters.skuSearch}
              onChange={(e) => setFilters(prev => ({ ...prev, skuSearch: e.target.value }))}
              className="pl-9 w-[180px] rounded-full bg-background"
            />
          </div>

          {/* Results count */}
          <span className="text-sm text-muted-foreground ml-2">
            {filteredProducts.length} of {products.length} styles
          </span>
        </div>

        {/* Active filters row */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            {filters.category && (
              <ActiveFilterTag
                label={`Category: ${filters.category}`}
                onRemove={() => clearFilter('category')}
              />
            )}
            {filters.color && (
              <ActiveFilterTag
                label={`Color: ${filters.color}`}
                onRemove={() => clearFilter('color')}
              />
            )}
            {filters.fabric && (
              <ActiveFilterTag
                label={`Fabric: ${filters.fabric}`}
                onRemove={() => clearFilter('fabric')}
              />
            )}
            {filters.skuSearch && (
              <ActiveFilterTag
                label={`SKU: "${filters.skuSearch}"`}
                onRemove={() => clearFilter('skuSearch')}
              />
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Pill-style dropdown filter
interface FilterPillProps {
  label: string
  value: string | null
  options: string[]
  onChange: (value: string | null) => void
}

function FilterPill({ label, value, options, onChange }: FilterPillProps) {
  const [open, setOpen] = useState(false)

  if (options.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "rounded-full px-4 gap-1.5",
            value && "bg-foreground text-background hover:bg-foreground/90 hover:text-background"
          )}
        >
          {value || label}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2 max-h-[300px] overflow-y-auto" align="start">
        <div className="flex flex-col gap-1">
          <button
            className={cn(
              "text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors",
              !value && "bg-muted font-medium"
            )}
            onClick={() => { onChange(null); setOpen(false) }}
          >
            All {label === 'Category' ? 'Categories' : `${label}s`}
          </button>
          {options.map(option => (
            <button
              key={option}
              className={cn(
                "text-left px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors",
                value === option && "bg-muted font-medium"
              )}
              onClick={() => { onChange(option); setOpen(false) }}
            >
              {option}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Active filter tag with remove button
interface ActiveFilterTagProps {
  label: string
  onRemove: () => void
}

function ActiveFilterTag({ label, onRemove }: ActiveFilterTagProps) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-background border border-border rounded-full">
      {label}
      <button
        onClick={onRemove}
        className="hover:text-destructive transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}
