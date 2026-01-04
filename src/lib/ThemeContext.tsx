'use client'

import { createContext, useContext, type ReactNode } from 'react'

interface ThemeContextValue {
  getAccentColorValue: () => string
}

const ThemeContext = createContext<ThemeContextValue>({
  getAccentColorValue: () => '#90FCCC', // Limeapple default
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value: ThemeContextValue = {
    getAccentColorValue: () => '#90FCCC',
  }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
