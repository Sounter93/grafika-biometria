import { computeHistogram, type Channel } from '../core/histogram.ts'
import type { ImageBuffer } from '../core/imageBuffer.ts'
import type { Editor } from '../editor/editor.ts'
import { brightnessContrast, grayscale, negative } from './adjustments.ts'
import { otsuThreshold, thresholdBinarize, thresholdEachChannel } from './binarization.ts'
import { equalizeHistogram, imageMinMax, stretchHistogram } from './histogramOps.ts'

// Panel "Obraz": binaryzacja, Otsu, operacje na histogramie, jasność.
// Operacje z suwakami pokazują podgląd na żywo, a "Zastosuj" zapisuje zmianę.
export function mountOperationsPanel(root: HTMLElement, editor: Editor) {
  root.innerHTML = `
    <details class="op" data-op="threshold" open>
      <summary>Binaryzacja progowa</summary>
      <div class="op-body">
        <div class="label">Kanał</div>
        <div class="seg js-th-channel">
          <button data-ch="r">R</button>
          <button data-ch="g">G</button>
          <button data-ch="b">B</button>
          <button data-ch="avg">Średnia</button>
          <button data-ch="each" title="Każdy kanał R, G, B binaryzowany osobno">Osobno</button>
        </div>
        <div class="slider-row">
          <span>Próg</span>
          <input type="range" min="0" max="255" value="128" class="js-th-range" />
          <input type="number" min="0" max="255" value="128" class="js-th-num" />
        </div>
        <button type="button" class="btn small js-th-otsu">Wstaw próg z metody Otsu</button>
        <div class="btn-row">
          <button type="button" class="btn primary js-th-apply">Zastosuj</button>
          <button type="button" class="btn js-th-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="otsu">
      <summary>Binaryzacja Otsu</summary>
      <div class="op-body">
        <div class="label">Histogram kanału</div>
        <div class="seg js-otsu-channel">
          <button data-ch="r">R</button>
          <button data-ch="g">G</button>
          <button data-ch="b">B</button>
          <button data-ch="avg">Średnia</button>
        </div>
        <div class="info-row">Wyliczony próg: <b class="mono js-otsu-value">–</b></div>
        <div class="btn-row">
          <button type="button" class="btn primary js-otsu-apply">Zastosuj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="stretch">
      <summary>Rozciąganie histogramu</summary>
      <div class="op-body">
        <div class="label">Zakres wejściowy</div>
        <div class="range-row">
          <input type="number" min="0" max="255" class="js-st-in-min" />
          <span>–</span>
          <input type="number" min="0" max="255" class="js-st-in-max" />
          <button type="button" class="btn small js-st-auto" title="Min i max z obrazu">Auto</button>
        </div>
        <div class="label">Zakres docelowy</div>
        <div class="range-row">
          <input type="number" min="0" max="255" value="0" class="js-st-out-min" />
          <span>–</span>
          <input type="number" min="0" max="255" value="255" class="js-st-out-max" />
          <span></span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn primary js-st-apply">Zastosuj</button>
          <button type="button" class="btn js-st-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="equalize">
      <summary>Wyrównanie histogramu</summary>
      <div class="op-body">
        <div class="label">Sposób</div>
        <select class="js-eq-mode">
          <option value="separate">Osobno dla R, G, B</option>
          <option value="together">Wspólnie (histogram średniej)</option>
        </select>
        <div class="btn-row">
          <button type="button" class="btn primary js-eq-apply">Zastosuj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="bc">
      <summary>Jasność i kontrast</summary>
      <div class="op-body">
        <div class="slider-row">
          <span>Jasność</span>
          <input type="range" min="-255" max="255" value="0" class="js-bc-b-range" />
          <input type="number" min="-255" max="255" value="0" class="js-bc-b-num" />
        </div>
        <div class="slider-row">
          <span>Kontrast</span>
          <input type="range" min="-100" max="100" value="0" class="js-bc-c-range" />
          <input type="number" min="-100" max="100" value="0" class="js-bc-c-num" />
        </div>
        <div class="btn-row">
          <button type="button" class="btn primary js-bc-apply">Zastosuj</button>
          <button type="button" class="btn js-bc-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="other">
      <summary>Inne</summary>
      <div class="op-body">
        <div class="btn-row">
          <button type="button" class="btn js-negative">Negatyw</button>
          <button type="button" class="btn js-gray">Skala szarości</button>
        </div>
      </div>
    </details>
  `

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!

  // ---------- podgląd ----------

  let previewOwner: string | null = null
  let pendingMake: (() => ImageBuffer) | null = null
  let frame = 0

  // liczymy podgląd najwyżej raz na klatkę (suwak potrafi wysłać dużo zdarzeń)
  function showPreview(owner: string, make: () => ImageBuffer) {
    previewOwner = owner
    pendingMake = make
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (pendingMake && previewOwner) editor.setPreview(pendingMake())
      pendingMake = null
    })
  }

  function cancelPreview() {
    pendingMake = null
    if (!previewOwner) return
    previewOwner = null
    editor.setPreview(null)
  }

  function apply(make: () => ImageBuffer) {
    pendingMake = null
    previewOwner = null
    editor.applyImage(make())
  }

  editor.on('doc', () => {
    previewOwner = null
    pendingMake = null
  })

  // suwak i pole liczbowe trzymają tę samą wartość
  function linkSlider(range: HTMLInputElement, num: HTMLInputElement, onChange: () => void) {
    range.addEventListener('input', () => {
      num.value = range.value
      onChange()
    })
    num.addEventListener('input', () => {
      if (num.value === '' || !Number.isFinite(Number(num.value))) return
      range.value = num.value
      onChange()
    })
  }

  // grupa przycisków, z których jeden jest wybrany
  function segmented(container: HTMLElement, initial: string, onChange: (v: string) => void) {
    let value = initial
    const buttons = container.querySelectorAll<HTMLButtonElement>('button')
    const mark = () => buttons.forEach((b) => b.classList.toggle('active', b.dataset.ch === value))
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        value = b.dataset.ch!
        mark()
        onChange(value)
      }),
    )
    mark()
    return () => value
  }

  const readInt = (inp: HTMLInputElement, min: number, max: number) => {
    const v = Math.round(Number(inp.value))
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min
  }

  // ---------- binaryzacja progowa ----------

  const thRange = $<HTMLInputElement>('.js-th-range')
  const thNum = $<HTMLInputElement>('.js-th-num')
  const thChannel = segmented($('.js-th-channel'), 'avg', () => previewThreshold())

  function makeThreshold() {
    const t = readInt(thRange, 0, 255)
    const ch = thChannel()
    return ch === 'each' ? thresholdEachChannel(editor.base, t) : thresholdBinarize(editor.base, ch as Channel, t)
  }

  function previewThreshold() {
    showPreview('threshold', makeThreshold)
  }

  linkSlider(thRange, thNum, previewThreshold)

  $<HTMLButtonElement>('.js-th-otsu').addEventListener('click', () => {
    const ch = thChannel()
    const h = computeHistogram(editor.base)
    const t = otsuThreshold(ch === 'each' ? h.avg : h[ch as Channel])
    thRange.value = String(t)
    thNum.value = String(t)
    previewThreshold()
  })
  $<HTMLButtonElement>('.js-th-apply').addEventListener('click', () => apply(makeThreshold))
  $<HTMLButtonElement>('.js-th-cancel').addEventListener('click', cancelPreview)

  // ---------- Otsu ----------

  const otsuValue = $<HTMLElement>('.js-otsu-value')
  const otsuChannel = segmented($('.js-otsu-channel'), 'avg', () => updateOtsu())

  function computeOtsu() {
    const h = computeHistogram(editor.base)
    return otsuThreshold(h[otsuChannel() as Channel])
  }

  function updateOtsu() {
    otsuValue.textContent = String(computeOtsu())
  }

  $<HTMLButtonElement>('.js-otsu-apply').addEventListener('click', () => {
    const t = computeOtsu()
    apply(() => thresholdBinarize(editor.base, otsuChannel() as Channel, t))
  })

  // ---------- rozciąganie ----------

  const stInMin = $<HTMLInputElement>('.js-st-in-min')
  const stInMax = $<HTMLInputElement>('.js-st-in-max')
  const stOutMin = $<HTMLInputElement>('.js-st-out-min')
  const stOutMax = $<HTMLInputElement>('.js-st-out-max')

  function autoStretchRange() {
    const [min, max] = imageMinMax(editor.base)
    stInMin.value = String(min)
    stInMax.value = String(max)
  }

  function makeStretch() {
    return stretchHistogram(
      editor.base,
      readInt(stInMin, 0, 255),
      readInt(stInMax, 0, 255),
      readInt(stOutMin, 0, 255),
      readInt(stOutMax, 0, 255),
    )
  }

  for (const inp of [stInMin, stInMax, stOutMin, stOutMax]) {
    inp.addEventListener('input', () => showPreview('stretch', makeStretch))
  }
  $<HTMLButtonElement>('.js-st-auto').addEventListener('click', () => {
    autoStretchRange()
    showPreview('stretch', makeStretch)
  })
  $<HTMLButtonElement>('.js-st-apply').addEventListener('click', () => {
    apply(makeStretch)
    autoStretchRange()
  })
  $<HTMLButtonElement>('.js-st-cancel').addEventListener('click', cancelPreview)

  // ---------- wyrównanie ----------

  $<HTMLButtonElement>('.js-eq-apply').addEventListener('click', () => {
    const separate = $<HTMLSelectElement>('.js-eq-mode').value === 'separate'
    apply(() => equalizeHistogram(editor.base, separate))
  })

  // ---------- jasność i kontrast ----------

  const bcB = $<HTMLInputElement>('.js-bc-b-range')
  const bcBNum = $<HTMLInputElement>('.js-bc-b-num')
  const bcC = $<HTMLInputElement>('.js-bc-c-range')
  const bcCNum = $<HTMLInputElement>('.js-bc-c-num')

  const makeBc = () => brightnessContrast(editor.base, readInt(bcB, -255, 255), readInt(bcC, -100, 100))
  const previewBc = () => showPreview('bc', makeBc)
  linkSlider(bcB, bcBNum, previewBc)
  linkSlider(bcC, bcCNum, previewBc)

  function resetBc() {
    for (const inp of [bcB, bcBNum, bcC, bcCNum]) inp.value = '0'
  }

  $<HTMLButtonElement>('.js-bc-apply').addEventListener('click', () => {
    apply(makeBc)
    resetBc()
  })
  $<HTMLButtonElement>('.js-bc-cancel').addEventListener('click', () => {
    cancelPreview()
    resetBc()
  })

  // ---------- inne ----------

  $<HTMLButtonElement>('.js-negative').addEventListener('click', () => apply(() => negative(editor.base)))
  $<HTMLButtonElement>('.js-gray').addEventListener('click', () => apply(() => grayscale(editor.base)))

  // ---------- rozwijane sekcje ----------

  // otwarta może być tylko jedna sekcja, a zamknięcie sekcji kasuje jej podgląd
  const sections = root.querySelectorAll<HTMLDetailsElement>('details.op')
  sections.forEach((det) => {
    det.addEventListener('toggle', () => {
      const op = det.dataset.op!
      if (det.open) {
        sections.forEach((other) => {
          if (other !== det) other.open = false
        })
        if (op === 'otsu') updateOtsu()
        if (op === 'stretch') autoStretchRange()
      } else if (previewOwner === op) {
        cancelPreview()
      }
    })
  })

  // gdy obraz się zmieni (np. cofnięcie), odśwież wyliczone wartości
  editor.on('image', () => {
    if (editor.preview) return
    if ($<HTMLDetailsElement>('[data-op="otsu"]').open) updateOtsu()
  })
  editor.on('doc', () => autoStretchRange())

  autoStretchRange()

  return { cancelPreview }
}
