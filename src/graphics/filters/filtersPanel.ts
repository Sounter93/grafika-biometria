import { saltPepper } from '../../biometrics/adjustments.ts'
import { bindSlider, readNumber, segmented, sliderRow } from '../../core/ui.ts'
import type { Editor } from '../../editor/editor.ts'
import { setupAccordion, type Preview } from '../../editor/preview.ts'
import {
  convolve,
  gaussKernel,
  kernelSum,
  kuwahara,
  meanFilter,
  medianFilter,
  minRGB,
  pixelate,
  predator,
  sobel,
  type Kernel,
} from './filters.ts'
import { isBinary, morphology, type MorphOp, type StructElement } from './morphology.ts'

interface Preset {
  name: string
  size: number
  values: number[]
  abs?: boolean
  offset?: number
}

// gotowe maski do splotu
const PRESETS: Preset[] = [
  { name: 'Uśredniający 3×3', size: 3, values: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { name: 'Gauss 3×3', size: 3, values: [1, 2, 1, 2, 4, 2, 1, 2, 1] },
  {
    name: 'Gauss 5×5',
    size: 5,
    values: [1, 4, 6, 4, 1, 4, 16, 24, 16, 4, 6, 24, 36, 24, 6, 4, 16, 24, 16, 4, 1, 4, 6, 4, 1],
  },
  { name: 'Sobel – krawędzie pionowe', size: 3, values: [-1, 0, 1, -2, 0, 2, -1, 0, 1], abs: true },
  { name: 'Sobel – krawędzie poziome', size: 3, values: [-1, -2, -1, 0, 0, 0, 1, 2, 1], abs: true },
  { name: 'Prewitt – krawędzie pionowe', size: 3, values: [-1, 0, 1, -1, 0, 1, -1, 0, 1], abs: true },
  { name: 'Prewitt – krawędzie poziome', size: 3, values: [-1, -1, -1, 0, 0, 0, 1, 1, 1], abs: true },
  { name: 'Laplasjan (4 sąsiadów)', size: 3, values: [0, 1, 0, 1, -4, 1, 0, 1, 0], abs: true },
  { name: 'Laplasjan (8 sąsiadów)', size: 3, values: [1, 1, 1, 1, -8, 1, 1, 1, 1], abs: true },
  {
    name: 'Laplasjan 5×5 (LoG)',
    size: 5,
    values: [0, 0, -1, 0, 0, 0, -1, -2, -1, 0, -1, -2, 16, -2, -1, 0, -1, -2, -1, 0, 0, 0, -1, 0, 0],
    abs: true,
  },
  { name: 'Wyostrzanie', size: 3, values: [0, -1, 0, -1, 5, -1, 0, -1, 0] },
  { name: 'Płaskorzeźba', size: 3, values: [-2, -1, 0, -1, 1, 1, 0, 1, 2], offset: 128 },
]

const SIZE_BUTTONS = [3, 5, 7, 9].map((n) => `<button data-value="${n}">${n}×${n}</button>`).join('')

// Panel "Filtry": filtry z Grafiki 2 i Biometrii 4 + morfologia
export function mountFiltersPanel(root: HTMLElement, editor: Editor, preview: Preview) {
  root.innerHTML = `
    <details class="op" data-op="mean" open>
      <summary>Uśredniający (wygładzający)</summary>
      <div class="op-body">
        ${sliderRow('Maska', 'js-mean-size', 3, 31, 2, 3)}
        <div class="formula mono">nowy piksel = średnia z okna n × n</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-mean-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="median">
      <summary>Medianowy</summary>
      <div class="op-body">
        ${sliderRow('Maska', 'js-med-size', 3, 31, 2, 3)}
        <div class="formula mono">nowy piksel = środkowa wartość z posortowanego okna n × n<br />(osobno dla R, G, B)</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-med-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
        <button type="button" class="btn small js-med-noise" title="Do testu: 5% pikseli zmienia się na białe/czarne">Dodaj szum sól i pieprz (do testu)</button>
      </div>
    </details>

    <details class="op" data-op="sobel">
      <summary>Wykrywanie krawędzi (Sobel)</summary>
      <div class="op-body">
        <div class="seg js-sobel-mode">
          <button data-value="gray">Skala szarości</button>
          <button data-value="rgb">Osobno R, G, B</button>
        </div>
        <div class="formula mono">Gx = [−1 0 1; −2 0 2; −1 0 1]<br />Gy = [−1 −2 −1; 0 0 0; 1 2 1]<br />wynik = √(Gx² + Gy²)</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-sobel-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="conv">
      <summary>Splot – własna maska</summary>
      <div class="op-body">
        <label class="field">
          <span>Gotowa maska</span>
          <select class="js-conv-preset">
            ${PRESETS.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}
          </select>
        </label>
        <div class="label">Rozmiar</div>
        <div class="seg js-conv-size">${SIZE_BUTTONS}</div>
        <div class="kernel-grid js-conv-grid"></div>
        <div class="range-row">
          <span class="label">Gauss σ</span>
          <span></span>
          <input type="number" min="0.1" max="10" step="0.1" value="1" class="js-conv-sigma" />
          <button type="button" class="btn small js-conv-gauss">Wstaw</button>
        </div>
        <div class="fields">
          <label class="field"><span>Dzielnik</span><input type="number" step="any" class="js-conv-div" /></label>
          <label class="field"><span>Przesunięcie</span><input type="number" step="1" value="0" class="js-conv-offset" /></label>
        </div>
        <label class="check"><input type="checkbox" class="js-conv-auto" checked /> Dzielnik = suma wag (auto)</label>
        <label class="check"><input type="checkbox" class="js-conv-abs" /> Wartość bezwzględna</label>
        <label class="check"><input type="checkbox" class="js-conv-gray" /> Licz na skali szarości</label>
        <div class="formula mono">nowy = Σ (piksel · waga) / dzielnik + przesunięcie</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-conv-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="pixel">
      <summary>Pikselizacja</summary>
      <div class="op-body">
        ${sliderRow('Blok', 'js-px-size', 2, 64, 1, 8)}
        <div class="formula mono">każdy blok n × n = średni kolor bloku</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-px-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="kuwahara">
      <summary>Kuwahara</summary>
      <div class="op-body">
        ${sliderRow('Okno', 'js-kw-size', 3, 31, 2, 5)}
        <div class="formula mono">okno dzielimy na 4 ćwiartki,<br />bierzemy średni kolor ćwiartki o najmniejszej wariancji</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-kw-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="minrgb">
      <summary>MinRGB</summary>
      <div class="op-body">
        <div class="formula mono">zostaje tylko najmniejsza składowa R, G lub B,<br />pozostałe = 0</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-min-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="predator">
      <summary>Filtr Predatora</summary>
      <div class="op-body">
        ${sliderRow('Blok', 'js-pr-size', 2, 32, 1, 6)}
        <div class="formula mono">Pikselizacja → MinRGB → Sobel (R, G, B)</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-pr-apply">Zastosuj</button>
          <button type="button" class="btn js-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="morph">
      <summary>Morfologia (dylatacja, erozja)</summary>
      <div class="op-body">
        <div class="fields">
          <label class="field"><span>Wiersze</span><input type="number" min="1" max="21" value="3" class="js-se-rows" /></label>
          <label class="field"><span>Kolumny</span><input type="number" min="1" max="21" value="3" class="js-se-cols" /></label>
        </div>
        <div class="se-presets">
          <button type="button" class="btn small" data-se="full">Pełny</button>
          <button type="button" class="btn small" data-se="cross">Krzyż</button>
          <button type="button" class="btn small" data-se="disk">Koło</button>
          <button type="button" class="btn small" data-se="hline">—</button>
          <button type="button" class="btn small" data-se="vline">|</button>
          <button type="button" class="btn small" data-se="clear">Wyczyść</button>
        </div>
        <div class="se-grid js-se-grid"></div>
        <p class="op-desc">Kliknij (albo przeciągnij) komórki, żeby zbudować element. Kropka = środek.</p>
        <div class="label">Obiekt to piksele</div>
        <div class="seg js-se-object">
          <button data-value="white">Białe</button>
          <button data-value="black">Czarne</button>
        </div>
        <div class="info-row js-se-info"></div>
        <div class="btn-row">
          <button type="button" class="btn primary" data-morph="dilate">Dylatacja</button>
          <button type="button" class="btn primary" data-morph="erode">Erozja</button>
        </div>
        <div class="btn-row">
          <button type="button" class="btn" data-morph="open">Otwarcie</button>
          <button type="button" class="btn" data-morph="close">Zamknięcie</button>
        </div>
      </div>
    </details>
  `

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!
  const onClick = (sel: string, fn: () => void) => $<HTMLButtonElement>(sel).addEventListener('click', fn)

  root.querySelectorAll<HTMLButtonElement>('.js-cancel').forEach((b) => b.addEventListener('click', () => preview.cancel()))

  // ---------- proste filtry ----------

  const makeMean = () => meanFilter(editor.base, meanSize.get())
  const meanSize = bindSlider(root, 'js-mean-size', () => preview.show('mean', makeMean))
  onClick('.js-mean-apply', () => preview.apply(makeMean))

  const makeMedian = () => medianFilter(editor.base, medSize.get())
  const medSize = bindSlider(root, 'js-med-size', () => preview.show('median', makeMedian))
  onClick('.js-med-apply', () => preview.apply(makeMedian))
  onClick('.js-med-noise', () => preview.apply(() => saltPepper(editor.base, 0.05)))

  const makeSobel = () => sobel(editor.base, sobelMode() === 'gray')
  const sobelMode = segmented($('.js-sobel-mode'), 'gray', () => preview.show('sobel', makeSobel))
  onClick('.js-sobel-apply', () => preview.apply(makeSobel))

  const makePixel = () => pixelate(editor.base, pxSize.get())
  const pxSize = bindSlider(root, 'js-px-size', () => preview.show('pixel', makePixel))
  onClick('.js-px-apply', () => preview.apply(makePixel))

  const makeKuwahara = () => kuwahara(editor.base, kwSize.get())
  const kwSize = bindSlider(root, 'js-kw-size', () => preview.show('kuwahara', makeKuwahara))
  onClick('.js-kw-apply', () => preview.apply(makeKuwahara))

  const makeMin = () => minRGB(editor.base)
  onClick('.js-min-apply', () => preview.apply(makeMin))

  const makePredator = () => predator(editor.base, prSize.get())
  const prSize = bindSlider(root, 'js-pr-size', () => preview.show('predator', makePredator))
  onClick('.js-pr-apply', () => preview.apply(makePredator))

  // ---------- splot ----------

  const grid = $<HTMLDivElement>('.js-conv-grid')
  const divInput = $<HTMLInputElement>('.js-conv-div')
  const offsetInput = $<HTMLInputElement>('.js-conv-offset')
  const autoInput = $<HTMLInputElement>('.js-conv-auto')
  const absInput = $<HTMLInputElement>('.js-conv-abs')
  const grayInput = $<HTMLInputElement>('.js-conv-gray')
  let kSize = 3

  // rysuje siatkę pól z wagami maski
  function buildGrid(size: number, values: number[]) {
    kSize = size
    grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`
    grid.innerHTML = values.map((v) => `<input type="number" step="any" value="${v}" />`).join('')
  }

  function readKernelValues() {
    return Array.from(grid.querySelectorAll<HTMLInputElement>('input'), (inp) => readNumber(inp, -1e6, 1e6, 0))
  }

  function readKernel(): Kernel {
    const values = readKernelValues()
    if (autoInput.checked) divInput.value = String(Math.round(kernelSum(values) * 1000) / 1000)
    let divisor = readNumber(divInput, -1e6, 1e6, 1)
    if (divisor === 0) divisor = 1
    return { size: kSize, values, divisor, offset: readNumber(offsetInput, -255, 255, 0), abs: absInput.checked }
  }

  const makeConv = () => convolve(editor.base, readKernel(), grayInput.checked)
  const showConv = () => {
    readKernel() // odświeża dzielnik
    preview.show('conv', makeConv)
  }

  function loadPreset(i: number, show = true) {
    const p = PRESETS[i]
    buildGrid(p.size, p.values)
    convSizeSet(p.size)
    absInput.checked = !!p.abs
    offsetInput.value = String(p.offset ?? 0)
    autoInput.checked = true
    divInput.disabled = true
    if (show) showConv()
    else readKernel()
  }

  // zmiana rozmiaru: zostawiamy wagi ze środka, nowe pola = 0 (środek = 1)
  function resizeKernel(size: number) {
    const old = readKernelValues()
    const oldSize = kSize
    const values: number[] = []
    const shift = (size - oldSize) / 2
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ox = x - shift
        const oy = y - shift
        values.push(ox >= 0 && oy >= 0 && ox < oldSize && oy < oldSize ? old[oy * oldSize + ox] : 0)
      }
    }
    const empty = !values.some((v) => v !== 0)
    if (empty) values[(size * size) >> 1] = 1
    buildGrid(size, values)
    showConv()
  }

  // segmented nie ma settera, więc zaznaczenie przycisku robimy ręcznie
  const convSizeEl = $<HTMLDivElement>('.js-conv-size')
  segmented(convSizeEl, '3', (v) => resizeKernel(Number(v)))
  function convSizeSet(size: number) {
    convSizeEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.classList.toggle('active', b.dataset.value === String(size)))
  }

  $<HTMLSelectElement>('.js-conv-preset').addEventListener('change', (e) => loadPreset(Number((e.target as HTMLSelectElement).value)))
  grid.addEventListener('input', showConv)
  for (const inp of [divInput, offsetInput]) inp.addEventListener('input', showConv)
  for (const inp of [absInput, grayInput]) inp.addEventListener('change', showConv)
  autoInput.addEventListener('change', () => {
    divInput.disabled = autoInput.checked
    showConv()
  })
  onClick('.js-conv-gauss', () => {
    const sigma = readNumber($<HTMLInputElement>('.js-conv-sigma'), 0.1, 10, 1)
    buildGrid(kSize, gaussKernel(kSize, sigma))
    absInput.checked = false
    offsetInput.value = '0'
    showConv()
  })
  onClick('.js-conv-apply', () => preview.apply(makeConv))

  // ---------- morfologia ----------

  const seGrid = $<HTMLDivElement>('.js-se-grid')
  const rowsInput = $<HTMLInputElement>('.js-se-rows')
  const colsInput = $<HTMLInputElement>('.js-se-cols')
  const seInfo = $<HTMLDivElement>('.js-se-info')
  let se: StructElement = { rows: 3, cols: 3, cells: new Uint8Array(9).fill(1) }

  function drawSe() {
    seGrid.style.gridTemplateColumns = `repeat(${se.cols}, 1fr)`
    const cy = se.rows >> 1
    const cx = se.cols >> 1
    let html = ''
    for (let r = 0; r < se.rows; r++) {
      for (let c = 0; c < se.cols; c++) {
        const on = se.cells[r * se.cols + c] ? 'on' : ''
        const center = r === cy && c === cx ? 'center' : ''
        html += `<div class="se-cell ${on} ${center}" data-i="${r * se.cols + c}"></div>`
      }
    }
    seGrid.innerHTML = html
  }

  // nowy rozmiar - przepisujemy co się da ze starego elementu
  function resizeSe() {
    const rows = Math.round(readNumber(rowsInput, 1, 21, 3))
    const cols = Math.round(readNumber(colsInput, 1, 21, 3))
    const cells = new Uint8Array(rows * cols)
    for (let r = 0; r < Math.min(rows, se.rows); r++) {
      for (let c = 0; c < Math.min(cols, se.cols); c++) cells[r * cols + c] = se.cells[r * se.cols + c]
    }
    se = { rows, cols, cells }
    drawSe()
  }

  function seShape(kind: string) {
    const { rows, cols } = se
    const cy = (rows - 1) / 2
    const cx = (cols - 1) / 2
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let on = false
        if (kind === 'full') on = true
        else if (kind === 'cross') on = r === Math.floor(cy) || c === Math.floor(cx)
        else if (kind === 'disk') on = ((r - cy) / (rows / 2)) ** 2 + ((c - cx) / (cols / 2)) ** 2 <= 1
        else if (kind === 'hline') on = r === Math.floor(cy)
        else if (kind === 'vline') on = c === Math.floor(cx)
        se.cells[r * cols + c] = on ? 1 : 0
      }
    }
    drawSe()
  }

  // klikanie i przeciąganie po komórkach
  let paintValue = -1
  seGrid.addEventListener('pointerdown', (e) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.se-cell')
    if (!cell) return
    const i = Number(cell.dataset.i)
    paintValue = se.cells[i] ? 0 : 1
    se.cells[i] = paintValue
    cell.classList.toggle('on', paintValue === 1)
  })
  seGrid.addEventListener('pointerover', (e) => {
    if (paintValue < 0 || !(e.buttons & 1)) return
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.se-cell')
    if (!cell) return
    se.cells[Number(cell.dataset.i)] = paintValue
    cell.classList.toggle('on', paintValue === 1)
  })
  window.addEventListener('pointerup', () => (paintValue = -1))

  rowsInput.addEventListener('change', resizeSe)
  colsInput.addEventListener('change', resizeSe)
  root.querySelectorAll<HTMLButtonElement>('[data-se]').forEach((b) => b.addEventListener('click', () => seShape(b.dataset.se!)))

  const seObject = segmented($('.js-se-object'), 'white', () => {})

  function updateSeInfo() {
    seInfo.innerHTML = isBinary(editor.base)
      ? '✓ Obraz jest binarny'
      : '<span class="warn">Obraz nie jest binarny – zostanie podzielony progiem 128. Lepiej najpierw zbinaryzuj go w zakładce Binaryzacja.</span>'
  }

  root.querySelectorAll<HTMLButtonElement>('[data-morph]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!se.cells.some((v) => v === 1)) {
        seInfo.innerHTML = '<span class="warn">Element strukturyzujący jest pusty – zaznacz choć jedną komórkę.</span>'
        return
      }
      const op = b.dataset.morph as MorphOp
      preview.apply(() => morphology(editor.base, se, op, seObject() === 'white'))
    }),
  )

  editor.on('image', () => {
    if (!editor.preview && $<HTMLDetailsElement>('[data-op="morph"]').open) updateSeInfo()
  })

  // ---------- sekcje ----------

  setupAccordion(root, preview, (op) => {
    if (op === 'sobel') preview.show('sobel', makeSobel)
    if (op === 'minrgb') preview.show('minrgb', makeMin)
    if (op === 'predator') preview.show('predator', makePredator)
    if (op === 'conv') showConv()
    if (op === 'morph') updateSeInfo()
  })

  loadPreset(0, false)
  drawSe()
}
