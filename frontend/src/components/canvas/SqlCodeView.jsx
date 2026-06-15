import { useState } from 'react'
import { Code2, ChevronDown, ChevronUp } from 'lucide-react'

function rulesToSQL(rules) {
  if (!rules) return 'WHERE TRUE'
  const { operator = 'AND', conditions = [] } = rules
  if (!conditions.length) return 'WHERE TRUE'

  const parts = conditions.map(c => {
    const { field, op, value } = c
    const opMap = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', neq: '!=' }
    if (op === 'days_ago') return `last_order_date < NOW() - INTERVAL '${value} days'`
    if (op === 'contains' && field === 'tags') return `'${value}' = ANY(tags)`
    if (op === 'in') return `${field} IN (${(Array.isArray(value) ? value : [value]).map(v => `'${v}'`).join(', ')})`
    return `${field} ${opMap[op] || op} ${typeof value === 'string' ? `'${value}'` : value}`
  })

  return 'WHERE\n  ' + parts.join(`\n  ${operator} `)
}

export default function SqlCodeView({ rules }) {
  const [open, setOpen] = useState(false)
  const sql = rulesToSQL(rules)

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/3"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="flex items-center gap-2">
          <Code2 size={13} className="text-zinc-600" />
          <span className="text-xs font-medium text-zinc-500">Segment SQL</span>
        </div>
        {open ? <ChevronUp size={13} className="text-zinc-700" /> : <ChevronDown size={13} className="text-zinc-700" />}
      </button>

      {open && (
        <div className="animate-slide-up">
          <pre className="px-4 py-4 text-xs font-mono leading-relaxed overflow-x-auto"
            style={{ color: '#a78bfa', background: 'rgba(139,92,246,0.05)' }}>
            <span style={{ color: '#52525b' }}>SELECT * FROM </span>
            <span style={{ color: '#e4e4e7' }}>customers</span>
            {'\n'}
            <span style={{ color: '#52525b' }}>{sql}</span>
          </pre>
        </div>
      )}
    </div>
  )
}
