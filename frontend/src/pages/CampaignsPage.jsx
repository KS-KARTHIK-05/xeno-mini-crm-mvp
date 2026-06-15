import { useMemo, useState } from 'react'
import { RefreshCw, ArrowRight, CheckCircle2, Clock, XCircle, Loader2, BarChart2 } from 'lucide-react'
import { useCampaigns } from '../hooks/useCampaigns'

const STATUS_META = {
  completed: { label: 'Completed', color: '#10b981', icon: CheckCircle2 },
  launched:  { label: 'Launched',  color: '#10b981', icon: CheckCircle2 },
  running:   { label: 'Running',   color: '#0ea5e9', icon: Loader2 },
  pending:   { label: 'Pending',   color: '#f59e0b', icon: Clock },
  draft:     { label: 'Draft',     color: '#71717a', icon: Clock },
  failed:    { label: 'Failed',    color: '#f43f5e', icon: XCircle },
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function pct(n, total) {
  if (!total) return '—'
  return `${Math.round((n / total) * 100)}%`
}

export default function CampaignsPage({ onSelectCampaign, theme }) {
  const { campaigns, loading, error, refresh } = useCampaigns()
  const [sort, setSort]       = useState({ key: 'created_at', dir: -1 })
  const [refreshing, setRefreshing] = useState(false)

  const dark       = theme !== 'light'
  const pageBg     = dark ? '#050505' : '#f8f8f9'
  const cardBg     = dark ? 'rgba(255,255,255,0.02)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)'
  const headBg     = dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'
  const rowBorder  = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'
  const textMain   = dark ? '#f4f4f5' : '#18181b'
  const textSub    = dark ? '#71717a' : '#a1a1aa'
  const textMid    = dark ? '#a1a1aa' : '#52525b'

  const sorted = useMemo(() => {
    return [...(campaigns || [])].sort((a, b) => {
      const av = a[sort.key] ?? 0
      const bv = b[sort.key] ?? 0
      return sort.dir * (av < bv ? -1 : av > bv ? 1 : 0)
    })
  }, [campaigns, sort])

  const toggleSort = (key) => setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }))

  const CHANNEL_ICON = { whatsapp: '💬', email: '📧', sms: '📱', rcs: '⬡' }

  const handleRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <div className="min-h-full" style={{ background: pageBg }}>
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: textMain }}>Campaign History</h1>
            <p className="text-sm mt-0.5" style={{ color: textSub }}>
              {(campaigns || []).length} total campaign{(campaigns || []).length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
            style={{ border: `1px solid ${cardBorder}`, color: textSub, background: cardBg }}
          >
            <RefreshCw size={12} className={(refreshing || loading) ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-lg px-4 py-3 mb-4 text-sm text-red-400"
            style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.18)' }}>
            {error}
          </div>
        )}

        {/* ── Table ── */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${cardBorder}` }}>

          {/* Head */}
          <div className="grid gap-3 px-5 py-3 text-xs font-medium uppercase tracking-wider"
            style={{
              gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px 90px 36px',
              background: headBg,
              borderBottom: `1px solid ${rowBorder}`,
              color: textSub,
            }}>
            {[['name','Campaign'],['channel','Channel'],['created_at','Created'],
              ['audience_size','Audience'],['total_sent','Sent'],['total_delivered','Delivered'],
              ['status','Status']].map(([k, l]) => (
              <button key={k} onClick={() => toggleSort(k)}
                className="text-left hover:opacity-80 transition-opacity flex items-center gap-1">
                {l}{sort.key === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
              </button>
            ))}
            <div />
          </div>

          {/* Loading skeletons */}
          {(loading || refreshing) ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="grid gap-3 px-5 py-4 border-b items-center"
                style={{
                  gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px 90px 36px',
                  borderColor: rowBorder,
                  background: i % 2 === 0 ? (dark ? 'rgba(255,255,255,0.01)' : '#fff') : 'transparent',
                }}>
                <div className="h-3 shimmer-bg rounded-full w-3/4" />
                <div className="h-3 shimmer-bg rounded-full w-1/2" />
                <div className="h-3 shimmer-bg rounded-full w-2/3" />
                <div className="h-3 shimmer-bg rounded-full w-full" />
                <div className="h-3 shimmer-bg rounded-full w-full" />
                <div className="h-3 shimmer-bg rounded-full w-full" />
                <div className="h-3 shimmer-bg rounded-full w-2/3" />
                <div className="h-3 shimmer-bg rounded-full w-4" />
              </div>
            ))
          ) : (sorted || []).length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <BarChart2 size={28} style={{ color: textSub }} />
              <p className="text-sm" style={{ color: textSub }}>
                No campaigns yet — launch one from the Workspace tab.
              </p>
            </div>
          ) : (
            (sorted || []).map((c, idx) => {
              const sm = STATUS_META[c.status] || STATUS_META.draft
              const StatusIcon = sm.icon
              return (
                <div
                  key={c.id}
                  className="grid gap-3 px-5 py-3.5 text-sm items-center border-b cursor-pointer transition-colors duration-100"
                  style={{
                    gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px 90px 36px',
                    borderColor: rowBorder,
                    background: idx % 2 === 0
                      ? (dark ? 'rgba(255,255,255,0.01)' : '#ffffff')
                      : (dark ? 'transparent' : '#f9f9fa'),
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.03)' : '#f1f1f3'}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0
                    ? (dark ? 'rgba(255,255,255,0.01)' : '#ffffff')
                    : (dark ? 'transparent' : '#f9f9fa')}
                  onClick={() => onSelectCampaign?.(c.id)}
                >
                  <div>
                    <p className="font-medium truncate" style={{ color: textMain }}>{c.name}</p>
                    {c.ai_prompt && (
                      <p className="text-xs truncate mt-0.5" style={{ color: textSub }}>{c.ai_prompt}</p>
                    )}
                  </div>
                  <span style={{ color: textMid }}>{CHANNEL_ICON[c.channel]} {c.channel}</span>
                  <span className="text-xs" style={{ color: textSub }}>{fmtDate(c.created_at)}</span>
                  <span style={{ color: textMain }}>{(c.audience_size || 0).toLocaleString()}</span>
                  <span style={{ color: textMain }}>{(c.total_sent || 0).toLocaleString()}</span>
                  <span style={{ color: textMain }}>{pct(c.total_delivered || 0, c.total_sent || 0)}</span>
                  <span className="flex items-center gap-1.5" style={{ color: sm.color }}>
                    <StatusIcon size={12} className={c.status === 'running' ? 'animate-spin' : ''} />
                    {sm.label}
                  </span>
                  <ArrowRight size={13} style={{ color: textSub }} />
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
