import { useMemo } from 'react'
import { Send, CheckCheck, Eye, MousePointerClick, TrendingUp, XCircle } from 'lucide-react'

const METRICS = [
  { key: 'total_sent',      label: 'Sent',       icon: Send,              color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)',  border: 'rgba(14,165,233,0.18)' },
  { key: 'total_delivered', label: 'Delivered',  icon: CheckCheck,        color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.18)' },
  { key: 'total_read',      label: 'Read',        icon: Eye,               color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.18)' },
  { key: 'total_clicked',   label: 'Clicked',    icon: MousePointerClick, color: '#a855f7', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.18)' },
  { key: 'total_failed',    label: 'Failed',     icon: XCircle,           color: '#f43f5e', bg: 'rgba(244,63,94,0.08)',   border: 'rgba(244,63,94,0.18)' },
]

// Cumulative: each status implies all prior stages
const WS_CUMULATIVE = {
  sent:      ['total_sent'],
  delivered: ['total_sent', 'total_delivered'],
  read:      ['total_sent', 'total_delivered', 'total_read'],
  clicked:   ['total_sent', 'total_delivered', 'total_read', 'total_clicked'],
  converted: ['total_sent', 'total_delivered', 'total_read', 'total_clicked'],
  failed:    ['total_failed'],
}

export default function MetricsGrid({ campaign, comms = [], wsEvents = [], loading, theme }) {
  const dark = theme !== 'light'
  // Merge initial DB values with incremental WS events (cumulative)
  const metrics = useMemo(() => {
    const base = {
      total_sent:      0,
      total_delivered: 0,
      total_read:      0,
      total_clicked:   0,
      total_failed:    0,
      audience_size:   campaign?.audience_size   || 0,
    }

    const map = {}
    for (const c of (comms || [])) {
      map[c.id] = c.status
    }
    for (const e of (wsEvents || [])) {
      if (e.communication_id) {
        map[e.communication_id] = e.status
      }
    }

    const statuses = Object.values(map)
    if (statuses.length > 0) {
      for (const status of statuses) {
        const keys = WS_CUMULATIVE[status]
        if (keys) {
          keys.forEach(k => { base[k] = (base[k] || 0) + 1 })
        }
      }
    } else if (campaign) {
      base.total_sent      = campaign.total_sent || 0
      base.total_delivered = campaign.total_delivered || 0
      base.total_read      = campaign.total_read || 0
      base.total_clicked   = campaign.total_clicked || 0
      base.total_failed    = campaign.total_failed || 0
    }

    return base
  }, [campaign, comms, wsEvents])

  const audience = metrics.audience_size || 1
  const valClr   = dark ? '#f4f4f5' : '#18181b'
  const lblClr   = dark ? '#52525b' : '#71717a'
  const hdrClr   = dark ? '#52525b' : '#9ca3af'
  const footClr  = dark ? '#3f3f46' : '#d4d4d8'

  if (loading) return <SkeletonGrid />

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: hdrClr }}>Delivery Metrics</p>
      <div className="grid grid-cols-5 gap-2">
        {METRICS.map(({ key, label, icon: Icon, color, bg, border }) => {
          const value = metrics[key] || 0
          const pct   = audience > 0 ? Math.round((value / audience) * 100) : 0
          return (
            <div key={key} className="rounded-xl px-3 py-3 flex flex-col gap-2"
              style={{ background: bg, border: `1px solid ${border}` }}>
              <div className="flex items-center justify-between">
                <Icon size={13} style={{ color }} />
                <span className="text-xs" style={{ color: color + 'aa' }}>{pct}%</span>
              </div>
              <p className="text-xl font-bold" style={{ color: valClr }}>{value.toLocaleString()}</p>
              <p className="text-xs" style={{ color: lblClr }}>{label}</p>
              {/* Progress bar */}
              <div className="h-0.5 rounded-full overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs mt-2 text-right" style={{ color: footClr }}>Audience: {audience.toLocaleString()} customers</p>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-5 gap-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-xl h-24 shimmer-bg"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }} />
      ))}
    </div>
  )
}
