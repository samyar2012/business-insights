import Footer from '../components/general/Footer'
import Reveal from '../components/general/Reveal'
import { businessVerticals, serviceTracks } from '../content/home'

const Solutions = () => {
  return (
    <>
      <section className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Solutions</p>
            <h1 className="section-heading-gradient mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Website improvement for every type of online business.
            </h1>
            <p className="mt-4 max-w-3xl text-white/75">
              Stores, service providers, listings, and hybrid models - analyze your site, fix what
              blocks customers, and grow with AI tools.
            </p>
          </Reveal>
        </div>
      </section>

      <section id="business-types" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {businessVerticals.map((v, idx) => (
              <Reveal key={v.id} variant="scale" delay={idx * 70}>
                <article id={v.id} className="card-hover rounded-2xl bg-white/6 p-6">
                  <p className="text-xs uppercase tracking-wider text-amber-100/80">{v.badge}</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{v.title}</h2>
                  <p className="mt-2 text-sm text-white/72">{v.blurb}</p>
                  <ul className="mt-4 space-y-1.5 text-sm text-white/80">
                    {v.services.map((s) => (
                      <li key={s}>- {s}</li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="modern-section scroll-mt-24 pb-16 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-3">
            {serviceTracks.map((track, idx) => (
              <Reveal key={track.id} variant="scale" delay={idx * 70}>
                <article id={track.id} className="card-hover rounded-2xl bg-white/6 p-6">
                  <p className="text-xs uppercase tracking-wider text-amber-100/80">{track.tag}</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{track.title}</h2>
                  <ul className="mt-3 space-y-1.5 text-sm text-white/75">
                    {track.items.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </>
  )
}

export default Solutions
