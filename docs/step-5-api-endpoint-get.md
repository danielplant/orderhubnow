# Step 5: API Endpoint (GET) - Detailed Implementation Plan

## Overview

Create the API endpoint that serves the schema graph data to the frontend. This endpoint calls the `buildSchemaGraph()` function (already implemented in Step 4) and returns the result as JSON.

---

## 5.1 Endpoint Specification

```
GET /api/admin/shopify/schema
```

| Aspect | Value |
|--------|-------|
| **Method** | GET |
| **Auth** | Required (admin role) |
| **Path** | `/api/admin/shopify/schema` |
| **Query Params** | `connectionId` (optional, defaults to "default") |
| **Success Response** | 200 OK with `SchemaGraphData` |
| **Empty Cache** | 404 with `{ error, code: 'CACHE_EMPTY' }` |
| **Error Response** | 500 with `{ error }` |

---

## 5.2 File Location

```
src/app/api/admin/shopify/schema/route.ts
```

This follows the existing pattern in the codebase:
- `src/app/api/admin/shopify/entities/route.ts`
- `src/app/api/admin/shopify/introspect/[type]/route.ts`
- `src/app/api/admin/shopify/sync/...`

---

## 5.3 Prerequisites Check

Before creating the file, verify these exist:

| Dependency | Location | Status |
|------------|----------|--------|
| `buildSchemaGraph` function | `src/lib/shopify/schema-graph.ts` | ✅ Implemented (Step 4) |
| `SchemaGraphData` type | `src/lib/types/schema-graph.ts` | ✅ Implemented (Step 2) |
| `auth` provider | `src/lib/auth/providers` | ✅ Exists in codebase |
| `ShopifyTypeCache` table | Prisma schema | ✅ Must be populated |
| `ShopifyFieldMapping` table | Prisma schema | ✅ Implemented (Step 3) |

---

## 5.4 Implementation Code

Create the file `src/app/api/admin/shopify/schema/route.ts`:

```typescript
/**
 * GET /api/admin/shopify/schema
 *
 * Returns the complete schema graph data for React Flow rendering.
 * Combines cached introspection data with field mappings.
 *
 * Query params:
 * - connectionId: Tenant identifier (default: "default")
 *
 * Returns:
 * - 200: SchemaGraphData (nodes, edges, metadata)
 * - 401: Unauthorized (not admin)
 * - 404: Cache is empty (run introspection first)
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { buildSchemaGraph } from '@/lib/shopify/schema-graph'

export async function GET(request: NextRequest) {
  // 1. Auth check
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Extract query params
  const searchParams = request.nextUrl.searchParams
  const connectionId = searchParams.get('connectionId') ?? 'default'

  try {
    // 3. Build the graph
    const graphData = await buildSchemaGraph(connectionId)

    // 4. Handle empty cache
    if (!graphData) {
      return NextResponse.json(
        {
          error: 'Schema cache is empty. Run introspection first to populate the cache.',
          code: 'CACHE_EMPTY',
          hint: 'Visit /admin/dev/shopify/config and click "Refresh Schema" for each entity type.',
        },
        { status: 404 }
      )
    }

    // 5. Return success response
    return NextResponse.json({
      success: true,
      ...graphData,
    })
  } catch (error) {
    // 6. Handle errors
    console.error('Error building schema graph:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to build schema graph',
        details: message,
      },
      { status: 500 }
    )
  }
}
```

---

## 5.5 Response Shape

### Success Response (200)

```typescript
{
  success: true,
  nodes: [
    // Entity nodes
    {
      id: "entity:Product",
      type: "entity",
      position: { x: 0, y: 0 },
      data: {
        nodeType: "entity",
        entityName: "Product",
        displayName: "Product",
        fieldCount: 42,
        isExpanded: true
      }
    },
    // Field nodes
    {
      id: "field:Product.title",
      type: "field",
      position: { x: 0, y: 80 },
      data: {
        nodeType: "field",
        fieldName: "title",
        fieldPath: "title",
        fullPath: "Product.title",
        parentEntity: "Product",
        depth: 1,
        kind: "SCALAR",
        baseType: "String",
        category: "scalar",
        description: "The title of the product",
        isRelationship: false,
        isEnabled: true,
        isProtected: false,
        isMapped: true,
        mapping: { ... },
        isReadonly: false
      }
    },
    // ... more nodes
  ],
  edges: [
    // Entity-to-field edges
    {
      id: "edge:entity:Product-field:Product.title",
      source: "entity:Product",
      target: "field:Product.title",
      type: "smoothstep",
      data: { edgeType: "entity-to-field" }
    },
    // Relationship edges (animated, blue)
    {
      id: "edge:rel:field:ProductVariant.product-entity:Product",
      source: "field:ProductVariant.product",
      target: "entity:Product",
      type: "smoothstep",
      animated: true,
      style: { stroke: "#3b82f6" },
      data: {
        edgeType: "field-to-entity",
        sourceField: "product",
        targetEntity: "Product"
      }
    },
    // ... more edges
  ],
  entityCount: 6,
  fieldCount: 187,
  relationshipCount: 12,
  apiVersion: "2024-01",
  generatedAt: "2026-01-27T18:00:00.000Z"
}
```

### Empty Cache Response (404)

```typescript
{
  error: "Schema cache is empty. Run introspection first to populate the cache.",
  code: "CACHE_EMPTY",
  hint: "Visit /admin/dev/shopify/config and click \"Refresh Schema\" for each entity type."
}
```

### Error Response (500)

```typescript
{
  error: "Failed to build schema graph",
  details: "Database connection failed"
}
```

---

## 5.6 Directory Structure

Before creating the file, verify the directory exists:

```
src/app/api/admin/shopify/
├── entities/
│   └── route.ts              ← existing
├── introspect/
│   └── [type]/
│       └── route.ts          ← existing
├── schema/                    ← CREATE THIS DIRECTORY
│   └── route.ts              ← CREATE THIS FILE (Step 5)
└── sync/
    └── ...                   ← existing
```

---

## 5.7 Step-by-Step Instructions

### Step 5.7.1: Create the directory

```bash
mkdir -p src/app/api/admin/shopify/schema
```

### Step 5.7.2: Create the route file

Create `src/app/api/admin/shopify/schema/route.ts` with the code from Section 5.4.

### Step 5.7.3: Verify imports resolve

After creating the file, check that your IDE doesn't show import errors for:
- `@/lib/auth/providers`
- `@/lib/shopify/schema-graph`

If `@/lib/shopify/schema-graph` shows an error, verify that `buildSchemaGraph` is exported from that file.

### Step 5.7.4: Verify TypeScript compiles

```bash
npx tsc --noEmit
```

If there are type errors, address them before proceeding.

---

## 5.8 Testing

### 5.8.1: Manual Test (Browser/curl)

**Prerequisite**: The schema cache must be populated. If not, visit `/admin/dev/shopify/config` and introspect each entity first.

**Test 1: Successful response**

```bash
curl -X GET http://localhost:3000/api/admin/shopify/schema \
  -H "Cookie: <your-auth-cookie>"
```

Expected: 200 OK with JSON containing `nodes`, `edges`, `entityCount`, etc.

**Test 2: Unauthorized (no auth)**

```bash
curl -X GET http://localhost:3000/api/admin/shopify/schema
```

Expected: 401 Unauthorized

**Test 3: Empty cache**

If the cache is empty, you should get:

```json
{
  "error": "Schema cache is empty...",
  "code": "CACHE_EMPTY",
  "hint": "..."
}
```

### 5.8.2: Browser DevTools Test

1. Start dev server: `npm run dev`
2. Log in as admin
3. Open browser DevTools → Network tab
4. Navigate to: `http://localhost:3000/api/admin/shopify/schema`
5. Verify:
   - Status: 200
   - Response is valid JSON
   - `nodes` array is non-empty
   - `edges` array is non-empty

### 5.8.3: Response Validation Checklist

| Check | Expected |
|-------|----------|
| `success` field | `true` |
| `nodes` is array | Yes |
| `nodes.length > 0` | Yes (if cache populated) |
| All nodes have `id` | Yes |
| All nodes have `type` ("entity" or "field") | Yes |
| All nodes have `position.x` and `position.y` | Yes |
| All nodes have `data.nodeType` | Yes |
| `edges` is array | Yes |
| All edges have `id`, `source`, `target` | Yes |
| `entityCount` is number | Yes |
| `fieldCount` is number | Yes |
| `apiVersion` is string | Yes |
| `generatedAt` is ISO timestamp | Yes |

---

## 5.9 Potential Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Import error: `auth`** | "Cannot find module '@/lib/auth/providers'" | Verify the auth module path. Check existing routes for the correct import. |
| **Import error: `buildSchemaGraph`** | "Module has no exported member 'buildSchemaGraph'" | Ensure `buildSchemaGraph` is exported in `src/lib/shopify/schema-graph.ts` |
| **Empty cache** | Always returns 404 | Run introspection first: visit `/admin/dev/shopify/config` for each entity |
| **Prisma error** | "PrismaClientKnownRequestError" | Run `npx prisma generate` and restart dev server |
| **Type error on response** | TypeScript complaints on `graphData` | Ensure `SchemaGraphData` type matches what `buildSchemaGraph` returns |
| **Slow response** | Takes >5 seconds | The graph builder is querying multiple tables; consider adding database indexes or caching |

---

## 5.10 Completion Checklist

- [ ] Directory created: `src/app/api/admin/shopify/schema/`
- [ ] File created: `src/app/api/admin/shopify/schema/route.ts`
- [ ] Imports resolve without errors
- [ ] TypeScript compiles: `npx tsc --noEmit` passes
- [ ] Dev server starts: `npm run dev`
- [ ] Test: Unauthenticated request returns 401
- [ ] Test: Authenticated admin request returns 200
- [ ] Test: Response contains `success: true`
- [ ] Test: Response contains `nodes` array (non-empty)
- [ ] Test: Response contains `edges` array
- [ ] Test: Response contains `entityCount`, `fieldCount`, `relationshipCount`
- [ ] Test: Empty cache returns 404 with `code: 'CACHE_EMPTY'`

---

## 5.11 Next Step

Once this endpoint is working, proceed to **Step 6: Page Route** which will:
1. Create the page at `/admin/dev/shopify/schema`
2. Fetch from this API endpoint
3. Pass data to React Flow for rendering

The page will call:
```typescript
const res = await fetch('/api/admin/shopify/schema')
const data = await res.json()
// data.nodes and data.edges passed to ReactFlow
```

---

## 5.12 Code Summary

**File**: `src/app/api/admin/shopify/schema/route.ts`

**Lines of code**: ~45

**Key functionality**:
1. Auth check (admin only)
2. Extract `connectionId` from query params
3. Call `buildSchemaGraph(connectionId)`
4. Return graph data or appropriate error

**Dependencies**:
- `@/lib/auth/providers` → `auth()`
- `@/lib/shopify/schema-graph` → `buildSchemaGraph()`
