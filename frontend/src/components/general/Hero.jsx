import { Link } from 'react-router-dom'
import Reveal from './Reveal'

const Hero = () => {
  return (
    <section
      className="scroll-mt-24 flex min-h-[calc(100dvh-4rem)] flex-col justify-center lg:scroll-mt-28"
      aria-label="Introduction"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_min(420px,100%)] lg:items-center lg:gap-14">
          <div className="hero-stagger max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 sm:text-sm">
              Modern growth system
            </p>
            <h1 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
              <span className="hero-title-gradient">
                Black-label customer growth for modern brands.
              </span>
            </h1>
            <p className="mt-5 text-base leading-relaxed text-white/80 sm:text-lg lg:text-xl">
              Business Insight gives you a premium command center to attract better leads, convert
              faster, and retain high-value customers with elegant automation and clear reporting.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/#register"
                className="cta-glow btn-lift relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-black/25"
              >
                <span className="relative z-10">Book strategy call</span>
              </Link>
              <Link
                to="/#services"
                className="btn-lift inline-flex items-center justify-center rounded-full border border-white/45 bg-white/12 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/18"
              >
                Explore services
              </Link>
            </div>
          </div>

          <Reveal variant="scale" delay={140}>
            <div className="hero-glass-panel glass-panel flex flex-col rounded-2xl p-6 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-xs">
                Live performance
              </p>
              <dl className="mt-6 space-y-4 sm:space-y-5">
                <div className="stat-row rounded-xl bg-white/6 px-4 py-3 sm:py-4">
                  <dt className="text-xs text-white/65 sm:text-sm">Lead response speed</dt>
                  <dd className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                    5x faster first-touch outreach
                  </dd>
                </div>
                <div className="stat-row rounded-xl bg-white/6 px-4 py-3 sm:py-4">
                  <dt className="text-xs text-white/65 sm:text-sm">Conversion visibility</dt>
                  <dd className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                    One view across funnel, calls, and retention
                  </dd>
                </div>
                <div className="stat-row rounded-xl bg-white/6 px-4 py-3 sm:py-4">
                  <dt className="text-xs text-white/65 sm:text-sm">Customer lifetime value</dt>
                  <dd className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                    Predictable expansion and renewal playbooks
                  </dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export default Hero
