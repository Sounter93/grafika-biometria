import { ImageBuffer } from '../../core/imageBuffer.ts'
import { showBuffer } from '../../core/io.ts'
import type { Editor } from '../../editor/editor.ts'
import { cmykToRgb, hexToRgb, hsvToRgb, rgbToCmyk, rgbToHex, rgbToHsv } from './convert.ts'

// Pasek z gradientem, po którym klikamy / przeciągamy myszą (jak suwaki w Photoshopie).
// Canvas ma 256 x 1 piksel, a CSS rozciąga go na całą szerokość.
class ColorBar {
  canvas: HTMLCanvasElement
  buf: ImageBuffer
  marker: HTMLDivElement

  constructor(holder: HTMLElement, onPick: (t: number) => void) {
    holder.classList.add('bar')
    this.canvas = document.createElement('canvas')
    this.buf = new ImageBuffer(256, 1)
    this.marker = document.createElement('div')
    this.marker.className = 'bar-marker'
    holder.append(this.canvas, this.marker)

    let pressed = false
    const pick = (e: PointerEvent) => {
      const r = holder.getBoundingClientRect()
      const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      onPick(t)
    }
    holder.addEventListener('pointerdown', (e) => {
      pressed = true
      holder.setPointerCapture(e.pointerId)
      pick(e)
    })
    holder.addEventListener('pointermove', (e) => {
      if (pressed) pick(e)
    })
    holder.addEventListener('pointerup', () => (pressed = false))
  }

  // colorAt(t, out) ma wpisać do out kolor (0..1) dla pozycji t
  paint(colorAt: (t: number, out: number[]) => void) {
    const out = [0, 0, 0]
    for (let x = 0; x < 256; x++) {
      colorAt(x / 255, out)
      this.buf.setPixel(x, 0, out[0] * 255, out[1] * 255, out[2] * 255)
    }
    showBuffer(this.canvas, this.buf)
  }

  setValue(t: number) {
    this.marker.style.left = `${t * 100}%`
  }
}

// kolory jak w Paincie
const PALETTE = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
]

const f3 = (v: number) => v.toFixed(3)
const pct = (v: number) => (v * 100).toFixed(1)

// Panel "Kolor": wybór w RGB i CMYK + konwersja. Wybrany kolor = kolor rysowania.
export function mountColorPanel(root: HTMLElement, editor: Editor) {
  const channelRow = (label: string, key: string, max: number, step: number, unit: string) => `
    <div class="channel">
      <span class="ch-label">${label}</span>
      <div class="js-bar-${key}"></div>
      <input type="number" class="js-in-${key}" min="0" max="${max}" step="${step}" />
      <span class="unit">${unit}</span>
    </div>`

  root.innerHTML = `
    <section class="card">
      <h3>Próbnik</h3>
      <div class="sv-box js-sv">
        <canvas width="256" height="256"></canvas>
        <div class="sv-marker"></div>
      </div>
      <div class="js-hue"></div>
      <div class="palette js-palette">
        ${PALETTE.map((c) => `<button class="swatch-btn" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h3>RGB <span class="badge js-badge-rgb"></span></h3>
      ${channelRow('R', 'r', 255, 1, '')}
      ${channelRow('G', 'g', 255, 1, '')}
      ${channelRow('B', 'b', 255, 1, '')}
      <label class="field hex-field">
        <span>HEX</span>
        <input type="text" class="mono js-hex" maxlength="7" spellcheck="false" />
      </label>
    </section>

    <section class="card">
      <h3>CMYK <span class="badge js-badge-cmyk"></span></h3>
      ${channelRow('C', 'c', 100, 0.1, '%')}
      ${channelRow('M', 'm', 100, 0.1, '%')}
      ${channelRow('Y', 'y', 100, 0.1, '%')}
      ${channelRow('K', 'k', 100, 0.1, '%')}
    </section>

    <section class="card">
      <h3>Podgląd i konwersja</h3>
      <div class="preview js-preview"></div>
      <div class="summary js-summary"></div>
      <div class="formula mono js-formula"></div>
    </section>
  `

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!

  // ---------- stan ----------
  let rgb: number[] = [...editor.color] // 0..255
  let cmyk = [0, 0, 0, 0] // 0..1
  let hue = 0 // 0..360
  let sat = 0 // 0..1
  let val = 0 // 0..1
  let source: 'rgb' | 'cmyk' = 'rgb' // w czym użytkownik wybrał kolor

  // ---------- kwadrat nasycenie / jasność ----------
  const svBox = $<HTMLDivElement>('.js-sv')
  const svCanvas = svBox.querySelector('canvas')!
  const svMarker = $<HTMLDivElement>('.sv-marker')
  const svBuf = new ImageBuffer(256, 256)
  let paintedHue = -1

  function paintSv(h: number) {
    const out = [0, 0, 0]
    const d = svBuf.data
    let i = 0
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        hsvToRgb(h, x / 255, 1 - y / 255, out)
        d[i] = out[0] * 255
        d[i + 1] = out[1] * 255
        d[i + 2] = out[2] * 255
        d[i + 3] = 255
        i += 4
      }
    }
    showBuffer(svCanvas, svBuf)
  }

  let svPressed = false
  const svPick = (e: PointerEvent) => {
    const r = svBox.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    setHsv(hue, s, v)
  }
  svBox.addEventListener('pointerdown', (e) => {
    svPressed = true
    svBox.setPointerCapture(e.pointerId)
    svPick(e)
  })
  svBox.addEventListener('pointermove', (e) => {
    if (svPressed) svPick(e)
  })
  svBox.addEventListener('pointerup', () => (svPressed = false))

  // ---------- paski ----------
  const hueBar = new ColorBar($('.js-hue'), (t) => setHsv(t * 360, sat, val))
  hueBar.paint((t, out) => hsvToRgb(t * 360, 1, 1, out))

  const rgbBars = [0, 1, 2].map(
    (ch) =>
      new ColorBar($(`.js-bar-${'rgb'[ch]}`), (t) => {
        const next = [...rgb]
        next[ch] = Math.round(t * 255)
        setRgb(next[0], next[1], next[2])
      }),
  )

  const cmykBars = [0, 1, 2, 3].map(
    (ch) =>
      new ColorBar($(`.js-bar-${'cmyk'[ch]}`), (t) => {
        const next = [...cmyk]
        next[ch] = Math.round(t * 1000) / 1000
        setCmyk(next[0], next[1], next[2], next[3])
      }),
  )

  const rgbInputs = ['r', 'g', 'b'].map((k) => $<HTMLInputElement>(`.js-in-${k}`))
  const cmykInputs = ['c', 'm', 'y', 'k'].map((k) => $<HTMLInputElement>(`.js-in-${k}`))
  const hexInput = $<HTMLInputElement>('.js-hex')

  // ---------- zmiana koloru ----------

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  // HSV liczymy z RGB, ale odcień zostawiamy gdy kolor jest szary (wtedy odcienia nie ma)
  function syncHsv() {
    const [h, s, v] = rgbToHsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    if (s > 0 && v > 0) hue = h
    if (v > 0) sat = s
    val = v
  }

  // po każdej zmianie: odśwież panel i przekaż kolor do edytora
  function changed() {
    refresh()
    editor.setColor([rgb[0], rgb[1], rgb[2]])
  }

  function setRgb(r: number, g: number, b: number, fromPicker = false) {
    rgb = [Math.round(clamp(r, 0, 255)), Math.round(clamp(g, 0, 255)), Math.round(clamp(b, 0, 255))]
    cmyk = rgbToCmyk(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
    if (!fromPicker) syncHsv()
    source = 'rgb'
    changed()
  }

  function setCmyk(c: number, m: number, y: number, k: number) {
    cmyk = [clamp(c, 0, 1), clamp(m, 0, 1), clamp(y, 0, 1), clamp(k, 0, 1)]
    const [r, g, b] = cmykToRgb(cmyk[0], cmyk[1], cmyk[2], cmyk[3])
    rgb = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
    syncHsv()
    source = 'cmyk'
    changed()
  }

  function setHsv(h: number, s: number, v: number) {
    hue = h
    sat = s
    val = v
    const out = [0, 0, 0]
    hsvToRgb(h, s, v, out)
    setRgb(out[0] * 255, out[1] * 255, out[2] * 255, true)
  }

  // kolor zmieniony z zewnątrz (pipeta, zaznaczenie obiektu)
  editor.on('color', () => {
    const c = editor.color
    if (c[0] === rgb[0] && c[1] === rgb[1] && c[2] === rgb[2]) return
    setRgb(c[0], c[1], c[2])
  })

  // ---------- odświeżenie widoku ----------

  // nie nadpisujemy pola, w którym ktoś akurat pisze
  function setInput(inp: HTMLInputElement, value: string, force: boolean) {
    if (force || document.activeElement !== inp) inp.value = value
  }

  function refresh(force = false) {
    const [r, g, b] = rgb
    const [c, m, y, k] = cmyk

    if (hue !== paintedHue) {
      paintSv(hue)
      paintedHue = hue
    }
    svMarker.style.left = `${sat * 100}%`
    svMarker.style.top = `${(1 - val) * 100}%`
    hueBar.setValue(hue / 360)

    // paski RGB - każdy pokazuje co się stanie przy zmianie tylko tego kanału
    rgbBars.forEach((bar, ch) => {
      bar.paint((t, out) => {
        out[0] = r / 255
        out[1] = g / 255
        out[2] = b / 255
        out[ch] = t
      })
      bar.setValue(rgb[ch] / 255)
    })

    // paski CMYK tak samo
    cmykBars.forEach((bar, ch) => {
      bar.paint((t, out) => {
        const tmp = [c, m, y, k]
        tmp[ch] = t
        const res = cmykToRgb(tmp[0], tmp[1], tmp[2], tmp[3])
        out[0] = res[0]
        out[1] = res[1]
        out[2] = res[2]
      })
      bar.setValue(cmyk[ch])
    })

    rgbInputs.forEach((inp, i) => setInput(inp, String(rgb[i]), force))
    cmykInputs.forEach((inp, i) => setInput(inp, pct(cmyk[i]), force))
    const hex = rgbToHex(r, g, b)
    setInput(hexInput, hex.toUpperCase(), force)

    $<HTMLSpanElement>('.js-badge-rgb').textContent = source === 'rgb' ? 'wybrany' : 'po konwersji'
    $<HTMLSpanElement>('.js-badge-cmyk').textContent = source === 'cmyk' ? 'wybrany' : 'po konwersji'
    $<HTMLSpanElement>('.js-badge-rgb').classList.toggle('on', source === 'rgb')
    $<HTMLSpanElement>('.js-badge-cmyk').classList.toggle('on', source === 'cmyk')

    $<HTMLDivElement>('.js-preview').style.background = hex

    const rgbText = `(${r}, ${g}, ${b})`
    const cmykText = `(${pct(c)}%, ${pct(m)}%, ${pct(y)}%, ${pct(k)}%)`
    const chosen = source === 'rgb' ? ['RGB', rgbText] : ['CMYK', cmykText]
    const converted = source === 'rgb' ? ['CMYK', cmykText] : ['RGB', rgbText]

    $<HTMLDivElement>('.js-summary').innerHTML = `
      <div class="row"><span>Wybrano (${chosen[0]})</span><b class="mono">${chosen[1]}</b></div>
      <div class="row"><span>Po konwersji (${converted[0]})</span><b class="mono">${converted[1]}</b></div>
      <div class="row"><span>HEX</span><b class="mono">${hex.toUpperCase()}</b></div>
    `
    $<HTMLDivElement>('.js-formula').innerHTML = source === 'rgb' ? rgbFormula() : cmykFormula()
  }

  // obliczenia krok po kroku, żeby było widać że wzory działają
  function rgbFormula() {
    const r = rgb[0] / 255
    const g = rgb[1] / 255
    const b = rgb[2] / 255
    const k = 1 - Math.max(r, g, b)
    let s = `<div class="f-title">RGB → CMYK</div>`
    s += `<div>R' = ${rgb[0]}/255 = ${f3(r)}</div>`
    s += `<div>G' = ${rgb[1]}/255 = ${f3(g)}</div>`
    s += `<div>B' = ${rgb[2]}/255 = ${f3(b)}</div>`
    s += `<div>K = 1 − max(R', G', B') = ${f3(k)}</div>`
    if (k >= 1) {
      s += `<div>K = 1, więc C = M = Y = 0</div>`
      return s
    }
    s += `<div>C = (1 − R' − K) / (1 − K) = ${f3((1 - r - k) / (1 - k))}</div>`
    s += `<div>M = (1 − G' − K) / (1 − K) = ${f3((1 - g - k) / (1 - k))}</div>`
    s += `<div>Y = (1 − B' − K) / (1 − K) = ${f3((1 - b - k) / (1 - k))}</div>`
    return s
  }

  function cmykFormula() {
    const [c, m, y, k] = cmyk
    const line = (name: string, x: string, v: number) => {
      const res = 1 - Math.min(1, v * (1 - k) + k)
      return `<div>${name} = 1 − min(1, ${x}·(1 − K) + K) = ${f3(res)} → ${Math.round(res * 255)}</div>`
    }
    let s = `<div class="f-title">CMYK → RGB</div>`
    s += `<div>C = ${f3(c)}, M = ${f3(m)}, Y = ${f3(y)}, K = ${f3(k)}</div>`
    s += line('R', 'C', c)
    s += line('G', 'M', m)
    s += line('B', 'Y', y)
    return s
  }

  // ---------- pola tekstowe ----------

  rgbInputs.forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = rgbInputs.map((x) => parseFloat(x.value))
      if (v.some((n) => !Number.isFinite(n))) return
      setRgb(v[0], v[1], v[2])
    })
    inp.addEventListener('change', () => refresh(true))
  })

  cmykInputs.forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = cmykInputs.map((x) => parseFloat(x.value))
      if (v.some((n) => !Number.isFinite(n))) return
      setCmyk(v[0] / 100, v[1] / 100, v[2] / 100, v[3] / 100)
    })
    inp.addEventListener('change', () => refresh(true))
  })

  hexInput.addEventListener('input', () => {
    const c = hexToRgb(hexInput.value)
    if (c && hexInput.value.replace('#', '').length === 6) setRgb(c[0], c[1], c[2])
  })
  hexInput.addEventListener('change', () => {
    const c = hexToRgb(hexInput.value)
    if (c) setRgb(c[0], c[1], c[2])
    refresh(true)
  })

  $<HTMLDivElement>('.js-palette').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.swatch-btn')
    if (!btn) return
    const c = hexToRgb(btn.dataset.color!)!
    setRgb(c[0], c[1], c[2])
  })

  // start
  setRgb(rgb[0], rgb[1], rgb[2])
}
