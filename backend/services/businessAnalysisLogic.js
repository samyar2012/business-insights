function normalizeUrlForCompare(url) {
  const trimmed = String(url || '').trim().toLowerCase()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    let path = parsed.pathname
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
    return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, '')}${path}`
  } catch {
    return trimmed
  }
}

module.exports = { normalizeUrlForCompare }
