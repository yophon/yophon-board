import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

interface UseWhiteboardFullscreenOptions {
  /** The element to request native fullscreen on; also the reference used to detect "is this element fullscreen". */
  wrapRef: Ref<HTMLElement | undefined>
  /** Called whenever the active mode changes — typically used to redraw at the new viewport size. */
  onModeChange: () => void
  /** Called when fullscreen toggle fails, so the canvas can show an error toast. */
  onError?: (message: string) => void
}

const LONG_PRESS_MS = 450

/**
 * Two fullscreen modes share state here:
 *
 * - **Web fullscreen**: a CSS-only mode that hides body overflow and lets the
 *   canvas wrap the viewport. Toggled by short tap.
 * - **Native fullscreen**: actual `requestFullscreen()` API. Long press only.
 *
 * The press handlers form a tap-vs-long-press machine: timer fires →
 * native; release before timer → web mode toggle.
 */
export function useWhiteboardFullscreen(options: UseWhiteboardFullscreenOptions) {
  const isFullscreen = ref(false)
  const isWebFullscreen = ref(false)
  const pressTimer = ref<number | null>(null)
  const longPressHandled = ref(false)
  let previousBodyOverflow = ''

  const fullscreenTitle = computed(() => {
    if (isFullscreen.value) return '退出屏幕全屏'
    if (isWebFullscreen.value) return '退出网页全屏'
    return '点击网页全屏，长按屏幕全屏'
  })

  function setWebFullscreen(next: boolean) {
    if (isWebFullscreen.value === next) return
    isWebFullscreen.value = next
    if (next) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousBodyOverflow
    }
    options.onModeChange()
  }

  function toggleWebFullscreen() {
    setWebFullscreen(!isWebFullscreen.value)
  }

  async function toggleFullscreen() {
    const wrap = options.wrapRef.value
    if (!wrap) return
    try {
      if (document.fullscreenElement === wrap) {
        await document.exitFullscreen()
      } else {
        // Browsers reject simultaneous CSS-fullscreen + native-fullscreen,
        // so we always exit web mode before requesting native.
        setWebFullscreen(false)
        await wrap.requestFullscreen()
      }
    } catch {
      options.onError?.('全屏切换失败')
    }
  }

  function onFullscreenChange() {
    isFullscreen.value = document.fullscreenElement === options.wrapRef.value
    options.onModeChange()
  }

  function clearPressTimer() {
    if (pressTimer.value !== null) {
      window.clearTimeout(pressTimer.value)
      pressTimer.value = null
    }
  }

  function startFullscreenPress() {
    longPressHandled.value = false
    pressTimer.value = window.setTimeout(() => {
      longPressHandled.value = true
      pressTimer.value = null
      void toggleFullscreen()
    }, LONG_PRESS_MS)
  }

  function finishFullscreenPress() {
    clearPressTimer()
    if (longPressHandled.value) {
      longPressHandled.value = false
      return
    }
    if (isFullscreen.value) {
      void toggleFullscreen()
      return
    }
    toggleWebFullscreen()
  }

  function cancelFullscreenPress() {
    clearPressTimer()
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', onFullscreenChange)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    clearPressTimer()
    if (isWebFullscreen.value) {
      document.body.style.overflow = previousBodyOverflow
    }
  })

  return {
    isFullscreen,
    isWebFullscreen,
    fullscreenTitle,
    toggleFullscreen,
    toggleWebFullscreen,
    startFullscreenPress,
    finishFullscreenPress,
    cancelFullscreenPress,
  }
}
