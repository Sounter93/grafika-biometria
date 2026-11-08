// Małe pomocniki do budowania paneli, żeby nie pisać ciągle tego samego

// suwak + pole liczbowe obok (HTML)
export function sliderRow(label: string, cls: string, min: number, max: number, step: number, value: number) {
  return `
    <div class="slider-row">
      <span>${label}</span>
      <input type="range" class="${cls}-range" min="${min}" max="${max}" step="${step}" value="${value}" />
      <input type="number" class="${cls}-num" min="${min}" max="${max}" step="${step}" value="${value}" />
    </div>`
}

// podpina suwak i pole liczbowe, żeby trzymały tę samą wartość
export function bindSlider(root: HTMLElement, cls: string, onChange: () => void) {
  const range = root.querySelector<HTMLInputElement>(`.${cls}-range`)!
  const num = root.querySelector<HTMLInputElement>(`.${cls}-num`)!
  const min = Number(range.min)
  const max = Number(range.max)

  range.addEventListener('input', () => {
    num.value = range.value
    onChange()
  })
  num.addEventListener('input', () => {
    if (num.value === '' || !Number.isFinite(Number(num.value))) return
    range.value = num.value
    onChange()
  })

  return {
    get() {
      const v = Number(num.value)
      return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min
    },
    set(v: number) {
      range.value = String(v)
      num.value = String(v)
    },
  }
}

// grupa przycisków, z których jeden jest wybrany (przyciski mają data-value)
export function segmented(container: HTMLElement, initial: string, onChange: (v: string) => void) {
  let value = initial
  const buttons = container.querySelectorAll<HTMLButtonElement>('button')
  const mark = () => buttons.forEach((b) => b.classList.toggle('active', b.dataset.value === value))
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      value = b.dataset.value!
      mark()
      onChange(value)
    }),
  )
  mark()
  return () => value
}

// liczba z pola, przycięta do zakresu
export function readNumber(inp: HTMLInputElement, min: number, max: number, fallback = min) {
  const v = Number(inp.value)
  if (inp.value === '' || !Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, v))
}
