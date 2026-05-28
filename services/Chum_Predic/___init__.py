"""
Production-oriented business diagnostics model for ecommerce stores.

Key capabilities:
- Train on business KPI data to predict customer-loss risk.
- Choose best model via cross-validation (ROC-AUC).
- Calibrate probabilities for better decision quality.
- Return actionable recommendations + confidence scores.

Default dataset schema:
  monthly_sessions, conversion_rate, repeat_customer_rate,
  avg_delivery_days, ad_spend_to_revenue_pct, refund_rate,
  will_lose_customers (0/1)
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

DIR_PATH = Path(__file__).resolve().parent
DEFAULT_DATASET = DIR_PATH / "business_metrics.csv"
ARTIFACT_PATH = DIR_PATH / "business_health_model_artifact.joblib"
METRICS_PATH = DIR_PATH / "business_health_model_metrics.json"

FEATURES = [
    "monthly_sessions",
    "conversion_rate",
    "repeat_customer_rate",
    "avg_delivery_days",
    "ad_spend_to_revenue_pct",
    "refund_rate",
]
TARGET_COL = "will_lose_customers"


def _ensure_dataset(path: Path) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(
            f"Missing dataset at {path}. Add a CSV with columns: {FEATURES + [TARGET_COL]}"
        )
    df = pd.read_csv(path)
    missing = [c for c in FEATURES + [TARGET_COL] if c not in df.columns]
    if missing:
        raise KeyError(f"Dataset missing required columns: {missing}")
    return df


def _clean_dataset(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    out = df.copy()
    for col in FEATURES:
        out[col] = pd.to_numeric(out[col], errors="coerce")
    out[TARGET_COL] = pd.to_numeric(out[TARGET_COL], errors="coerce")
    out = out.dropna(subset=FEATURES + [TARGET_COL])
    out[TARGET_COL] = out[TARGET_COL].astype(int).clip(lower=0, upper=1)
    X = out[FEATURES]
    y = out[TARGET_COL]
    return X, y


def _candidate_models(seed: int) -> dict[str, Any]:
    return {
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            max_iter=450,
            learning_rate=0.05,
            max_depth=8,
            min_samples_leaf=20,
            random_state=seed,
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=700,
            random_state=seed,
            n_jobs=-1,
            class_weight="balanced_subsample",
            min_samples_leaf=4,
        ),
        "logistic_regression": Pipeline(
            [
                ("scale", StandardScaler()),
                (
                    "clf",
                    LogisticRegression(
                        max_iter=2000,
                        class_weight="balanced",
                        solver="lbfgs",
                    ),
                ),
            ]
        ),
    }


def _pick_best_model(X: pd.DataFrame, y: pd.Series, seed: int) -> tuple[str, Any, dict[str, float]]:
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    scores: dict[str, float] = {}
    models = _candidate_models(seed)

    for name, model in models.items():
        auc = cross_val_score(model, X, y, cv=cv, scoring="roc_auc", n_jobs=-1)
        scores[name] = float(auc.mean())

    best_name = max(scores, key=scores.get)
    return best_name, models[best_name], scores


def _build_recommendations(values: dict[str, float]) -> list[dict[str, str]]:
    recs: list[dict[str, str]] = []

    if values["conversion_rate"] < 1.5:
        recs.append(
            {
                "priority": "high",
                "problem": "Low conversion rate",
                "action": "Improve product page message-match, trust blocks, and checkout friction points.",
            }
        )
    if values["repeat_customer_rate"] < 22:
        recs.append(
            {
                "priority": "high",
                "problem": "Weak repeat purchase loop",
                "action": "Launch post-purchase email/SMS journeys with reorder timing by product lifecycle.",
            }
        )
    if values["ad_spend_to_revenue_pct"] > 30:
        recs.append(
            {
                "priority": "high",
                "problem": "Ad spend pressure",
                "action": "Trim low-margin campaigns and optimize creatives by contribution margin, not only ROAS.",
            }
        )
    if values["avg_delivery_days"] > 6:
        recs.append(
            {
                "priority": "medium",
                "problem": "Slow fulfillment",
                "action": "Route top SKUs to faster suppliers and show ETA explicitly before checkout.",
            }
        )
    if values["refund_rate"] > 5:
        recs.append(
            {
                "priority": "medium",
                "problem": "High refund rate",
                "action": "Improve expectation setting with better media, sizing, and product clarification.",
            }
        )
    if values["monthly_sessions"] < 10000:
        recs.append(
            {
                "priority": "low",
                "problem": "Low qualified traffic",
                "action": "Add one consistent organic channel to stabilize acquisition costs.",
            }
        )
    if not recs:
        recs.append(
            {
                "priority": "low",
                "problem": "No major red flags detected",
                "action": "Maintain weekly experimentation cadence across offers, landing pages, and lifecycle flows.",
            }
        )
    return recs


def _health_score(values: dict[str, float], risk_probability: float) -> int:
    score = int(round((1.0 - risk_probability) * 100))
    if values["conversion_rate"] < 1.5:
        score -= 7
    if values["repeat_customer_r te"] < 22:
        score -= 8
    if values["ad_spend_to_revenue_pct"] > 30:
        score -= 7
    if values["avg_delivery_days"] > 6:
        score -= 6
    if values["refund_rate"] > 5:
        score -= 6
    return max(0, min(100, score))


def train_business_model(
    dataset_path: Path = DEFAULT_DATASET,
    test_size: float = 0.2,
    random_state: int = 42,
) -> dict[str, Any]:
    df = _ensure_dataset(dataset_path)
    X, y = _clean_dataset(df)
    if y.nunique() < 2:
        raise ValueError("Dataset must contain both classes (0 and 1) in will_lose_customers.")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=y,
    )

    best_name, best_model, cv_scores = _pick_best_model(X_train, y_train, random_state)
    calibrated = CalibratedClassifierCV(best_model, method="sigmoid", cv=3)
    calibrated.fit(X_train, y_train)

    y_prob = calibrated.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="binary", zero_division=0
    )
    metrics = {
        "selected_model": best_name,
        "candidate_cv_auc": cv_scores,
        "holdout_accuracy": float(accuracy_score(y_test, y_pred)),
        "holdout_auc": float(roc_auc_score(y_test, y_prob)),
        "holdout_brier_loss": float(brier_score_loss(y_test, y_prob)),
        "holdout_precision": float(precision),
        "holdout_recall": float(recall),
        "holdout_f1": float(f1),
        "dataset": dataset_path.name,
        "n_rows": int(len(X)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "features": FEATURES,
        "target_col": TARGET_COL,
    }

    artifact = {
        "model": calibrated,
        "features": FEATURES,
        "target_col": TARGET_COL,
        "metrics": metrics,
    }
    joblib.dump(artifact, ARTIFACT_PATH)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return metrics


def predict_business_risk(user_values: dict[str, Any]) -> dict[str, Any]:
    if not ARTIFACT_PATH.is_file():
        raise FileNotFoundError(f"Train first; missing artifact: {ARTIFACT_PATH.name}")
    art = joblib.load(ARTIFACT_PATH)
    model = art["model"]
    features = art["features"]

    missing = [f for f in features if f not in user_values]
    if missing:
        raise KeyError(f"Missing keys for prediction: {missing}")

    values = {f: float(user_values[f]) for f in features}
    row = pd.DataFrame([values])[features]
    risk_prob = float(model.predict_proba(row)[0, 1])
    will_lose = bool(risk_prob >= 0.5)
    confidence = float(abs(risk_prob - 0.5) * 2.0)
    score = _health_score(values, risk_prob)

    return {
        "probability_customer_loss": risk_prob,
        "will_lose_customers": will_lose,
        "confidence": confidence,
        "health_score": score,
        "status": "critical" if score < 45 else "warning" if score < 65 else "healthy",
        "recommendations": _build_recommendations(values),
        "model_info": {
            "selected_model": art.get("metrics", {}).get("selected_model"),
            "holdout_auc": art.get("metrics", {}).get("holdout_auc"),
        },
    }


def bootstrap_sample_dataset(output_path: Path, rows: int = 800, seed: int = 42) -> None:
    rng = np.random.default_rng(seed)
    data = {
        "monthly_sessions": rng.integers(2000, 150000, size=rows),
        "conversion_rate": rng.normal(2.0, 0.8, size=rows).clip(0.2, 8.0),
        "repeat_customer_rate": rng.normal(24.0, 10.0, size=rows).clip(1.0, 80.0),
        "avg_delivery_days": rng.normal(5.5, 2.0, size=rows).clip(1.0, 20.0),
        "ad_spend_to_revenue_pct": rng.normal(26.0, 10.0, size=rows).clip(2.0, 90.0),
        "refund_rate": rng.normal(4.0, 2.0, size=rows).clip(0.1, 30.0),
    }
    df = pd.DataFrame(data)
    risk_raw = (
        (1.6 - df["conversion_rate"]) * 0.25
        + (22 - df["repeat_customer_rate"]) * 0.03
        + (df["avg_delivery_days"] - 5.5) * 0.08
        + (df["ad_spend_to_revenue_pct"] - 26) * 0.025
        + (df["refund_rate"] - 4) * 0.08
    )
    prob = 1 / (1 + np.exp(-risk_raw))
    df[TARGET_COL] = (rng.random(rows) < prob).astype(int)
    df.to_csv(output_path, index=False)


# Legacy compatibility names
def train_churn_model(*args, **kwargs):  # type: ignore[no-untyped-def]
    return train_business_model(*args, **kwargs)


def predict_churn(user_values: dict[str, Any]) -> dict[str, Any]:
    return predict_business_risk(user_values)


def _predict_interactive() -> None:
    print("Enter business metrics:")
    vals: dict[str, float] = {}
    prompts = {
        "monthly_sessions": "Monthly sessions",
        "conversion_rate": "Conversion rate (%)",
        "repeat_customer_rate": "Repeat customer rate (%)",
        "avg_delivery_days": "Average delivery days",
        "ad_spend_to_revenue_pct": "Ad spend/revenue (%)",
        "refund_rate": "Refund rate (%)",
    }
    for key in FEATURES:
        vals[key] = float(input(f"{prompts[key]}: ").strip())
    print(json.dumps(predict_business_risk(vals), indent=2))


def main() -> None:
    p = argparse.ArgumentParser(description="Business diagnostics model")
    sub = p.add_subparsers(dest="cmd")

    t = sub.add_parser("train", help="Train and save business model")
    t.add_argument("--dataset", type=str, default=str(DEFAULT_DATASET))
    t.add_argument("--test-size", type=float, default=0.2)
    t.add_argument("--seed", type=int, default=42)

    b = sub.add_parser("bootstrap-data", help="Generate a starter training dataset")
    b.add_argument("--output", type=str, default=str(DEFAULT_DATASET))
    b.add_argument("--rows", type=int, default=800)
    b.add_argument("--seed", type=int, default=42)

    sub.add_parser("predict", help="Interactive prediction")

    args = p.parse_args()
    if args.cmd == "predict":
        _predict_interactive()
        return
    if args.cmd == "bootstrap-data":
        output = Path(args.output)
        bootstrap_sample_dataset(output, rows=int(args.rows), seed=int(args.seed))
        print(f"Wrote sample dataset: {output}")
        return

    dataset = Path(getattr(args, "dataset", str(DEFAULT_DATASET)))
    metrics = train_business_model(
        dataset_path=dataset,
        test_size=float(getattr(args, "test_size", 0.2)),
        random_state=int(getattr(args, "seed", 42)),
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
