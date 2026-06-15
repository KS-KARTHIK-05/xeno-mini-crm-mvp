export default function SuggestionChips({ suggestions = [], onSelect, compact = false }) {
  if (!suggestions.length) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? 'mb-2' : ''}`}>
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="text-xs px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-200 
                     hover:bg-white/8 transition-all duration-150 text-left leading-snug"
          style={{ border: '1px solid rgba(255,255,255,0.09)' }}
        >
          {compact ? truncate(s, 50) : s}
        </button>
      ))}
    </div>
  )
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str
}
