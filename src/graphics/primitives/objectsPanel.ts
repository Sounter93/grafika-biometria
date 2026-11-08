import type { CanvasView } from '../../editor/canvasView.ts'
import type { Editor } from '../../editor/editor.ts'
import {
  DEFAULT_PARAMS,
  PARAM_NAMES,
  SHAPE_NAMES,
  createShapeFromParams,
  validateParams,
  type RGB,
  type ShapeType,
} from './shapes.ts'

// Panel "Obiekty": dodawanie z pól tekstowych, edycja zaznaczonego, lista
export function mountObjectsPanel(root: HTMLElement, editor: Editor, view: CanvasView) {
  root.innerHTML = `
    <section class="card">
      <h3>Nowy obiekt z parametrów</h3>
      <form class="js-new-form">
        <label class="field">
          <span>Typ</span>
          <select class="js-new-type">
            <option value="line">Linia</option>
            <option value="rect">Prostokąt</option>
            <option value="circle">Okrąg</option>
          </select>
        </label>
        <div class="fields js-new-fields"></div>
        <button type="submit" class="btn primary wide">Narysuj</button>
      </form>
    </section>

    <section class="card">
      <h3>Zaznaczony obiekt</h3>
      <p class="muted js-sel-empty">Nic nie jest zaznaczone. Wybierz narzędzie „Zaznacz” i kliknij obiekt.</p>
      <form class="js-edit-form hidden">
        <div class="sel-name js-sel-name"></div>
        <div class="fields js-edit-fields"></div>
        <div class="btn-row">
          <button type="submit" class="btn primary">Zastosuj</button>
          <button type="button" class="btn danger js-delete">Usuń</button>
        </div>
      </form>
    </section>

    <section class="card">
      <h3>Obiekty na obrazie</h3>
      <ul class="scene-list js-list"></ul>
      <div class="btn-row">
        <button type="button" class="btn js-clear">Usuń wszystkie</button>
        <button type="button" class="btn js-flatten" title="Obiekty staną się zwykłymi pikselami obrazu">Wtop w obraz</button>
      </div>
    </section>
  `

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!

  const newForm = $<HTMLFormElement>('.js-new-form')
  const newType = $<HTMLSelectElement>('.js-new-type')
  const newFields = $<HTMLDivElement>('.js-new-fields')
  const editForm = $<HTMLFormElement>('.js-edit-form')
  const editFields = $<HTMLDivElement>('.js-edit-fields')
  const selEmpty = $<HTMLParagraphElement>('.js-sel-empty')
  const selName = $<HTMLDivElement>('.js-sel-name')
  const list = $<HTMLUListElement>('.js-list')

  let editType: ShapeType | null = null

  function buildFields(container: HTMLElement, type: ShapeType, values: number[]) {
    container.innerHTML = PARAM_NAMES[type]
      .map(
        (name, i) => `
        <label class="field">
          <span>${name}</span>
          <input type="number" step="1" data-i="${i}" value="${values[i]}" />
        </label>`,
      )
      .join('')
  }

  function readFields(container: HTMLElement): number[] {
    const inputs = container.querySelectorAll<HTMLInputElement>('input')
    return Array.from(inputs, (inp) => parseFloat(inp.value))
  }

  function fillEditForm() {
    const sel = editor.selected
    if (!sel) {
      editForm.classList.add('hidden')
      selEmpty.classList.remove('hidden')
      editType = null
      return
    }
    editForm.classList.remove('hidden')
    selEmpty.classList.add('hidden')
    selName.textContent = `${SHAPE_NAMES[sel.type]} #${editor.shapes.indexOf(sel) + 1}`

    const values = sel.getParams()
    if (editType !== sel.type) {
      buildFields(editFields, sel.type, values)
      editType = sel.type
    } else {
      const inputs = editFields.querySelectorAll<HTMLInputElement>('input')
      inputs.forEach((inp, i) => (inp.value = String(values[i])))
    }
  }

  function refreshList() {
    if (editor.shapes.length === 0) {
      list.innerHTML = '<li class="muted">Brak obiektów</li>'
      return
    }
    list.innerHTML = editor.shapes
      .map((s, i) => {
        const active = s === editor.selected ? 'active' : ''
        const [r, g, b] = s.color
        return `
          <li class="${active}" data-i="${i}">
            <span class="dot" style="background: rgb(${r}, ${g}, ${b})"></span>
            <span>${SHAPE_NAMES[s.type]} #${i + 1}</span>
            <span class="mono muted">${s.getParams().join(', ')}</span>
          </li>`
      })
      .join('')
  }

  editor.on('shapes', () => {
    fillEditForm()
    refreshList()
  })

  newType.addEventListener('change', () => {
    const t = newType.value as ShapeType
    buildFields(newFields, t, DEFAULT_PARAMS[t])
  })

  newForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const type = newType.value as ShapeType
    const p = readFields(newFields)
    const err = validateParams(type, p)
    if (err) return view.showMessage(err, true)
    const s = createShapeFromParams(type, p)
    s.color = [...editor.color] as RGB
    editor.addShape(s)
    view.showMessage(`Dodano: ${SHAPE_NAMES[type]}`)
  })

  editForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const sel = editor.selected
    if (!sel) return
    const p = readFields(editFields)
    const err = validateParams(sel.type, p)
    if (err) return view.showMessage(err, true)
    editor.saveUndo()
    sel.setParams(p)
    editor.emit('shapes')
    view.showMessage('Zmieniono parametry obiektu')
  })

  $<HTMLButtonElement>('.js-delete').addEventListener('click', () => editor.deleteSelected())
  $<HTMLButtonElement>('.js-clear').addEventListener('click', () => editor.clearShapes())
  $<HTMLButtonElement>('.js-flatten').addEventListener('click', () => editor.flatten())

  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[data-i]')
    if (!li) return
    view.setTool('select')
    editor.select(editor.shapes[Number(li.dataset.i)])
  })

  buildFields(newFields, 'line', DEFAULT_PARAMS.line)
  refreshList()
}
