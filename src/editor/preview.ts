import type { ImageBuffer } from '../core/imageBuffer.ts'
import type { Editor } from './editor.ts'

// Podgląd operacji: suwakiem coś zmieniamy -> widać wynik, ale obraz zmienia się dopiero po "Zastosuj".
// Jeden wspólny obiekt dla wszystkich paneli, więc naraz jest tylko jeden podgląd.
export class Preview {
  editor: Editor
  owner: string | null = null
  private pending: (() => ImageBuffer) | null = null
  private frame = 0

  constructor(editor: Editor) {
    this.editor = editor
    editor.on('doc', () => {
      this.owner = null
      this.pending = null
    })
  }

  // liczymy najwyżej raz na klatkę (suwak potrafi wysłać dużo zdarzeń)
  show(owner: string, make: () => ImageBuffer) {
    this.owner = owner
    this.pending = make
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      if (this.pending && this.owner) this.editor.setPreview(this.pending())
      this.pending = null
    })
  }

  cancel() {
    this.pending = null
    if (!this.owner) return
    this.owner = null
    this.editor.setPreview(null)
  }

  apply(make: () => ImageBuffer) {
    this.pending = null
    this.owner = null
    this.editor.applyImage(make())
  }
}

// rozwijane sekcje: otwarta tylko jedna, a zamknięcie sekcji kasuje jej podgląd
export function setupAccordion(root: HTMLElement, preview: Preview, onOpen?: (op: string) => void) {
  const sections = root.querySelectorAll<HTMLDetailsElement>('details.op')
  sections.forEach((det) => {
    det.addEventListener('toggle', () => {
      const op = det.dataset.op!
      if (det.open) {
        sections.forEach((other) => {
          if (other !== det) other.open = false
        })
        onOpen?.(op)
      } else if (preview.owner === op) {
        preview.cancel()
      }
    })
  })
}
