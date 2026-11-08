import { computeHistogram, histogramStats, type Channel, type Histogram } from './histogram.ts'
import { ImageBuffer } from './imageBuffer.ts'
import { showBuffer } from './io.ts'

type Mode = Channel | 'all'

const W = 256
const H = 120

const MODES: { id: Mode; name: string }[] = [
  { id: 'all', name: 'RGB' },
  { id: 'r', name: 'R' },
  { id: 'g', name: 'G' },
  { id: 'b', name: 'B' },
  { id: 'avg', name: 'Średnia' },
]

const COLORS: Record<Channel, [number, number, number]> = {
  r: [239, 68, 68],
  g: [34, 197, 94],
  b: [59, 130, 246],
  avg: [210, 214, 222],
}

// histogram rysowany piksel po pikselu do małego canvasa
export class HistogramView {
  mode: Mode = 'all'
  hist: Histogram | null = null
  canvas: HTMLCanvasElement
  buf = new ImageBuffer(W, H)
  statsEl: HTMLDivElement
  root: HTMLElement

  constructor(root: HTMLElement) {
    this.root = root
    root.innerHTML = `
      <div class="seg js-hist-modes">
        ${MODES.map((m) => `<button data-mode="${m.id}">${m.name}</button>`).join('')}
      </div>
      <div class="hist-box"><canvas></canvas></div>
      <div class="hist-axis"><span>0</span><span>128</span><span>255</span></div>
      <div class="hist-stats js-hist-stats"></div>
    `
    this.canvas = root.querySelector('canvas')!
    this.statsEl = root.querySelector('.js-hist-stats')!

    root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode as Mode
        this.draw()
      })
    })
  }

  update(img: ImageBuffer) {
    this.hist = computeHistogram(img)
    this.draw()
  }

  draw() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.mode)
    })

    const d = this.buf.data
    // tło
    this.buf.fill(17, 19, 23)
    // linie pomocnicze co 1/4
    for (let x = 64; x < W; x += 64) {
      for (let y = 0; y < H; y++) this.buf.setPixel(x, y, 40, 44, 52)
    }

    const h = this.hist
    if (!h) return showBuffer(this.canvas, this.buf)

    const channels: Channel[] = this.mode === 'all' ? ['r', 'g', 'b'] : [this.mode]

    // najwyższy słupek = cała wysokość
    let max = 1
    for (const ch of channels) {
      for (let v = 0; v < 256; v++) if (h[ch][v] > max) max = h[ch][v]
    }

    for (let x = 0; x < W; x++) {
      for (const ch of channels) {
        const barH = Math.round((h[ch][x] / max) * H)
        const [cr, cg, cb] = COLORS[ch]
        for (let y = H - barH; y < H; y++) {
          const i = (y * W + x) * 4
          if (this.mode === 'all') {
            // w trybie RGB kolory się sumują, jak światło
            d[i] = Math.max(d[i], cr)
            d[i + 1] = Math.max(d[i + 1], cg)
            d[i + 2] = Math.max(d[i + 2], cb)
          } else {
            d[i] = cr
            d[i + 1] = cg
            d[i + 2] = cb
          }
        }
      }
    }
    showBuffer(this.canvas, this.buf)

    const statCh: Channel = this.mode === 'all' ? 'avg' : this.mode
    const st = histogramStats(h[statCh])
    this.statsEl.innerHTML = `
      <div><span>min</span><b>${st.min}</b></div>
      <div><span>max</span><b>${st.max}</b></div>
      <div><span>średnia</span><b>${st.mean.toFixed(1)}</b></div>
      <div><span>piksele</span><b>${h.count.toLocaleString('pl-PL')}</b></div>
    `
  }
}
