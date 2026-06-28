const SAFE_BROWSING_URL = 'https://safebrowsing.googleapis.com/v4/threatMatches:find'

const THREAT_TYPES = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'POTENTIALLY_HARMFUL_APPLICATION',
]

function isConfigured() {
  return Boolean(String(process.env.GOOGLE_SAFE_BROWSING_API_KEY || '').trim())
}

function unknownResult(message) {
  return {
    status: 'unknown',
    configured: false,
    threats: [],
    message:
      message ||
      'Live safety verification is not configured (GOOGLE_SAFE_BROWSING_API_KEY missing).',
  }
}

async function checkUrlSafety(url) {
  const apiKey = String(process.env.GOOGLE_SAFE_BROWSING_API_KEY || '').trim()
  if (!apiKey) {
    return unknownResult()
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return {
      status: 'unknown',
      configured: true,
      threats: [],
      message: 'Could not parse URL for safety check.',
    }
  }

  const body = {
    client: {
      clientId: 'business-insights-crawler',
      clientVersion: '1.0.0',
    },
    threatInfo: {
      threatTypes: THREAT_TYPES,
      platformTypes: ['ANY_PLATFORM'],
      threatEntryTypes: ['URL'],
      threatEntries: [{ url: parsed.href }],
    },
  }

  try {
    const res = await fetch(`${SAFE_BROWSING_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.SAFE_BROWSING_TIMEOUT_MS || 8000)),
    })

    if (!res.ok) {
      return {
        status: 'unknown',
        configured: true,
        threats: [],
        message: `Safe Browsing API returned HTTP ${res.status}.`,
      }
    }

    const data = await res.json()
    const matches = data?.matches || []
    if (matches.length === 0) {
      return {
        status: 'safe',
        configured: true,
        threats: [],
        message: 'No malware, phishing, or social engineering threats reported.',
      }
    }

    const threats = matches.map((m) => m.threatType).filter(Boolean)
    return {
      status: 'unsafe',
      configured: true,
      threats: [...new Set(threats)],
      message: `Site flagged by Google Safe Browsing: ${[...new Set(threats)].join(', ')}.`,
    }
  } catch (err) {
    return {
      status: 'unknown',
      configured: true,
      threats: [],
      message: `Safe Browsing check failed: ${err.message}`,
    }
  }
}

module.exports = {
  checkUrlSafety,
  isConfigured,
  unknownResult,
}
