# Plan: MyOrderHub Start Pages

Do ONE checkbox item per iteration. Mark `[x]` when complete.

---

## Phase 1: Architecture & Data Model

- [x] Create company data model (`src/lib/companies.ts`) with type definitions for Company (slug, name, logos, colors, routes, shopifyUrl)
- [ ] Add Limeapple+PreppyGoose as first company entry with all brand data
- [ ] Create company context/hook (`src/lib/contexts/company-context.tsx`) for selected company state
- [ ] Implement cookie persistence for selected company (read/write helper functions)

## Phase 2: Page 1 - Company Selection

- [ ] Design and implement Page 1 layout (`src/app/page.tsx`) with MyOrderHub platform branding
- [ ] Create CompanyCard component with logo display, hover states, and link to company portal
- [ ] Add animated entrance effects (staggered fade-in, subtle background elements)
- [ ] Implement "return visitor" logic - if cookie exists, show option to continue or switch company
- [ ] Mobile responsive adjustments for Page 1

## Phase 3: Page 2 - Portal Selection

- [ ] Create dynamic route `src/app/[company]/page.tsx` for company-specific portal selection
- [ ] Implement portal selection layout with company branding (logo, colors)
- [ ] Create CustomerPortalCard - prominent "Shop as Customer" option
- [ ] Create RepPortalSection - grouped "Sales Rep Portal" + "Order for Customer" options
- [ ] Add discrete Admin link (small text, footer or corner placement)
- [ ] Add e-commerce link to Shopify store
- [ ] Add "Back to company selection" link
- [ ] Mobile responsive adjustments for Page 2

## Phase 4: Polish & Edge Cases

- [ ] Handle invalid company slug (redirect to Page 1 or 404)
- [ ] Add loading states and transitions between pages
- [ ] Ensure all links work correctly with existing auth flows
- [ ] Test cookie persistence across sessions
- [ ] Accessibility audit (focus states, screen reader labels, keyboard nav)

---

## Notes

- Keep existing portal pages (`/admin`, `/rep`, `/buyer/*`) unchanged
- Company slug for Limeapple+Preppy Goose: `limeapple-preppygoose`
- Logos available at `/public/logos/` (limeapple-logo.png, preppy-goose-logo.png, *-bk.png variants)
