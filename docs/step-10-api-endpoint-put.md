# Step 10: API Endpoint (PUT) - Field Configuration

## Overview

Step 10 creates the persistence layer for field mapping configuration. This endpoint receives form data from the FieldConfigModal (Step 9) and upserts to the `ShopifyFieldMapping` table.

**Goal**: Create `PUT /api/admin/shopify/schema/field` to save field mapping configuration.

**File to create**: `src/app/api/admin/shopify/schema/field/route.ts`

---

## 10.1 Prerequisites

| Requirement | How to Verify |
|-------------|---------------|
| Step 9 complete | FieldConfigModal renders and logs mock saves |
| Prisma schema has `ShopifyFieldMapping` | Check `prisma/schema.prisma` lines 1060-1108 |
| Auth pattern established | See `src/app/api/admin/shopify/schema/route.ts` |

---

## 10.2 Design Decisions

### 10.2.1 HTTP Method: PUT (not POST)

**Decision**: Use PUT for upsert semantics.

**Rationale**:
- The operation is idempotent (same input → same result)
- The unique key is `[connectionId, entityType, fieldPath]`
- Creates if not exists, updates if exists
- Cleaner than POST with "if exists" logic

### 10.2.2 Request Body Structure

```typescript
interface FieldMappingRequest {
  // Required: identifies the field
  fullPath: string           // "ProductVariant.price.amount"

  // Configuration (from FieldConfigModal)
  enabled: boolean           // Include in sync?
  targetTable: string        // SQL table name (e.g., "Sku")
  targetColumn: string       // SQL column name (e.g., "Price")
  transformType: string      // "direct" | "parseFloat" | "parseInt" | "lookup" | "custom"
  transformConfig?: object   // Optional JSON config for transforms

  // Optional: multi-tenant support
  connectionId?: string      // Default: "default"
}
```

### 10.2.3 Response Structure

```typescript
// Success (200)
{
  success: true,
  mapping: FieldMapping,     // The upserted record
  created: boolean           // true if new, false if updated
}

// Error (4xx/5xx)
{
  error: string,
  code: string,
  details?: string
}
```

### 10.2.4 What NOT to Include

- **No batch operations**: One field at a time for simplicity
- **No DELETE method**: Disable fields by setting `enabled: false`
- **No version/etag**: Optimistic concurrency not needed (admin-only tool)

---

## 10.3 Implementation Steps

### Step 10.3.1: Create Directory Structure

```bash
mkdir -p src/app/api/admin/shopify/schema/field
```

### Step 10.3.2: Create Route File

Create `src/app/api/admin/shopify/schema/field/route.ts`:

```typescript
/**
 * PUT /api/admin/shopify/schema/field
 *
 * Upserts a field mapping configuration for a Shopify GraphQL field.
 * Used by the schema graph UI to configure how fields sync to SQL.
 *
 * Request body:
 * - fullPath: "ProductVariant.price.amount" (required)
 * - enabled: boolean (required)
 * - targetTable: string (required when enabled)
 * - targetColumn: string (required when enabled)
 * - transformType: "direct" | "parseFloat" | "parseInt" | "lookup" | "custom" (default: "direct")
 * - transformConfig: object (optional, for custom transforms)
 * - connectionId: string (optional, default: "default")
 *
 * Returns:
 * - 200: Success with upserted mapping
 * - 400: Validation error (invalid fullPath, transformType, etc.)
 * - 401: Unauthorized (not admin)
 * - 500: Server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/providers'
import { prisma } from '@/lib/db'

// Valid transform types
const VALID_TRANSFORM_TYPES = ['direct', 'parseFloat', 'parseInt', 'lookup', 'custom'] as const
type TransformType = typeof VALID_TRANSFORM_TYPES[number]

// Request body interface
interface FieldMappingRequest {
  fullPath: string
  enabled: boolean
  targetTable: string
  targetColumn: string
  transformType?: string
  transformConfig?: Record<string, unknown>
  connectionId?: string
}

export async function PUT(request: NextRequest) {
  // 1. Auth check (match pattern from GET endpoint)
  const session = await auth()
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401 }
    )
  }

  try {
    // 2. Parse and validate request body
    const body = await request.json() as FieldMappingRequest

    // 3. Validate required fields
    if (!body.fullPath || typeof body.fullPath !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid fullPath', code: 'INVALID_FULL_PATH' },
        { status: 400 }
      )
    }

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing or invalid enabled flag', code: 'INVALID_ENABLED' },
        { status: 400 }
      )
    }

    // 4. Parse fullPath to extract entityType and fieldPath
    // Format: "ProductVariant.price.amount" → entityType: "ProductVariant", fieldPath: "price.amount"
    const firstDotIndex = body.fullPath.indexOf('.')
    if (firstDotIndex === -1) {
      return NextResponse.json(
        { error: 'Invalid fullPath format. Expected "EntityType.fieldPath"', code: 'INVALID_FULL_PATH_FORMAT' },
        { status: 400 }
      )
    }

    const entityType = body.fullPath.substring(0, firstDotIndex)
    const fieldPath = body.fullPath.substring(firstDotIndex + 1)

    if (!entityType || !fieldPath) {
      return NextResponse.json(
        { error: 'Could not parse entityType and fieldPath from fullPath', code: 'INVALID_FULL_PATH_PARSE' },
        { status: 400 }
      )
    }

    // 5. Validate connectionId format (match GET endpoint pattern)
    const connectionId = body.connectionId ?? 'default'
    if (connectionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
      return NextResponse.json(
        { error: 'Invalid connectionId format', code: 'INVALID_CONNECTION_ID' },
        { status: 400 }
      )
    }

    // 6. Validate transform type
    const transformType = body.transformType ?? 'direct'
    if (!VALID_TRANSFORM_TYPES.includes(transformType as TransformType)) {
      return NextResponse.json(
        {
          error: `Invalid transformType. Must be one of: ${VALID_TRANSFORM_TYPES.join(', ')}`,
          code: 'INVALID_TRANSFORM_TYPE'
        },
        { status: 400 }
      )
    }

    // 7. Validate targetTable/targetColumn when enabled
    if (body.enabled) {
      if (!body.targetTable || typeof body.targetTable !== 'string' || body.targetTable.trim() === '') {
        return NextResponse.json(
          { error: 'targetTable is required when enabled', code: 'MISSING_TARGET_TABLE' },
          { status: 400 }
        )
      }
      if (!body.targetColumn || typeof body.targetColumn !== 'string' || body.targetColumn.trim() === '') {
        return NextResponse.json(
          { error: 'targetColumn is required when enabled', code: 'MISSING_TARGET_COLUMN' },
          { status: 400 }
        )
      }
    }

    // 8. Calculate depth from fieldPath
    const depth = fieldPath.split('.').length

    // 9. Serialize transformConfig if provided
    const transformConfig = body.transformConfig
      ? JSON.stringify(body.transformConfig)
      : null

    // 10. Upsert to database
    const result = await prisma.shopifyFieldMapping.upsert({
      where: {
        connectionId_entityType_fieldPath: {
          connectionId,
          entityType,
          fieldPath,
        },
      },
      create: {
        connectionId,
        entityType,
        fieldPath,
        fullPath: body.fullPath,
        depth,
        targetTable: body.targetTable?.trim() || null,
        targetColumn: body.targetColumn?.trim() || null,
        transformType,
        transformConfig,
        enabled: body.enabled,
        isProtected: false,  // User-created mappings are not protected
        accessStatus: 'untested',
      },
      update: {
        targetTable: body.targetTable?.trim() || null,
        targetColumn: body.targetColumn?.trim() || null,
        transformType,
        transformConfig,
        enabled: body.enabled,
        // Note: isProtected and accessStatus are NOT updated by user edits
      },
    })

    // 11. Check if this was a create or update
    // Compare createdAt and updatedAt to determine
    const created = result.createdAt.getTime() === result.updatedAt.getTime()

    // 12. Return success response
    return NextResponse.json({
      success: true,
      mapping: {
        id: result.id.toString(),
        entityType: result.entityType,
        fieldPath: result.fieldPath,
        fullPath: result.fullPath,
        depth: result.depth,
        targetTable: result.targetTable,
        targetColumn: result.targetColumn,
        transformType: result.transformType as TransformType,
        transformConfig: result.transformConfig ? JSON.parse(result.transformConfig) : undefined,
        enabled: result.enabled,
        isProtected: result.isProtected,
        accessStatus: result.accessStatus,
      },
      created,
    })
  } catch (error) {
    // 13. Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body', code: 'INVALID_JSON' },
        { status: 400 }
      )
    }

    // 14. Handle database errors
    console.error('Error upserting field mapping:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      {
        error: 'Failed to save field mapping',
        code: 'DATABASE_ERROR',
        details: message,
      },
      { status: 500 }
    )
  }
}
```

---

## 10.4 Validation Rules Summary

| Field | Required | Validation |
|-------|----------|------------|
| `fullPath` | Yes | Non-empty string, must contain "." |
| `enabled` | Yes | Boolean |
| `targetTable` | When enabled | Non-empty string |
| `targetColumn` | When enabled | Non-empty string |
| `transformType` | No | One of: direct, parseFloat, parseInt, lookup, custom |
| `transformConfig` | No | Valid JSON object |
| `connectionId` | No | Max 100 chars, alphanumeric + `_-` |

---

## 10.5 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not logged in as admin |
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `INVALID_FULL_PATH` | 400 | Missing or invalid fullPath |
| `INVALID_FULL_PATH_FORMAT` | 400 | fullPath doesn't contain "." |
| `INVALID_FULL_PATH_PARSE` | 400 | Could not extract entityType/fieldPath |
| `INVALID_ENABLED` | 400 | enabled is not a boolean |
| `INVALID_CONNECTION_ID` | 400 | connectionId too long or invalid chars |
| `INVALID_TRANSFORM_TYPE` | 400 | transformType not in allowed list |
| `MISSING_TARGET_TABLE` | 400 | enabled=true but no targetTable |
| `MISSING_TARGET_COLUMN` | 400 | enabled=true but no targetColumn |
| `DATABASE_ERROR` | 500 | Prisma/database error |

---

## 10.6 Manual Testing

### 10.6.1 Prerequisites

```bash
# 1. Start dev server
npm run dev

# 2. Ensure you're logged in as admin
# Navigate to http://localhost:3000 and login
```

### 10.6.2 Test Cases

#### Test 1: Unauthenticated Request

```bash
curl -X PUT http://localhost:3000/api/admin/shopify/schema/field \
  -H "Content-Type: application/json" \
  -d '{"fullPath": "Product.title", "enabled": true, "targetTable": "Sku", "targetColumn": "Title"}'
```

**Expected**: 401 Unauthorized

#### Test 2: Missing fullPath

```bash
# Use browser DevTools console (authenticated):
fetch('/api/admin/shopify/schema/field', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ enabled: true })
}).then(r => r.json()).then(console.log)
```

**Expected**: 400 with code `INVALID_FULL_PATH`

#### Test 3: Invalid Transform Type

```bash
# Use browser DevTools console:
fetch('/api/admin/shopify/schema/field', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullPath: 'Product.title',
    enabled: true,
    targetTable: 'Sku',
    targetColumn: 'Title',
    transformType: 'invalid'
  })
}).then(r => r.json()).then(console.log)
```

**Expected**: 400 with code `INVALID_TRANSFORM_TYPE`

#### Test 4: Enable Without Target

```bash
# Use browser DevTools console:
fetch('/api/admin/shopify/schema/field', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullPath: 'Product.title',
    enabled: true,
    targetTable: '',
    targetColumn: ''
  })
}).then(r => r.json()).then(console.log)
```

**Expected**: 400 with code `MISSING_TARGET_TABLE`

#### Test 5: Successful Create

```bash
# Use browser DevTools console:
fetch('/api/admin/shopify/schema/field', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullPath: 'ProductVariant.price.amount',
    enabled: true,
    targetTable: 'Sku',
    targetColumn: 'Price',
    transformType: 'parseFloat'
  })
}).then(r => r.json()).then(console.log)
```

**Expected**:
```json
{
  "success": true,
  "mapping": {
    "id": "1",
    "entityType": "ProductVariant",
    "fieldPath": "price.amount",
    "fullPath": "ProductVariant.price.amount",
    "depth": 2,
    "targetTable": "Sku",
    "targetColumn": "Price",
    "transformType": "parseFloat",
    "enabled": true,
    "isProtected": false,
    "accessStatus": "untested"
  },
  "created": true
}
```

#### Test 6: Successful Update

Run Test 5 again with different values:

```bash
fetch('/api/admin/shopify/schema/field', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullPath: 'ProductVariant.price.amount',
    enabled: true,
    targetTable: 'RawSkusFromShopify',
    targetColumn: 'VariantPrice',
    transformType: 'direct'
  })
}).then(r => r.json()).then(console.log)
```

**Expected**: Same as Test 5 but with `created: false` and updated values.

#### Test 7: Disable Field

```bash
fetch('/api/admin/shopify/schema/field', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fullPath: 'ProductVariant.price.amount',
    enabled: false,
    targetTable: '',
    targetColumn: ''
  })
}).then(r => r.json()).then(console.log)
```

**Expected**: Success with `enabled: false`, `targetTable: null`, `targetColumn: null`

### 10.6.3 Database Verification

After tests, verify in database:

```sql
SELECT * FROM ShopifyFieldMapping
WHERE connectionId = 'default'
ORDER BY updatedAt DESC;
```

Or via Prisma Studio:

```bash
npx prisma studio
```

Navigate to `ShopifyFieldMapping` table.

---

## 10.7 TypeScript Verification

After creating the file:

```bash
npm run type-check
```

Ensure no TypeScript errors in `src/app/api/admin/shopify/schema/field/route.ts`.

---

## 10.8 Integration Points

### 10.8.1 Relationship to GET Endpoint

- GET endpoint (`/api/admin/shopify/schema`) reads from `ShopifyFieldMapping` via `buildSchemaGraph()`
- PUT endpoint writes to `ShopifyFieldMapping`
- After PUT, refreshing the graph should show updated `isEnabled`/`isMapped` status

### 10.8.2 Step 11 Integration

Step 11 will:
1. Replace the mock `handleSaveField` in `page.tsx` with a real API call
2. Use this PUT endpoint to persist changes
3. Optionally refresh the graph after save

---

## 10.9 Security Considerations

| Concern | Mitigation |
|---------|------------|
| Auth bypass | `auth()` check with admin role requirement |
| SQL injection | Prisma parameterized queries |
| Large payloads | JSON body limit (Next.js default 1MB) |
| connectionId abuse | Format validation (100 char max, alphanumeric) |
| XSS via stored data | Data is only used server-side in sync, not rendered raw |

---

## 10.10 Performance Notes

- Single database upsert per request (fast)
- No complex queries or joins
- Index on `[connectionId, entityType, fieldPath]` for upsert lookup
- No caching needed (admin-only, low frequency)

---

## 10.11 Checklist

- [ ] Directory `src/app/api/admin/shopify/schema/field/` created
- [ ] Route file `route.ts` created
- [ ] TypeScript compiles without errors
- [ ] Auth check works (401 for non-admin)
- [ ] Validation returns correct error codes
- [ ] Successful create returns `created: true`
- [ ] Successful update returns `created: false`
- [ ] Database records created/updated correctly
- [ ] Disable flow works (enabled=false with empty targets)

---

## 10.12 Next Steps

After Step 10 is complete:

1. **Step 11**: Wire FieldConfigModal to call this endpoint
   - Replace mock `handleSaveField` with `fetch` to PUT endpoint
   - Add loading/error states to modal
   - Optionally refresh graph after save

2. **Optional enhancements** (not in scope for Step 10):
   - GET endpoint to fetch single mapping by fullPath
   - Batch save endpoint for multiple fields
   - Undo/revert functionality
