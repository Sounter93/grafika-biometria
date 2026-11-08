import type { ImageBuffer } from '../../core/imageBuffer.ts'
import { drawCircle, drawLine, drawRect } from './raster.ts'

export type ShapeType = 'line' | 'rect' | 'circle'
export type RGB = [number, number, number]

export interface Point {
  x: number
  y: number
}

export const SHAPE_NAMES: Record<ShapeType, string> = {
  line: 'Linia',
  rect: 'Prostokąt',
  circle: 'Okrąg',
}

// nazwy pól tekstowych dla każdego kształtu (w tej kolejności co getParams)
export const PARAM_NAMES: Record<ShapeType, string[]> = {
  line: ['x1', 'y1', 'x2', 'y2'],
  rect: ['x', 'y', 'szerokość', 'wysokość'],
  circle: ['środek x', 'środek y', 'promień'],
}

export const DEFAULT_PARAMS: Record<ShapeType, number[]> = {
  line: [60, 60, 320, 220],
  rect: [120, 100, 240, 150],
  circle: [400, 250, 90],
}

// żeby ktoś nie wpisał miliona i nie zawiesił rysowania
const LIMIT = 20000

function toInt(v: number) {
  return Math.max(-LIMIT, Math.min(LIMIT, Math.round(v)))
}

// odległość punktu od odcinka AB
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// wspólne rzeczy dla wszystkich kształtów
export abstract class Shape {
  abstract type: ShapeType
  color: RGB = [0, 0, 0]

  abstract getParams(): number[]
  abstract setParams(p: number[]): void
  abstract draw(buf: ImageBuffer): void
  // czy kliknięcie (x, y) trafia w obiekt
  abstract hitTest(x: number, y: number, tolerance: number): boolean
  // punkty, za które można złapać i zmienić kształt
  abstract getHandles(): Point[]
  abstract moveHandle(index: number, x: number, y: number): void
  abstract moveBy(dx: number, dy: number): void
}

export class Line extends Shape {
  type: ShapeType = 'line'
  x1: number
  y1: number
  x2: number
  y2: number

  constructor(x1: number, y1: number, x2: number, y2: number) {
    super()
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2
  }

  getParams() {
    return [this.x1, this.y1, this.x2, this.y2]
  }

  setParams(p: number[]) {
    this.x1 = toInt(p[0])
    this.y1 = toInt(p[1])
    this.x2 = toInt(p[2])
    this.y2 = toInt(p[3])
  }

  draw(buf: ImageBuffer) {
    const [r, g, b] = this.color
    drawLine(buf, this.x1, this.y1, this.x2, this.y2, r, g, b)
  }

  hitTest(x: number, y: number, tolerance: number) {
    return distToSegment(x, y, this.x1, this.y1, this.x2, this.y2) <= tolerance
  }

  getHandles() {
    return [
      { x: this.x1, y: this.y1 },
      { x: this.x2, y: this.y2 },
    ]
  }

  moveHandle(index: number, x: number, y: number) {
    if (index === 0) {
      this.x1 = x
      this.y1 = y
    } else {
      this.x2 = x
      this.y2 = y
    }
  }

  moveBy(dx: number, dy: number) {
    this.x1 += dx
    this.y1 += dy
    this.x2 += dx
    this.y2 += dy
  }
}

// prostokąt trzymamy jako dwa przeciwległe rogi
export class Rect extends Shape {
  type: ShapeType = 'rect'
  x1: number
  y1: number
  x2: number
  y2: number

  constructor(x1: number, y1: number, x2: number, y2: number) {
    super()
    this.x1 = x1
    this.y1 = y1
    this.x2 = x2
    this.y2 = y2
  }

  getParams() {
    return [
      Math.min(this.x1, this.x2),
      Math.min(this.y1, this.y2),
      Math.abs(this.x2 - this.x1),
      Math.abs(this.y2 - this.y1),
    ]
  }

  setParams(p: number[]) {
    this.x1 = toInt(p[0])
    this.y1 = toInt(p[1])
    this.x2 = this.x1 + toInt(p[2])
    this.y2 = this.y1 + toInt(p[3])
  }

  draw(buf: ImageBuffer) {
    const [r, g, b] = this.color
    drawRect(buf, this.x1, this.y1, this.x2, this.y2, r, g, b)
  }

  // trafienie tylko w krawędź, nie w środek
  hitTest(x: number, y: number, tolerance: number) {
    const { x1, y1, x2, y2 } = this
    return (
      distToSegment(x, y, x1, y1, x2, y1) <= tolerance ||
      distToSegment(x, y, x2, y1, x2, y2) <= tolerance ||
      distToSegment(x, y, x2, y2, x1, y2) <= tolerance ||
      distToSegment(x, y, x1, y2, x1, y1) <= tolerance
    )
  }

  // 4 rogi + 4 środki boków
  getHandles() {
    const { x1, y1, x2, y2 } = this
    const mx = Math.round((x1 + x2) / 2)
    const my = Math.round((y1 + y2) / 2)
    return [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
      { x: mx, y: y1 },
      { x: x2, y: my },
      { x: mx, y: y2 },
      { x: x1, y: my },
    ]
  }

  moveHandle(index: number, x: number, y: number) {
    switch (index) {
      case 0:
        this.x1 = x
        this.y1 = y
        break
      case 1:
        this.x2 = x
        this.y1 = y
        break
      case 2:
        this.x2 = x
        this.y2 = y
        break
      case 3:
        this.x1 = x
        this.y2 = y
        break
      case 4:
        this.y1 = y
        break
      case 5:
        this.x2 = x
        break
      case 6:
        this.y2 = y
        break
      case 7:
        this.x1 = x
        break
    }
  }

  moveBy(dx: number, dy: number) {
    this.x1 += dx
    this.y1 += dy
    this.x2 += dx
    this.y2 += dy
  }
}

export class Circle extends Shape {
  type: ShapeType = 'circle'
  cx: number
  cy: number
  r: number

  constructor(cx: number, cy: number, r: number) {
    super()
    this.cx = cx
    this.cy = cy
    this.r = r
  }

  getParams() {
    return [this.cx, this.cy, this.r]
  }

  setParams(p: number[]) {
    this.cx = toInt(p[0])
    this.cy = toInt(p[1])
    this.r = Math.abs(toInt(p[2]))
  }

  draw(buf: ImageBuffer) {
    const [r, g, b] = this.color
    drawCircle(buf, this.cx, this.cy, this.r, r, g, b)
  }

  hitTest(x: number, y: number, tolerance: number) {
    const d = Math.hypot(x - this.cx, y - this.cy)
    return Math.abs(d - this.r) <= tolerance
  }

  // 4 punkty na okręgu (zmiana promienia) + środek (przesuwanie)
  getHandles() {
    const { cx, cy, r } = this
    return [
      { x: cx + r, y: cy },
      { x: cx, y: cy + r },
      { x: cx - r, y: cy },
      { x: cx, y: cy - r },
      { x: cx, y: cy },
    ]
  }

  moveHandle(index: number, x: number, y: number) {
    if (index === 4) {
      this.cx = x
      this.cy = y
    } else {
      this.r = Math.round(Math.hypot(x - this.cx, y - this.cy))
    }
  }

  moveBy(dx: number, dy: number) {
    this.cx += dx
    this.cy += dy
  }
}

// kształt z dwóch klikniętych punktów
export function createShape(type: ShapeType, a: Point, b: Point): Shape {
  if (type === 'line') return new Line(a.x, a.y, b.x, b.y)
  if (type === 'rect') return new Rect(a.x, a.y, b.x, b.y)
  return new Circle(a.x, a.y, Math.round(Math.hypot(b.x - a.x, b.y - a.y)))
}

// kształt z liczb wpisanych w pola
export function createShapeFromParams(type: ShapeType, p: number[]): Shape {
  const s = createShape(type, { x: 0, y: 0 }, { x: 0, y: 0 })
  s.setParams(p)
  return s
}

// kopia obiektu (do historii cofania)
export function cloneShape(s: Shape): Shape {
  const copy = createShapeFromParams(s.type, s.getParams())
  copy.color = [...s.color] as RGB
  return copy
}

// sprawdzenie wpisanych wartości, zwraca tekst błędu albo null
export function validateParams(type: ShapeType, p: number[]): string | null {
  const names = PARAM_NAMES[type]
  for (let i = 0; i < names.length; i++) {
    if (!Number.isFinite(p[i])) return `Pole „${names[i]}” musi być liczbą`
  }
  if (type === 'rect' && (p[2] < 0 || p[3] < 0)) return 'Szerokość i wysokość nie mogą być ujemne'
  if (type === 'circle' && p[2] < 0) return 'Promień nie może być ujemny'
  return null
}
