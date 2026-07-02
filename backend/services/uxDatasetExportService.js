const CSV_COLUMNS = [
  'url',
  'business_model',
  'scoring_rubric',
  'safety_score',
  'functionality_score',
  'ux_ui_score',
  'business_fit_score',
  'customer_attraction_score',
  'desktop_text_density',
  'mobile_text_density',
  'avg_paragraph_length',
  'max_text_block_length',
  'cta_above_fold',
  'nav_visibility_score',
  'visual_hierarchy_score',
  'readability_score',
  'mobile_usability_score',
  'image_support_score',
  'layout_overflow_score',
  'human_ux_score',
  'human_notes',
]

function escapeCsvValue(value) {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function rowToCsv(row) {
  return CSV_COLUMNS.map((column) => escapeCsvValue(row[column])).join(',')
}

function buildUxDatasetRow({
  url,
  business = {},
  scores = {},
  uxFeatures = {},
  humanUxScore = '',
  humanNotes = '',
} = {}) {
  return {
    url: url || '',
    business_model: business.business_model || '',
    scoring_rubric: scores.scoring_rubric || '',
    safety_score: scores.safety_score ?? '',
    functionality_score: scores.functionality_score ?? '',
    ux_ui_score: scores.ux_ui_score ?? '',
    business_fit_score: scores.business_fit_score ?? '',
    customer_attraction_score: scores.customer_attraction_score ?? '',
    desktop_text_density: uxFeatures.desktop_text_density ?? '',
    mobile_text_density: uxFeatures.mobile_text_density ?? '',
    avg_paragraph_length: uxFeatures.avg_paragraph_length ?? '',
    max_text_block_length: uxFeatures.max_text_block_length ?? '',
    cta_above_fold: uxFeatures.cta_above_fold ?? '',
    nav_visibility_score: uxFeatures.nav_visibility_score ?? '',
    visual_hierarchy_score: uxFeatures.visual_hierarchy_score ?? '',
    readability_score: uxFeatures.readability_score ?? '',
    mobile_usability_score: uxFeatures.mobile_usability_score ?? '',
    image_support_score: uxFeatures.image_support_score ?? '',
    layout_overflow_score: uxFeatures.layout_overflow_score ?? '',
    human_ux_score: humanUxScore,
    human_notes: humanNotes,
  }
}

function buildUxDatasetFromProfile(profile, business = {}) {
  const summary = profile?.summary || {}
  const scores = profile?.scores || {}
  const uxFeatures = profile?.signals?.ux_features || summary.ux_features || {}
  const url = summary.start_url || business.store_url || ''

  return buildUxDatasetRow({
    url,
    business,
    scores,
    uxFeatures,
  })
}

function buildUxDatasetCsv(rows = []) {
  const header = CSV_COLUMNS.join(',')
  const body = rows.map((row) => rowToCsv(row))
  return [header, ...body].join('\n')
}

function buildUxDatasetFromProfiles(profiles = [], businessById = {}) {
  return profiles.map((profile) =>
    buildUxDatasetFromProfile(profile, businessById[profile.business_id] || {}),
  )
}

module.exports = {
  CSV_COLUMNS,
  buildUxDatasetRow,
  buildUxDatasetFromProfile,
  buildUxDatasetFromProfiles,
  buildUxDatasetCsv,
  escapeCsvValue,
}
