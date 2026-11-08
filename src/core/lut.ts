import { ImageBuffer } from './imageBuffer.ts'

// LUT = tablica "stara wartość -> nowa wartość".
// Liczymy ją raz (256 pozycji), a potem tylko podmieniamy piksele - dlatego jest szybko.
export function applyLut(src: ImageBuffer, lutR: Uint8ClampedArray, lutG: Uint8ClampedArray, lutB: Uint8ClampedArray) {
  const out = new ImageBuffer(src.width, src.height)
  const s = src.data
  const d = out.data
  for (let i = 0; i < s.length; i += 4) {
    d[i] = lutR[s[i]]
    d[i + 1] = lutG[s[i + 1]]
    d[i + 2] = lutB[s[i + 2]]
    d[i + 3] = 255
  }
  return out
}

// ta sama LUT dla wszystkich kanałów
export function applyLutAll(src: ImageBuffer, lut: Uint8ClampedArray) {
  return applyLut(src, lut, lut, lut)
}

export function makeLut(fn: (v: number) => number) {
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) lut[v] = Math.round(fn(v))
  return lut
}
