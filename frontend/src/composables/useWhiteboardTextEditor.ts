import { nextTick, ref, type Ref } from 'vue'
import type { TextElementData } from '../whiteboard/types'
import { clampTextFontSize } from '../whiteboard/textLayout'

export interface TextEditorState {
  mode: 'new' | 'edit'
  key?: string
  text: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fontSize: number
  color: string
  align: NonNullable<TextElementData['align']>
  bold: boolean
  italic: boolean
}

export interface TextEditorCommit extends TextEditorState {
  /** Text after trimming. Always non-empty when `onCommit` is called. */
  text: string
  /** Recomputed bounds — width/height are at least the user-typed dimensions. */
  width: number
  height: number
}

export interface MeasuredTextBox {
  width: number
  height: number
  fontSize: number
}

interface UseWhiteboardTextEditorOptions {
  textEditorRef: Ref<HTMLTextAreaElement | undefined>
  textToolbarRef: Ref<HTMLDivElement | undefined>
  /**
   * Measure a text box for the given parameters. Caller wraps the
   * canvas-aware `measureTextBox` so this composable doesn't need to
   * know about the rendering context.
   */
  measureBox: (text: string, fontSize: number, width: number, bold: boolean, italic: boolean) => MeasuredTextBox
  /** Called when the editor commits with non-empty text. Caller handles persistence. */
  onCommit: (commit: TextEditorCommit) => Promise<void> | void
  /** Called whenever the editor state changes in a way the canvas should re-render. */
  onChange: () => void
}

/**
 * Owns the inline text editor: open / type / style / commit / cancel.
 * The composable does NOT know about strokes — committing fires
 * `onCommit(...)` so the caller can either create a new text element or
 * patch an existing one. State is kept reactive so the canvas can
 * position the textarea via computed.
 *
 * Click-outside semantics: when the textarea blurs, we commit unless the
 * blur was caused by clicking the toolbar (where `startToolbarInteraction`
 * has been called) or by focusing back into our own UI elements.
 */
export function useWhiteboardTextEditor(options: UseWhiteboardTextEditorOptions) {
  const editor = ref<TextEditorState | null>(null)
  let toolbarInteraction = false

  function isOurUi(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) return false
    return !!options.textEditorRef.value?.contains(target)
      || !!options.textToolbarRef.value?.contains(target)
  }

  function focusEditor(selectAll = false) {
    void nextTick(() => {
      const input = options.textEditorRef.value
      if (!input) return
      input.focus()
      if (selectAll) input.select()
    })
  }

  function beginInsertion(state: Omit<TextEditorState, 'mode'>) {
    editor.value = { mode: 'new', ...state }
    focusEditor()
  }

  function beginEdit(state: Omit<TextEditorState, 'mode'> & { key: string }) {
    editor.value = { mode: 'edit', ...state }
    focusEditor(true)
  }

  function onInput(e: Event) {
    const current = editor.value
    if (!current) return
    const input = e.target as HTMLTextAreaElement
    current.text = input.value
    const measured = options.measureBox(input.value, current.fontSize, current.width, current.bold, current.italic)
    current.height = Math.max(current.height, measured.height)
  }

  function startToolbarInteraction() {
    toolbarInteraction = true
    window.setTimeout(() => { toolbarInteraction = false }, 0)
  }

  function onBlur(e: FocusEvent) {
    if (toolbarInteraction || isOurUi(e.relatedTarget)) return
    void commit()
  }

  function onToolbarFocusOut(e: FocusEvent) {
    if (isOurUi(e.relatedTarget)) return
    void commit()
  }

  function updateColor(color: string) {
    if (!editor.value) return
    editor.value.color = color
    focusEditor()
  }

  function updateFontSize(fontSize: number) {
    const current = editor.value
    if (!current || !Number.isFinite(fontSize)) return
    current.fontSize = clampTextFontSize(fontSize)
    const measured = options.measureBox(current.text, current.fontSize, current.width, current.bold, current.italic)
    current.height = Math.max(36, measured.height)
    focusEditor()
  }

  function toggleStyle(style: 'bold' | 'italic') {
    const current = editor.value
    if (!current) return
    current[style] = !current[style]
    const measured = options.measureBox(current.text, current.fontSize, current.width, current.bold, current.italic)
    current.height = Math.max(current.height, measured.height)
    focusEditor()
  }

  function setAlign(align: NonNullable<TextElementData['align']>) {
    if (!editor.value) return
    editor.value.align = align
    focusEditor()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void commit()
    }
  }

  function cancel() {
    editor.value = null
    options.onChange()
  }

  async function commit() {
    const current = editor.value
    if (!current) return
    editor.value = null
    const text = current.text.trim()
    if (!text) {
      options.onChange()
      return
    }

    const measured = options.measureBox(text, current.fontSize, current.width, current.bold, current.italic)
    const width = Math.max(current.width, measured.width)
    const height = Math.max(current.height, measured.height)

    await options.onCommit({ ...current, text, width, height })
    options.onChange()
  }

  return {
    editor,
    beginInsertion,
    beginEdit,
    focusEditor,
    isOurUi,
    onInput,
    onKeyDown,
    onBlur,
    onToolbarFocusOut,
    startToolbarInteraction,
    updateColor,
    updateFontSize,
    toggleStyle,
    setAlign,
    commit,
    cancel,
  }
}
