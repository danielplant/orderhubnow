# Table Search Pattern

All data tables in OrderHub use URL-driven server-side search.

## Why URL-Driven Search?

- **Shareable**: Users can copy/paste URLs with filters applied
- **Bookmarkable**: Save filtered views as bookmarks
- **Back/Forward**: Browser navigation works correctly
- **Consistent**: Same behavior across all tables
- **Debounced**: SearchInput handles debouncing automatically

## Usage

### Basic Usage

```typescript
import { useTableSearch } from '@/lib/hooks'
import { SearchInput } from '@/components/ui'

function MyTable() {
  const { q, page, setParam, setPage, setSort } = useTableSearch()
  
  return (
    <SearchInput
      value={q}
      onValueChange={(v) => setParam('q', v || null)}
      placeholder="Search..."
    />
  )
}
```

### With Base Path

```typescript
const search = useTableSearch({ basePath: '/admin/orders' })
```

### Available Properties

| Property | Type | Description |
|----------|------|-------------|
| q | string | Current search query |
| page | number | Current page (1-indexed) |
| pageSize | number | Items per page |
| sort | string | Sort column ID |
| dir | 'asc' or 'desc' | Sort direction |

### Available Methods

| Method | Description |
|--------|-------------|
| setParam(key, value) | Set single URL param |
| setParams(updates) | Set multiple params |
| setPage(page) | Navigate to page |
| setSort({columnId, direction}) | Set sort |
| clearFilters() | Remove all filters |
| getParam(key) | Get any URL param |

## Example: Full Table Implementation

```typescript
'use client'

import { useTableSearch } from '@/lib/hooks'
import { DataTable, SearchInput } from '@/components/ui'

interface MyTableProps {
  data: MyDataRow[]
  total: number
}

export function MyTable({ data, total }: MyTableProps) {
  const { q, page, pageSize, sort, dir, setParam, setPage, setSort, getParam } = useTableSearch()
  
  // Get custom filters via getParam
  const status = getParam('status') || 'all'
  
  // Define columns
  const columns = [
    { id: 'name', header: 'Name', cell: (row) => row.name },
    { id: 'email', header: 'Email', cell: (row) => row.email },
  ]
  
  return (
    <div>
      <SearchInput
        value={q}
        onValueChange={(v) => setParam('q', v || null)}
        placeholder="Search..."
      />
      
      <DataTable
        columns={columns}
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        manualSorting
        sort={{ columnId: sort, direction: dir }}
        onSortChange={setSort}
      />
    </div>
  )
}
```

## When NOT to Use

- **Small static datasets**: Use client-side filtering (e.g., Email Logs)
- **Buyer-facing filters**: May use client-side for faster UX (e.g., Collection Filter)

## Tables Using This Pattern

| Table | Location | Notes |
|-------|----------|-------|
| Products | `/admin/products` | Has collection filter |
| Orders | `/admin/orders` | Has status tabs, date range |
| Customers | `/admin/customers` | Standard implementation |
| Inventory | `/admin/inventory` | Has status tabs |
| Missing SKUs | `/admin/collections/mapping` | Has status tabs |
| Rep Orders | `/rep/orders` | Has status filter |
| Open Items | `/admin/open-items` | Converted from submit-to-apply |

## Migration Notes

When converting a table to use `useTableSearch`:

1. Import the hook:
   ```typescript
   import { useTableSearch } from '@/lib/hooks'
   ```

2. Replace manual URL param handling:
   ```typescript
   // Before
   const router = useRouter()
   const searchParams = useSearchParams()
   const q = searchParams.get('q') || ''
   const page = Number(searchParams.get('page') || '1')
   
   // After
   const { q, page, setParam, setPage } = useTableSearch()
   ```

3. Remove local setParam/setPageParam/setSortParam functions

4. Update DataTable props:
   ```typescript
   onPageChange={setPage}
   onSortChange={setSort}
   ```

5. For custom params (status, filters), use `getParam`:
   ```typescript
   const status = getParam('status') || 'all'
   ```
