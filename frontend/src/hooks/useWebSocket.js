import { useEffect, useRef, useState, useCallback } from 'react'

// Use window.location.host so WS goes through the Vite proxy (port 5173 → 8000)
// In production, set this to wss://your-backend-domain.com/api/copilot/ws
const WS_PROTO = window.location.protocol === 'https:' ? 'wss' : 'ws'
const WS_URL   = `${WS_PROTO}://${window.location.host}/api/copilot/ws`

export function useWebSocket() {
  const wsRef         = useRef(null)
  const retryTimer    = useRef(null)
  const mountedRef    = useRef(true)

  const [connected, setConnected]   = useState(false)
  const [events,    setEvents]      = useState([])   // newest first

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        if (!mountedRef.current) return
        setConnected(true)
      }

      ws.onmessage = (e) => {
        if (!mountedRef.current) return
        try {
          const evt = JSON.parse(e.data)
          setEvents(prev => [evt, ...prev].slice(0, 300))
        } catch {}
      }

      ws.onclose = () => {
        if (!mountedRef.current) return
        setConnected(false)
        retryTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    } catch {
      retryTimer.current = setTimeout(connect, 5000)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      clearTimeout(retryTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const clearEvents = useCallback(() => setEvents([]), [])

  return { connected, events, clearEvents }
}
