import { useMemo } from 'react'
import { Activity, BarChart3, Radio, Sparkles, Zap } from 'lucide-react'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useCampaignDetail } from '../../hooks/useCampaigns'
import MetricsGrid from './MetricsGrid'
import LiveFeed from './LiveFeed'
import SqlCodeView from './SqlCodeView'
import { DeliveryFunnelChart, ChannelPieChart, AIExplainBlock } from './CampaignCharts'

export default function CanvasPanel({ campaignId, theme }) {
  const dark = theme !== 'light'
  const { connected, events } = useWebSocket()
  const { campaign, comms, loading } = useCampaignDetail(campaignId)

  // Theme tokens
  const bg         = dark ? '#050505' : '#ffffff'
  const headerBdr  = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const textMain   = dark ? '#f4f4f5' : '#18181b'
  const textSub    = dark ? '#71717a'  : '#a1a1aa'

  const wsEvents = events.filter(e =>
    e.type === 'delivery_event' && (!campaignId || e.campaign_id === campaignId)
  )

  const metrics = useMemo(() => {
    const base = {
      total_sent:      0,
      total_delivered: 0,
      total_read:      0,
      total_clicked:   0,
      total_failed:    0,
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
        const keys = {
          sent:      ['total_sent'],
          delivered: ['total_sent', 'total_delivered'],
          read:      ['total_sent', 'total_delivered', 'total_read'],
          clicked:   ['total_sent', 'total_delivered', 'total_read', 'total_clicked'],
          failed:    ['total_sent', 'total_failed'],
        }[status]
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

  if (!campaignId) return <EmptyCanvas connected={connected} theme={theme} />

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: bg }}>

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3"
        style={{ borderBottom: `1px solid ${headerBdr}` }}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <BarChart3 size={14} className="text-emerald-400" />
          </div>
          <div>
            {loading
              ? <div className="w-36 h-3 shimmer-bg rounded-full mb-1" />
              : <p className="text-sm font-semibold leading-none mb-0.5" style={{ color: textMain }}>{campaign?.name || 'Campaign'}</p>
            }
            <p className="text-xs" style={{ color: textSub }}>Live analytics canvas</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs" style={{ color: textSub }}>Streaming live</span>
            </>
          ) : (
            <><span className="w-2 h-2 rounded-full bg-zinc-700" /><span className="text-xs" style={{ color: textSub }}>Connecting…</span></>
          )}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        {/* 1. Metrics grid */}
        <MetricsGrid campaign={campaign} comms={comms} wsEvents={wsEvents} loading={loading} theme={theme} />

        {/* 2. Charts row */}
        <div className="grid grid-cols-2 gap-4 animate-fade-in">
          <DeliveryFunnelChart metrics={metrics} theme={theme} />
          <ChannelPieChart comms={comms} wsEvents={wsEvents} theme={theme} />
        </div>

        {/* 3. AI Explainability */}
        {campaign && <AIExplainBlock campaign={campaign} theme={theme} />}

        {/* 4. Live delivery feed */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Radio size={13} style={{ color: textSub }} />
            <span className="text-xs font-medium uppercase tracking-wider" style={{ color: textSub }}>Delivery Feed</span>
            {wsEvents.length > 0 && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                {wsEvents.length} live
              </span>
            )}
          </div>
          <LiveFeed wsEvents={wsEvents} comms={comms} connected={connected} theme={theme} />
        </div>

        {/* 5. SQL transparency */}
        {campaign?.segment_rules && <SqlCodeView rules={campaign.segment_rules} theme={theme} />}
      </div>
    </div>
  )
}

/* ── Premium empty state ── */
function EmptyCanvas({ connected, theme }) {
  const dark = theme !== 'light'
  const bg       = dark ? '#050505' : '#ffffff'
  const textMain = dark ? '#d4d4d8' : '#3f3f46'
  const textSub  = dark ? '#71717a'  : '#a1a1aa'
  const cardBg   = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
  const cardBdr  = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'

  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden"
      style={{ background: bg }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 60%, rgba(139,92,246,0.05) 0%, transparent 70%)' }} />

      <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center mb-5 animate-float"
        style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(109,40,217,0.06))',
          border: '1px solid rgba(139,92,246,0.15)',
          boxShadow: '0 0 40px rgba(139,92,246,0.1)',
        }}>
        <Activity size={28} className="text-violet-500/70" />
      </div>

      <h2 className="text-base font-semibold mb-2" style={{ color: textMain }}>Live Metrics Canvas</h2>
      <p className="text-sm text-center max-w-[280px] leading-relaxed mb-8" style={{ color: textSub }}>
        Select or launch an AI campaign to stream real-time delivery metrics
      </p>

      <div className="flex gap-3 mb-8">
        {[
          { icon: Sparkles, label: 'Describe goal',  sub: 'in the Copilot' },
          { icon: Zap,       label: 'Launch',         sub: 'the campaign' },
          { icon: BarChart3, label: 'Charts animate', sub: 'live via WS' },
        ].map(({ icon: Icon, label, sub }, i) => (
          <div key={i} className="flex flex-col items-center gap-2 px-5 py-4 rounded-xl"
            style={{ background: cardBg, border: `1px solid ${cardBdr}` }}>
            <Icon size={14} style={{ color: textSub }} />
            <p className="text-xs font-medium" style={{ color: textSub }}>{label}</p>
            <p className="text-xs" style={{ color: dark ? '#52525b' : '#d4d4d8' }}>{sub}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: connected ? 'rgba(16,185,129,0.06)' : (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'),
          border:     connected ? '1px solid rgba(16,185,129,0.12)' : `1px solid ${cardBdr}`,
        }}>
        {connected ? (
          <>
            <span className="relative flex w-1.5 h-1.5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-50" />
              <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-500/80">WebSocket connected — ready to stream</span>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
            <span className="text-xs" style={{ color: textSub }}>Connecting to live feed…</span>
          </>
        )}
      </div>
    </div>
  )
}
