export default function MessageBubble({ text }) {
  return (
    <div className="flex justify-end animate-slide-up">
      <div
        className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm text-zinc-100 leading-relaxed"
        style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.25)' }}
      >
        {text}
      </div>
    </div>
  )
}
