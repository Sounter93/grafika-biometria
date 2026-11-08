// Binaryzacja na podstawie entropii histogramu.
// Próg t dzieli piksele na dwie grupy: tło [0..t] i obiekt [t+1..255].
// Entropia grupy mówi, jak "różnorodne" są w niej jasności.

// entropia obu grup dla progu t (p = histogram znormalizowany, suma = 1)
function entropies(p: Float64Array, t: number): [number, number] | null {
  let p0 = 0
  for (let i = 0; i <= t; i++) p0 += p[i]
  const p1 = 1 - p0
  // jedna z grup pusta - taki próg nie ma sensu
  if (p0 <= 0 || p1 <= 0) return null

  let h0 = 0
  for (let i = 0; i <= t; i++) {
    if (p[i] > 0) h0 -= (p[i] / p0) * Math.log(p[i] / p0)
  }
  let h1 = 0
  for (let i = t + 1; i < 256; i++) {
    if (p[i] > 0) h1 -= (p[i] / p1) * Math.log(p[i] / p1)
  }
  return [h0, h1]
}

function normalize(hist: Uint32Array) {
  let total = 0
  for (let i = 0; i < 256; i++) total += hist[i]
  const p = new Float64Array(256)
  for (let i = 0; i < 256; i++) p[i] = total ? hist[i] / total : 0
  return p
}

// Kapur: wybieramy próg, przy którym SUMA entropii tła i obiektu jest największa
export function kapurThreshold(hist: Uint32Array): number {
  const p = normalize(hist)
  let best = 0
  let bestValue = -Infinity
  for (let t = 0; t < 255; t++) {
    const e = entropies(p, t)
    if (!e) continue
    if (e[0] + e[1] > bestValue) {
      bestValue = e[0] + e[1]
      best = t
    }
  }
  return best
}

// LuWu (Wu, Ma, Lu): wybieramy próg, przy którym entropie tła i obiektu są sobie NAJBLIŻSZE
export function luWuThreshold(hist: Uint32Array): number {
  const p = normalize(hist)
  let best = 0
  let bestDiff = Infinity
  for (let t = 0; t < 255; t++) {
    const e = entropies(p, t)
    if (!e) continue
    const diff = Math.abs(e[0] - e[1])
    if (diff < bestDiff) {
      bestDiff = diff
      best = t
    }
  }
  return best
}
