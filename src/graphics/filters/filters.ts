import { fromChannels, fromGray, getChannel, toGray } from '../../core/channels.ts'
import { ImageBuffer } from '../../core/imageBuffer.ts'
import { IntegralImage } from '../../core/integral.ts'

// przy brzegu obrazu bierzemy najbliższy piksel z obrazu
const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v)

// ---------- filtr uśredniający ----------

// każdy piksel = średnia z okna size x size (osobno R, G, B).
// Sumę okna bierzemy z obrazu całkowego, więc duże okno nie spowalnia.
export function meanFilter(src: ImageBuffer, size: number) {
  const { width: w, height: h } = src
  const r = size >> 1
  const planes = [0, 1, 2].map((c) => {
    const ch = getChannel(src, c)
    const ii = new IntegralImage(ch, w, h)
    const out = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r)
        const x1 = Math.min(w - 1, x + r)
        const n = (x1 - x0 + 1) * (y1 - y0 + 1)
        out[y * w + x] = Math.round(ii.rectSum(x0, y0, x1, y1) / n)
      }
    }
    return out
  })
  return fromChannels(planes[0], planes[1], planes[2], w, h)
}

// ---------- filtr medianowy ----------

// Mediana z okna size x size dla jednego kanału.
// Zamiast sortować okno dla każdego piksela, trzymamy histogram okna
// i przesuwając okno w prawo tylko wyjmujemy lewą kolumnę i dokładamy prawą (algorytm Huanga).
function medianPlane(src: Uint8Array, w: number, h: number, size: number) {
  const r = size >> 1
  const half = (size * size) >> 1
  const out = new Uint8Array(w * h)
  const hist = new Int32Array(256)

  for (let y = 0; y < h; y++) {
    hist.fill(0)
    for (let dy = -r; dy <= r; dy++) {
      const row = clamp(y + dy, h - 1) * w
      for (let dx = -r; dx <= r; dx++) hist[src[row + clamp(dx, w - 1)]]++
    }

    // mdn = mediana, lt = ile wartości w oknie jest mniejszych od mdn
    let mdn = 0
    let lt = 0
    while (lt + hist[mdn] <= half) {
      lt += hist[mdn]
      mdn++
    }
    out[y * w] = mdn

    for (let x = 1; x < w; x++) {
      const xOut = clamp(x - r - 1, w - 1)
      const xIn = clamp(x + r, w - 1)
      for (let dy = -r; dy <= r; dy++) {
        const row = clamp(y + dy, h - 1) * w
        const vOut = src[row + xOut]
        hist[vOut]--
        if (vOut < mdn) lt--
        const vIn = src[row + xIn]
        hist[vIn]++
        if (vIn < mdn) lt++
      }
      // poprawiamy medianę w dół albo w górę
      while (lt > half) {
        mdn--
        lt -= hist[mdn]
      }
      while (lt + hist[mdn] <= half) {
        lt += hist[mdn]
        mdn++
      }
      out[y * w + x] = mdn
    }
  }
  return out
}

export function medianFilter(src: ImageBuffer, size: number) {
  const { width: w, height: h } = src
  const r = medianPlane(getChannel(src, 0), w, h, size)
  const g = medianPlane(getChannel(src, 1), w, h, size)
  const b = medianPlane(getChannel(src, 2), w, h, size)
  return fromChannels(r, g, b, w, h)
}

// ---------- Sobel ----------

// Gx wykrywa zmiany w poziomie, Gy w pionie, wynik = sqrt(Gx² + Gy²)
//      | -1 0 1 |        | -1 -2 -1 |
// Gx = | -2 0 2 |   Gy = |  0  0  0 |
//      | -1 0 1 |        |  1  2  1 |
function sobelPlane(src: Uint8Array, w: number, h: number) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const up = clamp(y - 1, h - 1) * w
    const mid = y * w
    const down = clamp(y + 1, h - 1) * w
    for (let x = 0; x < w; x++) {
      const l = clamp(x - 1, w - 1)
      const r = clamp(x + 1, w - 1)
      const gx = src[up + r] + 2 * src[mid + r] + src[down + r] - src[up + l] - 2 * src[mid + l] - src[down + l]
      const gy = src[down + l] + 2 * src[down + x] + src[down + r] - src[up + l] - 2 * src[up + x] - src[up + r]
      out[mid + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy))
    }
  }
  return out
}

// gray = na jasności (wynik szary), inaczej osobno dla R, G, B (wynik kolorowy)
export function sobel(src: ImageBuffer, gray: boolean) {
  const { width: w, height: h } = src
  if (gray) return fromGray(sobelPlane(toGray(src), w, h), w, h)
  return fromChannels(
    sobelPlane(getChannel(src, 0), w, h),
    sobelPlane(getChannel(src, 1), w, h),
    sobelPlane(getChannel(src, 2), w, h),
    w,
    h,
  )
}

// ---------- splot (filtr liniowy z dowolną maską) ----------

export interface Kernel {
  size: number // maska size x size (nieparzyste)
  values: number[] // wiersz po wierszu
  divisor: number // przez ile dzielimy sumę
  offset: number // co dodajemy na koniec (np. 128 żeby zobaczyć wartości ujemne)
  abs: boolean // wartość bezwzględna (przydatne dla masek krawędziowych)
}

// suma wag maski (dzielnik "auto"), jak wychodzi 0 to dzielimy przez 1
export function kernelSum(values: number[]) {
  const s = values.reduce((a, b) => a + b, 0)
  return Math.abs(s) < 1e-9 ? 1 : s
}

// nowy piksel = suma (piksel z okna * waga z maski) / dzielnik + przesunięcie
function convolvePlane(src: Uint8Array, w: number, h: number, k: Kernel) {
  const r = k.size >> 1
  // zapamiętujemy tylko niezerowe wagi, żeby nie liczyć niepotrzebnie
  const dxs: number[] = []
  const dys: number[] = []
  const ws: number[] = []
  for (let ky = 0; ky < k.size; ky++) {
    for (let kx = 0; kx < k.size; kx++) {
      const v = k.values[ky * k.size + kx]
      if (v === 0) continue
      dxs.push(kx - r)
      dys.push(ky - r)
      ws.push(v)
    }
  }

  // przesunięcie w tablicy dla każdej wagi (do szybkiego liczenia w środku obrazu)
  const n = ws.length
  const offs = new Int32Array(n)
  const wf = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    offs[i] = dys[i] * w + dxs[i]
    wf[i] = ws[i]
  }

  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const insideY = y >= r && y < h - r
    for (let x = 0; x < w; x++) {
      let sum = 0
      const p = y * w + x
      if (insideY && x >= r && x < w - r) {
        // środek obrazu - okno na pewno się mieści
        for (let i = 0; i < n; i++) sum += src[p + offs[i]] * wf[i]
      } else {
        // brzeg - bierzemy najbliższy piksel z obrazu
        for (let i = 0; i < n; i++) {
          sum += src[clamp(y + dys[i], h - 1) * w + clamp(x + dxs[i], w - 1)] * wf[i]
        }
      }
      let v = sum / k.divisor
      if (k.abs) v = Math.abs(v)
      v += k.offset
      out[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
    }
  }
  return out
}

export function convolve(src: ImageBuffer, k: Kernel, gray: boolean) {
  const { width: w, height: h } = src
  if (gray) return fromGray(convolvePlane(toGray(src), w, h, k), w, h)
  return fromChannels(
    convolvePlane(getChannel(src, 0), w, h, k),
    convolvePlane(getChannel(src, 1), w, h, k),
    convolvePlane(getChannel(src, 2), w, h, k),
    w,
    h,
  )
}

// maska Gaussa dowolnego rozmiaru: waga = exp(-(x² + y²) / (2σ²))
export function gaussKernel(size: number, sigma: number): number[] {
  const r = size >> 1
  const values: number[] = []
  let sum = 0
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const v = Math.exp(-(x * x + y * y) / (2 * sigma * sigma))
      values.push(v)
      sum += v
    }
  }
  // normalizujemy, żeby suma = 1, i zaokrąglamy żeby ładnie wyglądało w polach
  return values.map((v) => Math.round((v / sum) * 10000) / 10000)
}

// ---------- pikselizacja ----------

// obraz dzielimy na kwadraty block x block i każdy wypełniamy średnim kolorem
export function pixelate(src: ImageBuffer, block: number) {
  const { width: w, height: h } = src
  const s = src.data
  const out = new ImageBuffer(w, h)
  const d = out.data

  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      const x1 = Math.min(w, bx + block)
      const y1 = Math.min(h, by + block)
      let r = 0
      let g = 0
      let b = 0
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * w + x) * 4
          r += s[i]
          g += s[i + 1]
          b += s[i + 2]
        }
      }
      const n = (x1 - bx) * (y1 - by)
      r = Math.round(r / n)
      g = Math.round(g / n)
      b = Math.round(b / n)
      for (let y = by; y < y1; y++) {
        for (let x = bx; x < x1; x++) {
          const i = (y * w + x) * 4
          d[i] = r
          d[i + 1] = g
          d[i + 2] = b
          d[i + 3] = 255
        }
      }
    }
  }
  return out
}

// ---------- Kuwahara ----------

// Okno wokół piksela dzielimy na 4 nachodzące na siebie ćwiartki.
// Wybieramy ćwiartkę z najmniejszą wariancją (najbardziej jednolitą) i bierzemy jej średni kolor.
// Wygładza obraz, ale zostawia ostre krawędzie (efekt "obrazu olejnego").
export function kuwahara(src: ImageBuffer, size: number) {
  const { width: w, height: h } = src
  const r = size >> 1
  const gray = toGray(src)
  const iiGray = new IntegralImage(gray, w, h, true)
  const iiR = new IntegralImage(getChannel(src, 0), w, h)
  const iiG = new IntegralImage(getChannel(src, 1), w, h)
  const iiB = new IntegralImage(getChannel(src, 2), w, h)

  const out = new ImageBuffer(w, h)
  const d = out.data

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let bestVar = Infinity
      let bx0 = 0
      let by0 = 0
      let bx1 = 0
      let by1 = 0

      // 4 ćwiartki: lewa-górna, prawa-górna, lewa-dolna, prawa-dolna
      for (let q = 0; q < 4; q++) {
        const x0 = q % 2 === 0 ? Math.max(0, x - r) : x
        const x1 = q % 2 === 0 ? x : Math.min(w - 1, x + r)
        const y0 = q < 2 ? Math.max(0, y - r) : y
        const y1 = q < 2 ? y : Math.min(h - 1, y + r)
        const n = (x1 - x0 + 1) * (y1 - y0 + 1)
        const m = iiGray.rectSum(x0, y0, x1, y1) / n
        const variance = iiGray.rectSumSq(x0, y0, x1, y1) / n - m * m
        if (variance < bestVar) {
          bestVar = variance
          bx0 = x0
          by0 = y0
          bx1 = x1
          by1 = y1
        }
      }

      const n = (bx1 - bx0 + 1) * (by1 - by0 + 1)
      const i = (y * w + x) * 4
      d[i] = iiR.rectSum(bx0, by0, bx1, by1) / n
      d[i + 1] = iiG.rectSum(bx0, by0, bx1, by1) / n
      d[i + 2] = iiB.rectSum(bx0, by0, bx1, by1) / n
      d[i + 3] = 255
    }
  }
  return out
}

// ---------- MinRGB i Predator ----------

// w każdym pikselu zostawiamy tylko najmniejszą składową, resztę zerujemy
export function minRGB(src: ImageBuffer) {
  const out = new ImageBuffer(src.width, src.height)
  const s = src.data
  const d = out.data
  for (let i = 0; i < s.length; i += 4) {
    const m = Math.min(s[i], s[i + 1], s[i + 2])
    d[i] = s[i] === m ? m : 0
    d[i + 1] = s[i + 1] === m ? m : 0
    d[i + 2] = s[i + 2] === m ? m : 0
    d[i + 3] = 255
  }
  return out
}

// Filtr Predatora = pikselizacja -> MinRGB -> Sobel (na kanałach RGB)
export function predator(src: ImageBuffer, block: number) {
  return sobel(minRGB(pixelate(src, block)), false)
}
