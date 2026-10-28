"""Table 3.3 regression (d0 = 1 km, w_p = w_r = 0.5, no-rating Q = 0.5)."""

import pytest

from apps.recommendations import engine

SETTINGS = engine.ScoringSettings(w_p=0.5, w_r=0.5, d0_km=1.0, no_rating_q=0.5)

TABLE_3_3 = {
    # name: (id, d_km, rating_avg, rating_count, P, Q, S, rank)
    "A": (1, 1.00, 4.0, 10, 0.5000, 0.7500, 0.6250, 1),
    "B": (2, 3.00, 5.0, 10, 0.2500, 1.0000, 0.6250, 2),
    "C": (3, 0.50, None, 0, 0.6667, 0.5000, 0.5833, 3),
}


def _candidates(order=("C", "B", "A")):
    return [
        engine.Candidate(id=TABLE_3_3[n][0], distance_km=TABLE_3_3[n][1], rating_avg=TABLE_3_3[n][2],
                         rating_count=TABLE_3_3[n][3], payload=n)
        for n in order
    ]


def test_table_3_3_scores_match_to_four_decimals():
    ranked = engine.recommend(_candidates(), SETTINGS)
    by_name = {sc.candidate.payload: sc for sc in ranked}
    for name, (_, _, _, _, p, q, s, rank) in TABLE_3_3.items():
        sc = by_name[name]
        assert round(sc.proximity_score, 4) == p, name
        assert round(sc.rating_score, 4) == q, name
        assert round(sc.score, 4) == s, name
        assert sc.rank == rank, name


@pytest.mark.parametrize("order", [("A", "B", "C"), ("C", "B", "A"), ("B", "C", "A")])
def test_table_3_3_order_is_a_b_c_regardless_of_input_order(order):
    ranked = engine.recommend(_candidates(order), SETTINGS)
    assert [sc.candidate.payload for sc in ranked] == ["A", "B", "C"]


def test_tie_on_score_breaks_by_distance_then_id():
    a = engine.Candidate(id=9, distance_km=1.0, rating_avg=4.0, rating_count=1)
    b = engine.Candidate(id=4, distance_km=1.0, rating_avg=4.0, rating_count=1)
    c = engine.Candidate(id=1, distance_km=3.0, rating_avg=5.0, rating_count=1)  # same S, farther
    ranked = engine.recommend([a, b, c], SETTINGS)
    assert [sc.id for sc in ranked] == [4, 9, 1]


def test_unrounded_values_are_kept():
    sc = engine.score(engine.Candidate(id=1, distance_km=0.5, rating_avg=None, rating_count=0), SETTINGS)
    assert sc.proximity_score == 1 / 1.5
    assert sc.score == 0.5 * (1 / 1.5) + 0.5 * 0.5


def test_formulas():
    assert engine.proximity_score(0, 1) == 1.0
    assert engine.proximity_score(2, 2) == 0.5
    assert engine.rating_score(1.0, 3, 0.5) == 0.0
    assert engine.rating_score(5.0, 3, 0.5) == 1.0
    assert engine.rating_score(None, 0, 0.42) == 0.42
    assert engine.overall_score(1.0, 0.0, 0.7, 0.3) == 0.7
    with pytest.raises(ValueError):
        engine.proximity_score(1, 0)
