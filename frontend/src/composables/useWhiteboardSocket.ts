import { onBeforeUnmount, ref } from 'vue'

export type WsState = 'connecting' | 'online' | 'offline'

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]

interface UseWhiteboardSocketOptions {
  /** Returns the WebSocket URL to connect to. Called on every connect attempt. */
  url: () => string
  /** Called on successful open. The socket will reconnect on close, so onOpen may run multiple times. */
  onOpen?: () => void
  /** Called on every incoming message. Owner is responsible for parsing/dispatching. */
  onMessage: (event: MessageEvent) => void
}

/**
 * Owns the canvas's WebSocket connection lifecycle: open, exponential-ish
 * reconnect, and clean teardown. The caller passes in `onMessage` to bridge
 * back into canvas state, so the composable doesn't know anything about
 * strokes or the server message schema.
 *
 * `connect()` is idempotent — calling it again closes any existing socket
 * and starts fresh. `disconnect()` runs automatically on unmount, but you
 * can also call it manually for hot reloads.
 */
export function useWhiteboardSocket(options: UseWhiteboardSocketOptions) {
  const wsState = ref<WsState>('offline')
  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  let reconnectAttempts = 0
  let unmounted = false

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function connect() {
    if (ws) {
      ws.close()
      ws = null
    }
    clearReconnectTimer()

    wsState.value = 'connecting'
    ws = new WebSocket(options.url())

    ws.onopen = () => {
      wsState.value = 'online'
      reconnectAttempts = 0
      options.onOpen?.()
    }
    ws.onmessage = options.onMessage
    ws.onerror = () => {
      wsState.value = 'offline'
    }
    ws.onclose = () => {
      if (unmounted) return
      wsState.value = 'offline'
      const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)]
      reconnectAttempts += 1
      reconnectTimer = window.setTimeout(connect, delay)
    }
  }

  function disconnect() {
    unmounted = true
    clearReconnectTimer()
    if (ws) {
      ws.close()
      ws = null
    }
  }

  onBeforeUnmount(disconnect)

  return {
    wsState,
    connect,
    disconnect,
  }
}
