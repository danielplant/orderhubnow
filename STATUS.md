# Status Log: MyOrderHub Start Pages

## 2026-01-07

### Completed: Create company data model

**Files created:**
- `src/lib/companies.ts`

**What was done:**
- Created `Company` interface with full type definitions for multi-tenant support
- Includes interfaces for `CompanyRoutes`, `CompanyLogos`, and `CompanyColors`
- Added `COMPANIES` registry array with Limeapple+Preppy Goose as first entry
- Implemented helper functions: `getCompanyBySlug()`, `getAllCompanySlugs()`, `isValidCompanySlug()`
- Includes optional fields for `faireUrl` (marketplace link) and `tagline`

**Files modified:**
- `src/app/page.tsx` - Fixed TypeScript errors in Framer Motion variants (added `as const` to ease arrays)

**Decisions made:**
- Company data stored in-memory as static registry (sufficient for MVP, can move to database later)
- Routes use existing portal paths (`/buyer/select-journey`, `/rep`, `/admin`)
- Included Faire URL as optional field for marketplace integration

**Commands run:**
- `npm run type-check` - Passed
- `npm run lint` - New file passes (pre-existing warnings in other files)
