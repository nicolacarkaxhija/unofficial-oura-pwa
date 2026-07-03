import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

// ─── Dark Mode Strategy ────────────────────────────────────────────────────────
//
// Three modes: 'system' (follows prefers-color-scheme), 'light', 'dark'.
// The active mode is stored in localStorage under 'theme'.
//
// Implementation: we add/remove the `dark` class on <html>. Tailwind's
// `dark:` variants are activated by this class (configured in styles.css via
// `@variant dark (&:where(.dark, .dark *))`).
//
// We do NOT use a CSS media query as the sole mechanism because users expect
// to be able to override the system preference in Settings.

export type Theme = 'system' | 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark' // the actual applied theme after resolving 'system'
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    return stored ?? 'system'
  })

  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme

  useEffect(() => {
    applyTheme(theme)

    // When theme is 'system', also listen for OS-level changes at runtime
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function setTheme(next: Theme) {
    localStorage.setItem('theme', next)
    setThemeState(next)
    applyTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
