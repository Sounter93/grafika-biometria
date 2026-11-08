import { ImageBuffer } from '../core/imageBuffer.ts'
import { showBuffer } from '../core/io.ts'
import { drawHandle } from '../graphics/primitives/raster.ts'
import { createShape, type Point, type RGB, type Shape, type ShapeType } from '../graphics/primitives/shapes.ts'
import type { Editor } from './editor.ts'

export type Tool = 'select' | ShapeType | 'picker'

export const TOOLS: { id: Tool; name: string; key: string; icon: string }[] = [
  { id: 'select', name: 'Zaznacz / przesuń', key: 'V', icon: '<path class="fill" d="M6 3l12 9-5.5 1L10 19z"/>' },
  { id: 'line', name: 'Linia', key: 'L', icon: '<path d="M5 19L19 5"/>' },
  { id: 'rect', name: 'Prostokąt', key: 'P', icon: '<rect x="4" y="6" width="16" height="12"/>' },
  { id: 'circle', name: 'Okrąg', key: 'O', icon: '<circle cx="12" cy="12" r="8"/>' },
  {
    id: 'picker',
    name: 'Pipeta (pobierz kolor z obrazu)',
    key: 'I',
    icon: '<path d="M14 4l6 6M17 7l-9 9-4 1 1-4 9-9"/>',
  },
]

const HINTS: Record<Tool, string> = {
  select: 'Kliknij obiekt, żeby go zaznaczyć. Złap krawędź – przesuwasz, złap uchwyt – zmieniasz rozmiar. Delete usuwa.',
  line: 'Kliknij punkt początkowy, a potem końcowy (albo przeciągnij).',
  rect: 'Kliknij jeden róg, a potem przeciwległy (albo przeciągnij).',
  circle: 'Kliknij środek, a potem punkt na okręgu (albo przeciągnij).',
  picker: 'Kliknij w obraz, żeby pobrać kolor.',
}

const ZOOMS = [0.1, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8]

interface Elements {
  area: HTMLElement
  canvas: HTMLCanvasElement
  toolbox: HTMLElement
  zoomLabel: HTMLElement
  pos: HTMLElement
  pixel: HTMLElement
  hint: HTMLElement
}

// Środek ekranu: canvas z obrazem, zoom i obsługa myszy (narzędzia)
export class CanvasView {
  editor: Editor
  el: Elements
  display = new ImageBuffer(1, 1)
  zoom = 1
  tool: Tool = 'select'

  // rysowanie: pierwszy klik zapamiętujemy tutaj
  drawStart: Point | null = null
  startedThisPress = false
  mouse: Point = { x: 0, y: 0 }
  // przeciąganie: handle = numer uchwytu, -1 = cały obiekt
  drag: { handle: number; last: Point } | null = null

  private frame = 0
  private messageTimer = 0

  constructor(editor: Editor, el: Elements) {
    this.editor = editor
    this.el = el

    el.toolbox.insertAdjacentHTML(
      'afterbegin',
      TOOLS.map(
        (t) => `
        <button class="tool-btn" data-tool="${t.id}" title="${t.name} (${t.key})">
          <svg viewBox="0 0 24 24">${t.icon}</svg>
        </button>`,
      ).join(''),
    )
    el.toolbox.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool as Tool))
    })

    editor.on('image', () => this.requestRender())
    editor.on('shapes', () => this.requestRender())
    editor.on('doc', () => {
      this.drawStart = null
      this.drag = null
      this.fit(false)
    })

    this.setupMouse()
    this.setTool('select')
  }

  // rysujemy najwyżej raz na klatkę, nawet jak zmian było kilka
  requestRender() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  render() {
    const src = this.editor.current
    if (this.display.width !== src.width || this.display.height !== src.height) {
      this.display = new ImageBuffer(src.width, src.height)
      this.applyZoom()
    }
    this.display.data.set(src.data)

    for (const s of this.editor.shapes) s.draw(this.display)

    // podgląd kształtu w trakcie rysowania
    if (this.drawStart && this.isShapeTool()) {
      const preview = createShape(this.tool as ShapeType, this.drawStart, this.mouse)
      preview.color = this.editor.color
      preview.draw(this.display)
    }

    const sel = this.editor.selected
    if (sel) {
      const size = Math.max(2, Math.round(4 / this.zoom))
      for (const h of sel.getHandles()) drawHandle(this.display, h.x, h.y, size)
    }

    showBuffer(this.el.canvas, this.display)
  }

  // ---------- narzędzia ----------

  isShapeTool() {
    return this.tool === 'line' || this.tool === 'rect' || this.tool === 'circle'
  }

  setTool(t: Tool) {
    this.tool = t
    this.drawStart = null
    this.el.toolbox.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === t)
    })
    this.el.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair'
    this.updateHint()
    this.requestRender()
  }

  updateHint() {
    this.el.hint.classList.remove('error')
    this.el.hint.textContent = this.drawStart ? 'Kliknij drugi punkt. Esc – anuluj.' : HINTS[this.tool]
  }

  showMessage(text: string, error = false) {
    this.el.hint.textContent = text
    this.el.hint.classList.toggle('error', error)
    clearTimeout(this.messageTimer)
    this.messageTimer = window.setTimeout(() => this.updateHint(), 3000)
  }

  cancel() {
    if (this.drawStart) this.drawStart = null
    else this.editor.select(null)
    this.updateHint()
    this.requestRender()
  }

  // ---------- zoom ----------

  applyZoom() {
    const { canvas } = this.el
    canvas.style.width = `${this.display.width * this.zoom}px`
    canvas.style.height = `${this.display.height * this.zoom}px`
    // przy powiększeniu chcemy widzieć ostre piksele
    canvas.style.imageRendering = this.zoom >= 2 ? 'pixelated' : 'auto'
    this.el.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`
    this.requestRender()
  }

  setZoom(z: number) {
    this.zoom = Math.max(0.05, Math.min(16, z))
    this.applyZoom()
  }

  zoomIn() {
    this.setZoom(ZOOMS.find((z) => z > this.zoom + 0.001) ?? this.zoom)
  }

  zoomOut() {
    const smaller = ZOOMS.filter((z) => z < this.zoom - 0.001)
    this.setZoom(smaller.length ? smaller[smaller.length - 1] : this.zoom)
  }

  // dopasowanie obrazu do okna (upscale = czy wolno powiększyć mały obraz)
  fit(upscale: boolean) {
    const img = this.editor.current
    const w = this.el.area.clientWidth - 48
    const h = this.el.area.clientHeight - 48
    let z = Math.min(w / img.width, h / img.height)
    if (!upscale) z = Math.min(1, z)
    this.setZoom(z)
  }

  // ---------- mysz ----------

  toImage(e: PointerEvent): Point {
    const r = this.el.canvas.getBoundingClientRect()
    return {
      x: Math.floor(((e.clientX - r.left) * this.el.canvas.width) / r.width),
      y: Math.floor(((e.clientY - r.top) * this.el.canvas.height) / r.height),
    }
  }

  // tolerancja w pikselach obrazu, żeby przy oddaleniu dalej dało się trafić
  tolerance() {
    return 6 / this.zoom
  }

  // szukamy od końca, bo ostatni obiekt jest na wierzchu
  findShapeAt(p: Point): Shape | null {
    const shapes = this.editor.shapes
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (shapes[i].hitTest(p.x, p.y, this.tolerance())) return shapes[i]
    }
    return null
  }

  findHandle(s: Shape, p: Point): number {
    const tol = this.tolerance()
    const handles = s.getHandles()
    for (let i = 0; i < handles.length; i++) {
      if (Math.abs(handles[i].x - p.x) <= tol && Math.abs(handles[i].y - p.y) <= tol) return i
    }
    return -1
  }

  pixelAt(p: Point): RGB | null {
    const img = this.editor.current
    if (p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height) return null
    const i = (p.y * img.width + p.x) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2]]
  }

  finishDrawing(p: Point) {
    if (!this.drawStart || !this.isShapeTool()) return
    const s = createShape(this.tool as ShapeType, this.drawStart, p)
    s.color = [...this.editor.color] as RGB
    this.drawStart = null
    this.editor.addShape(s)
    this.updateHint()
  }

  setupMouse() {
    const { canvas } = this.el
    const editor = this.editor

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      const p = this.toImage(e)
      this.mouse = p

      if (this.tool === 'picker') {
        const c = this.pixelAt(p)
        if (c) editor.setColor(c)
        return
      }

      if (this.tool === 'select') {
        const sel = editor.selected
        const h = sel ? this.findHandle(sel, p) : -1
        if (h >= 0) {
          editor.saveUndo()
          this.drag = { handle: h, last: p }
        } else {
          const hit = this.findShapeAt(p)
          editor.select(hit)
          if (hit) editor.saveUndo()
          this.drag = hit ? { handle: -1, last: p } : null
        }
        return
      }

      if (!this.drawStart) {
        this.drawStart = p
        this.startedThisPress = true
        editor.select(null)
        this.updateHint()
      } else {
        this.finishDrawing(p)
      }
      this.requestRender()
    })

    canvas.addEventListener('pointermove', (e) => {
      const p = this.toImage(e)
      this.mouse = p
      this.updateStatus(p)

      const sel = editor.selected
      if (this.drag && sel) {
        if (this.drag.handle >= 0) {
          sel.moveHandle(this.drag.handle, p.x, p.y)
        } else {
          sel.moveBy(p.x - this.drag.last.x, p.y - this.drag.last.y)
          this.drag.last = p
        }
        editor.emit('shapes')
        return
      }

      if (this.drawStart) {
        this.requestRender()
        return
      }

      // zmiana kursora, żeby było widać co można złapać
      if (this.tool === 'select') {
        if (sel && this.findHandle(sel, p) >= 0) canvas.style.cursor = 'crosshair'
        else if (this.findShapeAt(p)) canvas.style.cursor = 'move'
        else canvas.style.cursor = 'default'
      }
    })

    canvas.addEventListener('pointerup', () => {
      this.drag = null
      // jeśli ktoś przeciągnął zamiast drugiego kliknięcia
      if (this.drawStart && this.startedThisPress) {
        this.startedThisPress = false
        const d = Math.hypot(this.mouse.x - this.drawStart.x, this.mouse.y - this.drawStart.y)
        if (d * this.zoom > 4) this.finishDrawing(this.mouse)
      }
    })

    canvas.addEventListener('pointerleave', () => {
      this.el.pos.textContent = 'x: –  y: –'
      this.el.pixel.innerHTML = ''
    })

    // Ctrl + kółko = zoom
    this.el.area.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return
        e.preventDefault()
        if (e.deltaY < 0) this.zoomIn()
        else this.zoomOut()
      },
      { passive: false },
    )
  }

  updateStatus(p: Point) {
    this.el.pos.textContent = `x: ${p.x}  y: ${p.y}`
    const c = this.pixelAt(p)
    this.el.pixel.innerHTML = c
      ? `<span class="dot" style="background: rgb(${c[0]}, ${c[1]}, ${c[2]})"></span> RGB ${c[0]}, ${c[1]}, ${c[2]}`
      : ''
  }
}
