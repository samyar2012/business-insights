import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const CLOSE_DELAY_MS = 520

const megaContent = {
  product: {
    columns: [
      {
        heading: 'Platform',
        items: [
          {
            title: 'Growth workspace',
            desc: 'Ads, store, and social signals in one command center.',
            to: '/product#services',
          },
          {
            title: 'AI add-ons',
            desc: 'Copy, creative, offers, and ops assistants you can bundle.',
            to: '/product#ai-tools',
          },
          {
            title: 'Acquisition Roulette',
            desc: 'Weighted experiments so every week tests a fresh winning angle.',
            to: '/product#ai-tools',
          },
          {
            title: 'Integrations',
            desc: 'Shopify, Meta, TikTok, Klaviyo, and webhooks.',
            to: '/product#services',
          },
          {
            title: 'White-label',
            desc: 'Agencies: resell seats under your brand.',
            to: '/company#about',
          },
        ],
      },
      {
        heading: 'Use cases',
        simple: true,
        items: [
          { label: 'Shopify scale-up', to: '/solutions#shopify-business' },
          { label: 'Dropship lean growth', to: '/solutions#dropship-business' },
          { label: 'Creator & social stores', to: '/solutions#social-business' },
          { label: 'Free trial (no card)', to: '/product#trial' },
          { label: 'Pay after trial', to: '/solutions#trial-convert' },
        ],
      },
      {
        heading: 'More',
        simple: true,
        items: [
          { label: 'Product page', to: '/product' },
          { label: 'Security & trust', to: '/company#about' },
          { label: 'Contact sales', to: '/company#contact' },
        ],
      },
    ],
  },
  solutions: {
    columns: [
      {
        heading: 'Business types',
        items: [
          {
            title: 'Shopify brands',
            desc: 'CRO, retention, and catalog intelligence tuned for DTC.',
            to: '/solutions#shopify-business',
          },
          {
            title: 'Dropshippers',
            desc: 'Supplier signals, lean tests, and creative spins on demand.',
            to: '/solutions#dropship-business',
          },
          {
            title: 'Social-first sellers',
            desc: 'Content-to-cash attribution and DM-ready playbooks.',
            to: '/solutions#social-business',
          },
        ],
      },
      {
        heading: 'Programs',
        simple: true,
        items: [
          { label: 'Trial onboarding', to: '/solutions#trial-onboarding' },
          { label: 'Trial momentum', to: '/solutions#trial-momentum' },
          { label: 'Upgrade & billing', to: '/solutions#trial-convert' },
          { label: 'Operator coaching', to: '/product#services' },
        ],
      },
      {
        heading: 'More',
        simple: true,
        items: [
          { label: 'Solutions page', to: '/solutions' },
          { label: 'Done-for-you builds', to: '/company#contact' },
          { label: 'API & extensions', to: '/company#contact' },
        ],
      },
    ],
  },
  resources: {
    columns: [
      {
        heading: 'Learn',
        items: [
          {
            title: 'Growth playbooks',
            desc: 'Vertical guides for Shopify, dropship, and creators.',
            to: '/company#about',
          },
          {
            title: 'Trial checklist',
            desc: 'What to connect in week one for honest results.',
            to: '/product#trial',
          },
          {
            title: 'Office hours',
            desc: 'Live Q&A with our growth team.',
            to: '/company#contact',
          },
        ],
      },
      {
        heading: 'Product',
        simple: true,
        items: [
          { label: 'Resources page', to: '/resources' },
          { label: 'Service catalog', to: '/product#services' },
          { label: 'Compare business types', to: '/solutions#business-types' },
          { label: 'Log in', to: '/login' },
        ],
      },
      {
        heading: 'Company',
        simple: true,
        items: [
          { label: 'About', to: '/company#about' },
          { label: 'Careers', to: '/company#contact' },
          { label: 'Press', to: '/company#contact' },
        ],
      },
    ],
  },
}

function Chevron({ open, className = '' }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-200 ${open ? 'rotate-180' : ''} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

function MegaPanel({ menuKey, variant, compact = false, onNavigate }) {
  const data = megaContent[menuKey]
  if (!data) return null

  const isHero = variant === 'hero'
  const desktopPanelClass = isHero
    ? 'mega-hero-panel'
    : 'border border-slate-200/90 bg-white/90 shadow-xl shadow-slate-900/15 ring-1 ring-slate-200/50 backdrop-blur-3xl backdrop-saturate-150'

  const headingClass = isHero ? 'text-white/50' : 'text-slate-400'
  const titleClass = isHero
    ? 'text-white group-hover:text-white/85'
    : 'text-slate-900 group-hover:text-slate-900'
  const descClass = isHero ? 'text-white/70' : 'text-slate-500'
  const simpleClass = isHero
    ? 'text-white/90 active:text-white'
    : 'text-slate-600 active:text-slate-900'

  const headingMb = compact ? 'mb-3' : 'mb-5'
  const colGap = compact ? 'gap-8' : 'gap-10 sm:gap-12 lg:gap-16'
  const linkTap = compact ? 'py-1.5' : ''

  const wrapClass = compact
    ? isHero
      ? 'mega-panel-enter rounded-xl border border-white/25 bg-black/90 p-4 shadow-lg'
      : 'mega-panel-enter rounded-xl border border-slate-200 bg-white p-4 shadow-md'
    : `mega-panel-enter rounded-2xl p-8 sm:p-10 ${desktopPanelClass}`

  const innerAnim = compact ? '' : 'mega-menu-inner-swap'
  const contentClass = compact ? '' : isHero ? 'mega-hero-panel-content' : ''

  return (
    <div className={`${wrapClass} z-50 transition-shadow duration-500`}>
      <div key={menuKey} className={`${innerAnim} ${contentClass}`.trim()}>
        <div className={`grid grid-cols-1 sm:grid-cols-3 ${colGap}`}>
          {data.columns.map((col) => (
            <div key={col.heading}>
              <p className={`${headingMb} text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors duration-200 ${headingClass}`}>
                {col.heading}
              </p>
              {col.simple ? (
                <ul className={`flex flex-col ${compact ? 'gap-2' : 'gap-3.5'}`}>
                  {col.items.map((item) => (
                    <li key={item.label}>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        className={`block text-[15px] font-medium leading-snug transition-[color,transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:translate-x-1 hover:opacity-100 motion-reduce:transform-none ${simpleClass} ${linkTap}`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className={`flex flex-col ${compact ? 'gap-4' : 'gap-5'}`}>
                  {col.items.map((item) => (
                    <li key={item.title}>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        className={`group block rounded-lg py-1 outline-none transition-[background-color,color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:translate-x-0.5 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 ${isHero ? 'focus-visible:ring-offset-black hover:bg-white/5' : 'focus-visible:ring-offset-transparent hover:bg-slate-50'} ${linkTap}`}
                      >
                        <span className={`block text-[15px] font-semibold transition-colors duration-200 ${titleClass}`}>
                          {item.title}
                        </span>
                        <span className={`mt-1 block text-sm leading-relaxed transition-colors duration-200 ${descClass}`}>
                          {item.desc}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
/**
 * @param {{ variant?: 'hero' | 'light' }} props — omit to follow route: `/` → hero, else light
 */
const NavBar = ({ variant: variantProp }) => {
  const { pathname } = useLocation()
  const variant = variantProp ?? (pathname === '/' ? 'hero' : 'light')
  const { user, logout } = useAuth()

  const [menuOpen, setMenuOpen] = useState(false)
  const [activeMega, setActiveMega] = useState(null)
  const [mobileSection, setMobileSection] = useState(null)
  const closeTimer = useRef(null)

  const isHero = variant === 'hero'

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      setActiveMega(null)
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  const openMega = useCallback(
    (key) => {
      clearCloseTimer()
      setActiveMega(key)
    },
    [clearCloseTimer],
  )

  const toggleMega = useCallback(
    (key) => {
      clearCloseTimer()
      setActiveMega((prev) => (prev === key ? null : key))
    },
    [clearCloseTimer],
  )

  const closeMobileMenu = useCallback(() => {
    setMobileSection(null)
    setMenuOpen(false)
  }, [])

  const toggleMobileMenu = useCallback(() => {
    setMenuOpen((open) => {
      const next = !open
      if (!next) setMobileSection(null)
      return next
    })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setActiveMega(null)
        closeMobileMenu()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeMobileMenu])

  useEffect(() => {
    if (!menuOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const mq = window.matchMedia('(min-width: 1024px)')
    const closeIfDesktop = () => {
      if (mq.matches) closeMobileMenu()
    }
    mq.addEventListener('change', closeIfDesktop)  
    return () => mq.removeEventListener('change', closeIfDesktop)
  }, [menuOpen, closeMobileMenu])

  /* Shell: sticky top bar (same idea as `sticky top-0 z-50 bg-white shadow-md w-full`) */
  const headerClass = isHero
    ? 'bg-transparent shadow-none'
    : 'border-b border-slate-200/90 bg-white shadow-md backdrop-blur-md'

  const linkMuted = isHero
    ? 'text-white/85 transition-colors duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-white'
    : 'text-slate-600 transition-colors duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-slate-900'
  const triggerBase = isHero
    ? 'text-white/90 transition-[color,background-color] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-white'
    : 'text-slate-600 transition-[color,background-color] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-slate-900'
  const signInClass = isHero
    ? 'text-white/90 transition-[color,background-color] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/10 hover:text-white'
    : 'text-slate-600 transition-[color,background-color] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-50 hover:text-slate-900'
  const ctaClass = isHero
    ? 'bg-white text-black shadow-sm transition-[transform,background-color,box-shadow] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-white/90 hover:shadow-md focus-visible:ring-white/50 motion-reduce:transition-colors hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-5 motion-reduce:active:scale-5'
    : 'bg-slate-900 text-white shadow-sm transition-[transform,background-color,box-shadow] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-100 hover:shadow-md focus-visible:ring-slate-400 motion-reduce:transition-colors hover:scale-[1.02] active:scale-[0.98] motion-reduce:hover:scale-100 motion-reduce:active:scale-100'

  const logoText = isHero ? 'text-white' : 'text-slate-900'
  const logoSub = isHero ? 'text-white/60' : 'text-slate-500'
  const logoMark = isHero
    ? 'from-white/25 to-white/10 text-white ring-1 ring-white/30'
    : 'from-slate-800 to-slate-600 text-white'

  return (
    <nav
      className={`relative z-50 w-full transition-[box-shadow,background-color,border-color,backdrop-filter] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-0 ${headerClass}`}
      aria-label="Main"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="relative"
          onMouseLeave={scheduleClose}
          onMouseEnter={clearCloseTimer}
          onFocusCapture={clearCloseTimer}
        >
          <div className="flex h-16 items-center justify-between gap-4">
            <Link
              to="/"
              className="flex min-w-0 items-center gap-2.5 rounded-md outline-none transition-opacity duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:opacity-90 active:opacity-80 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-xs font-bold tracking-wide shadow-sm transition-transform duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-105 active:scale-95 motion-reduce:transition-none ${logoMark}`}
                aria-hidden
              >
                BI
              </span>
              <div className="hidden min-w-0 flex-col leading-tight sm:flex">
                <span className={`truncate text-base font-semibold tracking-tight ${logoText}`}>
                  Business Insight
                </span>
                <span className={`hidden text-[11px] font-medium lg:block ${logoSub}`}>
                  Commerce growth for Shopify & creators
                </span>
              </div>
            </Link>

            <div className="hidden flex-1 justify-center lg:flex">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium active:scale-[0.98] motion-reduce:active:scale-100 ${triggerBase} ${activeMega === 'product' ? (isHero ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-900') : ''}`}
                  aria-expanded={activeMega === 'product'}
                  aria-haspopup="true"
                  onMouseEnter={() => openMega('product')}
                  onFocus={() => openMega('product')}
                  onClick={() => toggleMega('product')}
                >
                  Product
                  <Chevron open={activeMega === 'product'} className={isHero ? 'text-white/70' : 'text-slate-400'} />
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium active:scale-[0.98] motion-reduce:active:scale-100 ${triggerBase} ${activeMega === 'solutions' ? (isHero ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-900') : ''}`}
                  aria-expanded={activeMega === 'solutions'}
                  aria-haspopup="true"
                  onMouseEnter={() => openMega('solutions')}
                  onFocus={() => openMega('solutions')}
                  onClick={() => toggleMega('solutions')}
                >
                  Solutions
                  <Chevron open={activeMega === 'solutions'} className={isHero ? 'text-white/70' : 'text-slate-400'} />
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium active:scale-[0.98] motion-reduce:active:scale-100 ${triggerBase} ${activeMega === 'resources' ? (isHero ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-900') : ''}`}
                  aria-expanded={activeMega === 'resources'}
                  aria-haspopup="true"
                  onMouseEnter={() => openMega('resources')}
                  onFocus={() => openMega('resources')}
                  onClick={() => toggleMega('resources')}
                >
                  Resources
                  <Chevron open={activeMega === 'resources'} className={isHero ? 'text-white/70' : 'text-slate-400'} />
                </button>
                <Link
                  to="/company"
                  className={`relative rounded-lg px-3 py-2 text-sm font-medium after:pointer-events-none after:absolute after:bottom-1.5 after:left-3 after:right-3 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-450 after:ease-[cubic-bezier(0.22,1,0.36,1)] hover:after:scale-x-100 motion-reduce:after:transition-none ${linkMuted}`}
                  onMouseEnter={() => setActiveMega(null)}
                >
                  Company
                </Link>
              </div>
            </div>

            <div className="hidden max-w-[min(100%,22rem)] items-center justify-end gap-2 lg:flex">
              {user ? (
                <>
                  <Link
                    to="/app"
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${signInClass}`}
                    onMouseEnter={() => setActiveMega(null)}
                  >
                    Workspace
                  </Link>
                  <span
                    className={`max-w-40 truncate px-2 text-xs font-medium sm:max-w-48 sm:text-sm ${isHero ? 'text-white/80' : 'text-slate-600'}`}
                    title={user.email}
                  >
                    {user.email}
                  </span>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ${signInClass}`}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${signInClass}`}
                  onMouseEnter={() => setActiveMega(null)}
                >
                  Log in
                </Link>
              )}
              <Link
                to="/signup"
                className={`rounded-full px-5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${ctaClass}`}
                onMouseEnter={() => setActiveMega(null)}
              >
                Start free trial
              </Link>
            </div>

            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-lg p-2 transition-[transform,background-color,color] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 motion-reduce:active:scale-100 lg:hidden ${isHero ? 'text-white hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'}`}
              onClick={toggleMobileMenu}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <span className="relative block h-6 w-6">
                <svg
                  className={`absolute inset-0 h-6 w-6 transition-[opacity,transform] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] ${menuOpen ? 'scale-90 opacity-0' : 'scale-100 opacity-100'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                <svg
                  className={`absolute inset-0 h-6 w-6 transition-[opacity,transform] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] ${menuOpen ? 'scale-100 rotate-0 opacity-100' : 'scale-90 rotate-90 opacity-0'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          </div>

          {/* Desktop mega-menu: full-width hit area + overlap under nav so the pointer never "leaves" */}
          <div
            className={[
              'mega-dropdown-anim absolute left-0 right-0 top-full z-50 hidden lg:block',
              activeMega ? 'pointer-events-auto' : 'pointer-events-none',
            ].join(' ')}
            aria-hidden={!activeMega}
            onMouseEnter={clearCloseTimer}
          >
            {activeMega ? (
              <div className="mega-dropdown-reveal -mt-3 w-full pt-3">
                <div className="mx-auto max-w-7xl px-0">
                  <MegaPanel menuKey={activeMega} variant={variant} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Mobile: scrollable panel, one accordion at a time, compact mega content */}
        <div
          id="mobile-nav"
          className={`overflow-hidden border-t transition-[max-height,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:duration-200 lg:hidden ${
            isHero ? 'border-white/15' : 'border-slate-100'
          } ${menuOpen ? 'max-h-[calc(100dvh-4rem)] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div
            className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-y-auto overscroll-y-contain px-2 py-3 transition-[opacity,transform] duration-450 ease-[cubic-bezier(0.22,1,0.36,1)] [touch-action:pan-y] motion-reduce:transition-none"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {['product', 'solutions', 'resources'].map((key) => {
              const open = mobileSection === key
              const label = key.charAt(0).toUpperCase() + key.slice(1)
              return (
                <div key={key} className="rounded-lg">
                  <button
                    type="button"
                    className={`flex min-h-12 w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold transition-[background-color,color,transform] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] motion-reduce:active:scale-100 ${isHero ? 'text-white active:bg-white/10' : 'text-slate-800 active:bg-slate-100'}`}
                    onClick={() => setMobileSection((prev) => (prev === key ? null : key))}
                    aria-expanded={open}
                  >
                    {label}
                    <Chevron
                      open={open}
                      className={`h-5! w-5! ${isHero ? 'text-white/80' : 'text-slate-500'}`}
                    />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className={`px-2 pb-2 pt-0 ${isHero ? 'border-l border-white/20' : 'border-l border-slate-300'}`}>
                        <MegaPanel
                          menuKey={key}
                          variant={variant}
                          compact
                          onNavigate={closeMobileMenu}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <Link
              to="/company"
              className={`min-h-12 rounded-lg px-3 py-3 text-sm font-medium leading-none transition-[background-color,color,transform] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] motion-reduce:active:scale-100 ${isHero ? 'text-white/90 active:bg-white/10' : 'text-slate-700 active:bg-slate-100'}`}
              onClick={closeMobileMenu}
            >
              Company
            </Link>
            <hr className={`my-2 shrink-0 ${isHero ? 'border-white/15' : 'border-slate-200'}`} />
            {user ? (
              <>
                <Link
                  to="/app"
                  className={`min-h-12 rounded-lg px-3 py-3 text-sm font-medium transition-[background-color,color,transform] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] motion-reduce:active:scale-100 ${isHero ? 'text-white/90 active:bg-white/10' : 'text-slate-700 active:bg-slate-100'}`}
                  onClick={closeMobileMenu}
                >
                  Workspace
                </Link>
                <p
                  className={`px-3 py-2 text-xs ${isHero ? 'text-white/70' : 'text-slate-500'}`}
                  title={user.email}
                >
                  {user.email}
                </p>
                <button
                  type="button"
                  className={`min-h-12 w-full rounded-lg px-3 py-3 text-left text-sm font-medium transition-[background-color,color,transform] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] motion-reduce:active:scale-100 ${isHero ? 'text-white/90 active:bg-white/10' : 'text-slate-700 active:bg-slate-100'}`}
                  onClick={() => {
                    logout()
                    closeMobileMenu()
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className={`min-h-12 rounded-lg px-3 py-3 text-sm font-medium transition-[background-color,color,transform] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] motion-reduce:active:scale-100 ${isHero ? 'text-white/90 active:bg-white/10' : 'text-slate-700 active:bg-slate-100'}`}
                onClick={closeMobileMenu}
              >
                Log in
              </Link>
            )}
            <Link
              to="/signup"
              className={`mb-2 mt-1 min-h-12 rounded-full px-4 py-3 text-center text-sm font-semibold leading-tight transition-[transform,background-color,opacity] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] motion-reduce:active:scale-100 active:opacity-90 ${isHero ? 'bg-white text-black active:bg-white/90' : 'bg-slate-900 text-white active:bg-slate-800'}`}
              onClick={closeMobileMenu}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default NavBar

