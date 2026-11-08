import { bindSlider, readNumber, sliderRow } from '../core/ui.ts'
import type { Editor } from '../editor/editor.ts'
import { setupAccordion, type Preview } from '../editor/preview.ts'
import { brightnessContrast, grayscale, negative } from './adjustments.ts'
import { equalizeHistogram, imageMinMax, stretchHistogram } from './histogramOps.ts'

// Panel "Korekcja": operacje na histogramie i jasności
export function mountCorrectionPanel(root: HTMLElement, editor: Editor, preview: Preview) {
  root.innerHTML = `
    <details class="op" data-op="stretch" open>
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
        <div class="formula mono">v' = a + (v − min) · (b − a) / (max − min)</div>
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
        <div class="formula mono">v' = 255 · (D(v) − D_min) / (N − D_min)<br />D = dystrybuanta (suma narastająca histogramu)</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-eq-apply">Zastosuj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="bc">
      <summary>Jasność i kontrast</summary>
      <div class="op-body">
        ${sliderRow('Jasność', 'js-bc-b', -255, 255, 1, 0)}
        ${sliderRow('Kontrast', 'js-bc-c', -100, 100, 1, 0)}
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

  const makeStretch = () =>
    stretchHistogram(
      editor.base,
      readNumber(stInMin, 0, 255),
      readNumber(stInMax, 0, 255, 255),
      readNumber(stOutMin, 0, 255),
      readNumber(stOutMax, 0, 255, 255),
    )

  for (const inp of [stInMin, stInMax, stOutMin, stOutMax]) {
    inp.addEventListener('input', () => preview.show('stretch', makeStretch))
  }
  $<HTMLButtonElement>('.js-st-auto').addEventListener('click', () => {
    autoStretchRange()
    preview.show('stretch', makeStretch)
  })
  $<HTMLButtonElement>('.js-st-apply').addEventListener('click', () => {
    preview.apply(makeStretch)
    autoStretchRange()
  })
  $<HTMLButtonElement>('.js-st-cancel').addEventListener('click', () => preview.cancel())

  // ---------- wyrównanie ----------

  $<HTMLButtonElement>('.js-eq-apply').addEventListener('click', () => {
    const separate = $<HTMLSelectElement>('.js-eq-mode').value === 'separate'
    preview.apply(() => equalizeHistogram(editor.base, separate))
  })

  // ---------- jasność i kontrast ----------

  const makeBc = () => brightnessContrast(editor.base, bright.get(), contrast.get())
  const bright = bindSlider(root, 'js-bc-b', () => preview.show('bc', makeBc))
  const contrast = bindSlider(root, 'js-bc-c', () => preview.show('bc', makeBc))

  function resetBc() {
    bright.set(0)
    contrast.set(0)
  }

  $<HTMLButtonElement>('.js-bc-apply').addEventListener('click', () => {
    preview.apply(makeBc)
    resetBc()
  })
  $<HTMLButtonElement>('.js-bc-cancel').addEventListener('click', () => {
    preview.cancel()
    resetBc()
  })

  // ---------- inne ----------

  $<HTMLButtonElement>('.js-negative').addEventListener('click', () => preview.apply(() => negative(editor.base)))
  $<HTMLButtonElement>('.js-gray').addEventListener('click', () => preview.apply(() => grayscale(editor.base)))

  setupAccordion(root, preview, (op) => {
    if (op === 'stretch') autoStretchRange()
  })
  editor.on('doc', autoStretchRange)
  autoStretchRange()
}
