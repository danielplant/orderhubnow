'use client'

import { useSearchShortcut, useEscapeBlur } from '@/lib/hooks/use-keyboard-shortcuts'

/**
 * Client component that registers global keyboard shortcuts for the admin area.
 * Place this component in the admin layout.
 *
 * Shortcuts:
 * - Cmd/Ctrl + K: Focus the search input (must have data-search-input attribute)
 * - Escape: Blur the currently focused element
 */
export function KeyboardShortcuts() {
  useSearchShortcut()
  useEscapeBlur()

  // This component doesn't render anything visible
  return null
}
