"""Train a baseline UX scoring model from ux_training_dataset.csv.

This is a starter model. Use it after you have manually labeled enough rows
with `human_ux_score`.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DATASET_COLUMNS = [
    "url",
    "business_model",
    "scoring_rubric",
    "safety_score",
    "functionality_score",
    "ux_ui_score",
    "ui_score",
    "business_fit_score",
    "customer_attraction_score",
    "desktop_text_density_score",
    "mobile_text_density_score",
    "average_paragraph_length",
    "max_text_block_length",
    "cta_above_fold",
    "navbar_visibility_score",
    "visual_hierarchy_score",
    "readability_score",
    "mobile_usability_score",
    "image_support_score",
    "layout_overflow_score",
    "human_ux_score",
]

NUMERIC_FEATURES = [
    "safety_score",
    "functionality_score",
    "ux_ui_score",
    "ui_score",
    "business_fit_score",
    "customer_attraction_score",
    "desktop_text_density_score",
    "mobile_text_density_score",
    "average_paragraph_length",
    "max_text_block_length",
    "navbar_visibility_score",
    "visual_hierarchy_score",
    "readability_score",
    "mobile_usability_score",
    "image_support_score",
    "layout_overflow_score",
]

CATEGORICAL_FEATURES = [
    "business_model",
    "scoring_rubric",
    "cta_above_fold",
]


def load_dataset(path: Path) -> pd.DataFrame:
    data = pd.read_csv(path)
    missing = [column for column in DATASET_COLUMNS if column not in data.columns]
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")
    data = data.dropna(subset=["human_ux_score"]).copy()
    if data.empty:
        raise ValueError("No labeled rows found. Fill human_ux_score before training.")
    return data


WEAK_LABEL_WARNING = (
    "Warning: human_ux_score appears to be generated from app scores, "
    "not manually labeled human scores."
)


def normalize_target_score(y: pd.Series) -> tuple[pd.Series, str]:
    """Normalize human_ux_score into a 0-100 scale.

    - If max <= 20, treat as 0-20 and multiply by 5.
    - If max <= 100, treat as already 0-100.
    - If max > 100, fail fast.
    """
    numeric = pd.to_numeric(y, errors="raise").astype(float)
    max_score = float(numeric.max())
    min_score = float(numeric.min())

    if max_score <= 20:
        print("Detected 0-20 target scale. Normalizing human_ux_score to 0-100 for training.")
        return numeric * 5.0, "0-20"
    if max_score <= 100:
        print("Detected target scale: 0-100 (no normalization needed).")
        return numeric, "0-100"
    raise ValueError(
        f"Invalid human_ux_score range: min={min_score:.2f}, max={max_score:.2f}. "
        "Values must be in 0-20 or 0-100 scale."
    )


def has_weak_label_evidence(data: pd.DataFrame, allow_weak_labels: bool) -> bool:
    if allow_weak_labels:
        return True
    if "target_source" in data.columns:
        if data["target_source"].astype(str).str.contains("weak_label", case=False, na=False).any():
            return True
    if "human_notes" in data.columns:
        if data["human_notes"].astype(str).str.contains("AUTO WEAK LABEL", case=False, na=False).any():
            return True
    return False


def maybe_print_weak_label_warning(
    data: pd.DataFrame,
    *,
    allow_weak_labels: bool,
    labels_are_human: bool,
) -> None:
    if labels_are_human:
        return
    if has_weak_label_evidence(data, allow_weak_labels):
        print(WEAK_LABEL_WARNING)


def build_preprocessor() -> ColumnTransformer:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    return ColumnTransformer(
        transformers=[
            ("num", numeric_pipeline, NUMERIC_FEATURES),
            ("cat", categorical_pipeline, CATEGORICAL_FEATURES),
        ]
    )


def choose_model(kind: str):
    if kind == "linear":
        return LinearRegression()
    if kind == "gradient_boosting":
        return GradientBoostingRegressor(random_state=42)
    if kind == "logistic":
        return LogisticRegression(max_iter=1000)
    return RandomForestRegressor(n_estimators=300, random_state=42, min_samples_leaf=2)


def regression_metrics(y_true, y_pred) -> dict:
    return {
        "mae": round(mean_absolute_error(y_true, y_pred), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 4),
        "r2": round(r2_score(y_true, y_pred), 4),
    }


def classification_metrics(y_true, y_pred) -> dict:
    precision, recall, fscore, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        average="weighted",
        zero_division=0,
    )
    support_value = int(len(y_true)) if support is None else int(np.sum(support))
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "precision": round(precision_score(y_true, y_pred, average="weighted", zero_division=0), 4),
        "recall": round(recall_score(y_true, y_pred, average="weighted", zero_division=0), 4),
        "f1": round(f1_score(y_true, y_pred, average="weighted", zero_division=0), 4),
        "precision_recall_fscore_support": {
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "fscore": round(float(fscore), 4),
            "support": support_value,
        },
    }


def train(
    dataset_path: Path,
    output_path: Path,
    model_kind: str,
    *,
    allow_weak_labels: bool = False,
    labels_are_human: bool = False,
) -> None:
    data = load_dataset(dataset_path)
    features = NUMERIC_FEATURES + CATEGORICAL_FEATURES
    x = data[features]
    y, detected_scale = normalize_target_score(data["human_ux_score"])
    maybe_print_weak_label_warning(
        data,
        allow_weak_labels=allow_weak_labels,
        labels_are_human=labels_are_human,
    )
    print(f"Training rows: {len(data)}")
    print(f"Target scale used for training: normalized to 0-100 (source: {detected_scale})")

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
    )

    model = Pipeline(
        steps=[
            ("preprocess", build_preprocessor()),
            ("model", choose_model(model_kind)),
        ]
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    print("Regression metrics:", regression_metrics(y_test, predictions))

    # Optional classification-style readout for "good UX" threshold.
    y_test_class = (y_test >= 70).astype(int)
    pred_class = (predictions >= 70).astype(int)
    print("Classification metrics:", classification_metrics(y_test_class, pred_class))

    # Brier score is useful when predictions are normalized into a probability-like value.
    pred_probability = np.clip(predictions / 100.0, 0.0, 1.0)
    print("Brier score:", round(brier_score_loss(y_test_class, pred_probability), 4))
    prob_true, prob_pred = calibration_curve(y_test_class, pred_probability, n_bins=5)
    print("Calibration true:", np.round(prob_true, 4).tolist())
    print("Calibration predicted:", np.round(prob_pred, 4).tolist())

    output_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, output_path)
    print(f"Saved model to {output_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="ux_training_dataset.csv")
    parser.add_argument("--output", default="models/ux_score_model.joblib")
    parser.add_argument(
        "--model",
        choices=["random_forest", "gradient_boosting", "linear", "logistic"],
        default="random_forest",
    )
    parser.add_argument(
        "--allow-weak-labels",
        action="store_true",
        help="Allow training with weak/auto-generated labels (prints a warning).",
    )
    parser.add_argument(
        "--labels-are-human",
        action="store_true",
        help="Suppress weak-label warnings when labels were manually verified.",
    )
    args = parser.parse_args()

    train(
        Path(args.dataset),
        Path(args.output),
        args.model,
        allow_weak_labels=args.allow_weak_labels,
        labels_are_human=args.labels_are_human,
    )


if __name__ == "__main__":
    main()

