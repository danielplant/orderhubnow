# Branch Review - Changes to Consider for Main

## Status Key
- [ ] Not reviewed
- [?] Needs discussion
- [x] Approved - add to main
- [-] Rejected - skip

---

## Branch 1: claude/test-rep-ux-comparison-aV8Qu

### BUG
- [ ] **setState in useMemo fix** (`my-order/client.tsx`) - Original code would cause infinite loop

### SECURITY
- [ ] **RepId validation** (`rep-context.ts`) - Validates repId is numeric before using in URLs
- [ ] **Removed debug script** (`scripts/check-user.mjs`) - Was exposing password fields in logs

### FEATURE
- [ ] **Date range filtering** (`orders.ts` + `rep-orders-table.tsx`) - Filter orders by date range
- [ ] **Buyer column in orders table** (`rep-orders-table.tsx`) - Shows buyer name + email

### REFACTOR
- [ ] **Auth debug logs removed** (`auth/config.ts`) - Removed console.logs, minor ID type change

### COSMETIC
- [ ] Rep sidebar navigation
- [ ] Loading spinner on search
- [ ] Form labels and styling
- [ ] Confirmation dialog on cancel

---

## Branch 2: claude/admin-ux-testing-hQ2h8
(Not yet reviewed)

---

## Branch 3: claude/fix-orderhub-management-iYlmY
(Not yet reviewed)

---

## Branch 4: claude/ux-testing-customer-workflows-sbLdR
(Not yet reviewed)

---

## Branch 5: claude/ux-testing-inventory-orderhub-nA3jq
(Not yet reviewed)
