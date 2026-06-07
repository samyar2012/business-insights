export const CHURN_FIELDS = [
  'InternetService',
  'OnlineSecurity',
  'OnlineBackup',
  'DeviceProtection',
  'TechSupport',
  'StreamingTV',
  'StreamingMovies',
  'Contract',
  'PaymentMethod',
  'PaperlessBilling',
  'tenure',
  'MonthlyCharges',
]

export const CHURN_DEFAULTS = {
  InternetService: 'Fiber optic',
  OnlineSecurity: 'No',
  OnlineBackup: 'No',
  DeviceProtection: 'No',
  TechSupport: 'No',
  StreamingTV: 'No',
  StreamingMovies: 'No',
  Contract: 'Month-to-month',
  PaymentMethod: 'Electronic check',
  PaperlessBilling: 'Yes',
  tenure: 12,
  MonthlyCharges: 70,
}

export const TOOL_CATALOG = [
  {
    slug: 'churn-prediction',
    to: '/app/tools/churn-prediction',
    title: 'Churn prediction',
    tagline: 'Score at-risk customers before they leave.',
    description:
      'Feed customer feature data into our model and get instant churn probability scores to prioritize retention.',
    icon: '◎',
    accent: 'indigo',
  },
  {
    slug: 'file-analyze',
    to: '/app/tools/file-analyze',
    title: 'File analyze',
    tagline: 'Upload CSV or PDF for automated insights.',
    description:
      'Drop in exports from your CRM or billing system and receive structured analysis without manual spreadsheets.',
    icon: '▤',
    accent: 'blue',
  },
  {
    slug: 'ai-coach',
    to: '/app/tools/ai-coach',
    title: 'AI coach',
    tagline: 'Strategy guidance tailored to your business.',
    description:
      'Ask retention questions and get actionable playbooks — from win-back campaigns to pricing experiments.',
    icon: '✦',
    accent: 'violet',
  },
]
