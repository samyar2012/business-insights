import json
import sys
from pathlib import Path

import joblib
import pandas as pd


def repo_root() -> Path:
    # backend/python -> backend -> repo root
    return Path(__file__).resolve().parents[2]


def load_artifact():
    artifact_path = repo_root() / "Chum_Predic" / "churn_model_artifact.joblib"
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Missing model artifact: {artifact_path}")
    art = joblib.load(artifact_path)
    return art


def predict_single(art, values: dict) -> dict:
    raw_cols = list(art["raw_columns"])
    cat_cols = list(art["categorical_columns"])
    enc_cols = list(art["encoded_columns"])
    missing = [k for k in raw_cols if k not in values]
    if missing:
        raise KeyError(f"Missing keys for prediction: {missing}")

    row = pd.DataFrame([{k: values[k] for k in raw_cols}])
    for c in raw_cols:
        if c not in cat_cols and c in row.columns:
            row[c] = pd.to_numeric(row[c], errors="coerce")

    X = pd.get_dummies(row, columns=cat_cols, drop_first=False)
    X = X.reindex(columns=enc_cols, fill_value=0)

    model = art["model"]
    threshold = float(art["decision_threshold"])
    proba = float(model.predict_proba(X)[0, 1])
    pred = 1 if proba >= threshold else 0

    return {
        "probability_churn": proba,
        "predicted_churn": bool(pred),
        "predicted_label": "Churn" if pred else "No churn",
        "threshold_used": threshold,
    }


def predict_batch_csv(art, csv_path: str) -> dict:
    raw_cols = list(art["raw_columns"])
    df = pd.read_csv(csv_path)

    missing_cols = [c for c in raw_cols if c not in df.columns]
    if missing_cols:
        raise KeyError(
            f"CSV missing required columns: {missing_cols}. Needed: {raw_cols}"
        )

    df = df[raw_cols].copy()
    rows = df.to_dict(orient="records")

    cat_cols = list(art["categorical_columns"])
    enc_cols = list(art["encoded_columns"])
    model = art["model"]
    threshold = float(art["decision_threshold"])

    # Prepare dataframe for encoding
    out = pd.DataFrame(rows)
    for c in raw_cols:
        if c not in cat_cols and c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce")

    X = pd.get_dummies(out, columns=cat_cols, drop_first=False)
    X = X.reindex(columns=enc_cols, fill_value=0)

    proba = model.predict_proba(X)[:, 1].astype(float)
    pred = (proba >= threshold).astype(int)

    # Helpful aggregates for UI
    predicted_churn_count = int(pred.sum())
    predicted_no_churn_count = int(len(pred) - predicted_churn_count)

    return {
        "rows_total": int(len(pred)),
        "predicted_churn_count": predicted_churn_count,
        "predicted_no_churn_count": predicted_no_churn_count,
        "predicted_churn_rate": predicted_churn_count / max(1, len(pred)),
        "threshold_used": threshold,
        "probability_churn_summary": {
            "min": float(proba.min()) if len(proba) else None,
            "max": float(proba.max()) if len(proba) else None,
            "mean": float(proba.mean()) if len(proba) else None,
        },
        # For MVP: include per-row predictions (first N for payload control)
        "predictions": [
            {
                "probability_churn": float(proba[i]),
                "predicted_churn": bool(pred[i]),
                "predicted_label": "Churn" if pred[i] else "No churn",
            }
            for i in range(min(50, len(pred)))
        ],
        "truncated": len(pred) > 50,
    }


def csv_row_count(csv_path: str) -> dict:
    df = pd.read_csv(csv_path)
    return {"rows": int(len(df))}


def main():
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"error": "Missing stdin JSON"}))
        return 1
    payload = json.loads(raw)

    art = load_artifact()
    t = payload.get("type")

    if t == "single":
        result = predict_single(art, payload["values"])
        print(json.dumps(result))
        return 0

    if t == "csv_count":
        result = csv_row_count(payload["filePath"])
        print(json.dumps(result))
        return 0

    if t == "csv":
        result = predict_batch_csv(art, payload["filePath"])
        print(json.dumps(result))
        return 0

    raise ValueError(f"Unknown payload type: {t}")


if __name__ == "__main__":
    sys.exit(main())

