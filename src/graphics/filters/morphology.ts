import { ImageBuffer } from '../../core/imageBuffer.ts'

// Element strukturyzujący: siatka rows x cols, 1 = komórka należy do elementu.
// Środek elementu to komórka (cols/2, rows/2).
export interface StructElement {
  rows: number
  cols: number
  cells: Uint8Array
}

// czy obraz ma tylko czarne i białe piksele
export function isBinary(src: ImageBuffer) {
  const d = src.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i]
    if ((v !== 0 && v !== 255) || d[i + 1] !== v || d[i + 2] !== v) return false
  }
  return true
}

// obraz -> maska 0/1 (1 = obiekt).
// Obiekt to białe piksele albo czarne, zależnie od ustawienia.
// Jak obraz nie jest binarny, dzielimy go progiem 128.
export function toMask(src: ImageBuffer, objectWhite: boolean) {
  const n = src.width * src.height
  const mask = new Uint8Array(n)
  const d = src.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const white = (d[i] + d[i + 1] + d[i + 2]) / 3 >= 128
    mask[p] = white === objectWhite ? 1 : 0
  }
  return mask
}

export function maskToImage(mask: Uint8Array, w: number, h: number, objectWhite: boolean) {
  const out = new ImageBuffer(w, h)
  const d = out.data
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const isObject = mask[p] === 1
    const v = isObject === objectWhite ? 255 : 0
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v
    d[i + 3] = 255
  }
  return out
}

// przesunięcia (dx, dy) zaznaczonych komórek względem środka
function offsets(se: StructElement) {
  const cx = se.cols >> 1
  const cy = se.rows >> 1
  const dx: number[] = []
  const dy: number[] = []
  for (let r = 0; r < se.rows; r++) {
    for (let c = 0; c < se.cols; c++) {
      if (se.cells[r * se.cols + c]) {
        dx.push(c - cx)
        dy.push(r - cy)
      }
    }
  }
  return { dx, dy }
}

// Dylatacja: piksel staje się obiektem, jeśli element przyłożony w tym miejscu
// trafia choć w jeden piksel obiektu. Obiekty się "pogrubiają".
export function dilate(mask: Uint8Array, w: number, h: number, se: StructElement) {
  const { dx, dy } = offsets(se)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let i = 0; i < dx.length; i++) {
        // element odbity (minus), tak jak w definicji dylatacji
        const xx = x - dx[i]
        const yy = y - dy[i]
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        if (mask[yy * w + xx]) {
          out[y * w + x] = 1
          break
        }
      }
    }
  }
  return out
}

// Erozja: piksel zostaje obiektem tylko wtedy, gdy CAŁY element mieści się w obiekcie.
// Obiekty się "odchudzają", małe kropki znikają.
export function erode(mask: Uint8Array, w: number, h: number, se: StructElement) {
  const { dx, dy } = offsets(se)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1
      for (let i = 0; i < dx.length; i++) {
        const xx = x + dx[i]
        const yy = y + dy[i]
        // poza obrazem nie sprawdzamy
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        if (!mask[yy * w + xx]) {
          all = 0
          break
        }
      }
      out[y * w + x] = all
    }
  }
  return out
}

export type MorphOp = 'dilate' | 'erode' | 'open' | 'close'

// otwarcie = erozja, potem dylatacja (usuwa drobne kropki)
// zamknięcie = dylatacja, potem erozja (zakleja małe dziury)
export function morphology(src: ImageBuffer, se: StructElement, op: MorphOp, objectWhite: boolean) {
  const { width: w, height: h } = src
  let m = toMask(src, objectWhite)
  if (op === 'dilate') m = dilate(m, w, h, se)
  else if (op === 'erode') m = erode(m, w, h, se)
  else if (op === 'open') m = dilate(erode(m, w, h, se), w, h, se)
  else m = erode(dilate(m, w, h, se), w, h, se)
  return maskToImage(m, w, h, objectWhite)
}
