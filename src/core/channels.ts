import { ImageBuffer } from './imageBuffer.ts'

// jasność piksela = średnia z R, G, B (tak samo jak w histogramie)
export function toGray(src: ImageBuffer): Uint8Array {
  const n = src.width * src.height
  const g = new Uint8Array(n)
  const d = src.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    g[p] = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)
  }
  return g
}

// jeden kanał (0 = R, 1 = G, 2 = B) jako osobna tablica
export function getChannel(src: ImageBuffer, c: number): Uint8Array {
  const n = src.width * src.height
  const out = new Uint8Array(n)
  const d = src.data
  for (let p = 0, i = c; p < n; p++, i += 4) out[p] = d[i]
  return out
}

// z trzech kanałów z powrotem obraz
export function fromChannels(r: Uint8Array, g: Uint8Array, b: Uint8Array, w: number, h: number) {
  const out = new ImageBuffer(w, h)
  const d = out.data
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    d[i] = r[p]
    d[i + 1] = g[p]
    d[i + 2] = b[p]
    d[i + 3] = 255
  }
  return out
}

// obraz szary z jednej tablicy
export function fromGray(g: Uint8Array, w: number, h: number) {
  return fromChannels(g, g, g, w, h)
}

// obraz czarno-biały z maski (1 = biały, 0 = czarny)
export function fromMask(mask: Uint8Array, w: number, h: number) {
  const out = new ImageBuffer(w, h)
  const d = out.data
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const v = mask[p] ? 255 : 0
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  return out
}
