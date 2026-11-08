import { fromMask, toGray } from '../core/channels.ts'
import type { ImageBuffer } from '../core/imageBuffer.ts'
import { localMeanStd, localMinMax } from '../core/integral.ts'
import { otsuThreshold } from './binarization.ts'

// Binaryzacja lokalna: każdy piksel ma swój próg T, liczony z okna wokół niego.
// Piksel jaśniejszy od T -> biały, inaczej czarny. Liczymy na jasności (średnia z R, G, B).

// Niblack: T = m + k * s
// m - średnia w oknie, s - odchylenie standardowe w oknie, k zwykle ok. -0.2
export function niblack(src: ImageBuffer, size: number, k: number) {
  const { width: w, height: h } = src
  const g = toGray(src)
  const { mean, std } = localMeanStd(g, w, h, size)
  const mask = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const t = mean[p] + k * std[p]
    mask[p] = g[p] > t ? 1 : 0
  }
  return fromMask(mask, w, h)
}

// Sauvola: T = m * (1 + k * (s / R - 1))
// R - największe możliwe odchylenie (dla 8 bitów 128), k zwykle 0.2 - 0.5
export function sauvola(src: ImageBuffer, size: number, k: number, R: number) {
  const { width: w, height: h } = src
  const g = toGray(src)
  const { mean, std } = localMeanStd(g, w, h, size)
  const mask = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const t = mean[p] * (1 + k * (std[p] / R - 1))
    mask[p] = g[p] > t ? 1 : 0
  }
  return fromMask(mask, w, h)
}

// Phansalkar: T = m * (1 + p * exp(-q * m) + k * (s / R - 1))
// tu jasności są w zakresie 0..1, domyślnie p = 2, q = 10, k = 0.25, R = 0.5
// (lepszy od Sauvoli dla ciemnych miejsc, np. słabo oświetlonych zdjęć)
export function phansalkar(src: ImageBuffer, size: number, k: number, R: number, pp: number, q: number) {
  const { width: w, height: h } = src
  const g = toGray(src)
  const { mean, std } = localMeanStd(g, w, h, size)
  const mask = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const m = mean[p] / 255
    const s = std[p] / 255
    const t = m * (1 + pp * Math.exp(-q * m) + k * (s / R - 1))
    mask[p] = g[p] / 255 > t ? 1 : 0
  }
  return fromMask(mask, w, h)
}

// Bernsen: w oknie bierzemy min i max.
// Jeśli kontrast (max - min) jest mały (< L), to okno jest jednolite i patrzymy tylko czy jest jasne.
// Jeśli kontrast jest duży, progiem jest środek: T = (min + max) / 2
export function bernsen(src: ImageBuffer, size: number, contrastLimit: number) {
  const { width: w, height: h } = src
  const g = toGray(src)
  const { min, max } = localMinMax(g, w, h, size)
  const mask = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const mid = (min[p] + max[p]) / 2
    if (max[p] - min[p] < contrastLimit) mask[p] = mid >= 128 ? 1 : 0
    else mask[p] = g[p] >= mid ? 1 : 0
  }
  return fromMask(mask, w, h)
}

// Nasz własny algorytm: mieszanka progu globalnego (Otsu) i lokalnego (średnia w oknie).
// T = a * T_otsu + (1 - a) * m
// Gdzie okno jest prawie jednolite (s < sMin), lokalna średnia nic nie mówi,
// więc wtedy bierzemy sam próg Otsu - dzięki temu tło nie robi się "zaszumione".
export function ownBinarization(src: ImageBuffer, size: number, a: number, sMin: number) {
  const { width: w, height: h } = src
  const g = toGray(src)
  const hist = new Uint32Array(256)
  for (let p = 0; p < w * h; p++) hist[g[p]]++
  const tOtsu = otsuThreshold(hist)

  const { mean, std } = localMeanStd(g, w, h, size)
  const mask = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const t = std[p] < sMin ? tOtsu : a * tOtsu + (1 - a) * mean[p]
    mask[p] = g[p] > t ? 1 : 0
  }
  return fromMask(mask, w, h)
}
