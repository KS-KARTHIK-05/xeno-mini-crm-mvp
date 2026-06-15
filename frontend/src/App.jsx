import { useState, useEffect } from 'react'
import TopNav from './components/layout/TopNav'
import WorkspacePage from './pages/WorkspacePage'
import CampaignsPage from './pages/CampaignsPage'
import CustomersPage from './pages/CustomersPage'
import HomePage from './pages/HomePage'
import { useWebSocket } from './hooks/useWebSocket'

export default function App() {
  const [activeTab,        setActiveTab]        = useState('home')
  const [activeCampaignId, setActiveCampaignId] = useState(null)
  const [theme,            setTheme]            = useState(() =>
    localStorage.getItem('xeno-theme') || 'dark'
  )

  // Persist and apply theme class to <html>
  useEffect(() => {
    localStorage.setItem('xeno-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
    document.title = 'Zeno CRM'
  }, [theme])

  const { connected } = useWebSocket()

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  const handleCampaignLaunched = (id) => {
    setActiveCampaignId(id)
    setActiveTab('workspace')
  }

  const dark = theme === 'dark'
  const appBg = dark ? '#050505' : '#fafafa'

  return (
    <div
      className="h-screen flex flex-col overflow-hidden font-sans"
      style={{ background: appBg, color: dark ? '#e4e4e7' : '#18181b' }}
    >
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onThemeToggle={toggleTheme}
      />

      <main className="flex-1 overflow-hidden relative">

        {/* Home */}
        <div className={activeTab === 'home' ? 'h-full' : 'hidden h-full'}>
          <HomePage theme={theme} />
        </div>

        {/* Workspace — always mounted to preserve copilot state */}
        <div className={activeTab === 'workspace' ? 'h-full' : 'hidden h-full'}>
          <WorkspacePage
            activeCampaignId={activeCampaignId}
            onCampaignLaunched={handleCampaignLaunched}
            theme={theme}
          />
        </div>

        {/* Campaigns */}
        <div className={activeTab === 'campaigns' ? 'h-full overflow-auto' : 'hidden'}>
          <CampaignsPage
            theme={theme}
            onSelectCampaign={(id) => {
              setActiveCampaignId(id)
              setActiveTab('workspace')
            }}
          />
        </div>

        {/* Customers */}
        <div className={activeTab === 'customers' ? 'h-full overflow-auto' : 'hidden'}>
          <CustomersPage theme={theme} />
        </div>

      </main>
    </div>
  )
}
