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
const {
  aggregatePages,
  calculateScores,
} = require('../services/businessProfileLogic')
const {
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_DEPTH,
  DAILY_CRAWL_LIMIT,
} = require('../services/crawler/crawlerLimits')

const SHOPIFY_LIKE_HTML = `<!DOCTYPE html>
<html><head>
<title>Acme Shop</title>
<meta name="description" content="Best widgets online">
<link rel="canonical" href="https://shop.com/">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Widget Pro",
  "image": "https://shop.com/widget.jpg",
  "offers": { "@type": "Offer", "price": "29.99", "priceCurrency": "USD" }
}
</script>
</head><body>
<h1>Welcome to Acme</h1>
<div class="product-card">
  <a href="/products/widget-pro">
    <img src="/widget.jpg" alt="Widget Pro">
    <h3 class="product-card__title">Widget Pro</h3>
    <span class="price">$29.99</span>
  </a>
  <button class="add-to-cart">Add to cart</button>
</div>
<a href="https://instagram.com/acme">Instagram</a>
<a href="mailto:hello@acme.com">Email</a>
<p>Free shipping and easy returns. Privacy policy linked in footer.</p>
</body></html>`

const AMAZON_LIKE_HTML = `<!DOCTYPE html>
<html><head><title>Amazon.com: Electronics</title></head><body>
<nav><a>Departments</a><a>Best Sellers</a><a>Gift Cards</a></nav>
<h2>Customers who bought this also bought</h2>
<h3>Best Sellers in Electronics</h3>
<h2>Shop by category</h2>
<h3>Deals</h3>
<div class="a-section">
  <span class="a-price"><span class="a-offscreen">$29.99</span></span>
  <span class="a-price"><span class="a-offscreen">$49.99</span></span>
</div>
<p>Sold by Amazon. Fulfilled by Amazon. Sponsored</p>
</body></html>`

const JSON_LD_HTML = `<!DOCTYPE html>
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "Organic Serum",
        "offers": { "price": "48.00", "priceCurrency": "USD" },
        "image": "https://brand.com/serum.jpg",
        "url": "https://brand.com/products/serum"
      }
    }
  ]
}
</script>
</head><body><h1>Our Products</h1></body></html>`

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
  it('extracts high-confidence products from Shopify-like HTML', () => {
    const extracted = extractPage(SHOPIFY_LIKE_HTML, 'https://shop.com/', 'shop.com')
    assert.equal(extracted.title, 'Acme Shop')
    assert.ok(extracted.headings.h1.includes('Welcome to Acme'))

    const products = extracted.extracted_data_json.products
    assert.ok(products.length > 0)
    assert.ok(products.some((p) => p.name === 'Widget Pro'))
    assert.ok(products.every((p) => p.confidence >= 70))
    assert.ok(extracted.extracted_data_json.extraction_meta.has_json_ld_products)
    assert.ok(extracted.extracted_data_json.extraction_meta.has_reliable_product_cards)
  })

  it('does not treat marketplace headings as products', () => {
    const extracted = extractPage(AMAZON_LIKE_HTML, 'https://amazon.com/dp/123', 'amazon.com')
    const products = extracted.extracted_data_json.products
    const names = products.map((p) => p.name.toLowerCase())

    assert.equal(
      names.some((n) => n.includes('customers who bought') || n.includes('best sellers')),
      false,
    )
    assert.equal(extracted.extracted_data_json.page_classification_hint, 'marketplace')
    assert.ok(extracted.extracted_data_json.extraction_meta.prices_without_products)
  })

  it('extracts JSON-LD Product and ItemList entries', () => {
    const extracted = extractPage(JSON_LD_HTML, 'https://brand.com/', 'brand.com')
    const products = extracted.extracted_data_json.products

    assert.equal(products.length, 1)
    assert.equal(products[0].name, 'Organic Serum')
    assert.equal(products[0].source, 'json_ld_item_list')
    assert.ok(products[0].confidence >= 75)
    assert.equal(products[0].price, 'USD 48.00')
  })

  it('detects social links', () => {
    const extracted = extractPage(SHOPIFY_LIKE_HTML, 'https://shop.com/', 'shop.com')
    assert.ok(extracted.extracted_data_json.social_links.some((l) => l.includes('instagram')))
  })

  it('flags sparse HTML as low crawlability content', () => {
    const sparse = `<html><body><div id="root"></div>${'<script></script>'.repeat(5)}</body></html>`
    const extracted = extractPage(sparse, 'https://spa.example/', 'spa.example')
    assert.ok(extracted.extracted_data_json.extraction_meta.sparse_content)
    assert.equal(appearsJsRendered(sparse), true)
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

describe('businessProfileLogic', () => {
  it('aggregates structured product signals and site classification', () => {
    const pages = [
      {
        page_type: 'homepage',
        title: 'Acme',
        final_url: 'https://shop.com/',
        extracted_text: 'buy shop product review trusted',
        extracted_data_json: {
          products: [
            {
              name: 'Widget',
              confidence: 82,
              source: 'product_card',
              signals: { has_price: true, has_image: true, has_link: true },
            },
          ],
          social_links: ['https://instagram.com/acme'],
          policies: { shipping: true, returns: false, privacy: true, terms: false },
          platform: 'Shopify',
          review_indicators: true,
          extraction_meta: {
            has_reliable_product_cards: true,
            has_json_ld_products: true,
            avg_product_confidence: 82,
            high_confidence_product_count: 1,
          },
          page_classification_hint: 'shopify_dtc',
        },
      },
    ]
    const agg = aggregatePages(pages)
    assert.equal(agg.platform, 'Shopify')
    assert.equal(agg.product_names[0], 'Widget')
    assert.equal(agg.trust_signals.https, true)
    assert.equal(agg.site_classification.classification, 'shopify_dtc')
  })

  it('calculates bounded scores with explanations and scoring rubric', () => {
    const aggregated = {
      products: [
        { name: 'A', confidence: 85, source: 'json_ld_product' },
        { name: 'B', confidence: 80, source: 'product_card' },
        { name: 'C', confidence: 78, source: 'product_card' },
      ],
      product_names: ['A', 'B', 'C'],
      high_confidence_products: [
        { name: 'A', confidence: 85 },
        { name: 'B', confidence: 80 },
        { name: 'C', confidence: 78 },
      ],
      social_channels: ['https://instagram.com/x'],
      policy_signals: { shipping: true, returns: true, privacy: true, terms: false },
      trust_signals: { https: true, review_indicators: true, policy_count: 3 },
      content_signals: {
        total_text_length: 2000,
        page_count: 5,
        ctas: ['Add to cart', 'Shop'],
        navigation_labels: [],
      },
      platform: 'Shopify',
      extraction_meta: {
        high_confidence_product_count: 3,
        avg_product_confidence: 81,
        has_reliable_product_cards: true,
        has_product_detail_page: true,
        has_json_ld_products: true,
        low_confidence_extraction: false,
        noisy_pages: 0,
        prices_without_products_pages: 0,
        js_rendered_pages: 0,
      },
      site_classification: { classification: 'shopify_dtc', confidence: 80, indicators: [] },
      pricing_signals: ['$29.99'],
      services: [],
    }
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      [{}, {}, {}],
    )
    assert.ok(scores.overall_score >= 0 && scores.overall_score <= 100)
    assert.ok(scores.store_score >= 0 && scores.store_score <= 100)
    assert.ok(Array.isArray(scores.score_explanation))
    assert.ok(scores.score_explanation.length > 0)
    assert.equal(scores.scoring_rubric, 'ecommerce_store')
  })

  it('scores ecommerce lower when product cards are missing', () => {
    const pages = [
      {
        final_url: 'https://bare.example/',
        extracted_text: 'Welcome to our shop. About us. Contact.',
        extracted_data_json: {
          products: [],
          platform: 'unknown',
          extraction_meta: {
            has_reliable_product_cards: false,
            has_product_detail_page: false,
            high_confidence_product_count: 0,
            avg_product_confidence: 0,
          },
          page_classification_hint: 'unknown',
        },
      },
    ]

    const aggregated = aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://bare.example', business_model: 'ecommerce_store' },
      pages,
    )

    assert.ok(scores.overall_score < 55)
    assert.equal(scores.scoring_rubric, 'ecommerce_store')
    assert.ok(
      scores.score_explanation.some((e) => e.delta < 0 && /product/i.test(e.reason)),
    )
  })

  it('scores physical service reasonably high without ecommerce penalties', () => {
    const pages = [
      {
        final_url: 'https://hvacpro.com/',
        page_type: 'homepage',
        extracted_text:
          'Request a free quote. Serving Dallas and Fort Worth. Call us at (214) 555-0100. View our project gallery. Customer reviews and testimonials. Schedule service today.',
        extracted_data_json: {
          products: [],
          phones: ['(214) 555-0100'],
          ctas: ['Request a quote', 'Schedule service'],
          review_indicators: true,
          social_links: ['https://facebook.com/hvacpro'],
          policies: {},
          extraction_meta: {
            has_reliable_product_cards: false,
            has_product_detail_page: false,
          },
          page_classification_hint: 'service',
        },
      },
    ]

    const aggregated = aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://hvacpro.com', business_model: 'online_plus_physical_service' },
      pages,
    )

    assert.equal(scores.scoring_rubric, 'online_plus_physical_service')
    assert.ok(scores.overall_score >= 58)
    assert.equal(
      scores.score_explanation.some((e) => /shipping policy/i.test(e.reason)),
      false,
    )
    assert.equal(
      scores.score_explanation.some((e) => /product cards/i.test(e.reason)),
      false,
    )
    assert.ok(scores.score_explanation.some((e) => e.delta > 0 && /quote|phone|service area|gallery|review/i.test(e.reason)))
  })

  it('scores offline store reasonably high with local signals', () => {
    const pages = [
      {
        final_url: 'https://localboutique.com/',
        page_type: 'contact',
        extracted_text:
          'Visit us at 123 Main Street, Austin TX. Store hours: Monday-Friday 9am-6pm. Call (512) 555-0199. Get directions on Google Maps. Customer reviews.',
        extracted_data_json: {
          phones: ['(512) 555-0199'],
          review_indicators: true,
          navigation_labels: ['Shop', 'Collections'],
          policies: { privacy: true },
          extraction_meta: {},
          page_classification_hint: 'single_brand_ecommerce',
        },
      },
    ]

    const aggregated = aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://localboutique.com', business_model: 'online_plus_offline_store' },
      pages,
    )

    assert.equal(scores.scoring_rubric, 'online_plus_offline_store')
    assert.ok(scores.overall_score >= 58)
    assert.ok(
      scores.score_explanation.some((e) => e.delta > 0 && /address|hours|phone|directions|review/i.test(e.reason)),
    )
  })

  it('warns when ecommerce onboarding conflicts with marketplace crawl', () => {
    const aggregated = aggregatePages([
      {
        final_url: 'https://amazon.com/dp/123',
        extracted_text: 'Sold by Amazon. Sponsored. $29.99',
        extracted_data_json: {
          products: [],
          prices: ['$29.99'],
          page_classification_hint: 'marketplace',
          page_classification_indicators: ['marketplace_host', 'marketplace_copy'],
          extraction_meta: {
            prices_without_products: true,
            avg_product_confidence: 0,
            high_confidence_product_count: 0,
          },
        },
      },
    ])

    const scores = calculateScores(
      aggregated,
      { store_url: 'https://amazon.com/dp/123', business_model: 'ecommerce_store' },
      [{}],
    )

    assert.equal(aggregated.site_classification.classification, 'marketplace')
    assert.ok(scores.mismatch_warnings.length > 0)
    assert.ok(
      scores.mismatch_warnings.some((w) => /marketplace/i.test(w)) ||
        scores.score_explanation.some((e) => /marketplace/i.test(e.reason)),
    )
  })

  it('does not award a high score when product extraction confidence is low', () => {
    const pages = [
      {
        final_url: 'https://noisy.example/',
        extracted_text: '$19.99 $24.99 Best Sellers Featured Deals',
        requires_browser: true,
        extracted_data_json: {
          products: [{ name: 'Maybe Product', confidence: 42, source: 'legacy_string', signals: {} }],
          prices: ['$19.99', '$24.99'],
          platform: 'unknown',
          extraction_meta: {
            avg_product_confidence: 42,
            high_confidence_product_count: 0,
            has_reliable_product_cards: false,
            has_product_detail_page: false,
            heading_promo_noise: true,
            prices_without_products: true,
            sparse_content: true,
          },
          page_classification_hint: 'unknown',
        },
      },
    ]

    const aggregated = aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://noisy.example', business_model: 'ecommerce_store' },
      pages,
    )

    assert.ok(scores.overall_score < 55)
    assert.ok(
      scores.score_explanation.some((e) => e.delta < 0 && /confidence|reliable|prices/i.test(e.reason)),
    )
  })

  it('penalizes marketplace classification when ecommerce rubric is used', () => {
    const aggregated = aggregatePages([
      {
        final_url: 'https://amazon.com/dp/123',
        extracted_text: 'Sold by Amazon. Sponsored. $29.99',
        extracted_data_json: {
          products: [],
          prices: ['$29.99'],
          page_classification_hint: 'marketplace',
          page_classification_indicators: ['marketplace_host', 'marketplace_copy'],
          extraction_meta: {
            prices_without_products: true,
            avg_product_confidence: 0,
            high_confidence_product_count: 0,
          },
        },
      },
    ])

    const scores = calculateScores(
      aggregated,
      { store_url: 'https://amazon.com/dp/123', business_model: 'ecommerce_store' },
      [{}],
    )

    assert.ok(scores.overall_score < 55)
    assert.equal(aggregated.site_classification.classification, 'marketplace')
    assert.ok(
      scores.mismatch_warnings.some((w) => /marketplace/i.test(w)) ||
        scores.score_explanation.some((e) => e.reason.toLowerCase().includes('marketplace')),
    )
  })
})

describe('businessAnalysisService', () => {
  const { normalizeUrlForCompare } = require('../services/businessAnalysisLogic')

  it('normalizes URLs for change detection', () => {
    assert.equal(
      normalizeUrlForCompare('https://www.shop.com/'),
      normalizeUrlForCompare('shop.com'),
    )
    assert.notEqual(
      normalizeUrlForCompare('https://shop.com'),
      normalizeUrlForCompare('https://other.com'),
    )
  })
})

describe('crawl limits', () => {
  it('enforces max pages default', () => {
    assert.equal(DEFAULT_MAX_PAGES, 20)
    assert.equal(DEFAULT_MAX_DEPTH, 2)
    assert.ok(DAILY_CRAWL_LIMIT > 0)
  })
})
