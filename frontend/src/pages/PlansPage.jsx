import PricingCard from '../components/app/PricingCard'

const PlansPage = () => {
  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <p className="app-eyebrow">Billing</p>
        <h1 className="app-page-title mt-2">Plans & pricing</h1>
        <p className="app-page-subtitle max-w-2xl">
          Scale from a single business to a full portfolio. Upgrade when you need more workspaces,
          tools, or priority support.
        </p>
      </header>

      <div className="mt-10">
        <PricingCard full />
      </div>

      <section className="app-card mt-10 p-6">
        <h2 className="text-sm font-semibold text-[var(--app-text)]">What&apos;s included</h2>
        <ul className="mt-4 grid gap-3 text-sm text-[var(--app-text-secondary)] sm:grid-cols-2">
          <li>+ First business workspace free</li>
          <li>+ Churn prediction and file analyze</li>
          <li>+ AI coach on Growth+</li>
          <li>+ Multiple businesses on paid plans</li>
          <li>+ Priority support on Scale</li>
          <li>+ Cancel anytime</li>
        </ul>
      </section>
    </div>
  )
}

export default PlansPage
