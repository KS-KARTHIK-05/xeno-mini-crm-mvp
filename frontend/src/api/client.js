// Use relative paths so the Vite dev proxy routes /api/* → localhost:8000
// In production, set VITE_API_BASE to your deployed backend URL
const BASE = import.meta.env.VITE_API_BASE || ''

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${txt}`)
  }
  return res.json()
}

export const api = {
  // ── Copilot ──────────────────────────────────────
  chat:        (body)   => req('/api/copilot/chat', { method: 'POST', body: JSON.stringify(body) }),
  suggestions: ()       => req('/api/copilot/suggestions'),

  // ── Campaigns ─────────────────────────────────────
  getCampaigns:    ()   => req('/api/campaigns'),
  getCampaign:     (id) => req(`/api/campaigns/${id}`),
  getCampaignComms:(id) => req(`/api/campaigns/${id}/comms`),   // endpoint is /comms not /communications

  // ── Customers ─────────────────────────────────────
  // Backend uses page/page_size Query params (not limit/skip)
  getCustomers: (p = {}) => {
    const { skip, limit, ...rest } = p
    const params = {
      page:      Math.floor((skip || 0) / (limit || 50)) + 1,
      page_size: limit || 50,
      ...rest,
    }
    return req(`/api/customers?${new URLSearchParams(params)}`)
  },
  getCustomerStats: () => req('/api/customers/stats'),
  importCustomers: (rows) => req('/api/customers/import', {
    method: 'POST',
    body: JSON.stringify({ customers: rows }),
  }),

  // ── Orders ─────────────────────────────────────────
  importOrders: (rows) => req('/api/orders/import', {
    method: 'POST',
    body: JSON.stringify({ orders: rows }),
  }),
}

