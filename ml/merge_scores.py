"""Blend deterministic UX scoring with an ML prediction.

This file intentionally stays small. The app can call the same formula later
from Node or Python once the model is trained.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MergedUxScore:
    deterministic_score: float
    ml_score: float | None
    final_score: float
    deterministic_weight: float
    ml_weight: float
    confidence: float


def clamp_score(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def merge_ux_scores(
    deterministic_score: float,
    ml_score: float | None = None,
    *,
    ml_weight: float = 0.40,
    ml_confidence: float = 1.0,
) -> MergedUxScore:
    """Return a blended UX score.

    If no ML score exists yet, this returns the deterministic score. If model
    confidence is low, the ML contribution is reduced automatically.
    """

    deterministic_score = clamp_score(deterministic_score)

    if ml_score is None:
        return MergedUxScore(
            deterministic_score=deterministic_score,
            ml_score=None,
            final_score=deterministic_score,
            deterministic_weight=1.0,
            ml_weight=0.0,
            confidence=0.0,
        )

    ml_score = clamp_score(ml_score)
    ml_confidence = clamp_score(ml_confidence, 0.0, 1.0)
    effective_ml_weight = clamp_score(ml_weight, 0.0, 1.0) * ml_confidence
    deterministic_weight = 1.0 - effective_ml_weight
    final_score = deterministic_score * deterministic_weight + ml_score * effective_ml_weight

    return MergedUxScore(
        deterministic_score=deterministic_score,
        ml_score=ml_score,
        final_score=round(final_score, 2),
        deterministic_weight=round(deterministic_weight, 4),
        ml_weight=round(effective_ml_weight, 4),
        confidence=round(ml_confidence, 4),
    )


if __name__ == "__main__":
    example = merge_ux_scores(62, 78, ml_weight=0.40, ml_confidence=0.85)
    print(example)

