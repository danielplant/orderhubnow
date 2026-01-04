# MyOrderHub Web Architecture

This document outlines the codebase structure, patterns, and guidelines for maintaining clean, modular code.

---

## System Context

MyOrderHub Web is **one component** in a larger system. Understanding this context is critical for making correct architectural decisions.

### System Overview

| Component | Technology | Status | Responsibility |
|-----------|------------|--------|----------------|
| **UI** | Next.js (this codebase) | Build new | All user-facing pages (admin + buyer) |
| **Database** | Azure SQL Server | Existing (unchanged) | Products, Orders, Inventory, Stores, etc. |
| **Shopify READS** | .NET WebJobs | Existing (unchanged) | Background inventory sync from Shopify |
| **Shopify WRITES** | Next.js API Routes | Build new | User-triggered order transfers, manual sync |

### Architecture Boundary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL                                        │
│  ┌─────────────┐                                                            │
│  │   SHOPIFY   │                                                            │
│  │   (API)     │                                                            │
│  └──────┬──────┘                                                            │
└─────────┼────────────────────────────────────────────────────────────────────┘
          │
          ▼ READS (background sync)              WRITES (user-triggered)
┌─────────────────────────────┐      ┌─────────────────────────────────┐
│   .NET WebJobs              │      │   Next.js API Routes            │
│   • Inventory sync          │      │   • Transfer Order to Shopify   │
│   • SKU reconciliation      │      │   • Manual sync trigger         │
│   STATUS: Keep as-is        │      │   STATUS: Build new             │
└────────────┬────────────────┘      └────────────┬────────────────────┘
             │ WRITE                              │ READ/WRITE
             ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AZURE SQL SERVER                                    │
│   • Products / SKUs           • Orders / Line Items                         │
│   • Inventory (by size)       • Customers / Stores                          │
│   STATUS: No changes (existing schema)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
             ▲
             │ READ/WRITE (Prisma ORM)
             │
┌────────────┴────────────────────────────────────────────────────────────────┐
│                         NEXT.JS APPLICATION (this codebase)                 │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│   │  UI Components  │    │  Server Actions │    │  API Routes     │        │
│   │  (React)        │───▶│  / Route        │───▶│  (Prisma)       │        │
│   │                 │    │  Handlers       │    │                 │        │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
             ▲
             │ HTTPS
┌────────────┴────────────────────────────────────────────────────────────────┐
│                              USER (Browser)                                 │
│   • Admin: Orders, Stores, Inventory management, Shopify transfer           │
│   • Buyer: Products, Cart, Linelists, Media                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **.NET WebJobs retained** — Background Shopify sync continues unchanged
2. **Next.js owns all UI** — Complete replacement of .NET Web Forms
3. **Prisma for data access** — Type-safe, direct SQL Server connection
4. **No .NET modifications** — Existing .NET code is reference only
5. **Shopify writes in Next.js** — All user-triggered Shopify API calls built fresh

### Common Misconception

**Wrong:** "Next.js calls existing .NET endpoints for Shopify operations"

**Correct:**
- .NET WebJobs handle **background READS** from Shopify (preserved, unchanged)
- Next.js builds **new API routes** for user-triggered **WRITES** to Shopify
- Next.js does NOT call .NET endpoints for Shopify operations

---

## Project Structure

```
05_myorderhub-v2/
├── .storybook/               # Storybook configuration
│   ├── main.ts               # Stories location, addons
│   └── preview.ts            # Global decorators, Tailwind import
│
├── prisma/                   # Prisma ORM configuration
│   ├── schema.prisma         # Database schema (introspected from existing DB)
│   └── client.ts             # Prisma client singleton
│
├── src/app/                  # Next.js App Router (pages & routing)
│   ├── (auth)/               # Route group for auth (URL: /login, /reset-password)
│   │   ├── login/            # Login page
│   │   └── reset-password/   # Password reset
│   ├── admin/                # Admin pages (URL: /admin/*)
│   │   ├── orders/           # Order management
│   │   ├── customers/        # Customer/store management
│   │   ├── inventory/        # Inventory management
│   │   ├── skus/             # SKU management
│   │   └── layout.tsx        # Admin layout wrapper
│   ├── buyer/                # Buyer pages (URL: /buyer/*)
│   │   ├── ats/              # Available-to-sell inventory
│   │   ├── pre-order/        # Pre-order collections
│   │   ├── my-order/         # Current order view
│   │   ├── confirmation/     # Order confirmation
│   │   ├── select-journey/   # Entry point / journey selection
│   │   └── layout.tsx        # Buyer layout wrapper
│   ├── rep/                  # Sales rep pages (URL: /rep/*)
│   │   ├── orders/           # Rep order management
│   │   └── layout.tsx        # Rep layout wrapper
│   ├── api/                  # API routes
│   │   ├── auth/             # NextAuth routes
│   │   ├── shopify/          # Shopify operations
│   │   │   ├── sync/         # POST: Trigger manual sync
│   │   │   └── transfer/     # POST: Transfer order to Shopify
│   │   ├── orders/           # Order CRUD + export
│   │   ├── customers/        # Customer CRUD + import
│   │   ├── skus/             # SKU CRUD
│   │   ├── categories/       # Category CRUD
│   │   ├── reps/             # Sales rep CRUD
│   │   └── reports/          # Reporting endpoints
│   ├── actions/              # Server actions (data fetching)
│   │   ├── auth.ts           # Authentication actions
│   │   ├── inventory.ts      # Inventory data actions
│   │   └── orders.ts         # Order data actions
│   ├── globals.css           # Design tokens & global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Home page
│
├── src/components/
│   ├── ui/                   # UI primitives (shadcn/ui + CVA-based)
│   │   ├── button.tsx        # Button component
│   │   ├── card.tsx          # Card component
│   │   ├── dialog.tsx        # Modal dialog
│   │   ├── badge.tsx         # Badge component
│   │   ├── text.tsx          # Typography component
│   │   ├── index.ts          # Barrel export
│   │   └── ...               # Other UI primitives
│   ├── admin/                # Admin feature components
│   │   └── admin-sidebar.tsx # Admin navigation sidebar
│   ├── auth/                 # Authentication components
│   │   ├── login-form.tsx    # Login form
│   │   └── session-provider.tsx # NextAuth session provider
│   └── buyer/                # Buyer feature components
│       ├── brand-header.tsx  # Brand header
│       ├── product-order-card.tsx # Product card with ordering
│       ├── journey-card.tsx  # Journey selection card
│       ├── size-chip.tsx     # Size selection chip
│       └── ...               # Other buyer components
│
├── src/lib/
│   ├── utils.ts              # Shared utilities (cn, focusRing, formatPrice)
│   ├── prisma.ts             # Prisma client singleton
│   ├── app-config.ts         # Application configuration
│   ├── theme.ts              # Theme utilities
│   ├── auth/                 # Authentication utilities
│   │   ├── config.ts         # NextAuth configuration
│   │   └── providers.ts      # Auth providers
│   ├── data/                 # Data access layer
│   │   ├── queries/          # Reusable Prisma queries
│   │   │   ├── categories.ts # Category queries
│   │   │   ├── inventory.ts  # Inventory queries
│   │   │   ├── skus.ts       # SKU queries
│   │   │   └── index.ts      # Barrel export
│   │   └── mappers/          # Data transformation
│   │       ├── category.ts   # Category mappers
│   │       └── index.ts      # Barrel export
│   ├── contexts/             # React contexts
│   │   ├── order-context.tsx # Order state context
│   │   ├── currency-context.tsx # Currency toggle context
│   │   ├── announcement-context.tsx # Announcements
│   │   └── index.ts          # Barrel export
│   ├── tokens/               # Design token definitions
│   │   ├── index.ts          # Barrel export
│   │   ├── typography.ts     # Type scale, weights, line heights
│   │   ├── spacing.ts        # Spacing scale, radius
│   │   ├── elevation.ts      # Shadow tokens
│   │   ├── motion.ts         # Duration, easing
│   │   └── sizing.ts         # Component sizing
│   ├── constants/            # Runtime constants
│   │   ├── brand.ts          # Brand name, app name
│   │   ├── colors.ts         # Color name → hex mapping
│   │   ├── inventory.ts      # Stock thresholds
│   │   ├── features.ts       # Feature flags
│   │   └── navigation.ts     # Navigation config
│   └── types/                # Domain TypeScript types
│       ├── index.ts          # Barrel export
│       ├── auth.ts           # Auth-related types
│       ├── inventory.ts      # Product, Variant, Metrics types
│       └── order.ts          # Order-related types
│
├── src/data/                 # Mock/seed data (development)
│   ├── customers.json        # Sample customer data
│   ├── inventory.json        # Sample inventory data
│   ├── orders.json           # Sample order data
│   └── products.json         # Sample product data
│
├── src/types/                # Global type declarations
│   └── next-auth.d.ts        # NextAuth type augmentation
│
└── public/                   # Static assets
```

### Route URL Mapping

Note the difference between **route groups** (parentheses, excluded from URL) and **regular folders** (included in URL):

| Folder | Type | URL Path |
|--------|------|----------|
| `(auth)/login/` | Route Group | `/login` |
| `admin/orders/` | Regular Folder | `/admin/orders` |
| `buyer/ats/` | Regular Folder | `/buyer/ats` |
| `rep/orders/` | Regular Folder | `/rep/orders` |

## Storybook

Storybook provides a component catalog for visual testing, documentation, and development.

### Running Storybook

```bash
npm run storybook      # Development server at localhost:6006
npm run build-storybook # Static build for deployment
```

### Writing Stories

Stories live alongside components with `.stories.tsx` extension:

```tsx
// components/ui/button.stories.tsx
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: "Click me", variant: "default" },
};
```

### Addons Installed

| Addon | Purpose |
|-------|---------|
| `@storybook/addon-a11y` | Accessibility testing panel |
| `@storybook/addon-docs` | Auto-generated documentation |
| `@chromatic-com/storybook` | Visual regression testing (optional) |

---

## Database Access (Prisma)

Next.js connects to Azure SQL Server via Prisma ORM. The schema is **introspected** from the existing database — we do not modify the schema.

### Configuration

```
prisma/
└── schema.prisma         # Database schema (introspected from existing DB)

src/lib/
└── prisma.ts             # Prisma client singleton
```

### Prisma Client Singleton

```tsx
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

### Usage Pattern

```tsx
import { prisma } from "@/lib/prisma";

// In Server Components or Server Actions
export async function getOrders() {
  return prisma.order.findMany({
    where: { status: "pending" },
    include: { lineItems: true, store: true },
  });
}
```

### Key Principle

**Do NOT modify the database schema.** The existing .NET WebJobs depend on the current schema structure. Prisma introspects the existing schema — we work with what exists.

### Database Query Organization

Reusable queries live in `src/lib/data/queries/`:

```tsx
// src/lib/data/queries/categories.ts
import { prisma } from "@/lib/prisma";

export async function getCategoriesWithProducts() {
  return prisma.category.findMany({
    include: { products: true },
  });
}
```

---

## Shopify Integration

### Architecture Boundary

| Direction | Handler | Notes |
|-----------|---------|-------|
| **Shopify → SQL** (reads) | .NET WebJobs | Existing, unchanged — background sync |
| **SQL → Shopify** (writes) | Next.js API Routes | Must be reimplemented |

### API Routes for Shopify Writes

```
src/app/api/shopify/
├── transfer/
│   └── route.ts          # POST: Transfer order to Shopify
└── sync/
    └── route.ts          # POST: Trigger manual sync
```

### Shopify Client

```tsx
// lib/shopify/client.ts
const SHOPIFY_SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

export async function shopifyFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(
    `https://${SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.statusText}`);
  }

  return response.json();
}
```

### Reference Implementation

When implementing Shopify writes, reference the existing .NET logic (do NOT call these endpoints):

| Operation | Reference File | Key Section |
|-----------|---------------|-------------|
| Order transfer | `01_dotNET/.../MyOrder.aspx.cs` | Lines 1640-1900, `ShopifyOrder` region |
| Sync trigger | `01_dotNET/.../ShopifySync.aspx.cs` | `FetchAndShowShopifyInventory` method |

### Important

Next.js does **NOT** call .NET endpoints for Shopify operations. The .NET code is reference material only — the logic must be reimplemented in Next.js API routes.

---

## Design Token System

All design values are centralized in CSS variables (`globals.css`) and TypeScript constants (`lib/tokens/`).

### Token Categories

| Category | CSS Variable Prefix | Example |
|----------|-------------------|---------|
| Colors | `--color-*` | `--color-foreground`, `--color-muted-foreground` |
| Surfaces | `--surface-*` | `--surface-primary`, `--surface-inverse` |
| Text | `--text-*` | `--text-primary`, `--text-secondary` |
| Borders | `--border*` | `--border`, `--border-strong` |
| Elevation | `--elevation-*` | `--elevation-sm`, `--elevation-lg` |
| Motion | `--duration-*`, `--easing-*` | `--duration-fast`, `--easing-default` |
| Sizing | `--size-*` | `--size-product-card`, `--size-chip-min` |

### Using Tokens

```tsx
// Use semantic Tailwind classes (preferred)
className="bg-card text-foreground border-border"

// Use CSS variables for custom values
className="h-[var(--size-product-card)]"

// Use utility classes for elevation/motion
className="elevation-md hover:elevation-lg motion-normal"
```

### Utility Classes

Defined in `globals.css`:
- **Elevation:** `.elevation-sm`, `.elevation-md`, `.elevation-lg`, `.elevation-xl`
- **Motion:** `.motion-fast` (150ms), `.motion-normal` (300ms), `.motion-slow` (500ms)
- **Focus:** `.focus-ring` (consistent focus-visible styling)

---

## Component Architecture

### `components/ui/` - UI Primitives

UI primitives use **shadcn/ui** (Radix-based) for accessible interactive components and **CVA** for variant management. Import via barrel export:

```tsx
import { Button, Dialog, Popover, Badge, Text } from "@/components/ui";
```

**shadcn/ui Components (Radix-based, accessible):**

| Component | Purpose | Accessibility Features |
|-----------|---------|----------------------|
| `Button` | All buttons | Focus ring, disabled state, `asChild` composition |
| `Popover` | Floating content | Focus trap, Escape closes, click outside closes |
| `Dialog` | Modals | Focus trap, scroll lock, Escape closes |
| `DropdownMenu` | Context menus | Keyboard navigation, typeahead |
| `Select` | Select inputs | Keyboard navigation, screen reader support |
| `Tooltip` | Hover hints | Delay, portal rendering |
| `Toaster` | Toast notifications | Auto-dismiss, screen reader announcements |
| `Card` | Card layouts | Semantic structure |

**Custom Components (CVA-based):**

| Component | Purpose | Key Variants |
|-----------|---------|--------------|
| `Text` | Typography system | `variant`: display, heading-*, body-*, label, caption, mono |
| `Divider` | Separators | `orientation`: horizontal, vertical |
| `Badge` | Circular badges | `size`: xs, sm, md / `variant`: default, inverse, ats, preorder |
| `IndicatorDot` | Status dots | `status`: success, warning, error, ats, preorder |
| `IconBox` | Icon containers | `size`: sm, md, lg / `variant`: primary, outline |
| `ColorSwatch` | Color indicators | `size`: sm, md, lg |

### CVA Pattern

All primitives follow this structure:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn, focusRing } from "@/lib/utils";

const componentVariants = cva(
  "base-classes", // Always applied
  {
    variants: {
      size: { sm: "...", md: "...", lg: "..." },
      variant: { default: "...", primary: "..." },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

export interface ComponentProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof componentVariants> {}

export function Component({ size, variant, className, ...props }: ComponentProps) {
  return (
    <div className={cn(componentVariants({ size, variant }), className)} {...props} />
  );
}
```

### `components/buyer/` - Buyer Feature Components

Larger components specific to buyer functionality. May use UI primitives internally.

**Examples:** `ProductOrderCard`, `JourneyCard`, `CollectionCard`, `BrandHeader`, `CategoryMetricsPanel`, `SizeChip`

### `components/admin/` - Admin Feature Components

Components specific to admin functionality (orders, inventory, stores, Shopify operations).

**Examples:** `AdminSidebar`, `OrderTable`, `OrderLineItems`, `StoreEditor`, `InventoryGrid`, `ShopifyTransferPanel`

### `components/auth/` - Authentication Components

Components for authentication flows. These wrap NextAuth functionality.

**Examples:** `LoginForm`, `SessionProvider`

### When to Use Which Component Folder

| Folder | Use For |
|--------|---------|
| `components/ui/` | Shared primitives used across all areas (Button, Dialog, Badge, etc.) |
| `components/admin/` | Order management, store CRUD, inventory editing, Shopify operations |
| `components/buyer/` | Product browsing, cart, linelists, ATS views |
| `components/auth/` | Login forms, session management, auth wrappers |

### When to Extract to `components/ui/`

Create a new UI primitive when:
- A pattern appears 2+ times across different files
- The pattern has no business logic (pure presentation)
- It could reasonably be used in other features
- It needs variant support (use CVA)

## Domain Types

All domain TypeScript interfaces are centralized in `lib/types/`. Import via barrel export:

```tsx
import type { Product, ProductVariant, Order, Store } from "@/lib/types";
```

**Type Files:**

| Type | File | Description |
|------|------|-------------|
| `Product` | inventory.ts | Product with metadata and variants |
| `ProductVariant` | inventory.ts | Variant with size, SKU, availability, price |
| `CategoryMetric` | inventory.ts | `{ name, count }` for dashboard metrics |
| `DashboardMetrics` | inventory.ts | Full dashboard metrics structure |
| `OrderQuantities` | order.ts | SKU → quantity mapping for orders |
| `Order` | order.ts | Order with line items, customer, status |
| `OrderLineItem` | order.ts | Individual line item in an order |
| `Store` | store.ts | Store/customer with sales rep, address |
| `SalesRep` | store.ts | Sales rep with territory |
| `ShopifyTransferResult` | shopify.ts | Result of Shopify order transfer |
| `ShopifySyncStatus` | shopify.ts | Sync operation status and metadata |

**Note:** Some types are re-exported from `app/actions/inventory.ts` for backwards compatibility.

## Code Organization Rules

### DO

- **Use semantic tokens** - `bg-card`, `text-foreground`, `border-border` instead of raw colors
- **Use CVA for variants** - All UI primitives should use class-variance-authority
- **Use elevation/motion utilities** - `elevation-md`, `motion-normal` instead of inline values
- **Add ARIA labels** - All interactive elements need `aria-label` or visible labels
- **Use `focusRing`** - Import from utils and apply to all interactive elements
- **Use existing components** - Check `components/ui/` before writing new JSX
- **Put utilities in `lib/utils.ts`** - Functions like `formatPrice()`, `extractSize()`, `cn()`
- **Put constants in `lib/constants/`** - Color maps, thresholds, configuration values
- **Use barrel exports** - `import { X, Y } from "@/components/ui"`
- **Keep components focused** - Aim for <200 lines per component
- **Use TypeScript interfaces** - Define props interfaces for all components
- **Use `cn()` for conditional classes** - Merge Tailwind classes cleanly

### DON'T

- **Don't use raw Tailwind colors** - No `bg-neutral-*`, `text-stone-*`, `bg-white` in components
- **Don't use arbitrary pixel values** - Use tokens or CSS variables like `h-[var(--size-product-card)]`
- **Don't use arbitrary duration values** - Use `motion-fast/normal/slow` instead of `duration-200`
- **Don't use inline shadows** - Use `elevation-sm/md/lg/xl` instead of `shadow-[...]`
- **Don't write inline JSX when a component exists** - If `Divider` exists, use it
- **Don't put helper functions in component files** - Extract to `lib/utils.ts`
- **Don't hardcode constants in components** - Use `lib/constants/`
- **Don't copy-paste styling** - Extract repeated patterns to UI primitives
- **Don't create unused components** - Delete or wire up immediately
- **Don't make monolithic components** - Split when >200 lines or handling multiple concerns

## Adding New Components

### UI Primitive Checklist

Before adding to `components/ui/`:

1. [ ] Pattern appears 2+ times in codebase
2. [ ] No business logic - purely presentational
3. [ ] Uses CVA for variant management
4. [ ] Uses semantic tokens (no raw Tailwind colors)
5. [ ] Has ARIA labels for interactive elements
6. [ ] Uses `focusRing` for keyboard focus states
7. [ ] Props interface extends `VariantProps<typeof variants>`
8. [ ] Added to barrel export in `src/components/ui/index.ts`

### CVA Component Template

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn, focusRing } from "@/lib/utils";

const myComponentVariants = cva(
  ["base-classes", "motion-normal", focusRing],
  {
    variants: {
      size: {
        sm: "text-xs p-2",
        md: "text-sm p-3",
        lg: "text-base p-4",
      },
      variant: {
        default: "bg-secondary text-foreground",
        primary: "bg-surface-inverse text-text-inverse",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

export interface MyComponentProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof myComponentVariants> {}

export function MyComponent({
  size,
  variant,
  className,
  ...props
}: MyComponentProps) {
  return (
    <div
      className={cn(myComponentVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { myComponentVariants };
```

## File Naming & Imports

### Naming Conventions
- **Files:** kebab-case (`icon-button.tsx`, `color-swatch.tsx`)
- **Components:** PascalCase (`IconButton`, `ColorSwatch`)
- **Utilities:** camelCase (`formatPrice`, `getColorHex`)
- **Constants:** SCREAMING_SNAKE_CASE (`COLOR_HEX_MAP`, `STOCK_THRESHOLDS`)

### Import Order
```tsx
// 1. React/Next
import { useState } from "react";
import Image from "next/image";

// 2. External libraries
import { motion } from "framer-motion";

// 3. Internal - types
import type { Product, OrderQuantities } from "@/lib/types";

// 4. Internal - utilities & constants
import { cn, formatPrice } from "@/lib/utils";
import { getColorHex } from "@/lib/constants/colors";

// 5. Internal - components (ui first, then feature)
import { Badge, Divider } from "@/components/ui";
import { SizeChip } from "./size-chip";
```

### Path Aliases
The `@/` alias points to `src/`. Always use it instead of relative paths for cross-directory imports:
```tsx
// Good
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";

// Avoid (for cross-directory)
import { cn } from "../../lib/utils";
```

## Anti-Patterns to Avoid

These patterns were identified and cleaned up - don't reintroduce them:

| Anti-Pattern | Example | Solution |
|--------------|---------|----------|
| Raw Tailwind colors | `bg-neutral-800`, `text-stone-500` | Use `bg-surface-inverse`, `text-muted-foreground` |
| Arbitrary shadows | `shadow-[0_2px_8px_rgba...]` | Use `elevation-md` utility class |
| Arbitrary durations | `duration-200`, `duration-500` | Use `motion-fast`, `motion-slow` |
| Magic pixel values | `h-[440px]`, `min-w-[52px]` | Use CSS vars `h-[var(--size-product-card)]` |
| Missing ARIA labels | `<button onClick={...}>` | Add `aria-label="Description"` |
| Inline variant logic | `isActive ? "bg-..." : "bg-..."` | Use CVA variants |
| Unused components | Component file exists but not used | Use the component or delete it |
| Monolithic components | 300+ line component | Split into smaller focused components |
| Inline helpers | `function getColor()` inside component | Move to `lib/utils.ts` or `lib/constants/` |
| Hardcoded constants | Color hex values in component | Use `lib/constants/colors.ts` |
| Repeated patterns | Same button styling in 4 places | Extract to `components/ui/` with CVA |
| Missing barrel exports | Importing from individual files | Add to `index.ts`, import from folder |
| Scattered types | Domain types defined in component files | Move to `lib/types/` |

---

## Deployment

### Target Environment

| Component | Target | Notes |
|-----------|--------|-------|
| **Next.js App** | Azure App Service (or Static Web Apps) | New deployment |
| **SQL Server** | Azure SQL | Existing, unchanged |
| **WebJobs** | Azure App Service | Existing, unchanged |

### Environment Variables

```env
# Database
DATABASE_URL=             # Azure SQL connection string (for Prisma)

# Shopify API
SHOPIFY_SHOP_DOMAIN=      # e.g., store.myshopify.com
SHOPIFY_ACCESS_TOKEN=     # Shopify Admin API token

# Application
NEXT_PUBLIC_APP_URL=      # Deployed application URL
NODE_ENV=                 # development | production
```

### Build & Deploy

```bash
# Development
npm run dev               # Start development server

# Production build
npm run build             # Build for production
npm run start             # Start production server

# Storybook
npm run storybook         # Development at localhost:6006
npm run build-storybook   # Static build for deployment
```

---

## Related Documents

- **System Architecture:** `10_system-plans/project-dec17/00_setup/00_design/architecture-data-flow.md`
- **UI/UX Specification:** `10_system-plans/project-dec17/02_master-plan/` (various files)
- **.NET Reference:** `01_dotNET/` (reference only, do not modify)
