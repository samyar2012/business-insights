# Growth Plan Engine research notes

Business Insights now generates a `growth_plan` (while keeping `fix_plan` for compatibility).
The growth roadmap uses four pillars:

- Acquire
- Convert
- Retain
- Operate

Each growth step contains:

- `pillar`
- `title`
- `why_it_matters`
- `evidence`
- `steps`
- `expected_business_outcome`
- `affected_scores`
- `expected_score_lift` (when relevant)
- `difficulty`
- `rank` / step ordering
- `unlock_reason`
- `ask_ai_prompt`

## Evidence model

The engine does not call external search APIs. It uses existing analyzer outputs:

- crawler and extraction signals
- onboarding business model
- category score deductions
- cap reasons and benchmark gaps
- website report evidence and risks

## Research basis used in roadmap narrative

The growth narrative and rationale are grounded in:

- Nielsen Norman Group usability heuristics and scanning behavior research
- Stanford Web Credibility Guidelines / Stanford Web Credibility Project
- Baymard Institute ecommerce UX and checkout trust research
- Think with Google mobile and local intent research
- Dark-patterns trust research (deceptive pattern impact on trust and conversion)

The engine references these sources through `research_basis` text attached to plan items so users
can understand why each step is ordered and how it supports customer growth.

## Product direction

The roadmap intentionally goes beyond website repair:

- Acquire: visibility and demand generation foundations
- Convert: turning traffic into calls/bookings/checkouts
- Retain: repeat and referral loops
- Operate: response and fulfillment readiness as demand grows

This keeps current Website Analyzer output useful today while leaving room for future tools
(business scanner, content generation, competitor tracking, social analysis, and later desktop file
analysis) to feed the same roadmap.
