// Anti-FOUC theme bootstrap. Loaded as a SYNCHRONOUS script in <head> —
// blocking first paint is the entire point: the dark class must be on <html>
// before any pixel renders. Lives in its own file (not inline) so the CSP can
// say script-src 'self' with no 'unsafe-inline', closing the injected-script
// hole entirely.
;(function () {
  var t = localStorage.getItem('theme')
  if (t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
    document.documentElement.classList.add('dark')
})()
