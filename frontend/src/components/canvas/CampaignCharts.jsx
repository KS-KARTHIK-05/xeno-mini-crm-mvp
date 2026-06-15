import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

/* ─── Status colour palette ────────────────────────────────── */
const STATUS_COLORS = {
  Sent:       '#0ea5e9',
  Delivered:  '#10b981',
  Read:       '#f59e0b',
  Clicked:    '#a855f7',
  Failed:     '#f43f5e',
}

const CHANNEL_COLORS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e']

/* ─── Custom Tooltip for bar chart ────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="px-3 py-2 rounded-lg text-xs"
      style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7' }}>
      <p className="font-medium mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

/* ─── Funnel bar chart: Sent → Delivered → Read → Clicked ─── */
export function DeliveryFunnelChart({ metrics }) {
  const data = useMemo(() => [
    { name: 'Sent',      value: metrics.total_sent      || 0, fill: STATUS_COLORS.Sent },
    { name: 'Delivered', value: metrics.total_delivered || 0, fill: STATUS_COLORS.Delivered },
    { name: 'Read',      value: metrics.total_read      || 0, fill: STATUS_COLORS.Read },
    { name: 'Clicked',   value: metrics.total_clicked   || 0, fill: STATUS_COLORS.Clicked },
    { name: 'Failed',    value: metrics.total_failed    || 0, fill: STATUS_COLORS.Failed },
  ], [metrics])

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">Delivery Funnel</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={28}>
          <XAxis
            dataKey="name"
            tick={{ fill: '#71717a', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#52525b', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ─── Channel distribution pie chart ──────────────────────── */
export function ChannelPieChart({ comms, wsEvents }) {
  const data = useMemo(() => {
    const counts = {}
    ;[...(comms || []), ...(wsEvents || [])].forEach(e => {
      const ch = e.channel || 'whatsapp'
      counts[ch] = (counts[ch] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [comms, wsEvents])

  if (data.length === 0) return null

  return (
    <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-4">Channel Mix</p>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
            isAnimationActive
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
            ))}
          </Pie>
          <Legend
            formatter={(v) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{v}</span>}
          />
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ─── AI Explainability block ──────────────────────────────── */
export function AIExplainBlock({ campaign }) {
  if (!campaign?.segment_rules) return null
  const { operator = 'AND', conditions = [] } = campaign.segment_rules

  const bullets = conditions.map(c => {
    const { field, op, value } = c
    if (op === 'days_ago')      return `Customers inactive for more than ${value} days`
    if (field === 'total_spend' && op === 'gte') return `Lifetime spend ≥ ₹${Number(value).toLocaleString('en-IN')}`
    if (field === 'total_spend' && op === 'lte') return `Lifetime spend ≤ ₹${Number(value).toLocaleString('en-IN')}`
    if (field === 'tags')       return `Tagged as "${value}"`
    if (field === 'city')       return `Located in ${value}`
    if (field === 'order_count') return `Order count ${op} ${value}`
    return `${field} ${op} ${value}`
  })

  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)' }}>
      <div className="flex items-center gap-2">
        <span className="text-violet-400 text-base">✦</span>
        <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">AI Reasoning</p>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">
        Gemini selected this audience using a{' '}
        <span className="text-violet-400 font-medium">{operator}</span> combination of {bullets.length} rule{bullets.length !== 1 ? 's' : ''}:
      </p>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
            <span className="text-violet-500 mt-0.5">▸</span>
            {b}
          </li>
        ))}
      </ul>
      <p className="text-xs text-zinc-600 italic pt-1">
        The charts below validate that this segment received and engaged with the campaign as expected.
      </p>
    </div>
  )
}
