import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getCampaigns()
      setCampaigns(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  return { campaigns, loading, error, refresh: fetch_ }
}

export function useCampaignDetail(campaignId) {
  const [campaign, setCampaign] = useState(null)
  const [comms,    setComms]    = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!campaignId) { setCampaign(null); setComms([]); return }
    setLoading(true)
    Promise.all([
      api.getCampaign(campaignId),
      api.getCampaignComms(campaignId).catch(() => []),
    ]).then(([c, commsData]) => {
      setCampaign(c)
      setComms(commsData.communications || commsData || [])
    }).finally(() => setLoading(false))
  }, [campaignId])

  return { campaign, comms, loading }
}
