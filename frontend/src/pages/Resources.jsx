import Footer from '../components/general/Footer'
import Reveal from '../components/general/Reveal'

const resources = [
  {
    title: 'Growth playbook',
    desc: 'Practical actions for Shopify, dropship, and creator-led commerce teams.',
  },
  {
    title: 'Trial setup checklist',
    desc: 'Connect data sources and launch your first experiments in under one day.',
  },
  {
    title: 'Office hours',
    desc: 'Join product and growth Q&A sessions with our operators.',
  },
  {
    title: 'API and integration docs',
    desc: 'Reference docs for events, webhooks, and custom automation.',
  },
]

const Resources = () => {
  return (
    <>
      <section className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Resources</p>
            <h1 className="section-heading-gradient mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Learn, implement, and scale faster.
            </h1>
          </Reveal>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {resources.map((r, i) => (
              <li key={r.title}>
                <Reveal variant="scale" delay={i * 60}>
                  <div className="card-hover rounded-2xl bg-white/6 p-6">
                    <h2 className="text-lg font-semibold text-white">{r.title}</h2>
                    <p className="mt-2 text-sm text-white/75">{r.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Footer />
    </>
  )
}

export default Resources
