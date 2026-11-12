// Leaflet 1.9 copies every click with `for (key in event)` to build its synthetic 'preclick' event.
// In Firefox that enumerates the deprecated `MouseEvent.mozPressure` / `mozInputSource` accessors
// and logs two "is deprecated" warnings to the console on the first map click. Making them
// non-enumerable keeps them out of that loop; reading them directly still works.
export function hideDeprecatedMouseEventProps() {
  if (typeof MouseEvent === 'undefined') return
  for (const name of ['mozPressure', 'mozInputSource']) {
    const desc = Object.getOwnPropertyDescriptor(MouseEvent.prototype, name)
    if (desc && desc.configurable && desc.enumerable) {
      Object.defineProperty(MouseEvent.prototype, name, { ...desc, enumerable: false })
    }
  }
}
