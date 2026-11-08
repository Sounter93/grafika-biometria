// Konwersje kolorów. Wszystkie wartości w zakresie 0..1
// (oprócz odcienia h, który jest w stopniach 0..360).

// RGB -> CMYK
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b)
  // czarny - nie da się dzielić przez (1 - k)
  if (k >= 1) return [0, 0, 0, 1]
  const c = (1 - r - k) / (1 - k)
  const m = (1 - g - k) / (1 - k)
  const y = (1 - b - k) / (1 - k)
  return [c, m, y, k]
}

// CMYK -> RGB
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const r = 1 - Math.min(1, c * (1 - k) + k)
  const g = 1 - Math.min(1, m * (1 - k) + k)
  const b = 1 - Math.min(1, y * (1 - k) + k)
  return [r, g, b]
}

// RGB -> HSV (potrzebne tylko do kwadratu próbnika)
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6)
    else if (max === g) h = 60 * ((b - r) / d + 2)
    else h = 60 * ((r - g) / d + 4)
  }
  if (h < 0) h += 360
  const s = max === 0 ? 0 : d / max
  return [h, s, max]
}

// HSV -> RGB, wynik wpisujemy do out,
// żeby nie robić nowej tablicy dla każdego piksela
export function hsvToRgb(h: number, s: number, v: number, out: number[]) {
  const c = v * s
  const hh = (h / 60) % 6
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (hh < 1) {
    r = c
    g = x
  } else if (hh < 2) {
    r = x
    g = c
  } else if (hh < 3) {
    g = c
    b = x
  } else if (hh < 4) {
    g = x
    b = c
  } else if (hh < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  out[0] = r + m
  out[1] = g + m
  out[2] = b + m
}

// r, g, b jako 0..255
export function rgbToHex(r: number, g: number, b: number): string {
  const part = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return '#' + part(r) + part(g) + part(b)
}

// "#ff8800" albo "f80" -> [255, 136, 0], zły tekst -> null
export function hexToRgb(text: string): [number, number, number] | null {
  let s = text.trim().replace('#', '')
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2]
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
}
