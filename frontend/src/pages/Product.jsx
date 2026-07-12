import { Link } from 'react-router-dom'
import Footer from '../components/general/Footer'
import Reveal from '../components/general/Reveal'
import { aiProducts, primaryServices, trialFlow } from '../content/home'

const Product = () => {
  return (
    <>
      <section className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Product</p>
            <h1 className="section-heading-gradient mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Website improvement platform for stores, services, and online businesses.
            </h1>
            <p className="mt-4 max-w-3xl text-white/75">
              Scan your site, review ranked problems, build a growth roadmap, and use AI tools - from free
              trial to paid when you are ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                className="btn-lift inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-950"
              >
                Start free trial
              </Link>
              <Link
                to="/app"
                className="btn-lift inline-flex rounded-full border border-white/35 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Open workspace
              </Link>
              <Link to="/login" className="btn-lift inline-flex rounded-full px-5 py-2.5 text-sm text-white/85">
                Log in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="services" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
            {primaryServices.map((item, index) => (
              <li key={item.title}>
                <Reveal variant="scale" delay={index * 50}>
                  <div className="card-hover h-full rounded-2xl bg-white/6 p-6">
                    <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                    <p className="mt-2 text-sm text-white/70">{item.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="ai-tools" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="section-heading-gradient text-2xl font-semibold tracking-tight sm:text-3xl">
              AI modules you can activate and sell
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {aiProducts.map((item, index) => (
              <li key={item.title}>
                <Reveal variant="scale" delay={index * 45}>
                  <div className="card-hover h-full rounded-2xl bg-white/6 p-5">
                    <p className="text-xs uppercase tracking-wider text-amber-100/80">{item.tag}</p>
                    <h3 className="mt-2 font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{item.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="trial" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="section-heading-gradient text-2xl font-semibold tracking-tight sm:text-3xl">
              Free trial first, payment after
            </h2>
          </Reveal>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {trialFlow.map((step, index) => (
              <li key={step.step}>
                <Reveal variant="scale" delay={index * 70}>
                  <div className="card-hover rounded-2xl bg-white/6 p-6">
                    <p className="text-sm font-semibold text-amber-100">Step {step.step}</p>
                    <h3 className="mt-2 font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm text-white/70">{step.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="register" className="modern-section scroll-mt-24 pb-16 lg:scroll-mt-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal variant="scale">
            <div className="contact-panel-glow glass-panel-strong rounded-2xl bg-white/8 p-8 text-center">
              <h2 className="section-heading-gradient text-2xl font-semibold">Start your free trial</h2>
              <p className="mt-3 text-white/75">No card required on signup. Upgrade when you are ready.</p>
              <a
                href="mailto:hello@businessinsight.example?subject=Start%20trial"
                className="btn-lift mt-6 inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-orange-950"
              >
                Email to start
              </a>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer />
    </>
  )
}

export default Product
