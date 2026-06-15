import CopilotPanel from '../components/copilot/CopilotPanel'
import CanvasPanel from '../components/canvas/CanvasPanel'

export default function WorkspacePage({ activeCampaignId, onCampaignLaunched, theme }) {
  const dark        = theme !== 'light'
  const dividerClr  = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
  const panelBg     = dark ? '#050505' : '#ffffff'
  const leftBg      = dark ? '#080808' : '#fafafa'

  return (
    <div className="flex h-full" style={{ background: panelBg }}>
      {/* Left: Copilot */}
      <div
        className="w-[460px] min-w-[360px] shrink-0 flex flex-col"
        style={{ borderRight: `1px solid ${dividerClr}`, background: leftBg }}
      >
        <CopilotPanel onCampaignLaunched={onCampaignLaunched} theme={theme} />
      </div>

      {/* Right: Live Canvas */}
      <div className="flex-1 min-w-0 overflow-hidden" style={{ background: panelBg }}>
        <CanvasPanel campaignId={activeCampaignId} theme={theme} />
      </div>
    </div>
  )
}
