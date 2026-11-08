import { ImageBuffer } from '../core/imageBuffer.ts'
import { cloneShape, type RGB, type Shape } from '../graphics/primitives/shapes.ts'

// image  - zmienił się obraz (albo podgląd)
// shapes - zmieniły się obiekty albo zaznaczenie
// color  - zmienił się aktualny kolor
// doc    - nowy dokument (wczytany plik / nowa kanwa)
export type EditorEvent = 'image' | 'shapes' | 'color' | 'doc'

interface Snapshot {
  base: ImageBuffer
  shapes: Shape[]
}

const HISTORY_LIMIT = 30

// Wspólny stan całej aplikacji. Panele tylko go czytają i wołają jego metody.
// Uwaga: obrazu "base" nigdy nie zmieniamy w miejscu - każda operacja robi nowy bufor,
// dlatego w historii wystarczy trzymać referencję.
export class Editor {
  base: ImageBuffer
  original: ImageBuffer
  preview: ImageBuffer | null = null // podgląd operacji przed "Zastosuj"
  fileName = 'nowy.png'
  shapes: Shape[] = []
  selected: Shape | null = null
  color: RGB = [30, 30, 30]

  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private listeners = new Map<EditorEvent, (() => void)[]>()

  constructor() {
    this.base = Editor.blank(800, 600)
    this.original = this.base
  }

  static blank(w: number, h: number) {
    const buf = new ImageBuffer(w, h)
    buf.fill(255, 255, 255)
    return buf
  }

  on(event: EditorEvent, fn: () => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event)!.push(fn)
  }

  emit(event: EditorEvent) {
    this.listeners.get(event)?.forEach((fn) => fn())
  }

  // to co aktualnie widać (podgląd albo obraz)
  get current() {
    return this.preview ?? this.base
  }

  // ---------- dokument ----------

  openImage(buf: ImageBuffer, fileName: string) {
    this.base = buf
    this.original = buf
    this.fileName = fileName
    this.preview = null
    this.shapes = []
    this.selected = null
    this.undoStack = []
    this.redoStack = []
    this.emit('doc')
    this.emit('image')
    this.emit('shapes')
  }

  // obraz + obiekty razem (do zapisu)
  composite() {
    const out = this.base.clone()
    for (const s of this.shapes) s.draw(out)
    return out
  }

  // ---------- operacje na obrazie ----------

  setPreview(buf: ImageBuffer | null) {
    this.preview = buf
    this.emit('image')
  }

  applyImage(buf: ImageBuffer) {
    this.saveUndo()
    this.base = buf
    this.preview = null
    this.emit('image')
  }

  resetToOriginal() {
    this.applyImage(this.original)
  }

  // obiekty "wtapiamy" w obraz, potem już są zwykłymi pikselami
  flatten() {
    if (this.shapes.length === 0) return
    this.saveUndo()
    this.base = this.composite()
    this.shapes = []
    this.selected = null
    this.emit('image')
    this.emit('shapes')
  }

  // ---------- cofanie ----------

  private snapshot(): Snapshot {
    return { base: this.base, shapes: this.shapes.map(cloneShape) }
  }

  private restore(s: Snapshot) {
    this.base = s.base
    this.shapes = s.shapes
    this.selected = null
    this.preview = null
    this.emit('image')
    this.emit('shapes')
  }

  saveUndo() {
    this.undoStack.push(this.snapshot())
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
  }

  undo() {
    const s = this.undoStack.pop()
    if (!s) return
    this.redoStack.push(this.snapshot())
    this.restore(s)
  }

  redo() {
    const s = this.redoStack.pop()
    if (!s) return
    this.undoStack.push(this.snapshot())
    this.restore(s)
  }

  // ---------- obiekty ----------

  addShape(s: Shape) {
    this.saveUndo()
    this.shapes.push(s)
    this.select(s)
  }

  select(s: Shape | null) {
    this.selected = s
    if (s) {
      this.color = [...s.color] as RGB
      this.emit('color')
    }
    this.emit('shapes')
  }

  deleteSelected() {
    if (!this.selected) return
    this.saveUndo()
    this.shapes.splice(this.shapes.indexOf(this.selected), 1)
    this.select(null)
  }

  clearShapes() {
    if (this.shapes.length === 0) return
    this.saveUndo()
    this.shapes = []
    this.select(null)
  }

  // ---------- kolor ----------

  setColor(c: RGB) {
    if (c[0] === this.color[0] && c[1] === this.color[1] && c[2] === this.color[2]) return
    this.color = [...c] as RGB
    // zmiana koloru działa też na zaznaczony obiekt
    if (this.selected) {
      this.selected.color = [...c] as RGB
      this.emit('shapes')
    }
    this.emit('color')
  }
}
