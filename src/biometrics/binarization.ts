import type { Channel } from '../core/histogram.ts'
import { ImageBuffer } from '../core/imageBuffer.ts'

// Binaryzacja progowa na wybranym kanale (albo średniej).
// Wartość > próg -> biały, w przeciwnym razie czarny.
export function thresholdBinarize(src: ImageBuffer, channel: Channel, threshold: number): ImageBuffer {
  const out = new ImageBuffer(src.width, src.height)
  const s = src.data
  const d = out.data
  const offset = channel === 'r' ? 0 : channel === 'g' ? 1 : 2

  for (let i = 0; i < s.length; i += 4) {
    const v = channel === 'avg' ? (s[i] + s[i + 1] + s[i + 2]) / 3 : s[i + offset]
    const c = v > threshold ? 255 : 0
    d[i] = c
    d[i + 1] = c
    d[i + 2] = c
    d[i + 3] = 255
  }
  return out
}

// Każdy kanał binaryzujemy osobno, więc wychodzi max 8 kolorów
export function thresholdEachChannel(src: ImageBuffer, threshold: number): ImageBuffer {
  const out = new ImageBuffer(src.width, src.height)
  const s = src.data
  const d = out.data
  for (let i = 0; i < s.length; i += 4) {
    d[i] = s[i] > threshold ? 255 : 0
    d[i + 1] = s[i + 1] > threshold ? 255 : 0
    d[i + 2] = s[i + 2] > threshold ? 255 : 0
    d[i + 3] = 255
  }
  return out
}

// Metoda Otsu: szukamy progu, przy którym dwie grupy pikseli
// (ciemne i jasne) są od siebie najbardziej "oddalone" (max wariancja międzyklasowa)
export function otsuThreshold(hist: Uint32Array): number {
  let total = 0
  let sumAll = 0
  for (let t = 0; t < 256; t++) {
    total += hist[t]
    sumAll += t * hist[t]
  }

  let wB = 0 // ile pikseli w grupie ciemnej
  let sumB = 0
  let best = 0
  let bestVar = -1

  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB // ile w jasnej
    if (wF === 0) break

    sumB += t * hist[t]
    const meanB = sumB / wB
    const meanF = (sumAll - sumB) / wF
    const between = wB * wF * (meanB - meanF) * (meanB - meanF)

    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best
}
