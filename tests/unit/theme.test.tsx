import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider } from '@/theme/ThemeContext'
import { useTheme } from '@/theme/useTheme'

// ─── matchMedia stub ──────────────────────────────────────────────────────────
//
// jsdom does not implement window.matchMedia at all, and ThemeProvider calls it
// both during render (resolvedTheme) and inside its effect (change listener).
// A controllable stub — rather than a static vi.fn() — lets tests flip the OS
// preference at runtime and fire the 'change' event, which is the only way to
// exercise the 'system' mode listener path.

let systemPrefersDark = false
let changeListeners: Array<() => void> = []

function installMatchMedia(): void {
  window.matchMedia = (query: string) =>
    // Partial stub — MediaQueryList has legacy members ThemeProvider never
    // touches; the double cast is the standard escape hatch for DOM stubs.
    ({
      // getter, not a snapshot: ThemeProvider re-queries matchMedia on every
      // change event, so `matches` must reflect the *current* stub state.
      get matches() {
        return query.includes('prefers-color-scheme: dark') && systemPrefersDark
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => {
        changeListeners.push(listener)
      },
      removeEventListener: (_type: string, listener: () => void) => {
        changeListeners = changeListeners.filter((l) => l !== listener)
      },
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

function fireSystemThemeChange(prefersDark: boolean): void {
  systemPrefersDark = prefersDark
  act(() => {
    for (const listener of [...changeListeners]) listener()
  })
}

// Consumer component: exercises the context exactly the Settings page does.
function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button
        onClick={() => {
          setTheme('dark')
        }}
      >
        to-dark
      </button>
      <button
        onClick={() => {
          setTheme('light')
        }}
      >
        to-light
      </button>
      <button
        onClick={() => {
          setTheme('system')
        }}
      >
        to-system
      </button>
    </div>
  )
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

const htmlHasDark = () => document.documentElement.classList.contains('dark')

beforeEach(() => {
  systemPrefersDark = false
  changeListeners = []
  installMatchMedia()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ThemeProvider', () => {
  it('defaults to light (not system) when nothing is stored', () => {
    renderProbe()
    // Product decision: dark mode is opt-in via Settings; first-time users
    // must land in light even if their OS prefers dark.
    systemPrefersDark = true
    expect(screen.getByTestId('theme').textContent).toBe('light')
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    expect(htmlHasDark()).toBe(false)
  })

  it('restores the persisted theme from localStorage on mount', () => {
    localStorage.setItem('theme', 'dark')
    renderProbe()
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(htmlHasDark()).toBe(true)
  })

  it('setTheme(dark) toggles the html class and persists', () => {
    renderProbe()
    fireEvent.click(screen.getByText('to-dark'))

    expect(htmlHasDark()).toBe(true)
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    // Persistence is what survives a reload — the class alone would not.
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('setTheme(light) after dark removes the html class', () => {
    localStorage.setItem('theme', 'dark')
    renderProbe()
    fireEvent.click(screen.getByText('to-light'))

    expect(htmlHasDark()).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('system mode resolves from the OS preference', () => {
    systemPrefersDark = true
    localStorage.setItem('theme', 'system')
    renderProbe()

    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(htmlHasDark()).toBe(true)
  })

  it('system mode follows OS changes at runtime', () => {
    localStorage.setItem('theme', 'system')
    renderProbe()
    expect(htmlHasDark()).toBe(false)

    fireSystemThemeChange(true)
    expect(htmlHasDark()).toBe(true)

    fireSystemThemeChange(false)
    expect(htmlHasDark()).toBe(false)
  })

  it('explicit light ignores OS-level dark changes (no listener attached)', () => {
    renderProbe()
    fireEvent.click(screen.getByText('to-light'))

    // The change listener is only registered in 'system' mode — an explicit
    // choice must never be overridden by the OS flipping its preference.
    expect(changeListeners).toHaveLength(0)
    fireSystemThemeChange(true)
    expect(htmlHasDark()).toBe(false)
  })

  it('switching from system to explicit dark detaches the OS listener', () => {
    localStorage.setItem('theme', 'system')
    renderProbe()
    expect(changeListeners.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('to-dark'))
    // Effect cleanup must remove the listener, otherwise a later OS change
    // would silently re-apply system resolution over the user's choice.
    expect(changeListeners).toHaveLength(0)
    expect(htmlHasDark()).toBe(true)
  })

  it('unmount removes the system-mode listener (no leak)', () => {
    localStorage.setItem('theme', 'system')
    const { unmount } = renderProbe()
    expect(changeListeners.length).toBeGreaterThan(0)
    unmount()
    expect(changeListeners).toHaveLength(0)
  })
})

describe('useTheme', () => {
  it('throws a descriptive error outside ThemeProvider', () => {
    // React logs the thrown error via console.error — silence it so the test
    // output stays clean while still asserting the throw.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Probe />)).toThrow('useTheme must be used inside ThemeProvider')
  })
})
