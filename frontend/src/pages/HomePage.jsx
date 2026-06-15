import { Activity, Zap, Brain, Radio, GitBranch, Database, Users, Shield } from 'lucide-react'

/* ─── Architecture flow steps — exact spec ─────────────────── */
const FLOW = [
  {
    icon: Brain,
    color: '#a78bfa',
    bg: 'rgba(139,92,246,0.12)',
    border: 'rgba(139,92,246,0.25)',
    title: 'AI Intent Parsing',
    sub: 'AI Model',
    desc: 'User types a plain-language goal. The AI parses it into structured segment rules (channel, filters, offer).',
  },
  {
    icon: Database,
    color: '#38bdf8',
    bg: 'rgba(14,165,233,0.10)',
    border: 'rgba(14,165,233,0.22)',
    title: 'SQL Compilation',
    sub: 'Database',
    desc: 'Segment rules are compiled into parameterized SQL and executed against your customer records in the database.',
  },
  {
    icon: Radio,
    color: '#34d399',
    bg: 'rgba(16,185,129,0.10)',
    border: 'rgba(16,185,129,0.22)',
    title: 'Async Dispatch',
    sub: 'Server',
    desc: 'Campaign records are persisted to the Database. A background task dispatches messages to each matched customer via the channel.',
  },
  {
    icon: Activity,
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.10)',
    border: 'rgba(251,146,60,0.22)',
    title: 'Live Reporting',
    sub: 'Website / Interface',
    desc: 'The receipt webhook triggers real-time broadcasts. Metrics animate live in the interface as each status update arrives.',
  },
]

/* ─── Lower stats grid — exact spec ────────────────────────── */
const STATS = [
  { icon: Users, label: 'Ingest or Upload Data', sub: 'Work clients/customers data', color: '#a78bfa' },
  { icon: Database, label: 'Database', sub: 'Secure + Storage', color: '#38bdf8' },
  { icon: Shield, label: 'Real-time', sub: 'Web interface delivery feed', color: '#34d399' },
]

export default function HomePage({ theme }) {
  const dark = theme !== 'light'
  const pageBg = dark ? '#050505' : '#f8f8f9'
  const cardBg = dark ? 'rgba(255,255,255,0.03)' : '#ffffff'
  const cardBorder = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'
  const textMain = dark ? '#f4f4f5' : '#18181b'
  const textSub = dark ? '#71717a' : '#a1a1aa'
  const textMid = dark ? '#a1a1aa' : '#52525b'

  return (
    <div className="h-full overflow-y-auto" style={{ background: pageBg }}>
      <div className="max-w-5xl mx-auto px-6 py-12">

        {/* ── Hero ── */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2.5 mb-6 px-4 py-1.5 rounded-full"
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Zap size={13} className="text-violet-400" />
            <span className="text-sm font-medium text-violet-400">AI-Native Campaign Platform</span>
          </div>

          <h1 className="text-4xl font-bold tracking-tight mb-4 leading-tight" style={{ color: textMain }}>
            Zeno CRM
          </h1>
          <p className="text-base max-w-lg mx-auto leading-relaxed" style={{ color: textSub }}>
            Reach the right customer with the right message —<br />
            described in plain language, executed in milliseconds.
          </p>
        </div>

        {/* ── Architecture Flow with dashed connectors ── */}
        <div className="mb-14">
          <div className="flex items-center gap-2 mb-6">
            <GitBranch size={14} style={{ color: textSub }} />
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: textSub }}>
              System Architecture
            </h2>
          </div>

          {/* Flex row: Box — dash — Box — dash — Box — dash — Box */}
          <div className="flex items-stretch gap-0">
            {FLOW.map((step, i) => {
              const Icon = step.icon
              const isLast = i === FLOW.length - 1
              return (
                <div key={i} className="flex items-center flex-1 min-w-0">
                  {/* Card */}
                  <div className="flex-1 flex flex-col items-center text-center gap-3 p-5 rounded-2xl relative animate-float"
                    style={{ 
                      background: cardBg, 
                      border: `1px solid ${cardBorder}`,
                      animationDelay: `${i * 300}ms`
                    }}>
                    {/* Step badge */}
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-mono px-2 py-0.5 rounded-full"
                      style={{ background: step.bg, color: step.color, border: `1px solid ${step.border}` }}>
                      0{i + 1}
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mt-1"
                      style={{ background: step.bg, border: `1px solid ${step.border}` }}>
                      <Icon size={18} style={{ color: step.color }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5" style={{ color: textMain }}>{step.title}</p>
                      <p className="text-xs mb-2 font-medium" style={{ color: step.color }}>{step.sub}</p>
                      <p className="text-xs leading-relaxed" style={{ color: textSub }}>{step.desc}</p>
                    </div>
                  </div>

                  {/* Dashed connector — not after last box */}
                  {!isLast && (
                    <div className="shrink-0 flex items-center justify-center w-8">
                      <div className="flex flex-col gap-1">
                        {[0, 1, 2].map(d => (
                          <div key={d} className="w-1.5 h-1.5 rounded-full"
                            style={{ background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Stats / Data Row ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {STATS.map(({ icon: Icon, label, sub, color }) => (
            <div key={label} className="flex items-center gap-4 p-5 rounded-2xl"
              style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: textMain }}>{label}</p>
                <p className="text-xs mt-0.5" style={{ color: textSub }}>{sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Enterprise Authentication (kept exactly as specified) ── */}
        <div className="flex flex-col items-center gap-4 py-10 rounded-2xl"
          style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
          <p className="text-sm font-medium" style={{ color: textSub }}>
            Enterprise Authentication
          </p>

          <button
            onClick={() => handleGoogleSignIn()}
            className="flex items-center gap-3 px-6 py-3 rounded-xl font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-95 shadow-lg"
            style={{
              background: dark ? '#ffffff' : '#18181b',
              color: dark ? '#18181b' : '#ffffff',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>

          <p className="text-xs" style={{ color: textSub }}>
            Google Workspace SSO — Scoped access per brand
          </p>
        </div>

      </div>
    </div>
  )
}

/* Google OAuth handler — reads env vars */
function handleGoogleSignIn() {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     || ''
  const redirectTo       = window.location.origin + window.location.pathname

  if (GOOGLE_CLIENT_ID) {
    // ── Direct Google OAuth 2.0 — using the explicit Client ID ──
    // Uses 'code' response type with localhost redirect
    const params = new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      redirect_uri:  window.location.origin,   // must match Google Cloud Console
      response_type: 'code',
      scope:         'openid email profile',
      prompt:        'select_account',
      access_type:   'offline',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`

  } else if (SUPABASE_URL) {
    // ── Supabase Auth flow (fallback) ──
    window.location.href =
      `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`

  } else {
    // ── Dev mode toast ──
    const el = document.createElement('div')
    el.innerHTML = `
      <div style="position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 20px;border-radius:12px;
        background:#111;border:1px solid rgba(255,255,255,0.12);color:#e4e4e7;font-size:13px;
        font-family:Inter,sans-serif;max-width:340px;line-height:1.5;">
        🔐 Add <strong>VITE_GOOGLE_CLIENT_ID</strong> to <code>frontend/.env</code><br/>
        <span style="color:#71717a;font-size:11px;">Then restart the Vite dev server</span>
      </div>`
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 5000)
  }
}
