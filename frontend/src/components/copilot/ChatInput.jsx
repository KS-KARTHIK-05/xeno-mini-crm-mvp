import { useState } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'

export default function ChatInput({ onSend, isLoading, theme }) {
  const [inputText, setInputText] = useState('')
  const dark = theme !== 'light'

  const handleSubmit = () => {
    const text = inputText.trim()
    if (!text || isLoading) return
    onSend(text)
    setInputText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="relative z-50 pointer-events-auto flex items-center gap-2 w-full"
      style={{
        position: 'relative',
        zIndex: 50,
        pointerEvents: 'auto'
      }}
    >
      <input
        type="text"
        placeholder="Type a custom campaign prompt..."
        className="w-full bg-zinc-900 text-white border border-zinc-700 rounded-lg p-4 relative z-50 pointer-events-auto focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          zIndex: 50,
          pointerEvents: 'auto'
        }}
      />

      <button
        onClick={handleSubmit}
        className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center transition-all duration-150 relative z-50 pointer-events-auto"
        style={{
          background: inputText.trim()
            ? 'linear-gradient(135deg,#8b5cf6,#7c3aed)'
            : (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'),
          opacity: inputText.trim() ? 1 : 0.4,
          position: 'relative',
          zIndex: 50,
          pointerEvents: 'auto'
        }}
      >
        {isLoading
          ? <Loader2 size={16} className="text-zinc-400 animate-spin" />
          : <ArrowUp  size={16} className="text-white" />
        }
      </button>
    </div>
  )
}
