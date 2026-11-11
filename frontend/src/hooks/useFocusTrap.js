import { useEffect } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Keeps keyboard focus inside `ref` while it is mounted, wraps Tab / Shift+Tab, calls onEscape on
// Escape (when given) and puts focus back where it was on close. Focus starts on `initialFocusRef`
// when given (a dialog whose first control is a consequential one must not hand it focus),
// otherwise on the first control.
export function useFocusTrap(ref, onEscape, initialFocusRef) {
  useEffect(() => {
    const root = ref.current
    if (!root) return undefined
    const previous = document.activeElement
    const controls = () => Array.from(root.querySelectorAll(FOCUSABLE))
    const first = initialFocusRef?.current || controls()[0]
    if (first) first.focus()
    else root.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const list = controls()
      if (list.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      if (!root.contains(document.activeElement)) {
        e.preventDefault()
        firstEl.focus()
      } else if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previous && previous !== document.body && document.contains(previous)) previous.focus()
    }
    // onEscape is read through the closure on mount: callers pass a stable function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, initialFocusRef])
}
