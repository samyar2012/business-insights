import { BUSINESS_TYPES, BUSINESS_MODELS, BUSINESS_MODEL_HELPERS } from '../../lib/businessFormConfig'

const BusinessProfileForm = ({
  form,
  onChange,
  disabled = false,
  showStoreUrlHint = false,
}) => {
  const set = (key, value) => onChange({ ...form, [key]: value })

  return (
    <div className="space-y-5">
      <label className="app-label">
        Your name
        <input
          required
          value={form.owner_name}
          onChange={(e) => set('owner_name', e.target.value)}
          className="app-field"
          disabled={disabled}
        />
      </label>

      <label className="app-label">
        Business / brand name
        <input
          required
          value={form.business_name}
          onChange={(e) => set('business_name', e.target.value)}
          className="app-field"
          disabled={disabled}
        />
      </label>

      <label className="app-label">
        Type of business
        <select
          value={form.business_type}
          onChange={(e) => set('business_type', e.target.value)}
          className="app-field"
          disabled={disabled}
        >
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="app-label">
        Business model
        <select
          required
          value={form.business_model}
          onChange={(e) => set('business_model', e.target.value)}
          className="app-field"
          disabled={disabled}
        >
          {BUSINESS_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {form.business_model ? (
        <p className="-mt-3 text-xs text-[var(--app-text-muted)]">
          {BUSINESS_MODEL_HELPERS[form.business_model]}
        </p>
      ) : null}

      <label className="app-label">
        Product you sell
        <input
          value={form.product_sold}
          onChange={(e) => set('product_sold', e.target.value)}
          className="app-field"
          placeholder="e.g. skincare, digital templates, coaching"
          disabled={disabled}
        />
      </label>

      <label className="app-label">
        Your customers
        <textarea
          rows={3}
          value={form.target_customers}
          onChange={(e) => set('target_customers', e.target.value)}
          className="app-field"
          placeholder="Who buys from you? Demographics, niches, regions..."
          disabled={disabled}
        />
      </label>

      <label className="app-label">
        Store / website link
        <input
          type="url"
          value={form.store_url}
          onChange={(e) => set('store_url', e.target.value)}
          className="app-field"
          placeholder="https://"
          disabled={disabled}
        />
      </label>

      {showStoreUrlHint ? (
        <p className="text-xs text-[var(--app-text-muted)]">
          Changing the store URL later clears previous website crawls, scans, and research for the old
          address.
        </p>
      ) : null}

      <fieldset>
        <legend className="app-label mb-3">Statistics</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="app-label">
            Monthly revenue ($)
            <input
              type="number"
              min="0"
              value={form.monthly_revenue}
              onChange={(e) => set('monthly_revenue', e.target.value)}
              className="app-field"
              disabled={disabled}
            />
          </label>
          <label className="app-label">
            Customers
            <input
              type="number"
              min="0"
              value={form.customer_count}
              onChange={(e) => set('customer_count', e.target.value)}
              className="app-field"
              disabled={disabled}
            />
          </label>
          <label className="app-label">
            Monthly orders
            <input
              type="number"
              min="0"
              value={form.monthly_orders}
              onChange={(e) => set('monthly_orders', e.target.value)}
              className="app-field"
              disabled={disabled}
            />
          </label>
        </div>
      </fieldset>
    </div>
  )
}

export default BusinessProfileForm
