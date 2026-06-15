import { useRef, useState } from 'react'
import { useCustomers } from '../hooks/useCustomers'
import { Search, ChevronLeft, ChevronRight, Users, Upload, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { api } from '../api/client'

const TAG_COLORS = {
  'vip':     { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.25)' },
  'at-risk': { bg: 'rgba(244,63,94,0.10)',  color: '#fb7185', border: 'rgba(244,63,94,0.25)' },
  'new':     { bg: 'rgba(16,185,129,0.10)', color: '#34d399', border: 'rgba(16,185,129,0.25)' },
  'lapsed':  { bg: 'rgba(245,158,11,0.10)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
  'loyal':   { bg: 'rgba(14,165,233,0.10)', color: '#38bdf8', border: 'rgba(14,165,233,0.25)' },
}

function TagBadge({ tag }) {
  const c = TAG_COLORS[tag] || { bg: 'rgba(255,255,255,0.05)', color: '#71717a', border: 'rgba(255,255,255,0.1)' }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {tag}
    </span>
  )
}

function fmt(n) {
  if (!n && n !== 0) return '—'
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

/* ── CSV Import toast ──────────────────────────────────────── */
function ImportToast({ result, onClose }) {
  if (!result) return null
  const ok = result.type === 'success'
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl animate-slide-up"
      style={{
        background: ok ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
        border:     ok ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(244,63,94,0.25)',
        backdropFilter: 'blur(12px)',
      }}>
      {ok
        ? <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
        : <AlertCircle  size={16} className="text-red-400 mt-0.5 shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: ok ? '#34d399' : '#fb7185' }}>
          {ok ? 'Import successful' : 'Import failed'}
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">{result.message}</p>
      </div>
      <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 shrink-0">
        <X size={13} />
      </button>
    </div>
  )
}

/* ── Robust CSV Parser ──────────────────────────────────────── */
// Normalise a header to a key for loose matching
function normHdr(h) {
  return h.toLowerCase().replace(/[\s_\-/"']+/g, '')
}

// Find a value from row object by any of several possible normalized header names
function pick(obj, ...candidates) {
  for (const c of candidates) {
    const key = Object.keys(obj).find(k => normHdr(k) === normHdr(c))
    if (key && obj[key] !== undefined && obj[key] !== '') return obj[key]
  }
  return null
}

function parseCSV(text) {
  // Support \r\n and \n line endings
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  // Parse headers — strip BOM, quotes, extra whitespace
  const headers = lines[0]
    .replace(/^\uFEFF/, '') // BOM
    .split(',')
    .map(h => h.trim().replace(/^"|"$/g, ''))

  return lines.slice(1)
    .filter(l => l.trim().length > 0) // skip blank rows
    .map(line => {
      // Simple CSV split (handles quoted fields with commas)
      const vals = []
      let cur = '', inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
        else cur += ch
      }
      vals.push(cur.trim())

      const obj = {}
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '') })

      const name  = pick(obj, 'name', 'fullname', 'full_name', 'customer_name') || ''
      const email = pick(obj, 'email', 'email_address', 'emailaddress') || ''

      // Skip rows with no name AND no email — be lenient
      if (!name && !email) return null

      const rawTags = pick(obj, 'tags', 'tag', 'labels') || ''
      const tags = rawTags
        ? rawTags.split(/[;|,]/).map(t => t.trim().toLowerCase()).filter(Boolean)
        : []

      return {
        name,
        email,
        phone:       pick(obj, 'phone', 'mobile', 'phone_number', 'contact') || null,
        city:        pick(obj, 'city', 'location', 'town', 'region') || null,
        total_spend: parseFloat(pick(obj, 'total_spend', 'spend', 'total', 'amount') || '0') || 0,
        order_count: parseInt(pick(obj, 'order_count', 'orders', 'order_count', 'purchases') || '0', 10) || 0,
        tags,
      }
    })
    .filter(Boolean) // drop nulls
}

/* ── Orders CSV Parser ─────────────────────────────────────── */
function parseOrdersCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = lines[0]
    .replace(/^\uFEFF/, '')
    .split(',')
    .map(h => h.trim().replace(/^"|"$/g, ''))

  return lines.slice(1)
    .filter(l => l.trim().length > 0)
    .map(line => {
      // CSV split handling quoted fields
      const vals = []
      let cur = '', inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = '' }
        else cur += ch
      }
      vals.push(cur.trim())

      const obj = {}
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '') })

      const customer_id = pick(obj, 'customer_id', 'customerid') || ''
      const amount = parseFloat(pick(obj, 'amount', 'total', 'order_amount') || '0') || 0
      if (!customer_id) return null

      // Parse items column — it's a JSON string like [{"qty":1,"name":"Dress"}]
      let items = []
      const rawItems = pick(obj, 'items', 'order_items', 'line_items') || ''
      if (rawItems) {
        try { items = JSON.parse(rawItems) } catch { items = [] }
      }

      return {
        customer_id,
        amount,
        items,
        created_at: pick(obj, 'created_at', 'order_date', 'date') || null,
      }
    })
    .filter(Boolean)
}

export default function CustomersPage({ theme }) {
  const {
    customers, stats, loading,
    search, setSearch,
    tagFilter, setTagFilter,
    page, setPage, PAGE_SIZE,
    TAGS,
    refresh,
  } = useCustomers()

  const dark = theme === 'dark'
  const bg       = dark ? '#050505' : '#fafafa'
  const cardBg   = dark ? 'rgba(255,255,255,0.02)' : '#ffffff'
  const border   = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'
  const textMain = dark ? '#f4f4f5' : '#18181b'
  const textSub  = dark ? '#71717a' : '#a1a1aa'

  const total = stats?.total_customers ?? null

  // CSV import state
  const fileInputRef = useRef(null)
  const orderFileInputRef = useRef(null)
  const [importing,   setImporting]   = useState(false)
  const [importToast, setImportToast] = useState(null)

  const handleOrderCSVUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseOrdersCSV(text)
      if (!rows.length) throw new Error('No valid order rows found in CSV')
      const res = await api.importOrders(rows)
      setImportToast({
        type: 'success',
        message: `${res.inserted} orders imported (${res.total} total rows)`,
      })
      refresh()
    } catch (err) {
      setImportToast({ type: 'error', message: err.message })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleCSVUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCSV(text)
      if (!rows.length) throw new Error('No valid rows found in CSV')

      const res = await api.importCustomers(rows)
      setImportToast({
        type: 'success',
        message: `${res.inserted} inserted, ${res.skipped} duplicates skipped (${res.total} total rows)`,
      })
      refresh()
    } catch (err) {
      setImportToast({ type: 'error', message: err.message })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: textMain }}>Customer Browser</h1>
            <p className="text-sm mt-0.5" style={{ color: textSub }}>
              {total !== null
                ? <><span style={{ color: textMain, fontWeight: 500 }}>{total.toLocaleString()}</span> {total === 1 ? 'Customer' : 'Customers'}</>
                : <span className="inline-block w-24 h-3 shimmer-bg rounded-full mt-1" />
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats pills */}
            {stats && (
              <div className="flex gap-4 text-right mr-4">
                <StatPill label="VIP"      value={stats.vip_count?.toLocaleString()}     color="#a78bfa" dark={dark} />
                <StatPill label="At‑Risk"  value={stats.at_risk_count?.toLocaleString()} color="#fb7185" dark={dark} />
                <StatPill label="Avg Spend" value={fmt(stats.avg_spend)}                  dark={dark} />
              </div>
            )}
            {/* CSV Import */}
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
              style={{
                background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                border:     `1px solid ${border}`,
                color:      textSub,
              }}
            >
              <Upload size={12} />
              {importing ? 'Importing…' : 'Import Customers CSV'}
            </button>
            {/* Orders CSV Import */}
            <input ref={orderFileInputRef} type="file" accept=".csv" className="hidden" onChange={handleOrderCSVUpload} />
            <button
              onClick={() => orderFileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 disabled:opacity-50"
              style={{
                background: dark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
                border:     `1px solid ${dark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.15)'}`,
                color:      dark ? '#a78bfa' : '#7c3aed',
              }}
            >
              <Upload size={12} />
              {importing ? 'Importing…' : 'Import Orders CSV'}
            </button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textSub }} />
            <input
              className="w-full rounded-lg px-3 py-2 pl-9 text-sm outline-none transition-all duration-150"
              style={{
                background: dark ? '#0d0d0d' : '#f4f4f5',
                border:     `1px solid ${border}`,
                color:      textMain,
              }}
              placeholder="Search name, email, city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip label="All" active={tagFilter === ''} onClick={() => setTagFilter('')} dark={dark} />
            {TAGS.map(t => {
              const c = TAG_COLORS[t] || {}
              return (
                <FilterChip
                  key={t}
                  label={t}
                  active={tagFilter === t}
                  onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                  activeStyle={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
                  dark={dark}
                />
              )
            })}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
          <div className="grid px-5 py-3 text-xs font-medium uppercase tracking-wider"
            style={{
              gridTemplateColumns: '2fr 2fr 1.2fr 1.2fr 72px 90px 1.4fr',
              background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
              borderBottom: `1px solid ${border}`,
              color: textSub,
            }}>
            {['Name', 'Email', 'City', 'Last Order', 'Orders', 'Spend', 'Tags'].map(h => (
              <span key={h}>{h}</span>
            ))}
          </div>

          {loading ? (
            [...Array(10)].map((_, i) => (
              <div key={i} className="px-5 py-4 border-b" style={{ borderColor: border }}>
                <div className="h-3 shimmer-bg rounded-full" style={{ width: `${55 + (i % 4) * 10}%` }} />
              </div>
            ))
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-3">
              <Users size={28} style={{ color: textSub }} />
              <p className="text-sm" style={{ color: textSub }}>No customers found</p>
              {(search || tagFilter) && (
                <button className="text-xs px-3 py-1.5 rounded-md transition-all"
                  style={{ color: textSub, border: `1px solid ${border}` }}
                  onClick={() => { setSearch(''); setTagFilter('') }}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            customers.map((c, idx) => (
              <div
                key={c.id}
                className="grid px-5 py-3 text-sm items-center border-b"
                style={{
                  gridTemplateColumns: '2fr 2fr 1.2fr 1.2fr 72px 90px 1.4fr',
                  borderColor: border,
                  background: dark
                    ? (idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent')
                    : (idx % 2 === 0 ? '#fff' : '#fafafa'),
                }}
              >
                <p className="font-medium truncate" style={{ color: textMain }}>{c.name}</p>
                <p className="truncate text-xs" style={{ color: textSub }}>{c.email}</p>
                <p style={{ color: dark ? '#a1a1aa' : '#52525b' }}>{c.city || '—'}</p>
                <p className="text-xs" style={{ color: textSub }}>{fmtDate(c.last_order_date)}</p>
                <p style={{ color: dark ? '#a1a1aa' : '#52525b' }}>{c.order_count ?? 0}</p>
                <p className="font-medium text-xs" style={{ color: textMain }}>{fmt(c.total_spend)}</p>
                <div className="flex flex-wrap gap-1">
                  {(c.tags || []).map(t => <TagBadge key={t} tag={t} />)}
                  {(!c.tags || c.tags.length === 0) && <span className="text-xs" style={{ color: textSub }}>—</span>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Pagination ── */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs" style={{ color: textSub }}>
            Page {page} · {customers.length} shown{total ? ` of ${total.toLocaleString()}` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-30"
              style={{ border: `1px solid ${border}`, color: textSub }}>
              <ChevronLeft size={13} /> Prev
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={customers.length < PAGE_SIZE}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-30"
              style={{ border: `1px solid ${border}`, color: textSub }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* CSV help text */}
        <p className="text-xs mt-3" style={{ color: textSub }}>
          Customer CSV: <span className="font-mono" style={{ color: dark ? '#a1a1aa' : '#52525b' }}>name, email, phone, city, total_spend, order_count, tags</span> — tags separated by semicolons
        </p>
        <p className="text-xs mt-1" style={{ color: textSub }}>
          Orders CSV: <span className="font-mono" style={{ color: dark ? '#a1a1aa' : '#52525b' }}>customer_id, amount, items, created_at</span> — items as JSON array e.g. <code style={{ color: '#a78bfa' }}>[{'{"name":"Dress","qty":1}'}]</code>
        </p>
      </div>

      {/* Import toast */}
      <ImportToast result={importToast} onClose={() => setImportToast(null)} />
    </div>
  )
}

function StatPill({ label, value, color, dark }) {
  return (
    <div className="text-right">
      <p className="text-xs mb-0.5" style={{ color: dark ? '#71717a' : '#a1a1aa' }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: color || (dark ? '#e4e4e7' : '#18181b') }}>
        {value ?? <span className="inline-block w-8 h-3 shimmer-bg rounded-full" />}
      </p>
    </div>
  )
}

function FilterChip({ label, active, onClick, activeStyle, dark }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 capitalize"
      style={active ? (activeStyle || {
        background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
        color: dark ? '#e4e4e7' : '#18181b',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
      }) : {
        background: 'transparent',
        color: dark ? '#71717a' : '#a1a1aa',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
      }}
    >
      {label}
    </button>
  )
}
