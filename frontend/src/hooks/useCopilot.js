import { useState, useCallback, useEffect } from 'react'
import { api } from '../api/client'

let _msgId = 0
const nextId = () => ++_msgId

export function useCopilot({ onCampaignLaunched } = {}) {
  const [messages,      setMessages]     = useState([])
  const [isLoading,     setIsLoading]    = useState(false)
  const [currentIntent, setCurrentIntent]= useState(null)
  const [suggestions,   setSuggestions]  = useState([])

  useEffect(() => {
    api.suggestions().then(d => setSuggestions(d.suggestions || [])).catch(() => {})
  }, [])

  const push = useCallback((msg) => {
    setMessages(prev => [...prev, { _id: nextId(), ...msg }])
  }, [])

  // ── Step 1: Parse NL intent ──────────────────────
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return
    push({ role: 'user', text })
    setIsLoading(true)
    try {
      const payload = { message: text }
      console.log('[Copilot] Step 1 → sending:', payload)
      const res = await api.chat(payload)
      console.log('[Copilot] Step 1 ← response:', res)
      push({ role: 'copilot', ...res })
      if (res.type === 'segment_preview' && res.campaign_data) {
        setCurrentIntent(res.campaign_data)
      }
    } catch (err) {
      console.error('[Copilot] Step 1 FAILED:', err)
      push({ role: 'copilot', type: 'error', text: `⚠️ ${err.message}` })
    } finally {
      setIsLoading(false)   // always unlock the input
    }
  }, [isLoading, push])

  // ── Step 2: Draft message ────────────────────────
  const requestDraft = useCallback(async (intent) => {
    if (isLoading) return
    setIsLoading(true)
    push({ role: 'user', text: 'Draft the message for this segment.' })
    try {
      const payload = { confirmed_intent: intent }
      console.log('[Copilot] Step 2 → sending:', payload)
      const res = await api.chat(payload)
      console.log('[Copilot] Step 2 ← response:', res)
      push({ role: 'copilot', ...res })
      // Update intent with the richer campaign_data from Step 2 if provided
      if (res.campaign_data) setCurrentIntent(res.campaign_data)
    } catch (err) {
      console.error('[Copilot] Step 2 FAILED:', err)
      push({ role: 'copilot', type: 'error', text: `⚠️ ${err.message}` })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, push])

  // ── Step 3: Launch campaign ──────────────────────
  const launchCampaign = useCallback(async (intent, messageTemplate) => {
    if (isLoading) return
    setIsLoading(true)
    push({ role: 'user', text: 'Launch this campaign.' })
    try {
      const payload = { confirmed_intent: intent, confirmed_message: messageTemplate }
      console.log('[Copilot] Step 3 → launching with payload:', JSON.stringify(payload, null, 2))
      const res = await api.chat(payload)
      console.log('[Copilot] Step 3 ← response:', res)
      push({ role: 'copilot', ...res })
      setCurrentIntent(null)
      if (res.campaign_id && onCampaignLaunched) {
        onCampaignLaunched(res.campaign_id)
      }
    } catch (err) {
      console.error('[Copilot] Step 3 LAUNCH FAILED:', err.message, err)
      push({ role: 'copilot', type: 'error', text: `⚠️ Launch failed: ${err.message}` })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, push, onCampaignLaunched])

  const clearChat = useCallback(() => {
    setMessages([])
    setCurrentIntent(null)
    _msgId = 0
  }, [])

  return {
    messages, isLoading, currentIntent, suggestions,
    sendMessage, requestDraft, launchCampaign, clearChat,
  }
}
