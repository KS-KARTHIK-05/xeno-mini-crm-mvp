import { useMemo } from 'react'

const STATUS_META = {
  sent:      { label: 'Sent',      dot: '#0ea5e9', bg: 'rgba(14,165,233,0.08)' },
  delivered: { label: 'Delivered', dot: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  read:      { label: 'Read',      dot: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  clicked:   { label: 'Clicked',   dot: '#a855f7', bg: 'rgba(168,85,247,0.08)' },
  failed:    { label: 'Failed',    dot: '#f43f5e', bg: 'rgba(244,63,94,0.08)' },
  pending:   { label: 'Pending',   dot: '#52525b', bg: 'rgba(82,82,91,0.08)' },
}

const CHANNEL_ICON = { whatsapp: '💬', email: '📧', sms: '📱', rcs: '⬡' }

function fmt(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  catch { return '' }
}

export default function LiveFeed({ wsEvents = [], comms = [], connected }) {
  // Merge historical comms + real-time WS events (newest first)
  const rows = useMemo(() => {
    // Convert initial comms
    const hist = (comms || []).slice(0, 30).map(c => ({
      id:            c.id,
      customer_name: c.customer_name || '—',
      customer_city: c.customer_city || '',
      channel:       c.channel,
      status:        c.status,
      timestamp:     c.updated_at || c.created_at,
      isLive:        false,
    }))
    // WS events already newest-first
    const live = (wsEvents || []).slice(0, 50).map(e => ({
      id:            e.communication_id || Math.random(),
      customer_name: e.customer_name || '—',
      customer_city: e.customer_city || '',
      channel:       e.channel || 'whatsapp',
      status:        e.status,
      timestamp:     e.timestamp,
      isLive:        true,
    }))
    return [...live, ...hist].slice(0, 80)
  }, [wsEvents, comms])

  if (!rows.length) return (
    <div className="rounded-xl px-4 py-6 text-center"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-sm text-zinc-600">
        {connected ? 'Waiting for delivery events…' : 'No events yet'}
      </p>
    </div>
  )

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      {rows.map((row, i) => {
        const meta = STATUS_META[row.status] || STATUS_META.pending
        const isEven = i % 2 === 0
        return (
          <div
            key={`${row.id}-${i}`}
            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${row.isLive ? 'animate-slide-in-right' : ''}`}
            style={{ background: isEven ? 'rgba(255,255,255,0.02)' : 'transparent' }}
          >
            {/* Live / history indicator */}
            <div className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: row.isLive ? meta.dot : 'rgba(255,255,255,0.1)' }} />

            {/* Customer name */}
            <span className="text-xs text-zinc-300 w-36 truncate shrink-0">{row.customer_name}</span>

            {/* City */}
            <span className="text-xs text-zinc-600 w-20 truncate shrink-0">{row.customer_city}</span>

            {/* Channel */}
            <span className="text-xs text-zinc-600 w-8 shrink-0">
              {CHANNEL_ICON[row.channel] || '📨'}
            </span>

            {/* Status badge */}
            <span className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
              style={{ background: meta.bg, color: meta.dot }}>
              {meta.label}
            </span>

            {/* Timestamp */}
            <span className="ml-auto text-xs text-zinc-700 font-mono shrink-0">
              {fmt(row.timestamp)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
