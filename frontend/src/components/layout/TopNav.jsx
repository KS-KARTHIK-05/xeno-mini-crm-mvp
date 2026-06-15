import { Cpu, LayoutDashboard, Users, Zap, Home, Sun, Moon } from 'lucide-react'

const TABS = [
  { id: 'home',      label: 'Home',      icon: Home },
  { id: 'workspace', label: 'Workspace', icon: Zap },
  { id: 'campaigns', label: 'Campaigns', icon: LayoutDashboard },
  { id: 'customers', label: 'Customers', icon: Users },
]

export default function TopNav({ activeTab, onTabChange, theme, onThemeToggle }) {
  const dark = theme === 'dark'

  return (
    <header
      className="shrink-0 h-12 flex items-center px-4 gap-5 select-none"
      style={{
        background:   dark ? '#080808' : '#ffffff',
        borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
      }}
    >
      {/* ── Brand ── */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-800 flex items-center justify-center shadow-md shadow-purple-900/40">
          <Cpu size={14} className="text-white" />
        </div>
        <span className="font-semibold text-sm tracking-tight" style={{ color: dark ? '#f4f4f5' : '#18181b' }}>
          Zeno CRM
        </span>
      </div>

      {/* ── Tabs ── */}
      <nav className="flex items-center gap-0.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
              style={{
                background: active
                  ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
                  : 'transparent',
                color: active
                  ? (dark ? '#f4f4f5' : '#18181b')
                  : (dark ? '#71717a' : '#a1a1aa'),
              }}
            >
              <Icon size={12} strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* ── Right controls ── */}
      <div className="ml-auto flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150"
          style={{
            background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            border:     dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            color:      dark ? '#71717a' : '#a1a1aa',
          }}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? <Sun size={13} /> : <Moon size={13} />}
        </button>
      </div>
    </header>
  )
}
