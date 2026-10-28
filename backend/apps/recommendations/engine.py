"""Technician scoring (paper §3.1.3). Pure functions: no ORM, no rounding inside calculations.

    P_i = 1 / (1 + d_i / d0)
    Q_i = (r̄_i − 1) / 4,  or no_rating_q when the technician has no reviews
    S_i = w_p · P_i + w_r · Q_i
    order: S desc, distance asc, technician id asc
"""

from dataclasses import dataclass, field
from typing import Any, Iterable


def proximity_score(d_km: float, d0: float) -> float:
    if d0 <= 0:
        raise ValueError("d0 must be positive")
    if d_km < 0:
        raise ValueError("distance cannot be negative")
    return 1.0 / (1.0 + d_km / d0)


def rating_score(avg: float | None, count: int, no_rating_q: float) -> float:
    if not count or avg is None:
        return no_rating_q
    return (avg - 1.0) / 4.0


def overall_score(p: float, q: float, w_p: float, w_r: float) -> float:
    return w_p * p + w_r * q


@dataclass(frozen=True)
class ScoringSettings:
    w_p: float = 0.5
    w_r: float = 0.5
    d0_km: float = 1.0
    no_rating_q: float = 0.5


@dataclass
class Candidate:
    id: int
    distance_km: float
    rating_avg: float | None
    rating_count: int
    payload: Any = None  # e.g. the ORM object; ignored by the engine


@dataclass
class ScoredCandidate:
    candidate: Candidate
    proximity_score: float
    rating_score: float
    score: float
    rank: int = field(default=0)

    @property
    def id(self) -> int:
        return self.candidate.id

    @property
    def distance_km(self) -> float:
        return self.candidate.distance_km

    @property
    def has_ratings(self) -> bool:
        return bool(self.candidate.rating_count)


def score(candidate: Candidate, s: ScoringSettings) -> ScoredCandidate:
    p = proximity_score(candidate.distance_km, s.d0_km)
    q = rating_score(candidate.rating_avg, candidate.rating_count, s.no_rating_q)
    return ScoredCandidate(candidate=candidate, proximity_score=p, rating_score=q, score=overall_score(p, q, s.w_p, s.w_r))


def rank(scored: Iterable[ScoredCandidate]) -> list[ScoredCandidate]:
    ordered = sorted(scored, key=lambda sc: (-sc.score, sc.distance_km, sc.id))
    for position, sc in enumerate(ordered, start=1):
        sc.rank = position
    return ordered


def recommend(candidates: Iterable[Candidate], s: ScoringSettings) -> list[ScoredCandidate]:
    return rank(score(c, s) for c in candidates)
