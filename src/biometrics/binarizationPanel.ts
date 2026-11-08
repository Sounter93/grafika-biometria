import { computeHistogram, type Channel } from '../core/histogram.ts'
import { bindSlider, segmented, sliderRow } from '../core/ui.ts'
import type { Editor } from '../editor/editor.ts'
import { setupAccordion, type Preview } from '../editor/preview.ts'
import { otsuThreshold, thresholdBinarize, thresholdEachChannel } from './binarization.ts'
import { kapurThreshold, luWuThreshold } from './entropyBinarization.ts'
import { bernsen, niblack, ownBinarization, phansalkar, sauvola } from './localBinarization.ts'

const GLOBAL_FORMULAS: Record<string, string> = {
  otsu: 'Szukamy t, dla którego wariancja MIĘDZY grupami jest największa:<br />σ² = w₀ · w₁ · (μ₀ − μ₁)²',
  kapur: 'Szukamy t, dla którego SUMA entropii tła i obiektu jest największa:<br />H(t) = H₀ + H₁,  Hᵢ = −Σ (p/Pᵢ) · ln(p/Pᵢ)',
  luwu: 'Szukamy t, dla którego entropie tła i obiektu są NAJBLIŻSZE sobie:<br />min |H₀ − H₁|',
}

const LOCAL_FORMULAS: Record<string, string> = {
  niblack: 'T = m + k · s<br />m – średnia w oknie, s – odchylenie standardowe',
  sauvola: 'T = m · (1 + k · (s / R − 1))',
  phansalkar: 'T = m · (1 + p · e^(−q·m) + k · (s / R − 1))<br />(jasności w zakresie 0..1)',
  bernsen: 'kontrast = max − min w oknie<br />kontrast < L → okno jednolite: biały gdy (max+min)/2 ≥ 128<br />inaczej T = (max + min) / 2',
}

// Panel "Binaryzacja": ręczna, globalne (z histogramu), lokalne i nasza własna
export function mountBinarizationPanel(root: HTMLElement, editor: Editor, preview: Preview) {
  root.innerHTML = `
    <details class="op" data-op="manual" open>
      <summary>Progowa (ręczny próg)</summary>
      <div class="op-body">
        <div class="label">Kanał</div>
        <div class="seg js-man-channel">
          <button data-value="r">R</button>
          <button data-value="g">G</button>
          <button data-value="b">B</button>
          <button data-value="avg">Średnia</button>
          <button data-value="each" title="Każdy kanał R, G, B binaryzowany osobno">Osobno</button>
        </div>
        ${sliderRow('Próg', 'js-man-t', 0, 255, 1, 128)}
        <div class="formula mono">wartość > próg → biały, inaczej czarny</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-man-apply">Zastosuj</button>
          <button type="button" class="btn js-man-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="global">
      <summary>Globalne z histogramu (Otsu, Kapur, LuWu)</summary>
      <div class="op-body">
        <div class="label">Metoda</div>
        <div class="seg js-gl-method">
          <button data-value="otsu">Otsu</button>
          <button data-value="kapur">Kapur</button>
          <button data-value="luwu">LuWu</button>
        </div>
        <div class="label">Histogram kanału</div>
        <div class="seg js-gl-channel">
          <button data-value="r">R</button>
          <button data-value="g">G</button>
          <button data-value="b">B</button>
          <button data-value="avg">Średnia</button>
        </div>
        <div class="thresholds js-gl-values"></div>
        <div class="formula mono js-gl-formula"></div>
        <div class="btn-row">
          <button type="button" class="btn primary js-gl-apply">Zastosuj</button>
          <button type="button" class="btn js-gl-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="local">
      <summary>Lokalne (Niblack, Sauvola, Phansalkar, Bernsen)</summary>
      <div class="op-body">
        <div class="label">Metoda</div>
        <div class="seg js-lc-method">
          <button data-value="niblack">Niblack</button>
          <button data-value="sauvola">Sauvola</button>
          <button data-value="phansalkar">Phansalkar</button>
          <button data-value="bernsen">Bernsen</button>
        </div>
        ${sliderRow('Okno', 'js-lc-size', 3, 151, 2, 25)}
        <div data-for="niblack">${sliderRow('k', 'js-nb-k', -1, 1, 0.05, -0.2)}</div>
        <div data-for="sauvola">
          ${sliderRow('k', 'js-sv-k', 0, 1, 0.05, 0.5)}
          ${sliderRow('R', 'js-sv-r', 1, 255, 1, 128)}
        </div>
        <div data-for="phansalkar">
          ${sliderRow('k', 'js-ph-k', 0, 1, 0.05, 0.25)}
          ${sliderRow('R', 'js-ph-r', 0.05, 1, 0.05, 0.5)}
          ${sliderRow('p', 'js-ph-p', 0, 5, 0.1, 2)}
          ${sliderRow('q', 'js-ph-q', 0, 20, 0.5, 10)}
        </div>
        <div data-for="bernsen">${sliderRow('Kontrast L', 'js-bn-l', 0, 255, 1, 15)}</div>
        <div class="formula mono js-lc-formula"></div>
        <div class="btn-row">
          <button type="button" class="btn primary js-lc-apply">Zastosuj</button>
          <button type="button" class="btn js-lc-cancel">Anuluj</button>
        </div>
      </div>
    </details>

    <details class="op" data-op="own">
      <summary>Własny algorytm</summary>
      <div class="op-body">
        <p class="op-desc">
          Mieszamy próg globalny (Otsu) z lokalną średnią. Tam, gdzie okno jest prawie jednolite,
          lokalna średnia nic nie mówi, więc używamy samego progu Otsu – dzięki temu tło zostaje czyste.
        </p>
        ${sliderRow('Okno', 'js-own-size', 3, 151, 2, 25)}
        ${sliderRow('Waga a', 'js-own-a', 0, 1, 0.05, 0.5)}
        ${sliderRow('s min', 'js-own-s', 0, 64, 1, 10)}
        <div class="formula mono">s < s_min → T = T_otsu<br />inaczej T = a · T_otsu + (1 − a) · m</div>
        <div class="btn-row">
          <button type="button" class="btn primary js-own-apply">Zastosuj</button>
          <button type="button" class="btn js-own-cancel">Anuluj</button>
        </div>
      </div>
    </details>
  `

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!

  // ---------- ręczny próg ----------

  const makeManual = () => {
    const t = manT.get()
    const ch = manChannel()
    return ch === 'each' ? thresholdEachChannel(editor.base, t) : thresholdBinarize(editor.base, ch as Channel, t)
  }
  const showManual = () => preview.show('manual', makeManual)
  const manChannel = segmented($('.js-man-channel'), 'avg', showManual)
  const manT = bindSlider(root, 'js-man-t', showManual)

  $<HTMLButtonElement>('.js-man-apply').addEventListener('click', () => preview.apply(makeManual))
  $<HTMLButtonElement>('.js-man-cancel').addEventListener('click', () => preview.cancel())

  // ---------- globalne ----------

  const glValues = $<HTMLDivElement>('.js-gl-values')
  const glFormula = $<HTMLDivElement>('.js-gl-formula')

  // progi wszystkich trzech metod dla wybranego kanału
  function globalThresholds() {
    const h = computeHistogram(editor.base)[glChannel() as Channel]
    return { otsu: otsuThreshold(h), kapur: kapurThreshold(h), luwu: luWuThreshold(h) } as Record<string, number>
  }

  function updateGlobal() {
    const t = globalThresholds()
    const method = glMethod()
    glValues.innerHTML = `
      <div class="${method === 'otsu' ? 'on' : ''}"><span>Otsu</span><b>${t.otsu}</b></div>
      <div class="${method === 'kapur' ? 'on' : ''}"><span>Kapur</span><b>${t.kapur}</b></div>
      <div class="${method === 'luwu' ? 'on' : ''}"><span>LuWu</span><b>${t.luwu}</b></div>
    `
    glFormula.innerHTML = GLOBAL_FORMULAS[method]
    preview.show('global', () => thresholdBinarize(editor.base, glChannel() as Channel, t[method]))
  }

  const glMethod = segmented($('.js-gl-method'), 'otsu', updateGlobal)
  const glChannel = segmented($('.js-gl-channel'), 'avg', updateGlobal)

  $<HTMLButtonElement>('.js-gl-apply').addEventListener('click', () => {
    const t = globalThresholds()[glMethod()]
    preview.apply(() => thresholdBinarize(editor.base, glChannel() as Channel, t))
  })
  $<HTMLButtonElement>('.js-gl-cancel').addEventListener('click', () => preview.cancel())

  // ---------- lokalne ----------

  const makeLocal = () => {
    const size = lcSize.get()
    switch (lcMethod()) {
      case 'niblack':
        return niblack(editor.base, size, nbK.get())
      case 'sauvola':
        return sauvola(editor.base, size, svK.get(), svR.get())
      case 'phansalkar':
        return phansalkar(editor.base, size, phK.get(), phR.get(), phP.get(), phQ.get())
      default:
        return bernsen(editor.base, size, bnL.get())
    }
  }
  const showLocal = () => preview.show('local', makeLocal)

  // pokazujemy tylko suwaki wybranej metody
  function showLocalParams() {
    const m = lcMethod()
    root.querySelectorAll<HTMLElement>('[data-for]').forEach((el) => el.classList.toggle('hidden', el.dataset.for !== m))
    $<HTMLDivElement>('.js-lc-formula').innerHTML = LOCAL_FORMULAS[m]
  }

  function updateLocal() {
    showLocalParams()
    showLocal()
  }

  const lcMethod = segmented($('.js-lc-method'), 'niblack', updateLocal)
  const lcSize = bindSlider(root, 'js-lc-size', showLocal)
  const nbK = bindSlider(root, 'js-nb-k', showLocal)
  const svK = bindSlider(root, 'js-sv-k', showLocal)
  const svR = bindSlider(root, 'js-sv-r', showLocal)
  const phK = bindSlider(root, 'js-ph-k', showLocal)
  const phR = bindSlider(root, 'js-ph-r', showLocal)
  const phP = bindSlider(root, 'js-ph-p', showLocal)
  const phQ = bindSlider(root, 'js-ph-q', showLocal)
  const bnL = bindSlider(root, 'js-bn-l', showLocal)

  $<HTMLButtonElement>('.js-lc-apply').addEventListener('click', () => preview.apply(makeLocal))
  $<HTMLButtonElement>('.js-lc-cancel').addEventListener('click', () => preview.cancel())

  // ---------- własny ----------

  const makeOwn = () => ownBinarization(editor.base, ownSize.get(), ownA.get(), ownS.get())
  const showOwn = () => preview.show('own', makeOwn)
  const ownSize = bindSlider(root, 'js-own-size', showOwn)
  const ownA = bindSlider(root, 'js-own-a', showOwn)
  const ownS = bindSlider(root, 'js-own-s', showOwn)

  $<HTMLButtonElement>('.js-own-apply').addEventListener('click', () => preview.apply(makeOwn))
  $<HTMLButtonElement>('.js-own-cancel').addEventListener('click', () => preview.cancel())

  // po otwarciu sekcji od razu pokazujemy podgląd
  setupAccordion(root, preview, (op) => {
    if (op === 'global') updateGlobal()
    if (op === 'local') updateLocal()
    if (op === 'own') showOwn()
  })

  // obraz zmieniony (np. cofnięcie) - przelicz progi
  editor.on('image', () => {
    if (!editor.preview && $<HTMLDetailsElement>('[data-op="global"]').open) {
      const t = globalThresholds()
      glValues.querySelectorAll('b').forEach((b, i) => (b.textContent = String([t.otsu, t.kapur, t.luwu][i])))
    }
  })

  showLocalParams()
}
