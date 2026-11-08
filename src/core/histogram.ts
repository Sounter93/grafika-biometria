import type { ImageBuffer } from './imageBuffer.ts'

export type Channel = 'r' | 'g' | 'b' | 'avg'

export interface Histogram {
  r: Uint32Array
  g: Uint32Array
  b: Uint32Array
  avg: Uint32Array
  count: number
}

// zliczamy ile pikseli ma każdą wartość 0..255, osobno dla R, G, B i średniej
export function computeHistogram(buf: ImageBuffer): Histogram {
  const r = new Uint32Array(256)
  const g = new Uint32Array(256)
  const b = new Uint32Array(256)
  const avg = new Uint32Array(256)
  const d = buf.data

  for (let i = 0; i < d.length; i += 4) {
    r[d[i]]++
    g[d[i + 1]]++
    b[d[i + 2]]++
    avg[Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)]++
  }

  return { r, g, b, avg, count: buf.width * buf.height }
}

export interface HistStats {
  min: number
  max: number
  mean: number
}

export function histogramStats(h: Uint32Array): HistStats {
  let min = -1
  let max = 0
  let sum = 0
  let count = 0
  for (let v = 0; v < 256; v++) {
    if (h[v] === 0) continue
    if (min < 0) min = v
    max = v
    sum += v * h[v]
    count += h[v]
  }
  return { min: Math.max(min, 0), max, mean: count ? sum / count : 0 }
}
