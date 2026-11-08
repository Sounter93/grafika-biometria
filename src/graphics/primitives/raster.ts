import type { ImageBuffer } from '../../core/imageBuffer.ts'

// Linia - algorytm Bresenhama (same liczby całkowite)
export function drawLine(
  buf: ImageBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
) {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)

  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy

  while (true) {
    buf.setPixel(x0, y0, r, g, b)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

// Prostokąt to po prostu 4 linie
export function drawRect(
  buf: ImageBuffer,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
) {
  drawLine(buf, x1, y1, x2, y1, r, g, b)
  drawLine(buf, x2, y1, x2, y2, r, g, b)
  drawLine(buf, x2, y2, x1, y2, r, g, b)
  drawLine(buf, x1, y2, x1, y1, r, g, b)
}

// Okrąg - algorytm punktu środkowego.
// Liczymy tylko 1/8 okręgu, resztę dostajemy z symetrii.
export function drawCircle(
  buf: ImageBuffer,
  cx: number,
  cy: number,
  radius: number,
  r: number,
  g: number,
  b: number,
) {
  cx = Math.round(cx)
  cy = Math.round(cy)
  radius = Math.round(radius)

  if (radius <= 0) {
    buf.setPixel(cx, cy, r, g, b)
    return
  }

  let x = radius
  let y = 0
  let d = 1 - radius

  while (y <= x) {
    buf.setPixel(cx + x, cy + y, r, g, b)
    buf.setPixel(cx - x, cy + y, r, g, b)
    buf.setPixel(cx + x, cy - y, r, g, b)
    buf.setPixel(cx - x, cy - y, r, g, b)
    buf.setPixel(cx + y, cy + x, r, g, b)
    buf.setPixel(cx - y, cy + x, r, g, b)
    buf.setPixel(cx + y, cy - x, r, g, b)
    buf.setPixel(cx - y, cy - x, r, g, b)

    y++
    if (d < 0) {
      d += 2 * y + 1
    } else {
      x--
      d += 2 * (y - x) + 1
    }
  }
}

// uchwyt do łapania myszą - biały kwadracik z niebieską ramką (s = pół boku)
export function drawHandle(buf: ImageBuffer, cx: number, cy: number, s: number) {
  for (let y = cy - s; y <= cy + s; y++) {
    for (let x = cx - s; x <= cx + s; x++) {
      const border = x === cx - s || x === cx + s || y === cy - s || y === cy + s
      if (border) buf.setPixel(x, y, 37, 99, 235)
      else buf.setPixel(x, y, 255, 255, 255)
    }
  }
}
