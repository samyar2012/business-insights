const dns = require('dns').promises
const net = require('net')

const MAX_REDIRECTS = 5

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
])

const METADATA_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal'])

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true

  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:')) return true
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7)
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped)
  }
  return false
}

function assertSafeResolvedAddress(hostname, addresses) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  if (!host) {
    const err = new Error('Invalid hostname')
    err.code = 'SSRF_BLOCKED'
    throw err
  }

  if (BLOCKED_HOSTNAMES.has(host) || METADATA_HOSTS.has(host)) {
    const err = new Error(`Blocked hostname: ${host}`)
    err.code = 'SSRF_BLOCKED'
    throw err
  }

  if (!addresses || addresses.length === 0) {
    const err = new Error(`Could not resolve hostname: ${host}`)
    err.code = 'SSRF_BLOCKED'
    throw err
  }

  for (const addr of addresses) {
    const ip = String(addr).trim()
    if (METADATA_HOSTS.has(ip)) {
      const err = new Error(`Blocked metadata address: ${ip}`)
      err.code = 'SSRF_BLOCKED'
      throw err
    }
    if (net.isIPv4(ip) && isPrivateIpv4(ip)) {
      const err = new Error(`Blocked private IPv4 address: ${ip}`)
      err.code = 'SSRF_BLOCKED'
      throw err
    }
    if (net.isIPv6(ip) && isPrivateIpv6(ip)) {
      const err = new Error(`Blocked private IPv6 address: ${ip}`)
      err.code = 'SSRF_BLOCKED'
      throw err
    }
  }

  return true
}

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/\.$/, '')
}

function hostnameResolutionCandidates(hostname) {
  const host = normalizeHostname(hostname)
  if (!host) return []

  const candidates = [host]
  if (host.startsWith('www.')) {
    const apex = host.slice(4)
    if (apex && !candidates.includes(apex)) candidates.push(apex)
  } else if (host.includes('.') && !host.includes(' ')) {
    const wwwHost = `www.${host}`
    if (!candidates.includes(wwwHost)) candidates.push(wwwHost)
  }
  return candidates
}

async function lookupAddresses(host) {
  const addresses = []

  try {
    const results = await dns.lookup(host, { all: true, verbatim: false })
    for (const entry of results) {
      if (entry?.address) addresses.push(entry.address)
    }
  } catch {
    // Fall back to direct DNS record lookups below.
  }

  if (addresses.length === 0) {
    const [v4, v6] = await Promise.allSettled([dns.resolve4(host), dns.resolve6(host)])
    if (v4.status === 'fulfilled') addresses.push(...v4.value)
    if (v6.status === 'fulfilled') addresses.push(...v6.value)
  }

  return [...new Set(addresses)]
}

function isResolutionFailureError(err) {
  if (!err) return false
  if (err.code === 'SSRF_BLOCKED' && /Could not resolve hostname|DNS resolution failed/i.test(err.message)) {
    return true
  }
  const code = String(err.code || '')
  return ['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT', 'EAI_AGAIN'].includes(code)
}

async function resolveHostname(hostname) {
  const requestedHost = normalizeHostname(hostname)
  const candidates = hostnameResolutionCandidates(requestedHost)
  let lastError = null

  for (const host of candidates) {
    try {
      const addresses = await lookupAddresses(host)
      assertSafeResolvedAddress(host, addresses)
      return addresses
    } catch (err) {
      lastError = err
      if (!isResolutionFailureError(err)) throw err
    }
  }

  const apexHint = requestedHost.startsWith('www.') ? requestedHost.slice(4) : `www.${requestedHost}`
  const err = new Error(
    `Could not verify website hostname (DNS lookup failed for ${requestedHost}). Check the URL spelling or try ${apexHint}.`,
  )
  err.code = 'SSRF_BLOCKED'
  if (lastError?.message) err.cause = lastError
  throw err
}

function normalizeUrlString(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) {
    const err = new Error('URL is required')
    err.code = 'INVALID_URL'
    throw err
  }

  if (/^[a-zA-Z]:\\/.test(trimmed) || trimmed.startsWith('file:') || trimmed.startsWith('//')) {
    const err = new Error('Local file paths are not allowed')
    err.code = 'INVALID_URL'
    throw err
  }

  let parsed
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    const err = new Error('Invalid URL format')
    err.code = 'INVALID_URL'
    throw err
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('Only http and https URLs are allowed')
    err.code = 'INVALID_URL'
    throw err
  }

  if (parsed.username || parsed.password) {
    const err = new Error('URLs with embedded credentials are not allowed')
    err.code = 'INVALID_URL'
    throw err
  }

  parsed.hash = ''
  return parsed
}

async function validatePublicUrl(url) {
  const parsed = normalizeUrlString(url)
  await resolveHostname(parsed.hostname)
  return parsed
}

async function validateRedirectUrl(url, allowedHostname) {
  const parsed = await validatePublicUrl(url)
  const targetHost = parsed.hostname.replace(/^www\./, '').toLowerCase()
  const allowed = String(allowedHostname || '')
    .replace(/^www\./, '')
    .toLowerCase()
  if (targetHost !== allowed) {
    const err = new Error('Redirect left allowed domain')
    err.code = 'SSRF_BLOCKED'
    throw err
  }
  return parsed
}

function isBlockedCrawlPath(pathname) {
  const path = String(pathname || '').toLowerCase()
  const blocked = [
    /\/logout\b/,
    /\/cart\b/,
    /\/checkout\b/,
    /\/account\b/,
    /\/admin\b/,
    /\/wp-admin\b/,
    /\/my-account\b/,
    /\/signin\b/,
    /\/sign-in\b/,
    /\/login\b/,
    /\/tracking\b/,
    /\/track\b/,
    /\/pixel\b/,
    /\/collect\b/,
    /\/beacon\b/,
    /\/gtm\b/,
    /\/analytics\b/,
  ]
  return blocked.some((re) => re.test(path))
}

function canonicalizeUrl(parsed, { stripQuery = true } = {}) {
  const url = new URL(parsed.href)
  url.hash = ''
  if (stripQuery) {
    url.search = ''
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1)
  }
  return url
}

function sameOrigin(hostnameA, hostnameB) {
  const a = String(hostnameA || '')
    .replace(/^www\./, '')
    .toLowerCase()
  const b = String(hostnameB || '')
    .replace(/^www\./, '')
    .toLowerCase()
  return a === b
}

module.exports = {
  MAX_REDIRECTS,
  validatePublicUrl,
  validateRedirectUrl,
  assertSafeResolvedAddress,
  resolveHostname,
  lookupAddresses,
  hostnameResolutionCandidates,
  normalizeHostname,
  normalizeUrlString,
  isBlockedCrawlPath,
  canonicalizeUrl,
  sameOrigin,
  isPrivateIpv4,
  isPrivateIpv6,
}
