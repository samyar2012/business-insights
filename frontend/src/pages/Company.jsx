import Footer from '../components/general/Footer'
import Reveal from '../components/general/Reveal'

const Company = () => {
  return (
    <>
      <section id="about" className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Company</p>
            <h1 className="section-heading-gradient mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              We build revenue systems for modern commerce operators.
            </h1>
            <p className="mt-4 max-w-3xl text-white/75">
              Business Insight exists to help e-commerce and social businesses grow with better data,
              better experiments, and practical AI they can actually use.
            </p>
          </Reveal>
        </div>
      </section>

      <section id="contact" className="modern-section scroll-mt-24 pb-16 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Reveal variant="scale">
            <div className="contact-panel-glow glass-panel-strong rounded-2xl bg-white/8 p-8">
              <h2 className="section-heading-gradient text-2xl font-semibold">Talk to our team</h2>
              <p className="mt-3 text-white/75">
                Partnerships, press, hiring, or enterprise onboarding. We usually respond within one
                business day.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="mailto:hello@businessinsight.example"
                  className="btn-lift inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-950"
                >
                  Email us
                </a>
                <a
                  href="tel:+18005550199"
                  className="btn-lift inline-flex rounded-full border border-white/35 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Call sales
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer />
    </>
  )
}

export default Company
