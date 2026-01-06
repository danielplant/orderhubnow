# Lightbox Accessibility Improvements

**Status:** 🔵 Idea
**Priority:** Low
**Effort:** 30 mins
**Created:** 2026-01-06

## Problem

The image lightbox modal (implemented in `product-order-card.tsx`) generates console accessibility warnings:

```
`DialogContent` requires a `DialogTitle` for the component to be accessible for screen readers.
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
```

While the lightbox functions correctly, screen reader users may have a degraded experience.

## Current Implementation

The lightbox currently renders:
- `DialogContent` with the enlarged image
- A paragraph with the product title
- A close button

Missing:
- `DialogTitle` component (required for accessibility)
- `DialogDescription` or `aria-describedby` attribute

## Proposed Solution

Add the missing accessibility components using visually hidden elements:

```tsx
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

// In DialogContent:
<DialogContent className="max-w-3xl p-0 overflow-hidden">
  <VisuallyHidden>
    <DialogTitle>Product Image: {title}</DialogTitle>
    <DialogDescription>Enlarged view of {title}</DialogDescription>
  </VisuallyHidden>
  {/* ... rest of content */}
</DialogContent>
```

Alternatively, if `VisuallyHidden` doesn't exist, use Radix's approach:
```tsx
<DialogTitle className="sr-only">Product Image: {title}</DialogTitle>
```

## Implementation Steps

1. Check if `VisuallyHidden` component exists, or use `sr-only` Tailwind class
2. Import `DialogTitle` and `DialogDescription` from dialog component
3. Add hidden title and description to `DialogContent`
4. Verify console warnings are resolved
5. Test with screen reader (VoiceOver/NVDA)

## Files to Modify

- `src/components/buyer/product-order-card.tsx` - Add accessibility components

## References

- [Radix Dialog Accessibility](https://www.radix-ui.com/primitives/docs/components/dialog#accessibility)
- [WCAG 2.1 - Name, Role, Value](https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html)
