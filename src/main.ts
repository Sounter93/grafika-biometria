import './style.css'
import { HistogramView } from './core/histogramView.ts'
import { loadImageFile, saveImage } from './core/io.ts'
import { CanvasView, TOOLS } from './editor/canvasView.ts'
import { Editor } from './editor/editor.ts'
import { Preview } from './editor/preview.ts'
import { mountBinarizationPanel } from './biometrics/binarizationPanel.ts'
import { mountCorrectionPanel } from './biometrics/correctionPanel.ts'
import { mountColorPanel } from './graphics/color/colorPanel.ts'
import { mountFiltersPanel } from './graphics/filters/filtersPanel.ts'
import { mountObjectsPanel } from './graphics/primitives/objectsPanel.ts'

const icon = (path: string) => `<svg viewBox="0 0 24 24">${path}</svg>`

const ICONS = {
  open: icon('<path d="M3 7h6l2 2h10v10H3z"/>'),
  save: icon('<path d="M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6"/>'),
  new: icon('<path d="M6 3h8l4 4v14H6z M14 3v4h4"/>'),
  undo: icon('<path d="M9 7L4 12l5 5 M4 12h11a5 5 0 0 1 0 10h-3"/>'),
  redo: icon('<path d="M15 7l5 5-5 5 M20 12H9a5 5 0 0 0 0 10h3"/>'),
  reset: icon('<path d="M4 12a8 8 0 1 0 3-6.3 M4 4v5h5"/>'),
  minus: icon('<path d="M6 12h12"/>'),
  plus: icon('<path d="M6 12h12 M12 6v12"/>'),
  fit: icon('<path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5"/>'),
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <div class="logo-mark">GB</div>
      <span>Grafika i Biometria</span>
    </div>

    <div class="tb-group">
      <button class="tb-btn js-open" title="Otwórz obraz (Ctrl+O)">${ICONS.open}<span>Otwórz</span></button>
      <button class="tb-btn js-save" title="Zapisz jako PNG (Ctrl+S)">${ICONS.save}<span>Zapisz</span></button>
      <button class="tb-btn js-new" title="Nowa pusta kanwa">${ICONS.new}<span>Nowy</span></button>
    </div>

    <div class="tb-group">
      <button class="tb-btn icon-only js-undo" title="Cofnij (Ctrl+Z)">${ICONS.undo}</button>
      <button class="tb-btn icon-only js-redo" title="Ponów (Ctrl+Y)">${ICONS.redo}</button>
      <button class="tb-btn js-reset" title="Wróć do obrazu z pliku">${ICONS.reset}<span>Oryginał</span></button>
    </div>

    <div class="tb-group">
      <button class="tb-btn icon-only js-zoom-out" title="Oddal (-)">${ICONS.minus}</button>
      <span class="zoom-label mono js-zoom">100%</span>
      <button class="tb-btn icon-only js-zoom-in" title="Przybliż (+)">${ICONS.plus}</button>
      <button class="tb-btn icon-only js-fit" title="Dopasuj do okna (0)">${ICONS.fit}</button>
    </div>

    <div class="doc-info js-doc-info"></div>
    <input type="file" accept="image/*" class="hidden js-file" />
  </header>

  <div class="workspace">
    <div class="toolbox js-toolbox">
      <div class="tool-sep"></div>
      <button class="color-swatch js-swatch" title="Aktualny kolor (kliknij, żeby zmienić)"></button>
    </div>

    <div class="canvas-area js-area">
      <canvas class="main-canvas js-canvas"></canvas>
      <div class="empty-state js-empty">
        <div class="empty-icon">${ICONS.open}</div>
        <h2>Otwórz obraz, żeby zacząć</h2>
        <p>Kliknij przycisk albo przeciągnij plik (PNG, JPG, BMP…) w to miejsce.</p>
        <div class="btn-row">
          <button class="btn primary js-empty-open">Otwórz obraz</button>
          <button class="btn js-empty-blank">Pusta kanwa</button>
        </div>
      </div>
      <div class="drop-overlay">Upuść plik, żeby go otworzyć</div>
    </div>

    <aside class="dock">
      <section class="dock-hist">
        <div class="dock-title">Histogram</div>
        <div class="js-histogram"></div>
      </section>
      <nav class="dock-tabs">
        <button data-tab="correction" class="active">Korekcja</button>
        <button data-tab="binarization">Binaryzacja</button>
        <button data-tab="filters">Filtry</button>
        <button data-tab="color">Kolor</button>
        <button data-tab="objects">Obiekty</button>
      </nav>
      <div class="dock-body">
        <div class="dock-page js-page-correction" data-page="correction"></div>
        <div class="dock-page js-page-binarization hidden" data-page="binarization"></div>
        <div class="dock-page js-page-filters hidden" data-page="filters"></div>
        <div class="dock-page js-page-color hidden" data-page="color"></div>
        <div class="dock-page js-page-objects hidden" data-page="objects"></div>
      </div>
    </aside>
  </div>

  <footer class="statusbar">
    <span class="mono js-pos">x: –  y: –</span>
    <span class="mono pixel-info js-pixel"></span>
    <span class="hint js-hint"></span>
  </footer>

  <dialog class="dialog js-new-dialog">
    <form method="dialog">
      <h3>Nowa kanwa</h3>
      <div class="fields">
        <label class="field"><span>Szerokość</span><input type="number" min="1" max="8000" value="800" class="js-new-w" /></label>
        <label class="field"><span>Wysokość</span><input type="number" min="1" max="8000" value="600" class="js-new-h" /></label>
      </div>
      <div class="btn-row">
        <button value="cancel" class="btn">Anuluj</button>
        <button value="ok" class="btn primary">Utwórz</button>
      </div>
    </form>
  </dialog>
`

const $ = <T extends Element>(sel: string) => app.querySelector<T>(sel)!

// ---------- części edytora ----------

const editor = new Editor()

const view = new CanvasView(editor, {
  area: $('.js-area'),
  canvas: $('.js-canvas'),
  toolbox: $('.js-toolbox'),
  zoomLabel: $('.js-zoom'),
  pos: $('.js-pos'),
  pixel: $('.js-pixel'),
  hint: $('.js-hint'),
})

const histogram = new HistogramView($('.js-histogram'))
const preview = new Preview(editor)
mountCorrectionPanel($('.js-page-correction'), editor, preview)
mountBinarizationPanel($('.js-page-binarization'), editor, preview)
mountFiltersPanel($('.js-page-filters'), editor, preview)
mountColorPanel($('.js-page-color'), editor)
mountObjectsPanel($('.js-page-objects'), editor, view)

// histogram liczymy raz na klatkę, z tego co aktualnie widać
let histFrame = 0
editor.on('image', () => {
  if (histFrame) return
  histFrame = requestAnimationFrame(() => {
    histFrame = 0
    histogram.update(editor.current)
  })
})

const docInfo = $<HTMLDivElement>('.js-doc-info')
function updateDocInfo() {
  docInfo.textContent = `${editor.fileName} · ${editor.base.width} × ${editor.base.height}`
}
editor.on('doc', updateDocInfo)

const swatch = $<HTMLButtonElement>('.js-swatch')
const updateSwatch = () => {
  const [r, g, b] = editor.color
  swatch.style.background = `rgb(${r}, ${g}, ${b})`
}
editor.on('color', updateSwatch)

// ---------- zakładki w prawym panelu ----------

function openTab(name: string) {
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name))
  app.querySelectorAll<HTMLElement>('[data-page]').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== name))
  // zmiana zakładki kasuje niezatwierdzony podgląd
  preview.cancel()
}
app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
  b.addEventListener('click', () => openTab(b.dataset.tab!))
})
swatch.addEventListener('click', () => openTab('color'))

// ---------- plik ----------

const emptyState = $<HTMLDivElement>('.js-empty')
const fileInput = $<HTMLInputElement>('.js-file')

function hideEmptyState() {
  emptyState.classList.add('hidden')
  $<HTMLCanvasElement>('.js-canvas').classList.add('visible')
}

async function openFile(file: File) {
  try {
    const buf = await loadImageFile(file)
    editor.openImage(buf, file.name)
    hideEmptyState()
  } catch {
    view.showMessage(`Nie udało się otworzyć pliku ${file.name}`, true)
  }
}

function askForFile() {
  fileInput.value = ''
  fileInput.click()
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) openFile(file)
})

function save() {
  const name = editor.fileName.replace(/\.[^.]+$/, '') + '_edytowany.png'
  saveImage(editor.composite(), name)
  view.showMessage(`Zapisano ${name}`)
}

const newDialog = $<HTMLDialogElement>('.js-new-dialog')
newDialog.addEventListener('close', () => {
  if (newDialog.returnValue !== 'ok') return
  const w = Math.max(1, Math.min(8000, Math.round(Number($<HTMLInputElement>('.js-new-w').value)) || 800))
  const h = Math.max(1, Math.min(8000, Math.round(Number($<HTMLInputElement>('.js-new-h').value)) || 600))
  editor.openImage(Editor.blank(w, h), 'nowy.png')
  hideEmptyState()
})

$<HTMLButtonElement>('.js-open').addEventListener('click', askForFile)
$<HTMLButtonElement>('.js-empty-open').addEventListener('click', askForFile)
$<HTMLButtonElement>('.js-save').addEventListener('click', save)
$<HTMLButtonElement>('.js-new').addEventListener('click', () => newDialog.showModal())
$<HTMLButtonElement>('.js-empty-blank').addEventListener('click', () => {
  editor.openImage(Editor.blank(800, 600), 'nowy.png')
  hideEmptyState()
})

$<HTMLButtonElement>('.js-undo').addEventListener('click', () => editor.undo())
$<HTMLButtonElement>('.js-redo').addEventListener('click', () => editor.redo())
$<HTMLButtonElement>('.js-reset').addEventListener('click', () => editor.resetToOriginal())
$<HTMLButtonElement>('.js-zoom-in').addEventListener('click', () => view.zoomIn())
$<HTMLButtonElement>('.js-zoom-out').addEventListener('click', () => view.zoomOut())
$<HTMLButtonElement>('.js-fit').addEventListener('click', () => view.fit(true))

// przeciąganie pliku na obszar obrazu
const area = $<HTMLDivElement>('.js-area')
area.addEventListener('dragover', (e) => {
  e.preventDefault()
  area.classList.add('dragging')
})
area.addEventListener('dragleave', () => area.classList.remove('dragging'))
area.addEventListener('drop', (e) => {
  e.preventDefault()
  area.classList.remove('dragging')
  const file = e.dataTransfer?.files[0]
  if (file) openFile(file)
})

// ---------- skróty klawiszowe ----------

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement
  if (target.matches('input, select, textarea')) return
  const key = e.key.toLowerCase()

  if (e.ctrlKey) {
    if (key === 'o') askForFile()
    else if (key === 's') save()
    else if (key === 'z' && e.shiftKey) editor.redo()
    else if (key === 'z') editor.undo()
    else if (key === 'y') editor.redo()
    else return
    e.preventDefault()
    return
  }

  if (e.key === 'Delete' || e.key === 'Backspace') editor.deleteSelected()
  else if (e.key === 'Escape') {
    view.cancel()
    preview.cancel()
  } else if (e.key === '+' || e.key === '=') view.zoomIn()
  else if (e.key === '-') view.zoomOut()
  else if (e.key === '0') view.fit(true)
  else {
    const tool = TOOLS.find((t) => t.key.toLowerCase() === key)
    if (tool) view.setTool(tool.id)
  }
})

// start
updateDocInfo()
updateSwatch()
editor.emit('image')
