// Obraz całkowy (summed area table).
// W punkcie (x, y) trzymamy sumę wszystkich wartości na lewo i w górę od niego.
// Dzięki temu sumę w dowolnym prostokącie liczymy z 4 odczytów - niezależnie od wielkości okna.
export class IntegralImage {
  w: number
  h: number
  sum: Float64Array
  sumSq: Float64Array | null

  constructor(values: ArrayLike<number>, w: number, h: number, withSquares = false) {
    this.w = w
    this.h = h
    const W = w + 1
    this.sum = new Float64Array(W * (h + 1))
    this.sumSq = withSquares ? new Float64Array(W * (h + 1)) : null

    for (let y = 0; y < h; y++) {
      let rowSum = 0
      let rowSq = 0
      for (let x = 0; x < w; x++) {
        const v = values[y * w + x]
        rowSum += v
        rowSq += v * v
        const i = (y + 1) * W + (x + 1)
        this.sum[i] = this.sum[i - W] + rowSum
        if (this.sumSq) this.sumSq[i] = this.sumSq[i - W] + rowSq
      }
    }
  }

  private areaSum(t: Float64Array, x0: number, y0: number, x1: number, y1: number) {
    const W = this.w + 1
    return t[(y1 + 1) * W + (x1 + 1)] - t[y0 * W + (x1 + 1)] - t[(y1 + 1) * W + x0] + t[y0 * W + x0]
  }

  // prostokąt x0..x1, y0..y1 (włącznie) - współrzędne muszą być już w obrazie
  rectSum(x0: number, y0: number, x1: number, y1: number) {
    return this.areaSum(this.sum, x0, y0, x1, y1)
  }

  rectSumSq(x0: number, y0: number, x1: number, y1: number) {
    return this.areaSum(this.sumSq!, x0, y0, x1, y1)
  }
}

// średnia i odchylenie standardowe w oknie size x size wokół każdego piksela
// (przy brzegu okno jest obcinane do obrazu)
export function localMeanStd(gray: Uint8Array, w: number, h: number, size: number) {
  const ii = new IntegralImage(gray, w, h, true)
  const r = size >> 1
  const mean = new Float32Array(w * h)
  const std = new Float32Array(w * h)

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      const n = (x1 - x0 + 1) * (y1 - y0 + 1)
      const m = ii.rectSum(x0, y0, x1, y1) / n
      const variance = ii.rectSumSq(x0, y0, x1, y1) / n - m * m
      mean[y * w + x] = m
      std[y * w + x] = Math.sqrt(Math.max(0, variance))
    }
  }
  return { mean, std }
}

// najmniejsza i największa wartość w oknie size x size.
// Robimy to w dwóch krokach: najpierw w poziomie, potem w pionie (tak jest dużo szybciej).
export function localMinMax(gray: Uint8Array, w: number, h: number, size: number) {
  const r = size >> 1
  const rowMin = new Uint8Array(w * h)
  const rowMax = new Uint8Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let mn = 255
      let mx = 0
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let xx = x0; xx <= x1; xx++) {
        const v = gray[y * w + xx]
        if (v < mn) mn = v
        if (v > mx) mx = v
      }
      rowMin[y * w + x] = mn
      rowMax[y * w + x] = mx
    }
  }

  const min = new Uint8Array(w * h)
  const max = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      let mn = 255
      let mx = 0
      for (let yy = y0; yy <= y1; yy++) {
        const a = rowMin[yy * w + x]
        const b = rowMax[yy * w + x]
        if (a < mn) mn = a
        if (b > mx) mx = b
      }
      min[y * w + x] = mn
      max[y * w + x] = mx
    }
  }
  return { min, max }
}
