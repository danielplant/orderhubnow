import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { SearchInput } from '@/components/ui/search-input'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('does not update value before delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })
    
    // Before delay passes
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('initial')
  })

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })
    
    // After delay passes
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('updated')
  })

  it('only emits final value after rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } }
    )

    // Simulate rapid typing: s -> sh -> shi -> shir -> shirt
    rerender({ value: 's' })
    act(() => { vi.advanceTimersByTime(50) })
    
    rerender({ value: 'sh' })
    act(() => { vi.advanceTimersByTime(50) })
    
    rerender({ value: 'shi' })
    act(() => { vi.advanceTimersByTime(50) })
    
    rerender({ value: 'shir' })
    act(() => { vi.advanceTimersByTime(50) })
    
    rerender({ value: 'shirt' })
    
    // Still showing initial value (debounce not elapsed)
    expect(result.current).toBe('')
    
    // After full delay from last change
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('shirt')
  })
})

describe('SearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders with initial value', () => {
    render(<SearchInput value="test" onValueChange={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('test')
  })

  it('updates display immediately on typing', () => {
    const onValueChange = vi.fn()
    render(<SearchInput value="" onValueChange={onValueChange} />)
    
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'hello' } })
    
    // Display updates immediately
    expect(input).toHaveValue('hello')
    // Callback not yet called
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('calls onValueChange after debounce delay', () => {
    const onValueChange = vi.fn()
    render(<SearchInput value="" onValueChange={onValueChange} debounceMs={300} />)
    
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'hello' } })
    
    // Before delay
    act(() => { vi.advanceTimersByTime(200) })
    expect(onValueChange).not.toHaveBeenCalled()
    
    // After delay
    act(() => { vi.advanceTimersByTime(100) })
    expect(onValueChange).toHaveBeenCalledWith('hello')
    expect(onValueChange).toHaveBeenCalledTimes(1)
  })

  it('only calls onValueChange once after rapid typing', () => {
    const onValueChange = vi.fn()
    render(<SearchInput value="" onValueChange={onValueChange} debounceMs={300} />)
    
    const input = screen.getByRole('textbox')
    
    // Rapid typing
    fireEvent.change(input, { target: { value: 's' } })
    act(() => { vi.advanceTimersByTime(50) })
    
    fireEvent.change(input, { target: { value: 'sh' } })
    act(() => { vi.advanceTimersByTime(50) })
    
    fireEvent.change(input, { target: { value: 'shirt' } })
    
    // After debounce
    act(() => { vi.advanceTimersByTime(300) })
    
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('shirt')
  })

  it('syncs external value changes to input', () => {
    const onValueChange = vi.fn()
    const { rerender } = render(
      <SearchInput value="initial" onValueChange={onValueChange} />
    )
    
    expect(screen.getByRole('textbox')).toHaveValue('initial')
    
    // External value change (e.g., URL param change)
    rerender(<SearchInput value="external" onValueChange={onValueChange} />)
    
    expect(screen.getByRole('textbox')).toHaveValue('external')
  })

  it('clears input immediately when clear button clicked', () => {
    const onValueChange = vi.fn()
    render(<SearchInput value="test" onValueChange={onValueChange} showClear />)
    
    const clearButton = screen.getByRole('button', { name: /clear/i })
    fireEvent.click(clearButton)
    
    // Input cleared immediately
    expect(screen.getByRole('textbox')).toHaveValue('')
    // Callback called immediately (no debounce for clear)
    expect(onValueChange).toHaveBeenCalledWith('')
  })

  it('shows clear button only when there is a value', () => {
    render(
      <SearchInput value="" onValueChange={() => {}} showClear />
    )
    
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
    
    // Type something
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'test' } })
    
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })
})
