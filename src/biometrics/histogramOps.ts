import { computeHistogram } from '../core/histogram.ts'
import type { ImageBuffer } from '../core/imageBuffer.ts'
import { applyLut, applyLutAll, makeLut } from '../core/lut.ts'

// najmniejsza i największa wartość w obrazie (po wszystkich kanałach)
export function imageMinMax(src: ImageBuffer): [number, number] {
  const d = src.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = d[i + c]
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  return [min, max]
}

// Rozciąganie histogramu: zakres [inMin, inMax] przechodzi liniowo na [outMin, outMax].
// Co jest poniżej inMin dostaje outMin, co powyżej inMax dostaje outMax.
export function stretchHistogram(src: ImageBuffer, inMin: number, inMax: number, outMin: number, outMax: number) {
  const lut = makeLut((v) => {
    if (inMax <= inMin) return v <= inMin ? outMin : outMax
    let t = (v - inMin) / (inMax - inMin)
    t = Math.max(0, Math.min(1, t))
    return outMin + t * (outMax - outMin)
  })
  return applyLutAll(src, lut)
}

// LUT do wyrównania z dystrybuanty (sumy narastającej histogramu)
function equalizeLut(hist: Uint32Array) {
  const cdf = new Uint32Array(256)
  let sum = 0
  for (let v = 0; v < 256; v++) {
    sum += hist[v]
    cdf[v] = sum
  }
  let cdfMin = 0
  for (let v = 0; v < 256; v++) {
    if (cdf[v] > 0) {
      cdfMin = cdf[v]
      break
    }
  }
  const total = sum
  // obraz w jednym kolorze - nie ma czego wyrównywać
  if (total === cdfMin) return makeLut((v) => v)
  return makeLut((v) => ((cdf[v] - cdfMin) / (total - cdfMin)) * 255)
}

// Wyrównanie histogramu.
// separate = każdy kanał ma swój histogram, inaczej używamy histogramu średniej dla wszystkich
export function equalizeHistogram(src: ImageBuffer, separate: boolean) {
  const h = computeHistogram(src)
  if (separate) return applyLut(src, equalizeLut(h.r), equalizeLut(h.g), equalizeLut(h.b))
  return applyLutAll(src, equalizeLut(h.avg))
}
