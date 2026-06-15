import { useState } from 'react'
import {
  Users, MessageSquare, Rocket, AlertCircle, Info,
  ChevronDown, ChevronUp, CheckCircle2, Code2, Edit3
} from 'lucide-react'

/* ─────────────────────────────────────────────────────
   CopilotCard — renders every AI response type
   Types: segment_preview | message_draft | campaign_launched | info | error
───────────────────────────────────────────────────── */
export default function CopilotCard({ message, currentIntent, onDraft, onLaunch, theme }) {
  const { type } = message
  const dark = theme !== 'light'

  if (type === 'segment_preview')   return <SegmentPreviewCard message={message} onDraft={onDraft} dark={dark} />
  if (type === 'message_draft')     return <MessageDraftCard   message={message} intent={currentIntent} onLaunch={onLaunch} dark={dark} />
  if (type === 'campaign_launched') return <LaunchSuccessCard  message={message} dark={dark} />
  if (type === 'error')             return <InfoCard message={message} variant="error" dark={dark} />
  return <InfoCard message={message} variant="info" dark={dark} />
}

/* ── Segment Preview Card ── */
function SegmentPreviewCard({ message, onDraft, dark }) {
  const [showSql, setShowSql] = useState(false)
  const sp    = message.segment_preview || {}
  const cd    = message.campaign_data   || {}
  const count = sp.count ?? 0
  const sample = sp.sample_customers || []

  const textMain = dark ? '#e4e4e7' : '#18181b'
  const textSub  = dark ? '#71717a'  : '#a1a1aa'
  const textMid  = dark ? '#a1a1aa'  : '#52525b'
  const tagBg    = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'
  const tagBdr   = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'

  return (
    <div className="animate-slide-up space-y-3">
      <AssistantBubble>
        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: textMain }}>{message.text}</p>
      </AssistantBubble>

      <div className="card ml-10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
            <Users size={18} className="text-violet-400" />
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: textMain }}>{count.toLocaleString()}</p>
            <p className="text-xs" style={{ color: textSub }}>customers in segment</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs uppercase tracking-wider font-medium" style={{ color: textSub }}>Channel</p>
            <p className="text-sm font-semibold text-accent-light capitalize">{cd.channel || 'whatsapp'}</p>
          </div>
        </div>

        {sample.length > 0 && (
          <div>
            <p className="text-xs mb-2 uppercase tracking-wider font-medium" style={{ color: textSub }}>Sample audience</p>
            <div className="flex flex-wrap gap-1.5">
              {sample.map((c, i) => (
                <span key={i}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={{ background: tagBg, border: `1px solid ${tagBdr}`, color: textMid }}
                >
                  {c.name} · {c.city}
                </span>
              ))}
            </div>
          </div>
        )}

        {sp.sql_preview && (
          <div>
            <button
              onClick={() => setShowSql(v => !v)}
              className="flex items-center gap-1.5 text-xs transition-colors"
              style={{ color: textSub }}
            >
              <Code2 size={12} />
              {showSql ? 'Hide' : 'Show'} segment query
              {showSql ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
            {showSql && (
              <pre className="mt-2 px-3 py-2.5 rounded-lg text-xs font-mono text-violet-300 overflow-x-auto"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                {sp.sql_preview}
              </pre>
            )}
          </div>
        )}

        <button
          onClick={() => onDraft(message.campaign_data)}
          className="btn-primary w-full justify-center"
        >
          <MessageSquare size={14} />
          Draft the message for {count} customers
        </button>
      </div>
    </div>
  )
}

/* ── Message Draft Card ── */
function MessageDraftCard({ message, intent, onLaunch, dark }) {
  const [editedMsg, setEditedMsg] = useState(message.message_draft || '')
  const textMain = dark ? '#e4e4e7' : '#18181b'
  const textSub  = dark ? '#71717a'  : '#a1a1aa'
  const textMid  = dark ? '#a1a1aa'  : '#52525b'

  return (
    <div className="animate-slide-up space-y-3">
      <AssistantBubble>
        <p className="text-sm leading-relaxed" style={{ color: textMain }}>Message drafted! Review and edit below before launching.</p>
      </AssistantBubble>

      <div className="card ml-10 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-accent" />
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: textSub }}>
            {intent?.channel || 'whatsapp'} Message Draft
          </span>
        </div>

        {message.subject_line && (
          <div>
            <p className="text-xs mb-1" style={{ color: textSub }}>Subject</p>
            <p className="text-sm font-medium" style={{ color: textMain }}>{message.subject_line}</p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <p className="text-xs" style={{ color: textSub }}>Message body</p>
            <Edit3 size={10} style={{ color: textSub }} />
          </div>
          <textarea
            value={editedMsg}
            onChange={(e) => setEditedMsg(e.target.value)}
            rows={4}
            className="input-base resize-none font-mono text-xs leading-relaxed"
            style={{
              background: 'rgba(139,92,246,0.05)',
              borderColor: 'rgba(139,92,246,0.2)',
              color: textMain,
            }}
          />
          <p className="text-xs mt-1" style={{ color: textMid }}>
            Use <code className="text-violet-500">{'{{first_name}}'}</code> for personalization
          </p>
        </div>

        <button
          onClick={() => onLaunch(intent, editedMsg)}
          className="btn-primary w-full justify-center"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)' }}
          disabled={!editedMsg.trim()}
        >
          <Rocket size={14} />
          Launch Campaign →
        </button>
      </div>
    </div>
  )
}

/* ── Launch Success Card ── */
function LaunchSuccessCard({ message, dark }) {
  const cd = message.campaign_data || {}
  const textMain = dark ? '#e4e4e7' : '#18181b'
  const textSub  = dark ? '#71717a'  : '#a1a1aa'

  return (
    <div className="animate-slide-up space-y-3">
      <AssistantBubble>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: textMain }}>Campaign launched! 🚀</p>
            <p className="text-xs leading-relaxed" style={{ color: textSub }}>
              {message.text.replace('🚀 **Campaign launched!**\n\n', '')}
            </p>
          </div>
        </div>
      </AssistantBubble>

      {cd.audience_size && (
        <div className="ml-10 flex gap-3">
          <Stat label="Audience" value={cd.audience_size?.toLocaleString()} />
          <Stat label="Channel"  value={cd.channel?.toUpperCase()}          />
          <Stat label="Status"   value={cd.status}                           />
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex-1 rounded-lg px-3 py-2.5 text-center"
      style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-emerald-400">{value}</p>
    </div>
  )
}

/* ── Info / Error Card ── */
function InfoCard({ message, variant, dark }) {
  const isError  = variant === 'error'
  const textMain = dark ? '#d4d4d8' : '#27272a'

  return (
    <div className="animate-slide-up">
      <AssistantBubble>
        <div className="flex gap-2.5">
          {isError
            ? <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            : <Info         size={15} className="text-zinc-500 shrink-0 mt-0.5" />
          }
          <p className="text-sm leading-relaxed" style={{ color: textMain }}>{message.text}</p>
        </div>
      </AssistantBubble>
    </div>
  )
}

/* ── Shared wrapper for AI messages ── */
function AssistantBubble({ children }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-800 flex-shrink-0 flex items-center justify-center mt-0.5 shadow-md shadow-purple-950/50">
        <span className="text-xs">✦</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
