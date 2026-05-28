import { Link } from 'react-router-dom'
import Footer from '../components/general/Footer'
import Hero from '../components/general/Hero'
import Reveal from '../components/general/Reveal'
import {
  aiProducts,
  businessVerticals,
  primaryServices,
  serviceTracks,
  trialFlow,
} from '../content/home'

const aboutBullets = [
  'A premium black-glass interface designed for confident executive decision making.',
  'Live operating views for acquisition, sales calls, onboarding, and renewals.',
  'Service-driven delivery model so strategy and implementation move together.',
]

const Home = () => {
  return (
    <>
      <Hero />

      <section id="services" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                Core services
              </p>
              <h2 className="section-heading-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                A complete service stack to drive calls and customer growth.
              </h2>
              <p className="mt-3 text-base text-white/75 sm:text-lg">
                Every layer of the platform is built to improve response speed, conversion quality, and
                long-term retention.
              </p>
            </div>
          </Reveal>
          <ul className="mt-12 grid gap-6 md:grid-cols-3">
            {primaryServices.map((item, index) => (
              <li key={item.title}>
                <Reveal variant="scale" delay={index * 80}>
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
                Service programs
              </p>
              <h2 className="section-heading-gradient mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Done-for-you tracks that match your growth stage.
              </h2>
              <p className="mt-3 max-w-2xl text-base text-white/75 sm:text-lg">
                Choose the right path for your team and scale into deeper service support as your volume
                and complexity increase.
              </p>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {serviceTracks.map((track, index) => (
              <Reveal key={track.id} variant="scale" delay={index * 70}>
                <article
                  id={track.id}
                  className="card-hover flex h-full flex-col rounded-2xl bg-linear-to-b from-white/12 to-white/4 p-6 backdrop-blur-lg sm:p-7"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-xs">
                    {track.tag}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{track.title}</h3>
                  <ul className="mt-5 space-y-2 text-sm text-white/80">
                    {track.items.map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="ai-tools" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                Modern capabilities
              </p>
              <h2 className="section-heading-gradient mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Purpose-built products for acquisition, conversion, and retention.
              </h2>
            </div>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {aiProducts.map((item, index) => (
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

      <section className="modern-section scroll-mt-24 lg:scroll-mt-28" aria-label="Vertical playbooks">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                Industry verticals
              </p>
              <h2 className="section-heading-gradient mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Specialized playbooks for every kind of ecommerce business.
              </h2>
            </div>
          </Reveal>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {businessVerticals.map((v, index) => (
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

      <section id="trial" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                How to get started
              </p>
              <h2 className="section-heading-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Three clean steps from onboarding to ongoing growth.
              </h2>
            </div>
          </Reveal>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {trialFlow.map((item, index) => (
              <li key={item.step}>
                <Reveal variant="scale" delay={index * 80}>
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

      <section id="about" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-12">
            <Reveal>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65 sm:text-sm">
                  Why Business Insight
                </p>
                <h2 className="section-heading-gradient mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                  A luxury-modern experience with real business outcomes.
                </h2>
                <p className="mt-3 text-base text-white/75 sm:text-lg">
                  Built for teams that care about design quality and revenue quality. We combine elegant
                  UX, intelligent workflows, and hands-on growth partnership.
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
                  Ready to build a premium growth engine?
                </h2>
                <p className="mt-3 text-sm text-white/75 sm:text-base">
                  Book your strategy call and we will map your service plan, growth priorities, and launch
                  timeline.
                </p>
                <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                  <Link
                    to="/signup"
                    className="btn-lift inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-lg"
                  >
                    Start now
                  </Link>
                  <a
                    href="tel:+18005550199"
                    className="btn-lift inline-flex items-center justify-center rounded-full border border-white/35 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Call sales
                  </a>
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

      <section id="login" className="scroll-mt-24 pb-16 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-center text-sm text-white/60">
              Secure workspace login is available for active clients and internal teams.
            </p>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  )
}

export default Home
