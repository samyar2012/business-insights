"""
Single entry point: load Churn.csv once, score service columns vs churn, validate,
and write text/JSON/SQLite/SQL dump.

Replaces the old stat.py + check.py + convert.py flow (one CSV read, one process).

Outputs (same directory as this file):
  important_services.txt, stat_run_metadata.json, validation_ok,
  service_importance.db, service_importance_import.sql,
  churn_terminal_report.db (terminal tables: overview + service + categories),
  churn_report_overview.csv, churn_report_service_summary.csv,
  churn_report_service_categories.csv (same data as terminal, for pandas),
  important_services_importance.json (IMPORTANT list + pct and scores),
  importance_selection_log.txt (how scores were computed; statistical, not ML)
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

DIR_PATH = Path(__file__).resolve().parent

SERVICE_FEATURES = [
    "InternetService",
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
    "PhoneService",
    "MultipleLines",
]

TARGET_COL = "Churn"
OUTPUT_TXT = DIR_PATH / "important_services.txt"
OUTPUT_JSON = DIR_PATH / "stat_run_metadata.json"
IMPORTANT_IMPORTANCE_JSON = DIR_PATH / "important_services_importance.json"
VALIDATION_MARKER = DIR_PATH / "validation_ok"
DB_PATH = DIR_PATH / "service_importance.db"
REPORT_DB_PATH = DIR_PATH / "churn_terminal_report.db"
REPORT_CSV_OVERVIEW = DIR_PATH / "churn_report_overview.csv"
REPORT_CSV_SERVICE_SUMMARY = DIR_PATH / "churn_report_service_summary.csv"
REPORT_CSV_CATEGORY = DIR_PATH / "churn_report_service_categories.csv"
SQL_DUMP_PATH = DIR_PATH / "service_importance_import.sql"
LOG_TXT = DIR_PATH / "importance_selection_log.txt"

P_VALUE_MAX = 0.05
CRAMERS_V_MIN = 0.05


def _resolve_churn_csv() -> Path:
    for name in ("Churn.csv", "churn.csv"):
        p = DIR_PATH / name
        if p.is_file():
            return p
    raise FileNotFoundError(
        f"No Churn.csv or churn.csv found under {DIR_PATH}"
    )


def cramers_v(chi2: float, n: int, n_rows: int, n_cols: int) -> float:
    if n <= 0 or min(n_rows, n_cols) < 2:
        return 0.0
    denom = n * (min(n_rows, n_cols) - 1)
    if denom <= 0:
        return 0.0
    return float(np.sqrt(chi2 / denom))


def _ensure_churn_columns(tab: pd.DataFrame) -> pd.DataFrame:
    t = tab.copy()
    for c in (0, 1):
        if c not in t.columns:
            t[c] = 0
    return t[[0, 1]]


def _category_breakdown(tab: pd.DataFrame) -> list[dict]:
    """Per service category: counts for Churn=No (0) and Churn=Yes (1), and % who churned."""
    tab = _ensure_churn_columns(tab)
    rows: list[dict] = []
    for cat in tab.index:
        n_no = int(tab.loc[cat, 0])
        n_yes = int(tab.loc[cat, 1])
        n_tot = n_no + n_yes
        pct_no = 100.0 * n_no / n_tot if n_tot else 0.0
        pct_yes = 100.0 * n_yes / n_tot if n_tot else 0.0
        rows.append(
            {
                "category": str(cat),
                "n_churn_no": n_no,
                "n_churn_yes": n_yes,
                "n_total": n_tot,
                "pct_of_group_no_churn": round(pct_no, 2),
                "pct_of_group_churned": round(pct_yes, 2),
            }
        )
    return rows


def feature_churn_detail(series: pd.Series, churn: pd.Series) -> dict:
    """Chi-square, Cramér's V, and per-category Churn No vs Yes breakdown."""
    df = pd.DataFrame({"f": series.astype(str), "c": churn})
    df = df.dropna()
    if df.empty:
        return {
            "chi2": None,
            "pvalue": None,
            "cramers_v": None,
            "n": 0,
            "by_category": [],
        }
    tab = pd.crosstab(df["f"], df["c"])
    chi2, p, dof, _ = chi2_contingency(tab)
    n = int(tab.values.sum())
    r, c = tab.shape
    v = cramers_v(chi2, n, r, c)
    by_cat = _category_breakdown(tab)
    return {
        "chi2": float(chi2),
        "pvalue": float(p),
        "cramers_v": v,
        "n": n,
        "by_category": by_cat,
    }


def _fail(msg: str) -> None:
    if VALIDATION_MARKER.is_file():
        VALIDATION_MARKER.unlink()
    print(f"pipeline.py: FAILED - {msg}", file=sys.stderr)
    raise SystemExit(1)


def _write_sql_exports(names: list[str], ts: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS important_services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feature_name TEXT NOT NULL UNIQUE,
                imported_at_utc TEXT NOT NULL
            );
            """
        )
        conn.execute("DELETE FROM important_services;")
        conn.executemany(
            "INSERT INTO important_services (feature_name, imported_at_utc) VALUES (?, ?);",
            [(n, ts) for n in names],
        )
        conn.commit()
    finally:
        conn.close()

    def esc(s: str) -> str:
        return s.replace("'", "''")

    sql_lines = [
        "BEGIN TRANSACTION;",
        "CREATE TABLE IF NOT EXISTS important_services (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  feature_name TEXT NOT NULL UNIQUE,",
        "  imported_at_utc TEXT NOT NULL",
        ");",
        "DELETE FROM important_services;",
    ]
    for n in names:
        sql_lines.append(
            f"INSERT INTO important_services (feature_name, imported_at_utc) "
            f"VALUES ('{esc(n)}', '{esc(ts)}');"
        )
    sql_lines.append("COMMIT;")
    SQL_DUMP_PATH.write_text("\n".join(sql_lines) + "\n", encoding="utf-8")


def _write_terminal_report_db(
    ts: str,
    csv_name: str,
    n_rows: int,
    churn: pd.Series,
    per_feature: dict[str, dict],
    importance_pct: dict[str, float],
    important: list[str],
) -> None:
    """Persist the same figures shown in the terminal to a separate SQLite DB."""
    n_no = int((churn == 0).sum())
    n_yes = int((churn == 1).sum())
    pct_no = 100.0 * n_no / n_rows if n_rows else 0.0
    pct_yes = 100.0 * n_yes / n_rows if n_rows else 0.0
    important_set = set(important)

    conn = sqlite3.connect(REPORT_DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.executescript(
            """
            DROP TABLE IF EXISTS service_category_breakdown;
            DROP TABLE IF EXISTS service_terminal_summary;
            DROP TABLE IF EXISTS churn_overview;
            CREATE TABLE churn_overview (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                generated_at_utc TEXT NOT NULL,
                source_csv TEXT NOT NULL,
                n_rows INTEGER NOT NULL,
                n_churn_no INTEGER NOT NULL,
                n_churn_yes INTEGER NOT NULL,
                pct_churn_no REAL NOT NULL,
                pct_churn_yes REAL NOT NULL,
                p_value_threshold REAL NOT NULL,
                cramer_v_threshold REAL NOT NULL
            );
            CREATE TABLE service_terminal_summary (
                feature_name TEXT PRIMARY KEY,
                chi2 REAL,
                pvalue REAL,
                cramer_v REAL,
                relative_importance_pct REAL NOT NULL,
                is_important INTEGER NOT NULL CHECK (is_important IN (0, 1)),
                contingency_n INTEGER NOT NULL
            );
            CREATE TABLE service_category_breakdown (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feature_name TEXT NOT NULL,
                category TEXT NOT NULL,
                n_churn_no INTEGER NOT NULL,
                n_churn_yes INTEGER NOT NULL,
                n_total INTEGER NOT NULL,
                pct_churn_no REAL NOT NULL,
                pct_churn_yes REAL NOT NULL,
                UNIQUE (feature_name, category)
            );
            """
        )
        conn.execute(
            """
            INSERT INTO churn_overview (
                id, generated_at_utc, source_csv, n_rows,
                n_churn_no, n_churn_yes, pct_churn_no, pct_churn_yes,
                p_value_threshold, cramer_v_threshold
            ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                ts,
                csv_name,
                n_rows,
                n_no,
                n_yes,
                round(pct_no, 4),
                round(pct_yes, 4),
                P_VALUE_MAX,
                CRAMERS_V_MIN,
            ),
        )
        for col in SERVICE_FEATURES:
            f = per_feature[col]
            conn.execute(
                """
                INSERT INTO service_terminal_summary (
                    feature_name, chi2, pvalue, cramer_v,
                    relative_importance_pct, is_important, contingency_n
                ) VALUES (?, ?, ?, ?, ?, ?, ?);
                """,
                (
                    col,
                    f.get("chi2"),
                    f.get("pvalue"),
                    f.get("cramers_v"),
                    round(importance_pct[col], 4),
                    1 if col in important_set else 0,
                    int(f.get("n") or 0),
                ),
            )
            for row in f.get("by_category") or []:
                conn.execute(
                    """
                    INSERT INTO service_category_breakdown (
                        feature_name, category, n_churn_no, n_churn_yes, n_total,
                        pct_churn_no, pct_churn_yes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        col,
                        row["category"],
                        row["n_churn_no"],
                        row["n_churn_yes"],
                        row["n_total"],
                        float(row["pct_of_group_no_churn"]),
                        float(row["pct_of_group_churned"]),
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def _write_terminal_report_csvs(
    ts: str,
    csv_name: str,
    n_rows: int,
    churn: pd.Series,
    per_feature: dict[str, dict],
    importance_pct: dict[str, float],
    important: list[str],
) -> None:
    """Mirror terminal / DB tables as CSV for training scripts (pandas.read_csv)."""
    important_set = set(important)
    n_no = int((churn == 0).sum())
    n_yes = int((churn == 1).sum())
    pct_no = 100.0 * n_no / n_rows if n_rows else 0.0
    pct_yes = 100.0 * n_yes / n_rows if n_rows else 0.0

    overview = pd.DataFrame(
        [
            {
                "generated_at_utc": ts,
                "source_csv": csv_name,
                "n_rows": n_rows,
                "n_churn_no": n_no,
                "n_churn_yes": n_yes,
                "pct_churn_no": round(pct_no, 4),
                "pct_churn_yes": round(pct_yes, 4),
                "p_value_threshold": P_VALUE_MAX,
                "cramer_v_threshold": CRAMERS_V_MIN,
            }
        ]
    )
    overview.to_csv(REPORT_CSV_OVERVIEW, index=False)

    summary_rows: list[dict] = []
    for col in SERVICE_FEATURES:
        f = per_feature[col]
        summary_rows.append(
            {
                "feature_name": col,
                "chi2": f.get("chi2"),
                "pvalue": f.get("pvalue"),
                "cramer_v": f.get("cramers_v"),
                "relative_importance_pct": round(importance_pct[col], 4),
                "is_important": 1 if col in important_set else 0,
                "contingency_n": f.get("n"),
                "terminal_flag": "IMPORTANT" if col in important_set else "-",
            }
        )
    pd.DataFrame(summary_rows).to_csv(REPORT_CSV_SERVICE_SUMMARY, index=False)

    cat_rows: list[dict] = []
    for col in SERVICE_FEATURES:
        for row in per_feature[col].get("by_category") or []:
            cat_rows.append(
                {
                    "feature_name": col,
                    "category": row["category"],
                    "n_churn_no": row["n_churn_no"],
                    "n_churn_yes": row["n_churn_yes"],
                    "n_total": row["n_total"],
                    "pct_churn_no": row["pct_of_group_no_churn"],
                    "pct_churn_yes": row["pct_of_group_churned"],
                }
            )
    pd.DataFrame(cat_rows).to_csv(REPORT_CSV_CATEGORY, index=False)


def _build_important_importance_json(
    ts: str,
    csv_name: str,
    n_rows: int,
    important: list[str],
    per_feature: dict[str, dict],
    importance_pct: dict[str, float],
) -> dict:
    """Compact JSON: only flagged IMPORTANT services with percentage + test stats."""
    v_imp = sum(
        float(per_feature[n]["cramers_v"])
        for n in important
        if per_feature[n].get("cramers_v") is not None
    )
    services: list[dict] = []
    for name in important:
        f = per_feature[name]
        v = f.get("cramers_v")
        v_f = float(v) if v is not None else 0.0
        pct_within = (100.0 * v_f / v_imp) if v_imp > 0 else 0.0
        chi = f.get("chi2")
        services.append(
            {
                "feature_name": name,
                "relative_importance_pct_of_all_9": round(importance_pct[name], 4),
                "relative_importance_pct_within_important_only": round(
                    pct_within, 4
                ),
                "cramer_v": round(v_f, 6),
                "pvalue": f.get("pvalue"),
                "chi2": round(float(chi), 6) if chi is not None else None,
                "contingency_n": f.get("n"),
            }
        )
    return {
        "generated_at_utc": ts,
        "source_csv": csv_name,
        "n_rows_used": n_rows,
        "criteria": {
            "p_max": P_VALUE_MAX,
            "cramers_v_min": CRAMERS_V_MIN,
        },
        "important_service_names": list(important),
        "important_services": services,
        "percentage_definitions": {
            "relative_importance_pct_of_all_9": (
                "100 * cramer_v / sum(cramer_v over all 9 service columns); "
                "shares strength vs every tracked service."
            ),
            "relative_importance_pct_within_important_only": (
                "Same formula but denominator is sum of cramer_v only over "
                "IMPORTANT services; values sum to 100 across that list."
            ),
        },
    }


def _relative_importance_pct(per_feature: dict[str, dict]) -> dict[str, float]:
    """Share of total Cramér's V across all service columns (sums to 100%)."""
    total_v = sum(
        float(f["cramers_v"])
        for f in per_feature.values()
        if f.get("cramers_v") is not None
    )
    out: dict[str, float] = {}
    for name, f in per_feature.items():
        v = f.get("cramers_v")
        if v is None or total_v <= 0:
            out[name] = 0.0
        else:
            out[name] = 100.0 * float(v) / total_v
    return out


def _print_terminal_report(
    csv_name: str,
    n_rows: int,
    churn: pd.Series,
    per_feature: dict[str, dict],
    importance_pct: dict[str, float],
    important: list[str],
) -> None:
    n_no = int((churn == 0).sum())
    n_yes = int((churn == 1).sum())
    base_yes = 100.0 * n_yes / n_rows if n_rows else 0.0
    base_no = 100.0 * n_no / n_rows if n_rows else 0.0

    print()
    print("=== Churn overview (all rows used) ===")
    print(f"  Dataset: {csv_name}  |  n = {n_rows}")
    print(
        f"  Churn = No: {n_no} ({base_no:.2f}%)  |  "
        f"Churn = Yes: {n_yes} ({base_yes:.2f}%)"
    )
    print()
    print(
        "=== Service importance (statistical association with churn) ==="
    )
    print(
        "  Cramer V (Cramer's V): 0 = none; higher = stronger link to churn."
    )
    print(
        "  Rel.import %: share of total V across these 9 columns (not a probability)."
    )
    print(
        f"  Flagged IMPORTANT: p < {P_VALUE_MAX} AND Cramer V >= {CRAMERS_V_MIN}."
    )
    print()
    hdr = f"{'Service':<22} {'CramerV':>8} {'Rel.%':>7} {'p-value':>10}  Flag"
    print(hdr)
    print("-" * len(hdr))
    for col in SERVICE_FEATURES:
        f = per_feature[col]
        v = f.get("cramers_v")
        p = f.get("pvalue")
        flag = "IMPORTANT" if col in important else "-"
        vs = f"{v:.4f}" if v is not None else "n/a"
        ps = f"{p:.2e}" if p is not None else "n/a"
        rp = importance_pct.get(col, 0.0)
        print(f"{col:<22} {vs:>8} {rp:>6.1f}% {ps:>10}  {flag}")

    print()
    print("=== By service: Churn No vs Yes within each category ===")
    for col in SERVICE_FEATURES:
        print(f"\n  [{col}]")
        sub = f"{'Category':<28} {'No':>6} {'Yes':>6} {'%No':>8} {'%Yes':>8}"
        print(f"    {sub}")
        print(f"    {'-' * 60}")
        for row in per_feature[col].get("by_category") or []:
            cat = str(row["category"])[:28]
            print(
                f"    {cat:<28} {row['n_churn_no']:>6} {row['n_churn_yes']:>6} "
                f"{row['pct_of_group_no_churn']:>7.1f}% {row['pct_of_group_churned']:>7.1f}%"
            )


def _write_selection_log(
    ts: str,
    csv_name: str,
    n_rows: int,
    churn: pd.Series,
    per_feature: dict[str, dict],
    importance_pct: dict[str, float],
    important: list[str],
) -> None:
    n_no = int((churn == 0).sum())
    n_yes = int((churn == 1).sum())
    lines: list[str] = [
        "IMPORTANCE SELECTION LOG",
        f"Generated (UTC): {ts}",
        f"Source file: {csv_name}",
        f"Rows used after dropping invalid Churn: {n_rows}",
        "",
        "WHAT DECIDED THE SCORES (NOT A NEURAL-NET / LLM MODEL)",
        "This pipeline uses classical statistics, not machine-learning model training.",
        "",
        "1) For each service column, we build a contingency table:",
        "   rows = each category of that service (e.g. DSL, Fiber optic),",
        "   columns = Churn with values No (encoded 0) and Yes (encoded 1).",
        "",
        "2) Pearson chi-square test of independence checks whether the distribution",
        "   of churn differs across service categories. Under the null hypothesis,",
        "   service and churn are independent. A small p-value means the pattern",
        f"   is unlikely by chance; we require p < {P_VALUE_MAX} to consider",
        "   the link statistically significant.",
        "",
        "3) Cramér's V measures effect size (how strong the association is),",
        "   on a scale from 0 upward. Large samples can yield tiny p-values for",
        f"   weak effects, so we also require Cramér's V >= {CRAMERS_V_MIN} to",
        "   mark a service as IMPORTANT in important_services.txt.",
        "",
        "4) RELATIVE IMPORTANCE PERCENTAGE (Rel.% in the terminal):",
        "   For the nine service columns, let V_i = Cramér's V for column i.",
        "   Then Rel.%_i = 100 * V_i / sum(V_1..V_9).",
        "   These percentages sum to 100% across the nine columns; they describe",
        "   how much of the *total measured association strength* each column",
        "   carries relative to the others, not the chance that churn happens.",
        "",
        "5) PER-CATEGORY TABLES:",
        "   For each category of a service, we count customers with Churn=No and",
        "   Churn=Yes, and show %No and %Yes within that category only.",
        "",
        "SERVICES MARKED IMPORTANT (met both thresholds):",
    ]
    if not important:
        lines.append("  (none)")
    else:
        for name in important:
            f = per_feature[name]
            lines.append(
                f"  - {name}: chi2={f['chi2']:.4f}, p={f['pvalue']:.4e}, "
                f"CramerV={f['cramers_v']:.4f}, Rel.%={importance_pct[name]:.2f}%"
            )

    lines.extend(
        [
            "",
            "FULL DETAIL BY SERVICE",
            "",
        ]
    )
    for col in SERVICE_FEATURES:
        f = per_feature[col]
        lines.append(f"--- {col} ---")
        lines.append(
            f"chi2={f.get('chi2')}, p={f.get('pvalue')}, "
            f"CramerV={f.get('cramers_v')}, n={f.get('n')}, "
            f"Rel.%={importance_pct[col]:.2f}%"
        )
        lines.append("category | n_No | n_Yes | %No | %Yes")
        for row in f.get("by_category") or []:
            lines.append(
                f"  {row['category']} | {row['n_churn_no']} | {row['n_churn_yes']} | "
                f"{row['pct_of_group_no_churn']}% | {row['pct_of_group_churned']}%"
            )
        lines.append("")

    LOG_TXT.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    csv_path = _resolve_churn_csv()
    df = pd.read_csv(csv_path)
    missing = [c for c in SERVICE_FEATURES + [TARGET_COL] if c not in df.columns]
    if missing:
        _fail(f"CSV missing columns: {missing}")

    work = df[SERVICE_FEATURES + [TARGET_COL]].copy()
    work = work.dropna(subset=[TARGET_COL])
    churn = work[TARGET_COL].map({"Yes": 1, "No": 0})
    work = work.loc[churn.notna()]
    churn = churn.astype(int)

    per_feature: dict[str, dict] = {}
    important: list[str] = []

    for col in SERVICE_FEATURES:
        stats = feature_churn_detail(work[col], churn)
        per_feature[col] = stats
        p, v = stats["pvalue"], stats["cramers_v"]
        if p is not None and v is not None and p < P_VALUE_MAX and v >= CRAMERS_V_MIN:
            important.append(col)

    important.sort()
    importance_pct = _relative_importance_pct(per_feature)
    for col in SERVICE_FEATURES:
        per_feature[col]["relative_importance_pct"] = round(importance_pct[col], 4)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for n in important:
        if n not in SERVICE_FEATURES or n not in df.columns:
            _fail(f"internal validation: bad feature {n!r}")

    lines = [
        f"# generated_at_utc={ts}",
        f"# source_csv={csv_path.name}",
        f"# n_rows_used={len(work)}",
        f"# criteria: p < {P_VALUE_MAX} and Cramers_V >= {CRAMERS_V_MIN}",
        "# one service column name per line below (no # prefix)",
    ]
    lines.extend(important)
    OUTPUT_TXT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    meta = {
        "generated_at_utc": ts,
        "source_csv": str(csv_path.name),
        "n_rows_used": len(work),
        "criteria": {"p_max": P_VALUE_MAX, "cramers_v_min": CRAMERS_V_MIN},
        "per_feature": per_feature,
        "important_services": important,
    }
    OUTPUT_JSON.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    importance_payload = _build_important_importance_json(
        ts, csv_path.name, len(work), important, per_feature, importance_pct
    )
    IMPORTANT_IMPORTANCE_JSON.write_text(
        json.dumps(importance_payload, indent=2), encoding="utf-8"
    )

    _write_sql_exports(important, ts)
    _write_terminal_report_db(
        ts,
        csv_path.name,
        len(work),
        churn,
        per_feature,
        importance_pct,
        important,
    )
    _write_terminal_report_csvs(
        ts,
        csv_path.name,
        len(work),
        churn,
        per_feature,
        importance_pct,
        important,
    )
    VALIDATION_MARKER.write_text("", encoding="utf-8")

    _print_terminal_report(
        csv_path.name, len(work), churn, per_feature, importance_pct, important
    )
    _write_selection_log(
        ts, csv_path.name, len(work), churn, per_feature, importance_pct, important
    )

    print()
    print("pipeline.py: OK - one pass complete.")
    print(f"  CSV: {csv_path.name}, rows used: {len(work)}, important services: {len(important)}")
    print(
        f"  Wrote {OUTPUT_TXT.name}, {OUTPUT_JSON.name}, "
        f"{IMPORTANT_IMPORTANCE_JSON.name}, {VALIDATION_MARKER.name}"
    )
    print(
        f"  Wrote {DB_PATH.name}, {REPORT_DB_PATH.name}, "
        f"{REPORT_CSV_OVERVIEW.name}, {REPORT_CSV_SERVICE_SUMMARY.name}, "
        f"{REPORT_CSV_CATEGORY.name}, {SQL_DUMP_PATH.name}"
    )
    print(f"  Wrote {LOG_TXT.name}")


if __name__ == "__main__":
    main()
