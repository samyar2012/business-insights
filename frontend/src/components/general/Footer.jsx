import { Link } from 'react-router-dom'

const linkGroups = [
  {
    title: 'Platform',
    links: [
      { label: 'Growth workspace', href: '/product#services', route: true },
      { label: 'AI modules catalog', href: '/product#ai-tools', route: true },
      { label: 'Trial - no card', href: '/product#trial', route: true },
      { label: 'Pay after trial', href: '/solutions#trial-convert', route: true },
      { label: 'Log in', href: '/login', route: true },
    ],
  },
  {
    title: 'Business types',
    links: [
      { label: 'Shopify brands', href: '/solutions#shopify-business', route: true },
      { label: 'Dropshippers', href: '/solutions#dropship-business', route: true },
      { label: 'Social-first sellers', href: '/solutions#social-business', route: true },
      { label: 'Compare all', href: '/solutions#business-types', route: true },
      { label: 'Start free trial', href: '/signup', route: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Why Business Insight', href: '/company#about', route: true },
      { label: 'Operator coaching', href: '/product#services', route: true },
      { label: 'Agency & white-label', href: '/company#contact', route: true },
      { label: 'Contact sales', href: '/company#contact', route: true },
      { label: 'System status', href: '/resources', route: true },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/company#about', route: true },
      { label: 'Careers', href: '/company#contact', route: true },
      { label: 'Press kit', href: '/company#contact', route: true },
      { label: 'Partners', href: '/company#contact', route: true },
      { label: 'Book a call', href: '/company#contact', route: true },
    ],
  },
]

const highlights = [
  { label: 'Shopify Partner friendly', detail: 'Store and app ecosystem aligned workflows' },
  { label: 'No card trial', detail: 'Full workspace before you ever enter payment' },
  { label: 'Modular AI SKUs', detail: 'Add or resell assistants as your offer evolves' },
]

const Footer = () => {
  return (
    <footer className="site-footer flex flex-col">
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:gap-16 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-20">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/60 sm:text-[11px]">
              Business Insight
            </p>
            <p className="font-display mt-3 text-[2.125rem] font-medium leading-[1.15] tracking-[-0.02em] text-stone-50 sm:text-4xl lg:text-[2.85rem]">
              Growth for every digital storefront.
            </p>
            <p className="mt-4 text-sm font-normal leading-relaxed text-white/78 sm:text-[0.9375rem]">
              We help Shopify merchants, dropshippers, and social-first brands bring in more customers
              with vertical playbooks, modular AI, and acquisition experiments that stay fresh.
            </p>
            <p className="mt-4 text-sm font-normal leading-relaxed text-white/68 sm:text-[0.9375rem]">
              Start with a free trial-no credit card. When the trial ends, step two is choosing a paid
              plan; we only bill after you opt in.
            </p>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              Built for operators worldwide
            </p>
          </div>

          <div className="flex flex-col justify-between gap-10 rounded-2xl bg-white/6 p-6 sm:p-8 lg:max-w-lg lg:justify-center xl:max-w-none">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-stone-50 sm:text-xl">
                Growth drops in your inbox
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/72">
                Weekly ideas for creatives, offers, and store fixes-tailored to ecommerce and creator
                brands. Unsubscribe anytime.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="mailto:hello@businessinsight.example?subject=Subscribe%20to%20growth%20notes"
                className="btn-lift inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-center text-sm font-semibold text-black shadow-md"
              >
                Email to subscribe
              </a>
              <a href="#trial" className="footer-link text-center text-sm sm:text-left">
                Or read how trials work ->
              </a>
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-12 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4 lg:gap-10 xl:gap-12">
          {linkGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 sm:text-[11px]">
                {group.title}
              </h3>
              <ul className="mt-5 space-y-3.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    {link.route ? (
                      <Link to={link.href} className="footer-link">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="footer-link">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 sm:text-[11px]">
              Contact
            </h3>
            <ul className="mt-5 space-y-3.5">
              <li>
                <a href="mailto:hello@businessinsight.example" className="footer-link">
                  hello@businessinsight.example
                </a>
              </li>
              <li>
                <a href="mailto:sales@businessinsight.example" className="footer-link">
                  sales@businessinsight.example
                </a>
              </li>
              <li>
                <a href="tel:+18005550199" className="footer-link">
                  +1 (800) 555-0199
                </a>
              </li>
              <li>
                <p className="text-sm leading-relaxed text-white/62">
                  Monday–Friday · 8am–6pm Pacific
                  <br />
                  Enterprise support 24/7 on request
                </p>
              </li>
            </ul>
            <h3 className="mt-8 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55 sm:text-[11px]">
              Connect
            </h3>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#contact" className="footer-link">
                  LinkedIn
                </a>
              </li>
              <li>
                <a href="#contact" className="footer-link">
                  X (Twitter)
                </a>
              </li>
              <li>
                <a href="#contact" className="footer-link">
                  YouTube
                </a>
              </li>
            </ul>
          </div>
        </div>

        <ul className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8 lg:mt-16">
          {highlights.map((item) => (
            <li key={item.label}>
              <p className="text-sm font-semibold text-stone-50">{item.label}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-white/62">{item.detail}</p>
            </li>
          ))}
        </ul>

        <div className="footer-legal mt-14 flex flex-col gap-5 sm:mt-16 sm:flex-row sm:items-center sm:justify-between lg:pt-8">
          <p className="max-w-2xl text-[11px] leading-relaxed text-white/50 sm:text-xs">
            © {new Date().getFullYear()} Business Insight. All rights reserved. Business Insight and
            related marks are trademarks of Business Insight, Inc. Product visuals are illustrative.
          </p>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Legal">
            <a href="#contact">Privacy policy</a>
            <a href="#contact">Terms of service</a>
            <a href="#contact">Security</a>
            <a href="#contact">Cookie settings</a>
          </nav>
        </div>
      </div>
    </footer>
  )
}

export default Footer
