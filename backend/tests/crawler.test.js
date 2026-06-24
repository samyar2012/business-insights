const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeUrlString,
  canonicalizeUrl,
  isBlockedCrawlPath,
  sameOrigin,
  assertSafeResolvedAddress,
  isPrivateIpv4,
} = require('../services/crawler/urlSecurity')
const { parseRobotsTxt, isPathDisallowed } = require('../services/crawler/robotsService')
const { parseSitemapXml, detectPageType } = require('../services/crawler/sitemapService')
const { extractPage, hashContent } = require('../services/crawler/pageExtractor')
const { appearsJsRendered } = require('../services/crawler/pageFetcher')
const { aggregatePages, calculateScores } = require('../services/businessProfileLogic')
const {
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_DEPTH,
  DAILY_CRAWL_LIMIT,
} = require('../services/crawler/crawlerLimits')

describe('urlSecurity', () => {
  it('normalizes bare domains to https', () => {
    const url = normalizeUrlString('example.com')
    assert.equal(url.protocol, 'https:')
    assert.equal(url.hostname, 'example.com')
  })

  it('rejects file URLs', () => {
    assert.throws(() => normalizeUrlString('file:///etc/passwd'), /not allowed/)
  })

  it('rejects embedded credentials', () => {
    assert.throws(() => normalizeUrlString('https://user:pass@example.com'), /credentials/)
  })

  it('blocks private IPv4 ranges', () => {
    assert.equal(isPrivateIpv4('10.0.0.1'), true)
    assert.equal(isPrivateIpv4('192.168.1.1'), true)
    assert.equal(isPrivateIpv4('127.0.0.1'), true)
    assert.equal(isPrivateIpv4('169.254.169.254'), true)
    assert.equal(isPrivateIpv4('8.8.8.8'), false)
  })

  it('blocks localhost hostnames', () => {
    assert.throws(() => assertSafeResolvedAddress('localhost', ['127.0.0.1']), /Blocked/)
  })

  it('blocks metadata addresses', () => {
    assert.throws(
      () => assertSafeResolvedAddress('metadata.google.internal', ['169.254.169.254']),
      /Blocked/,
    )
  })

  it('canonicalizes URLs and strips hash', () => {
    const url = canonicalizeUrl(new URL('https://shop.com/products?ref=1#section'))
    assert.equal(url.href, 'https://shop.com/products')
  })

  it('blocks sensitive crawl paths', () => {
    assert.equal(isBlockedCrawlPath('/cart'), true)
    assert.equal(isBlockedCrawlPath('/checkout'), true)
    assert.equal(isBlockedCrawlPath('/admin/settings'), true)
    assert.equal(isBlockedCrawlPath('/about'), false)
  })

  it('enforces same origin', () => {
    assert.equal(sameOrigin('www.shop.com', 'shop.com'), true)
    assert.equal(sameOrigin('evil.com', 'shop.com'), false)
  })
})

describe('robotsService', () => {
  it('parses disallow rules and sitemaps', () => {
    const robots = `User-agent: *
Disallow: /admin/
Disallow: /cart
Sitemap: https://shop.com/sitemap.xml`
    const parsed = parseRobotsTxt(robots, 'shop.com')
    assert.ok(parsed.disallow.includes('/admin/'))
    assert.ok(parsed.sitemaps.some((s) => s.includes('sitemap.xml')))
  })

  it('respects disallow paths', () => {
    assert.equal(isPathDisallowed('/admin/users', ['/admin/']), true)
    assert.equal(isPathDisallowed('/about', ['/admin/']), false)
  })
})

describe('sitemapService', () => {
  it('parses sitemap URL sets', () => {
    const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://shop.com/</loc></url>
  <url><loc>https://shop.com/products</loc></url>
</urlset>`
    const { urls, isIndex } = parseSitemapXml(xml, 'shop.com')
    assert.equal(isIndex, false)
    assert.equal(urls.length, 2)
  })

  it('detects page types from paths', () => {
    assert.equal(detectPageType('https://shop.com/products/widget'), 'products')
    assert.equal(detectPageType('https://shop.com/about'), 'about')
    assert.equal(detectPageType('https://shop.com/random'), 'page')
  })
})

describe('pageExtractor', () => {
  const html = `<!DOCTYPE html>
<html><head>
<title>Acme Shop</title>
<meta name="description" content="Best widgets online">
<link rel="canonical" href="https://shop.com/">
</head><body>
<h1>Welcome to Acme</h1>
<h2>Featured Products</h2>
<p>Buy premium widgets with free shipping. Add to cart today.</p>
<a href="/products">Shop</a>
<a href="https://instagram.com/acme">Instagram</a>
<a href="mailto:hello@acme.com">Email</a>
<span class="product-title">Widget Pro</span>
<span>$29.99</span>
</body></html>`

  it('extracts title, headings, and products', () => {
    const extracted = extractPage(html, 'https://shop.com/', 'shop.com')
    assert.equal(extracted.title, 'Acme Shop')
    assert.ok(extracted.headings.h1.includes('Welcome to Acme'))
    assert.ok(extracted.extracted_data_json.products.length > 0)
  })

  it('detects social links', () => {
    const extracted = extractPage(html, 'https://shop.com/', 'shop.com')
    assert.ok(extracted.extracted_data_json.social_links.some((l) => l.includes('instagram')))
  })

  it('deduplicates content via hash', () => {
    const a = hashContent('hello world')
    const b = hashContent('hello world')
    const c = hashContent('different')
    assert.equal(a, b)
    assert.notEqual(a, c)
  })
})

describe('pageFetcher', () => {
  it('detects JS-rendered sparse pages', () => {
    const html = `<html><body><div id="root"></div>${'<script></script>'.repeat(5)}</body></html>`
    assert.equal(appearsJsRendered(html), true)
  })

  it('does not flag content-rich HTML as JS-rendered', () => {
    const html = `<html><body><h1>Real Content</h1>${'<p>Word </p>'.repeat(100)}</body></html>`
    assert.equal(appearsJsRendered(html), false)
  })
})

describe('businessProfileService', () => {
  it('aggregates page signals', () => {
    const pages = [
      {
        page_type: 'homepage',
        title: 'Acme',
        final_url: 'https://shop.com/',
        extracted_text: 'buy shop product review trusted',
        extracted_data_json: {
          products: ['Widget'],
          social_links: ['https://instagram.com/acme'],
          policies: { shipping: true, returns: false, privacy: true, terms: false },
          platform: 'Shopify',
          review_indicators: true,
        },
      },
    ]
    const agg = aggregatePages(pages)
    assert.equal(agg.platform, 'Shopify')
    assert.ok(agg.products.includes('Widget'))
    assert.equal(agg.trust_signals.https, true)
  })

  it('calculates bounded scores', () => {
    const aggregated = {
      products: ['A', 'B', 'C'],
      social_channels: ['https://instagram.com/x'],
      policy_signals: { shipping: true, returns: true, privacy: true, terms: false },
      trust_signals: { https: true, review_indicators: true, policy_count: 3 },
      content_signals: { total_text_length: 2000, page_count: 5, ctas: ['Buy', 'Shop'] },
      platform: 'Shopify',
    }
    const scores = calculateScores(aggregated, { store_url: 'https://shop.com' }, [{}, {}, {}])
    assert.ok(scores.overall_score >= 0 && scores.overall_score <= 100)
    assert.ok(scores.store_score >= 0 && scores.store_score <= 100)
  })
})

describe('crawl limits', () => {
  it('enforces max pages default', () => {
    assert.equal(DEFAULT_MAX_PAGES, 20)
    assert.equal(DEFAULT_MAX_DEPTH, 2)
    assert.ok(DAILY_CRAWL_LIMIT > 0)
  })
})
