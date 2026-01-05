'use client'

import * as React from 'react'

interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  handler: () => void
  description: string
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[]
  enabled?: boolean
}

/**
 * Hook to register global keyboard shortcuts.
 * Shortcuts are automatically disabled when focus is in an input, textarea, or contenteditable.
 */
export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  React.useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.tagName === 'SELECT'

      // Allow Escape in inputs to blur them
      if (isInputFocused && event.key !== 'Escape') {
        return
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey

        // Support both ctrl and meta for cross-platform (Ctrl on Windows, Cmd on Mac)
        const modifierMatch = shortcut.ctrl || shortcut.meta
          ? (shortcut.ctrl && event.ctrlKey) || (shortcut.meta && event.metaKey)
          : ctrlMatch && metaMatch

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          modifierMatch &&
          shiftMatch
        ) {
          event.preventDefault()
          shortcut.handler()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts, enabled])
}

/**
 * Focus the search input when Cmd/Ctrl+K is pressed.
 * The input should have data-search-input attribute.
 */
export function useSearchShortcut() {
  const focusSearch = React.useCallback(() => {
    const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]')
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }, [])

  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'k',
        meta: true,
        handler: focusSearch,
        description: 'Focus search',
      },
      {
        key: 'k',
        ctrl: true,
        handler: focusSearch,
        description: 'Focus search',
      },
    ],
  })

  return { focusSearch }
}

/**
 * Blur the currently focused element when Escape is pressed.
 */
export function useEscapeBlur() {
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 'Escape',
        handler: () => {
          const active = document.activeElement as HTMLElement
          if (active && active !== document.body) {
            active.blur()
          }
        },
        description: 'Blur current element',
      },
    ],
  })
}
