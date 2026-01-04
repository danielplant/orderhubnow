# Design System Standard

**Objective: Build software that would pass review by Joe Gebbia's design team at Airbnb.**

This document defines the standard, explains what we built to meet it, and provides checklists to ensure we maintain it.

---

## The Gebbia Standard

Joe Gebbia co-founded Airbnb and led their design culture. His teams built some of the most respected design systems in tech. The standard is:

> Every pixel, interaction, and component reflects intentionality. Nothing is accidental. Accessibility is non-negotiable. The system scales without degradation.

### What This Means in Practice

| Principle | Gebbia-Level | Amateur-Level |
|-----------|--------------|---------------|
| **Accessibility** | Every interactive element works with keyboard, screen reader, and meets WCAG AA | "We'll add accessibility later" |
| **Consistency** | One source of truth for every pattern | Copy-paste styling, inline overrides |
| **Intentionality** | Every design token has a purpose | Arbitrary values (`text-[13px]`, `mt-[7px]`) |
| **Documentation** | Components are cataloged and testable in isolation | "Read the code to understand it" |
| **Primitives** | Composable building blocks that enforce constraints | Monolithic components with baked-in assumptions |

---

## What We Built

### 1. Accessible Primitives (shadcn/ui + Radix)

We replaced custom implementations with battle-tested Radix UI primitives via shadcn/ui:

| Component | Accessibility Features |
|-----------|----------------------|
| `Button` | Focus ring, disabled states, keyboard activation, `asChild` for composition |
| `Popover` | **Focus trap**, Escape closes, click-outside closes, focus restoration |
| `Dialog` | **Focus trap**, scroll lock, Escape closes, ARIA roles |
| `DropdownMenu` | Keyboard navigation, typeahead search, submenus |
| `Select` | Keyboard navigation, screen reader announcements |
| `Tooltip` | Delay timing, portal rendering, screen reader support |

**Critical Fix:** The `SizeChip` quantity popover was completely inaccessible to keyboard users. Now uses Radix Popover with automatic focus trap.

### 2. Design Token System

All visual values flow from centralized tokens:

```
globals.css (CSS Variables)
    ↓
Tailwind Classes (bg-card, text-foreground, border-border)
    ↓
Components (never use raw colors)
```

**Token Categories:**
- Colors: `--foreground`, `--muted-foreground`, `--primary`
- Surfaces: `--card`, `--popover`, `--secondary`
- Borders: `--border`, `--ring`
- Elevation: `--elevation-sm/md/lg/xl`
- Motion: `--duration-fast/normal/slow`
- Sizing: `--size-product-card`, `--size-chip-min`

### 3. Component Architecture (CVA)

All components use Class Variance Authority for variant management:

```tsx
const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "..." },
    size: { sm: "...", md: "...", lg: "..." },
  },
  defaultVariants: { variant: "default", size: "md" },
});
```

This ensures:
- Consistent API across components
- Type-safe variant props
- No arbitrary styling creep

### 4. Storybook (Component Catalog)

Every component has stories for:
- All variants
- Interactive states
- Edge cases
- Accessibility testing (via addon-a11y)

```bash
npm run storybook  # localhost:6006
```

---

## Calibration Protocol

When this document is invoked for calibration, execute these checks in order.

### Quick Check (30 seconds)

Run these greps to detect obvious violations:

```bash
# Raw color usage (should use semantic tokens)
rg "bg-neutral|bg-gray|bg-white|bg-black|text-white|text-black" components/

# Raw buttons outside stories (should use shadcn Button)
rg "<button" components/ --glob "!*.stories.tsx" -l

# Arbitrary pixel values (should use tokens/variables)
rg "h-\[\d+px\]|w-\[\d+px\]|p-\[\d+px\]|m-\[\d+px\]" components/

# Wrong focus pattern (should be focus-visible)
rg "focus:ring|focus:outline" components/
```

**If any violations found → proceed to Standard Check**

### Standard Check (5 minutes)

```bash
# 1. Verify build passes
npm run build

# 2. Verify Storybook builds
npm run build-storybook

# 3. Check for dead code (components with no imports)
for f in components/ui/*.tsx; do
  name=$(basename "$f" .tsx)
  if [[ "$name" != "index" && "$name" != *.stories ]]; then
    count=$(rg -l "$name" components/ app/ --glob "!$f" | wc -l)
    if [[ $count -eq 0 ]]; then echo "UNUSED: $f"; fi
  fi
done

# 4. List components missing stories
for f in components/ui/*.tsx; do
  story="${f%.tsx}.stories.tsx"
  if [[ ! -f "$story" && "$f" != *index* ]]; then
    echo "MISSING STORY: $f"
  fi
done
```

### Deep Audit (30 minutes)

1. Run all Quick + Standard checks
2. Open Storybook: `npm run storybook`
3. Check Accessibility panel (addon-a11y) on each story
4. Manual keyboard test on key flows:
   - Tab through select-journey page
   - Open SizeChip popover with keyboard
   - Escape to close popovers/dialogs
5. Review `ARCHITECTURE.md` compliance
6. Verify new components follow CVA pattern

### Anti-Pattern Grep Patterns

Copy-paste these to find specific violations:

```bash
# Arbitrary shadows (use elevation-* utilities)
rg "shadow-\[|shadow-sm|shadow-md|shadow-lg|shadow-xl" components/ --glob "!globals.css"

# Arbitrary durations (use motion-* utilities)
rg "duration-\d+" components/

# Missing aria-label on icon buttons
rg "size=\"icon\"" components/ -A2 | rg -v "aria-label"

# Raw button elements (potential accessibility issues)
rg "<button" components/ -B2 -A5
```

### Severity Levels

| Level | Meaning | Examples |
|-------|---------|----------|
| 🔴 Critical | Accessibility broken, user cannot complete task | Missing focus trap, no keyboard support |
| 🟡 Warning | System drift, technical debt | Raw colors, missing story, arbitrary values |
| 🟢 Minor | Polish issues | Inconsistent spacing, missing aria-label on decorative element |

### Exemplary Files (Reference These)

| Pattern | File | Why It's Correct |
|---------|------|------------------|
| Radix Popover usage | `components/buyer/size-chip.tsx` | Focus trap, keyboard nav, proper composition |
| Complete story coverage | `components/ui/button.stories.tsx` | All variants, sizes, states documented |
| CVA component pattern | `components/ui/badge.tsx` | Variants, defaults, type-safe props |
| Semantic token usage | `components/buyer/brand-header.tsx` | No raw colors, uses system tokens |

---

## Calibration Checklists

Use these to audit any new work against the standard.

### Before Every PR: Component Checklist

```
□ Uses shadcn/ui primitives for interactive elements (Button, Dialog, Popover, etc.)
□ No raw <button> or <input> without proper accessibility
□ All interactive elements have aria-label or visible label
□ Uses semantic tokens (bg-card, text-foreground) not raw colors (bg-neutral-800)
□ No arbitrary values (h-[347px]) - use CSS variables or tokens
□ Focus states use focus-visible (keyboard only, not mouse)
□ Component has Storybook story
□ Story covers all variants and key states
```

### Monthly Audit: System Health

```
□ Run Storybook - all stories render without errors
□ Run build - no TypeScript errors
□ Check addon-a11y - no critical accessibility violations
□ Review new components - are they using primitives correctly?
□ Check for pattern drift - are similar things styled consistently?
□ Dead code check - unused components should be deleted
```

### New Component Decision Tree

```
Is this interactive (clickable, focusable, opens something)?
├── YES → Use shadcn/ui primitive (Button, Dialog, Popover, etc.)
└── NO → Is this a repeated pattern (2+ uses)?
    ├── YES → Create CVA component in components/ui/
    └── NO → Inline is fine, but use tokens
```

---

## Anti-Patterns (Never Do These)

| Anti-Pattern | Why It Fails | Correct Approach |
|--------------|--------------|------------------|
| Raw `<button>` for complex interactions | No focus trap, no escape key, no screen reader | Use `<Dialog>`, `<Popover>`, `<DropdownMenu>` |
| `bg-neutral-800`, `text-white` | Breaks theming, inconsistent | `bg-card`, `text-foreground` |
| `duration-200`, `shadow-lg` | Arbitrary, not from system | `motion-fast`, `elevation-md` |
| `focus:ring-2` | Shows on mouse click too | `focus-visible:ring-2` |
| Copy-pasting button styles | Drift, inconsistency | Use `<Button variant="...">` |
| Component without story | Undocumented, untestable | Every component gets a story |
| "We'll add accessibility later" | You won't, and it's harder | Build it in from the start |

---

## Quick Reference: Common Patterns

### Icon Button
```tsx
// ✓ Correct
<Button variant="ghost" size="icon" aria-label="Search">
  <Search className="h-4 w-4" />
</Button>

// ✗ Wrong
<button onClick={...} className="p-2 hover:bg-gray-100">
  <Search />
</button>
```

### Modal/Dialog
```tsx
// ✓ Correct - focus trap, escape, scroll lock built-in
<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* content */}
  </DialogContent>
</Dialog>

// ✗ Wrong - no focus trap, no escape handling
<div className={isOpen ? "fixed inset-0" : "hidden"}>
  <div className="bg-white p-4">{/* content */}</div>
</div>
```

### Popover with Controls
```tsx
// ✓ Correct - focus trap keeps Tab inside popover
<Popover>
  <PopoverTrigger asChild>
    <Button>Edit</Button>
  </PopoverTrigger>
  <PopoverContent>
    <Button>Action 1</Button>
    <Button>Action 2</Button>
  </PopoverContent>
</Popover>

// ✗ Wrong - Tab escapes, no focus management
{isOpen && (
  <div className="absolute top-full bg-white shadow">
    <button>Action 1</button>
    <button>Action 2</button>
  </div>
)}
```

### Color Usage
```tsx
// ✓ Correct - semantic tokens
className="bg-card text-foreground border-border"
className="bg-destructive text-destructive-foreground"
className="text-muted-foreground"

// ✗ Wrong - raw colors
className="bg-white text-black border-gray-200"
className="bg-red-500 text-white"
className="text-gray-500"
```

---

## The Test

When reviewing any component, ask:

1. **Can a keyboard user complete every action?**
   - Tab to focus, Enter/Space to activate, Escape to close

2. **Can a screen reader user understand what's happening?**
   - Proper labels, roles, and announcements

3. **Does it use the system, or fight it?**
   - Tokens, not arbitrary values
   - Primitives, not custom implementations

4. **Is it documented?**
   - Storybook story exists
   - Variants are demonstrated

5. **Would Gebbia's team approve this?**
   - If you have to ask, the answer is probably no

---

## Files That Define the System

| File | Purpose |
|------|---------|
| `app/globals.css` | Design tokens (CSS variables) |
| `components/ui/*.tsx` | Primitive components |
| `components/ui/*.stories.tsx` | Component documentation |
| `lib/utils.ts` | Shared utilities (cn, focusRing) |
| `.storybook/` | Storybook configuration |
| `ARCHITECTURE.md` | Code organization rules |
| `DESIGN_STANDARD.md` | This document |

---

## Summary

The Gebbia standard isn't about aesthetics—it's about **engineering discipline applied to design**. Every decision is intentional. Every interaction is accessible. Every component is documented.

When you cut corners, you accumulate design debt that compounds. When you maintain the standard, the system gets stronger with every addition.

**The goal is not to ship fast. The goal is to ship right, which ultimately is faster.**

---

*Last updated: November 2024*
*Standard established during shadcn/ui + Storybook migration*
