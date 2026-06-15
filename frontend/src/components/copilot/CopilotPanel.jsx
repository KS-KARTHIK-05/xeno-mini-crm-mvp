import { useRef, useEffect } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useCopilot } from '../../hooks/useCopilot'
import ChatInput from './ChatInput'
import SuggestionChips from './SuggestionChips'
import MessageBubble from './MessageBubble'
import CopilotCard from './CopilotCard'

export default function CopilotPanel({ onCampaignLaunched, theme }) {
  const scrollRef = useRef(null)
  const dark = theme !== 'light'

  const {
    messages, isLoading, currentIntent, suggestions,
    sendMessage, requestDraft, launchCampaign, clearChat,
  } = useCopilot({ onCampaignLaunched })

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isLoading])

  const isEmpty = messages.length === 0

  /* ── Theme tokens ── */
  const panelBg    = dark ? '#080808' : '#fafafa'
  const headerBdr  = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const inputBdr   = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
  const titleClr   = dark ? '#f4f4f5' : '#18181b'
  const subClr     = dark ? '#71717a'  : '#a1a1aa'
  const clearClr   = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'

  return (
    <div className="flex flex-col h-full" style={{ background: panelBg }}>

      {/* ── Header ── */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${headerBdr}` }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-lg shadow-purple-950/40">
            <Sparkles size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none mb-0.5" style={{ color: titleClr }}>
              Campaign Copilot
            </p>
            <p className="text-xs" style={{ color: subClr }}>
              Describe your goal — AI handles the rest
            </p>
          </div>
        </div>

        {/* Clear chat button — always visible, dims when no messages */}
        <button
          onClick={clearChat}
          title="Clear chat"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
          style={{
            opacity: isEmpty ? 0.35 : 1,
            background: clearClr,
            color: subClr,
            pointerEvents: isEmpty ? 'none' : 'auto',
          }}
        >
          <Trash2 size={11} />
          Clear
        </button>
      </div>

      {/* ── Message Stream ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {isEmpty ? (
          <EmptyState suggestions={suggestions} onSend={sendMessage} dark={dark} />
        ) : (
          (messages || []).map((msg) =>
            msg.role === 'user'
              ? <MessageBubble key={msg._id} text={msg.text} theme={theme} />
              : <CopilotCard
                  key={msg._id}
                  message={msg}
                  currentIntent={currentIntent}
                  onDraft={requestDraft}
                  onLaunch={launchCampaign}
                  theme={theme}
                />
          )
        )}
        {isLoading && <SkeletonLoader dark={dark} />}
      </div>

      {/* ── Input Area ── */}
      <div
        className="shrink-0 px-3 pb-3 pt-2"
        style={{ borderTop: `1px solid ${inputBdr}` }}
      >
        {!isEmpty && messages.length < 4 && suggestions.length > 0 && (
          <SuggestionChips suggestions={suggestions.slice(0, 3)} onSelect={sendMessage} compact />
        )}
        <ChatInput onSend={sendMessage} isLoading={isLoading} theme={theme} />
      </div>
    </div>
  )
}

/* ── Empty / Onboarding ── */
function EmptyState({ suggestions, onSend, dark }) {
  const textMain = dark ? '#e4e4e7' : '#18181b'
  const textSub  = dark ? '#71717a'  : '#a1a1aa'
  return (
    <div className="flex flex-col items-center py-8 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/15 to-purple-800/10 border border-violet-500/15 flex items-center justify-center mb-5 animate-float">
        <Sparkles size={26} className="text-violet-400" />
      </div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: textMain }}>Start with a command</h3>
      <p className="text-xs text-center max-w-[270px] mb-7 leading-relaxed" style={{ color: textSub }}>
        Describe your campaign goal in plain language. AI will identify the audience and craft the message.
      </p>
      <SuggestionChips suggestions={suggestions} onSelect={onSend} />
    </div>
  )
}

/* ── Loading Skeleton ── */
function SkeletonLoader({ dark }) {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-violet-800/40 flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2.5 py-1">
        <div className="h-3 rounded-full w-3/4 shimmer-bg" />
        <div className="h-3 rounded-full w-1/2 shimmer-bg" />
        <div className="h-3 rounded-full w-2/3 shimmer-bg" />
        <div className="h-3 rounded-full w-2/5 shimmer-bg" />
      </div>
    </div>
  )
}
