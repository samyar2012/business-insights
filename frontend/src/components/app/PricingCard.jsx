import { Link } from 'react-router-dom'

const plans = [
  { name: 'Starter', price: '$29', period: '/mo', detail: '1 business workspace', featured: false },
  { name: 'Growth', price: '$79', period: '/mo', detail: 'Up to 5 businesses + AI tools', featured: true },
  { name: 'Scale', price: '$149', period: '/mo', detail: 'Unlimited businesses + priority support', featured: false },
]

const PricingCard = ({ compact = false, linkToPlans = false, full = false }) => {
  return (
    <div className={`app-pricing-card ${compact ? 'p-3' : full ? 'p-8' : 'p-4'}`}>
      <p className="app-eyebrow">Plans & pricing</p>
      <p
        className={`mt-1.5 font-semibold text-[var(--app-text)] ${
          compact ? 'text-sm' : full ? 'text-2xl' : 'text-base'
        }`}
      >
        {full ? 'Choose the plan that fits your growth' : 'Unlock more business workspaces'}
      </p>
      {full ? (
        <p className="mt-2 text-sm text-[var(--app-text-secondary)]">
          Your first business is free. Upgrade anytime to add workspaces, unlock tools, and scale
          faster.
        </p>
      ) : null}

      <ul className={`${full ? 'mt-8 grid gap-4 sm:grid-cols-3' : 'mt-3 space-y-1'} ${compact ? 'text-xs' : 'text-sm'}`}>
        {plans.map((plan) => (
          <li
            key={plan.name}
            className={`app-pricing-plan ${full ? 'app-card flex-col !items-stretch p-5' : ''} ${
              plan.featured && full ? 'app-card--accent ring-1 ring-[var(--app-accent-strong)]' : ''
            }`}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <span>
                <span
                  className={`font-medium ${plan.featured ? 'text-[var(--app-accent-strong)]' : 'text-[var(--app-text)]'} ${full ? 'text-lg' : ''}`}
                >
                  {plan.name}
                  {plan.featured ? (
                    <span className="ml-1.5 rounded-full bg-[var(--app-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-accent-strong)]">
                      Popular
                    </span>
                  ) : null}
                </span>
                <span className={`mt-0.5 block text-[var(--app-text-muted)] ${full ? 'mt-2' : ''}`}>
                  {plan.detail}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-[var(--app-text)]">
                {plan.price}
                <span className="text-[var(--app-text-muted)]">{plan.period}</span>
              </span>
            </div>
            {full ? (
              <button type="button" className="app-btn app-btn--primary app-btn--block mt-5">
                Get {plan.name}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {!full ? (
        <button type="button" className={`app-btn app-btn--primary mt-3 ${compact ? 'py-2 text-xs' : ''} app-btn--block`}>
          Upgrade plan
        </button>
      ) : null}

      {linkToPlans && !full ? (
        <Link to="/app/plans" className="app-link mt-2 block text-center text-xs font-medium">
          View all plans ->
        </Link>
      ) : null}
    </div>
  )
}

export default PricingCard
