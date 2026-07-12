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

## 2b. Sequencing: "do this first, so it unlocks the next fix" instead of flat priority labels

A flat `critical/high/medium/low` label does not tell a business owner *why* one fix comes before
another, and several fixes actively undermine each other if done out of order (polishing layout on
a site that is still flagged unsafe, or fixing a CTA that mobile visitors can't scroll to). The
engine now orders fixes into dependency-aware waves (`TIER_SEQUENCE` in `fixPlanEngine.js`):

1. Hard blockers (unsafe site, homepage down, business-model mismatch, no conversion path)
2. Security foundation (no HTTPS)
3. Mobile essentials (no viewport tag, overflow, dense/unreadable mobile text)
4. Conversion & trust signals (weak CTA, missing contact/proof, unclear offer)
5. Content & technical depth (thin content, JS-rendered sparse HTML, weak SEO meta, and the
   per-category catch-alls)
6. Visual polish (nav clutter, visual polish, misaligned images)
7. Competitive benchmark gap (only once the site is otherwise ahead on fundamentals)

Within a wave, items are still ordered by how large the underlying score gap is (same
`priorityFromGap` computation as before) so severity still matters — the waves just make sure a
security blocker is never sequenced after a nav-spacing tweak. Each finalized item gets an
`unlock_reason` string instead of (or in addition to) a bare priority word:

- Rank 1 always reads `"Do this first - ..."` / `"Start here - ..."`.
- The first item in a new wave reads `"Unlocked now - ..."`, explaining what became possible
  because the earlier wave is assumed done.
- Items in the same wave as the previous one read `"Tackle this right after Fix #N - it is part
  of the same fix wave, so handle both together."`

`priority` is still computed and stored (action items still need it for the existing
open/high-priority dashboard metric), but the customer-facing plan leads with rank + unlock
reasoning, not the priority word.

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

## 3b. Research grounding: why a fix matters, per business type

A flat `why_it_matters` sentence explains the fix but not *why the underlying customer behavior
is true*, and what actually drives attraction/conversion genuinely differs by business type (an
online store lives and dies on cart abandonment; a local service business lives and dies on
phone/booking friction; a gallery/portfolio business lives and dies on inquiry-to-work proximity).

Each finalized fix item now also carries a `research_basis` string (`RESEARCH_BASIS` /
`researchBasisFor()` in `fixPlanEngine.js`). Every entry names a specific published study and,
where the study gives one, its actual number — each of these can be verified with a web search
of the source name plus the stat:

| Source | Finding used | Search check |
| --- | --- | --- |
| Baymard Institute | Running average across ~50 studies puts cart abandonment near 70%; ~1 in 5 US shoppers have abandoned checkout because they didn't trust the site with card details | "Baymard cart abandonment rate", "Baymard didn't trust the site with credit card" |
| Google/SOASTA (2017) | Bounce probability rises 32% as mobile load time goes 1s → 3s (900k+ landing pages) | "Google SOASTA bounce rate 32%" |
| Google | 53% of mobile visits abandoned when a page takes over 3 seconds; mobile-first indexing ranks the mobile version | "Google 53% mobile 3 seconds" |
| Think with Google | 76% of people who search for something nearby on their phone visit a related business within a day | "Think with Google 76% nearby search visit" |
| Nielsen Norman Group | Most visitors leave within 10–20 seconds unless value is clear; eye-tracking shows users read only ~20% of words on a page | "NNG how long do users stay on web pages", "Nielsen users read 20 percent" |
| Stanford Web Credibility Research (Fogg et al., 2,600+ participants) | 46% of consumers assessed site credibility from visual design; trust judged within moments from contact info and outside proof | "Stanford web credibility study 46%" |
| BrightLocal Local Consumer Review Survey (annual) | Nearly all consumers read online reviews for local businesses; most have a minimum star rating they will consider | "BrightLocal local consumer review survey" |
| Sistrix (80M+ clicks) | First organic result takes ~28% of clicks with steep drop-off | "Sistrix first position 28% CTR" |
| Data & Marketing Association | Email marketing returns roughly 42:1 per unit spent | "DMA email ROI 42" |
| Google search documentation | "Thin content with little or no added value" is explicitly filtered; helpful-content system rewards substantive first-hand detail | Google Search Central docs |

The basis is picked per `(category, business rubric)` pair, so an ecommerce site's "missing
trust signals" fix cites Baymard's payment-trust abandonment number while a local service
business's version cites BrightLocal's review-reading behavior — not the same recycled sentence.
Rule: never invent a percentage or attribute a claim to a source that did not publish it.

**Design fixes are capped.** The plan is meant to grow the business, not restyle it: at most one
visual-polish item (`nav_clutter` / `visual_polish` / `misaligned_images`) survives into the
final plan (the strongest one, with the others' evidence folded into it), and it is always
sequenced after conversion/trust work.

The trust-signal (`missing_contact_trust`) and content-depth (`thin_content`) clusters also gained
business-model-specific `steps` (`TRUST_STEPS_BY_RUBRIC`, `CONTENT_STEPS_BY_RUBRIC`) so "add proof"
means reviews + shipping policy for a store, reviews + service-area statement for a local service
business, and portfolio credibility + an artist statement for a gallery business, instead of one
shared checklist for every business type.

Covered by `"grounds each fix in attributed UX/conversion research that varies by business
model, not a flat generic label"` in `backend/tests/fixPlanEngine.test.js`, which asserts the
research basis differs between an ecommerce store and a local service business fixture, is a
substantive sentence (not a priority label), and that rubric-specific steps actually differ.

## 4. What intentionally was not changed

- Analyzer scoring itself (`categoryScorers.js`, `businessModelRubrics.js`, `scoreCaps.js`,
  `uxVisualScorer.js`) is untouched — this feature only consumes their output.
- The legacy `buildPriorityFixes` / `buildStrengthsList` / `buildRisksList` in
  `explanationBuilder.js` are kept (unused by the v2 path now) so the `businessProfileLogic.js`
  legacy fallback path, which has its own local implementations, is unaffected.
- No Google Search API, or any other external web lookup, is used by the Fix Plan Engine.

## 4b. Internal ops text must never reach the customer-facing plan

`categoryScorers.js` and `businessProfileLogic.js` previously surfaced
`"Configure GOOGLE_SAFE_BROWSING_API_KEY for live threat verification."` as a customer-facing
"problem" and "recommended fix" whenever our own Safe Browsing API key was not configured. That is
an internal ops/config detail — the business owner cannot set an environment variable on our
server — so it was removed at the source (the missing-key case still lowers scoring *confidence*
internally, it just no longer becomes a fix-plan item). `fixPlanEngine.js` also adds a defensive
`INTERNAL_TEXT_PATTERN` filter (`sanitize()`) on every evidence/step string as a second layer, so
any future `_API_KEY` / `process.env` / `GOOGLE_SAFE_BROWSING` style string can never reach a fix
plan even if a scorer regresses. Covered by
`"never lets internal ops/config strings (API keys, env vars) leak into evidence or steps"` in
`backend/tests/fixPlanEngine.test.js`.

## 5. Tests

`backend/tests/fixPlanEngine.test.js` covers:

- Each of the three example clusters from the product brief (dense mobile text → one
  "Improve mobile readability above the fold." fix; weak CTA → one "Make the primary customer
  action clearer." fix; missing contact/proof → one "Add stronger trust and proof signals."
  fix), asserting real evidence with numbers is attached, not placeholder text.
- That many raw problems collapse into a materially smaller number of fix items (clustering,
  not one-per-point), while every raw problem still shows up as evidence somewhere.
- That fixes are sequenced into dependency-aware waves (e.g. HTTPS before mobile readability
  before visual polish) and every item carries a non-generic `unlock_reason`, with rank 1 always
  reading "do this first".
- That internal ops/config strings (API keys, env vars) can never leak into evidence or steps.
- That two different site fixtures (`trustGap` vs. a dense-mobile-text service site) produce
  different fix-plan titles, different strengths, and different risks end-to-end through
  `calculateAnalyzerV2Scores`.
- That every fix item is fully-formed against the required schema (title, category, evidence,
  why_it_matters, steps 3–6, expected_score_lift, affected_scores, priority, difficulty, source,
  rank, unlock_reason).
- That generic strengths get rewritten with business-impact language, and risks are never a bare
  priority label.
