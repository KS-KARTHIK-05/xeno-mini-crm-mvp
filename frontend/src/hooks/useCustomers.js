import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'

const TAGS = ['vip', 'at-risk', 'new', 'lapsed', 'loyal']

export function useCustomers() {
  const [customers, setCustomers] = useState([])
  const [stats,     setStats]     = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [page,      setPage]      = useState(1)
  const PAGE_SIZE = 50

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page:      page,
        page_size: PAGE_SIZE,
      }
      if (search)    params.search = search
      if (tagFilter) params.tag    = tagFilter
      const data = await api.getCustomers(params)
      // Backend returns CustomerListOut: { customers: [...], total: int }
      setCustomers(data.customers || (Array.isArray(data) ? data : []))
    } catch {}
    finally { setLoading(false) }
  }, [search, tagFilter, page])

  useEffect(() => { fetch_() }, [fetch_])

  useEffect(() => {
    api.getCustomerStats().then(setStats).catch(() => {})
  }, [])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [search, tagFilter])

  return {
    customers, stats, loading,
    search, setSearch,
    tagFilter, setTagFilter,
    page, setPage, PAGE_SIZE,
    TAGS,
    refresh: fetch_,
  }
}
