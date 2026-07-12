import { Link } from 'react-router-dom'
import Reveal from './Reveal'

const workflowSteps = [
  { step: '1', label: 'Analyze', detail: 'Scan your public pages' },
  { step: '2', label: 'Review', detail: 'See scores and top problems' },
  { step: '3', label: 'Plan', detail: 'Prioritize growth steps that matter' },
  { step: '4', label: 'Improve', detail: 'Use AI tools to execute' },
]

const Hero = () => {
  return (
    <section
      className="scroll-mt-24 flex min-h-[calc(100dvh-4rem)] flex-col justify-center lg:scroll-mt-28"
      aria-label="Introduction"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_min(400px,100%)] lg:items-center lg:gap-14">
          <div className="hero-stagger max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70 sm:text-sm">
              Website improvement platform
            </p>
            <h1 className="mt-4 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
              <span className="hero-title-gradient">
                Find what is stopping customers from buying or contacting you.
              </span>
            </h1>
            <p className="mt-5 text-base leading-relaxed text-white/80 sm:text-lg lg:text-xl">
              Business Insights scans your website, scores trust, UX, and conversion paths, and gives
              you a clear growth roadmap - built for store owners, service businesses, and anyone selling
              online.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="cta-glow btn-lift relative inline-flex items-center justify-center overflow-hidden rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg shadow-black/25"
              >
                <span className="relative z-10">Start analyzing</span>
              </Link>
              <Link
                to="/#how-it-works"
                className="btn-lift inline-flex items-center justify-center rounded-full border border-white/45 bg-white/12 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/18"
              >
                See how it works
              </Link>
              <Link
                to="/login"
                className="btn-lift inline-flex items-center justify-center rounded-full px-4 py-3 text-sm font-semibold text-white/80 hover:text-white"
              >
                Log in
              </Link>
            </div>
          </div>

          <Reveal variant="scale" delay={140}>
            <div className="hero-glass-panel glass-panel flex flex-col rounded-2xl p-6 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-xs">
                Your workflow
              </p>
              <ol className="mt-6 space-y-3">
                {workflowSteps.map((item) => (
                  <li
                    key={item.step}
                    className="stat-row flex items-center gap-4 rounded-xl bg-white/6 px-4 py-3 sm:py-4"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-sm font-bold text-white">
                      {item.step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{item.label}</p>
                      <p className="text-xs text-white/65">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-xs leading-relaxed text-white/60">
                Works for online stores, local services, galleries, listings, and hybrid businesses.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

export default Hero
