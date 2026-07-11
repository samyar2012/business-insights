# Fix Plan Engine — research notes and evidence mapping

This document explains where the Fix Plan Engine's evidence comes from, how it turns raw
score deductions into a small number of meaningful fix items, and how strengths/risks were
made evidence-based instead of generic. No external search (Google Search API or similar) is
used anywhere in this feature — every fix, strength, and risk is derived entirely from data the
analyzer already collected for that scan.

Code:

- `backend/services/analyzerV2/fixPlanEngine.js` — clusters deductions into fix items.
- `backend/services/analyzerV2/evidenceNarrator.js` — rewrites strengths/risks with business
  impact framing.
- `backend/services/analyzerV2/index.js` — wires both into `calculateAnalyzerV2Scores`.
- `backend/services/actionPlanFixBuilder.js` — carries the richer fix fields into stored
  action-item metadata when a user creates a fix plan from a report.

## 1. Evidence sources

Everything the engine uses already exists on the analyzer's output before this feature; the
engine does not call any new data source.

| Source | Where it comes from | What it contains |
| --- | --- | --- |
| Crawler signals | `aggregated.*`, `pages[].extracted_data_json` | HTTPS, contact info, policies, products, pricing, navigation, text length, platform |
| Business-model rubric scoring | `businessModelRubrics.js` (`scoreOfferBusinessFit` and per-model scorers) | Model-specific `evidence[]` (`{ signal, strength, label, detail }`), `problems[]`, `strengths[]`, `recommended_fixes[]` |
| Category scorers | `categoryScorers.js` (`scoreSafetyTrust`, `scoreTechnicalFunctionality`, `scoreUxUiVisual`, `scoreCustomerAttraction`) | Per-category `evidence[]`, `problems[]`, `strengths[]`, and (for customer attraction) a granular `point_breakdown[]` with earned/max/note per sub-signal |
| Visual audit / UX features | `uxFeatureExtractor.js`, `uxVisualScorer.js`, `visualEvidenceService.js` | `readability_problems`, `layout_problems`, `visual_problems`, `hero_heading`, `readability_factors` (paragraph length, text density, section/bullet counts), `visual_evidence_summary` (misaligned images, density confidence) |
| Score caps | `scoreCaps.js` (`CAP_RULES`) | Hard blockers such as unsafe site, homepage down, no readable content, business-model mismatch, severe mobile overflow, no conversion path |
| Benchmark comparison | `websiteBenchmarkService.js` / `benchmarkInterpreter.js` | Gap to average/strong/top on the 20-point human scale, weakest category vs. same-model competitors, `ux_improvement_actions` |

## 2. From deductions to fix items: the clustering model

The old `buildPriorityFixes` (still kept in `explanationBuilder.js` for reference/legacy use)
emitted roughly one fix per `recommended_fixes` string per category — which is close to "one
task per point deducted" for sites with many small issues in the same category.

The Fix Plan Engine instead:

1. **Normalizes every deduction into one evidence pool** (`collectEvents` in
   `fixPlanEngine.js`): cap reasons, category `problems[]`, customer-attraction
   `point_breakdown` zero/penalty entries, and any extra UX-feature problems not already
   surfaced on a category. Every event keeps the exact evidence sentence produced elsewhere in
   the analyzer (e.g. `"Largest text block is 1284 characters and lacks section breaks."`) —
   nothing is reworded at this stage.
2. **Runs a fixed sequence of cluster matchers** (most severe/specific first: unsafe site →
   homepage down → business-model mismatch → no conversion path → mobile overflow → mobile
   readability → weak CTA → missing trust/proof → thin content → no HTTPS → …). Each matcher
   claims any *unclaimed* events whose text matches a pattern grounded in the exact strings the
   scorers already produce, and — once claimed — those events cannot be claimed again by a
   later, more generic matcher. This is what prevents duplicate or one-per-point fixes: five
   different "dense text" evidence lines become **one** `mobile_readability` fix with five
   evidence bullets, not five fixes.
3. **Falls back to a small number of per-category catch-alls** for anything left over
   (`runCategoryCatchAll` for safety/technical/UX/customer-attraction, `runUnclearOffer` for the
   business-fit category), so no real evidence is silently dropped, but it is still grouped into
   one item per category rather than one item per leftover problem.
4. **Optionally adds one benchmark-gap fix** when the site trails same-model competitors by a
   meaningful margin, citing the actual gap and the weakest benchmarked category.
5. **Finalizes each item** with:
   - `title` — plain-language name of the fix (business-model aware for CTA/offer clusters).
   - `category` — one of `safety, functionality, ux_ui, business_fit, customer_attraction,
     trust, content, seo, mobile`.
   - `evidence` — up to 4 of the actual matched evidence sentences (deduplicated).
   - `why_it_matters` — the customer/business impact, using the rubric where relevant.
   - `steps` — 3–6 concrete, deduplicated steps (business-model aware for CTA/offer fixes;
     always padded to at least 3, and a "rescan to confirm" step is added when there's room).
   - `expected_score_lift` — a bounded, evidence-derived estimate computed from the *actual*
     remaining point gap in each affected category (`estimateLift`), not a guess — e.g. a
     category sitting at 12/25 with 2 matched evidence items yields roughly `+2-5 pts`.
   - `affected_scores` — the core analyzer categories this fix would improve.
   - `priority` — `critical` only for hard caps (unsafe site, homepage down, business-model
     mismatch, no conversion path); otherwise derived from how large the gap is in the affected
     category (`priorityFromGap`, same thresholds the old `buildPriorityFixes` used: ≥65% gap =
     critical, ≥45% = high, ≥25% = medium, else low).
   - `difficulty` — `easy | medium | hard`, cluster-specific (e.g. adding a CTA is `easy`;
     fixing mobile overflow or JS-rendered sparse HTML is `hard`).
   - `source` — always `analyzer` (the engine's own output); action items later created from it
     record `source: 'website-report'`, matching existing behavior.
   - `related_pages` — homepage plus up to one category-relevant page (contact/about for trust,
     shop/services for business fit, etc.).
6. Items are sorted by priority and capped at 9, then re-numbered (`rank`). For backward
   compatibility, each item also carries `action` (alias for `title`), `reason` (alias for
   `why_it_matters`), and `expected_impact` (alias for `expected_score_lift`) so existing code
   reading the old `priority_fixes` shape keeps working unchanged.

`scores.priority_fixes` and `scores.fix_plan` are now the same array — `recommended_actions` is
still `fix_plan.map(fix => fix.title)`.

## 3. Evidence-based strengths and risks

`evidenceNarrator.js` takes the deterministic `strengths[]`/`problems[]` that the category
scorers already compute (these are themselves evidence-derived — e.g. "No testimonial or review
proof visible to new visitors." only appears when the crawler found none) and rewrites the small
set of genuinely generic/technical ones into business-impact sentences, for example:

| Generic (before) | Evidence-based (after) |
| --- | --- |
| "Homepage loaded successfully." | "Visitors can reach your homepage and contact/booking paths without errors, which supports local service conversion." *(business-model aware)* |
| "Site is served over HTTPS." | "Visitors see a secure, padlocked connection (HTTPS), avoiding the browser warnings that cause people to leave." |
| "HTTPS was not detected — visitors may see security warnings." | "The site is not served over HTTPS, so browsers show a 'not secure' warning that can scare visitors away before they read anything." |

Any strength/problem string that already reads as a full, impact-framed sentence (contains
words like "visitor", "trust", "convert", "bounce", etc.) is left untouched. Anything else gets a
short, category-specific impact clause appended (e.g. "...This affects whether visitors take the
next step toward becoming a customer.") rather than being dropped or replaced with boilerplate.
Because the underlying strengths/problems differ per site (different signals fire for different
crawls), the narrated strengths/risks differ per site too — verified in
`backend/tests/fixPlanEngine.test.js`.

Risks always resolve to full sentences; if a category has no problems and there are no mismatch
warnings, the list falls back to the single explicit sentence `"No major risks detected from
this crawl."` — never a bare priority label like "Medium impact."

## 4. What intentionally was not changed

- Analyzer scoring itself (`categoryScorers.js`, `businessModelRubrics.js`, `scoreCaps.js`,
  `uxVisualScorer.js`) is untouched — this feature only consumes their output.
- The legacy `buildPriorityFixes` / `buildStrengthsList` / `buildRisksList` in
  `explanationBuilder.js` are kept (unused by the v2 path now) so the `businessProfileLogic.js`
  legacy fallback path, which has its own local implementations, is unaffected.
- No Google Search API, or any other external web lookup, is used by the Fix Plan Engine.

## 5. Tests

`backend/tests/fixPlanEngine.test.js` covers:

- Each of the three example clusters from the product brief (dense mobile text → one
  "Improve mobile readability above the fold." fix; weak CTA → one "Make the primary customer
  action clearer." fix; missing contact/proof → one "Add stronger trust and proof signals."
  fix), asserting real evidence with numbers is attached, not placeholder text.
- That many raw problems collapse into a materially smaller number of fix items (clustering,
  not one-per-point), while every raw problem still shows up as evidence somewhere.
- That two different site fixtures (`trustGap` vs. a dense-mobile-text service site) produce
  different fix-plan titles, different strengths, and different risks end-to-end through
  `calculateAnalyzerV2Scores`.
- That every fix item is fully-formed against the required schema (title, category, evidence,
  why_it_matters, steps 3–6, expected_score_lift, affected_scores, priority, difficulty,
  source).
- That generic strengths get rewritten with business-impact language, and risks are never a bare
  priority label.
