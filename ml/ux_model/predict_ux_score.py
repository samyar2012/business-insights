"""Predict UX score from feature JSON passed on stdin."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

MODEL_VERSION = "ux_score_model_v1"
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "models" / "ux_score_model.joblib"
FALLBACK_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "ux_score_model.joblib"

FEATURE_COLUMNS = [
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
    "business_model",
    "scoring_rubric",
]


def resolve_model_path(payload: dict) -> Path:
    configured = payload.get("model_path")
    if configured:
        return Path(configured)
    if DEFAULT_MODEL_PATH.exists():
        return DEFAULT_MODEL_PATH
    return FALLBACK_MODEL_PATH


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def predict_with_confidence(pipeline, frame: pd.DataFrame) -> tuple[float, float, list[str]]:
    notes: list[str] = []
    preprocess = pipeline.named_steps["preprocess"]
    model = pipeline.named_steps["model"]
    transformed = preprocess.transform(frame)

    if hasattr(model, "estimators_"):
        tree_preds = np.array([tree.predict(transformed) for tree in model.estimators_])
        prediction = float(np.mean(tree_preds))
        spread = float(np.std(tree_preds))
        confidence = clamp(1.0 - (spread / 25.0), 0.05, 0.95)
        if spread > 12:
            notes.append("Model tree predictions varied widely for this input.")
        return prediction, confidence, notes

    prediction = float(model.predict(transformed)[0])
    notes.append("Confidence uses baseline model reliability because estimator spread is unavailable.")
    return prediction, 0.14, notes


def build_frame(payload: dict) -> pd.DataFrame:
    row = {column: payload.get(column) for column in FEATURE_COLUMNS}
    return pd.DataFrame([row])


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        model_path = resolve_model_path(payload)
        if not model_path.exists():
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": f"Model file not found: {model_path}",
                        "model_version": MODEL_VERSION,
                    }
                )
            )
            return 1

        pipeline = joblib.load(model_path)
        frame = build_frame(payload)
        raw_prediction, confidence, notes = predict_with_confidence(pipeline, frame)
        predicted = round(clamp(raw_prediction), 2)

        print(
            json.dumps(
                {
                    "ok": True,
                    "predicted_ux_score": predicted,
                    "confidence": round(confidence, 4),
                    "model_version": MODEL_VERSION,
                    "notes": notes,
                }
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001 - return structured error to caller
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "model_version": MODEL_VERSION,
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
