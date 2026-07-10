import { Link } from 'react-router-dom'
import Footer from '../components/general/Footer'
import Hero from '../components/general/Hero'
import Reveal from '../components/general/Reveal'
import {
  aiToolsPreview,
  businessTypes,
  howItWorks,
  productPillars,
  reportHighlights,
} from '../content/home'

const aboutBullets = [
  'Built for owners and operators — not agencies pitching retainers.',
  'Website Analyzer is the core product; AI tools extend what you learn from the scan.',
  'Scores adapt to your business model, from online stores to local services and listings.',
]

const Home = () => {
  return (
    <>
      <Hero />

      <section id="how-it-works" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                How it works
              </p>
              <h2 className="section-heading-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Analyze, review, plan, and improve — in one app.
              </h2>
              <p className="mt-3 text-base text-white/75 sm:text-lg">
                Business Insights is a practical workspace for fixing your website, not a services
                brochure.
              </p>
            </div>
          </Reveal>
          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {howItWorks.map((item, index) => (
              <li key={item.step}>
                <Reveal variant="scale" delay={index * 70}>
                  <div className="card-hover flex h-full flex-col rounded-2xl bg-white/6 p-6 text-left sm:p-7">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/14 text-sm font-bold text-white">
                      {item.step}
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/72">{item.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="product" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                What you get
              </p>
              <h2 className="section-heading-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                A website report that tells you what to fix first.
              </h2>
            </div>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {reportHighlights.map((item, index) => (
              <li key={item.label}>
                <Reveal variant="scale" delay={index * 60}>
                  <div className="card-hover rounded-2xl bg-white/6 p-5 text-center sm:p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/60">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                    <p className="mt-2 text-sm text-white/70">{item.detail}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {productPillars.map((item, index) => (
              <li key={item.title}>
                <Reveal variant="scale" delay={index * 50}>
                  <div className="card-hover flex h-full flex-col rounded-2xl bg-white/6 p-6 text-left sm:p-7">
                    <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-white/72">{item.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="business-types" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                Who it is for
              </p>
              <h2 className="section-heading-gradient mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Built for any business that relies on its website to win customers.
              </h2>
              <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
                Stores, service providers, galleries, listings, and hybrid models — scoring adjusts
                to how you actually operate.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {businessTypes.map((v, index) => (
              <Reveal key={v.id} variant="scale" delay={index * 60}>
                <article id={v.id} className="card-hover h-full rounded-2xl bg-white/4 p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 sm:text-xs">
                    {v.badge}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{v.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/75">{v.blurb}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="tools" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                After your scan
              </p>
              <h2 className="section-heading-gradient mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                AI tools that connect back to your website report.
              </h2>
            </div>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {aiToolsPreview.map((item, index) => (
              <li key={item.title}>
                <Reveal variant="scale" delay={index * 45}>
                  <div className="card-hover flex h-full flex-col rounded-2xl bg-white/6 p-5 sm:p-6">
                    <span className="w-fit rounded-full bg-white/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                      {item.tag}
                    </span>
                    <h3 className="mt-3 text-base font-semibold text-white sm:text-lg">{item.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-white/70">{item.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="about" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
            <Reveal>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                  Why Business Insights
                </p>
                <h2 className="section-heading-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  An app for fixing your site, not another agency pitch deck.
                </h2>
                <p className="mt-3 text-base text-white/75 sm:text-lg">
                  Scan your website, understand what blocks customers, build a fix plan, and use AI
                  tools to keep improving — all in one workspace.
                </p>
              </div>
            </Reveal>
            <ul className="flex flex-col gap-3">
              {aboutBullets.map((line, index) => (
                <li key={line}>
                  <Reveal variant="scale" delay={80 + index * 55}>
                    <div className="card-hover flex gap-3 rounded-xl bg-white/4 px-4 py-3 text-white/85 sm:py-4">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />
                      <span className="text-sm leading-relaxed sm:text-base">{line}</span>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="contact" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal variant="scale">
            <div
              id="register"
              className="contact-panel-glow glass-panel-strong mx-auto max-w-3xl rounded-2xl bg-linear-to-br from-white/14 via-white/8 to-white/4 p-8 sm:p-10"
            >
              <div className="mx-auto max-w-xl text-center">
                <h2 className="section-heading-gradient text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                  Start with a free website scan
                </h2>
                <p className="mt-3 text-sm text-white/75 sm:text-base">
                  Create an account, add your business URL, and see what is stopping customers from
                  buying or contacting you.
                </p>
                <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Link
                    to="/signup"
                    className="btn-lift inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg"
                  >
                    Start analyzing
                  </Link>
                  <Link
                    to="/#how-it-works"
                    className="btn-lift inline-flex items-center justify-center rounded-full border border-white/35 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    See how it works
                  </Link>
                </div>
                <p className="mt-5 text-xs text-white/55">
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-medium text-white underline-offset-2 hover:text-white/85 hover:underline"
                  >
                    Log in
                  </Link>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  )
}

export default Home
