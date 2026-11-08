import { ImageBuffer } from '../core/imageBuffer.ts'
import { applyLutAll, makeLut } from '../core/lut.ts'

// jasność: -255..255 (dodajemy do każdego kanału)
// kontrast: -100..100 (rozciągamy/ściskamy wartości wokół środka 128)
export function brightnessContrast(src: ImageBuffer, brightness: number, contrast: number) {
  const c = contrast * 2.55
  const factor = (259 * (c + 255)) / (255 * (259 - c))
  const lut = makeLut((v) => factor * (v - 128) + 128 + brightness)
  return applyLutAll(src, lut)
}

export function negative(src: ImageBuffer) {
  return applyLutAll(src, makeLut((v) => 255 - v))
}

// skala szarości jako średnia z R, G, B
export function grayscale(src: ImageBuffer) {
  const out = new ImageBuffer(src.width, src.height)
  const s = src.data
  const d = out.data
  for (let i = 0; i < s.length; i += 4) {
    const v = (s[i] + s[i + 1] + s[i + 2]) / 3
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  return out
}
