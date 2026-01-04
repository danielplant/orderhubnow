const theme = {
  colors: {
    primary: '#90FCCC',
    secondary: '#06D0E6',
    brand: {
      primary: '#90FCCC',
      secondary: '#06D0E6',
    },
    text: {
      primary: '#1a1a1a',
      secondary: '#666666',
      tertiary: '#999999',
      quaternary: '#b3b3b3',
      white: '#ffffff',
    },
    border: {
      primary: '#e5e5e5',
      secondary: '#f0f0f0',
      tertiary: '#d0d0d0',
    },
    background: {
      primary: '#ffffff',
      secondary: '#f5f5f5',
      tertiary: '#fafafa',
    },
  },
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    8: '2rem',
    10: '2.5rem',
    12: '3rem',
    16: '4rem',
  } as Record<number, string>,
  layout: {
    maxContentWidth: '1280px',
    sidebarWidth: '280px',
  },
  typography: {
    fontFamily: {
      body: 'system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, monospace',
    },
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
    } as Record<string, string>,
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  borderRadius: {
    none: '0',
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    full: '9999px',
  },
}

export default theme
