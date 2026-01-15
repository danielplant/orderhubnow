'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  /** Current search value (controlled) */
  value: string
  /** Callback when debounced value changes */
  onValueChange: (value: string) => void
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number
  /** Show clear button when input has value */
  showClear?: boolean
}

/**
 * Search input with built-in debouncing.
 * Maintains local state for instant typing feedback while
 * debouncing the onValueChange callback to prevent excessive updates.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onValueChange,
      debounceMs = 300,
      showClear = true,
      className,
      placeholder = 'Search...',
      ...props
    },
    ref
  ) => {
    // Local state for instant input feedback
    const [localValue, setLocalValue] = React.useState(value)
    const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const isInternalChange = React.useRef(false)

    // Sync external value changes to local state (e.g., URL changes, clear from parent)
    React.useEffect(() => {
      if (!isInternalChange.current) {
        setLocalValue(value)
      }
      isInternalChange.current = false
    }, [value])

    // Handle input changes with debouncing
    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        isInternalChange.current = true
        setLocalValue(newValue)

        // Clear existing timer
        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }

        // Set new debounced callback
        timerRef.current = setTimeout(() => {
          onValueChange(newValue)
        }, debounceMs)
      },
      [onValueChange, debounceMs]
    )

    // Handle clear button
    const handleClear = React.useCallback(() => {
      isInternalChange.current = true
      setLocalValue('')
      // Clear immediately on explicit clear action
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      onValueChange('')
    }, [onValueChange])

    // Cleanup timer on unmount
    React.useEffect(() => {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }
      }
    }, [])

    return (
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={ref}
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn('pl-8', showClear && localValue && 'pr-8', className)}
          {...props}
        />
        {showClear && localValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
SearchInput.displayName = 'SearchInput'

export { SearchInput }
