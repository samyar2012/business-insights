# UX Model Training Scaffold

This folder is the starting point for training a supervised UX scoring model from exported website scan data.

## Dataset source

Export rows with `backend/services/uxDatasetExportService.js`:

- `buildUxDatasetRow()` — single scan row
- `buildUxDatasetFromProfile()` — row from a persisted `business_web_profiles` record
- `buildUxDatasetCsv()` — CSV string for download or file export

Run scans with `VISUAL_AUDIT_ENABLED=true` and Playwright installed so `ux_features` are populated from rendered desktop/mobile viewports.

## CSV columns

| Column | Description |
|--------|-------------|
| `url` | Scanned homepage/start URL |
| `business_model` | Business model from profile |
| `scoring_rubric` | Rubric used for weighted scoring |
| `safety_score` | Safety category (0–30) |
| `functionality_score` | Functionality category (0–20) |
| `ux_ui_score` | Current deterministic UX/UI score (0–20) |
| `business_fit_score` | Business fit category (0–20) |
| `customer_attraction_score` | Customer attraction category (0–10) |
| `desktop_text_density` | Visible text density on desktop viewport |
| `mobile_text_density` | Visible text density on mobile viewport |
| `avg_paragraph_length` | Average text block length (characters) |
| `max_text_block_length` | Longest text block (characters) |
| `cta_above_fold` | Whether a CTA is visible above the fold |
| `nav_visibility_score` | 0–100 nav visibility sub-score |
| `visual_hierarchy_score` | 0–100 heading hierarchy sub-score |
| `readability_score` | 0–100 readability sub-score |
| `mobile_usability_score` | 0–100 mobile usability sub-score |
| `image_support_score` | 0–100 image support sub-score |
| `layout_overflow_score` | 0–100 layout/overflow sub-score |
| `human_ux_score` | **Label column** — human rating (blank until labeled) |
| `human_notes` | Reviewer notes (blank until labeled) |

## How to label `human_ux_score`

1. Open the exported URL in desktop and mobile viewports.
2. Rate overall UX quality on a **0–100** scale:
   - **0–39** — Hard to use, unclear hierarchy, poor mobile layout
   - **40–69** — Usable but weak CTAs, dense copy, or layout issues
   - **70–89** — Clear navigation, readable copy, visible primary CTA
   - **90–100** — Excellent hierarchy, accessibility, and mobile experience
3. Record short rationale in `human_notes` (e.g. "CTA below fold on mobile", "Strong hero + nav").
4. Leave `human_ux_score` blank for rows you have not reviewed yet.

Aim for at least **50–100 labeled rows** before expecting stable model performance.

## Recommended first model

Start with scikit-learn tabular regressors on numeric/boolean feature columns:

```python
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import pandas as pd

FEATURES = [
    "desktop_text_density", "mobile_text_density",
    "avg_paragraph_length", "max_text_block_length",
    "cta_above_fold", "nav_visibility_score",
    "visual_hierarchy_score", "readability_score",
    "mobile_usability_score", "image_support_score",
    "layout_overflow_score",
]

df = pd.read_csv("ux_training_export.csv")
df = df[df["human_ux_score"].notna()]
X = df[FEATURES].fillna(0)
y = df["human_ux_score"]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

model = GradientBoostingRegressor(random_state=42)
# model = RandomForestRegressor(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

pred = model.predict(X_test)
print("MAE", mean_absolute_error(y_test, pred))
print("R2", r2_score(y_test, pred))
```

**Training target:** `human_ux_score`

**Future prediction output:**

- `predicted_ux_score` — model estimate (0–100)
- `confidence` — e.g. tree variance, prediction interval width, or distance to training distribution

## Integration path (later)

1. Export labeled CSV from production/staging scans.
2. Train and evaluate in this folder (`ml/ux_model/`).
3. Serialize model (`.joblib` or ONNX).
4. Add a small Python inference service or batch scorer that writes `predicted_ux_score` back into scan metadata.
5. Blend ML prediction with deterministic `overall_static_ux_score` only after offline evaluation shows improvement over static scoring.

## Dependencies (local training only)

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install pandas scikit-learn joblib
```

No paid APIs or OpenAI are required for this training scaffold.
