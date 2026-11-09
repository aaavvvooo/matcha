"""Candidate selection and ranking for browse/search (DESIGN.md §8).

All values are bound parameters. The only interpolated SQL is built here from
code-defined fragments (filter clauses, the interest rule, ORDER BY columns
chosen from an allowlist) -- never from request text.
"""

from typing import Optional

from application.database import Database
from application.schema.discovery_schemas import DiscoveryQuery

# Candidate positions are snapped to this grid (degrees, ~2 km) before any distance
# is computed, so distance, the distance filter, sorting and the score can't be used
# to trilaterate someone's exact location; at best an attacker learns the cell.
GRID_DEG = 0.02

# Default ranking puts nearer areas first (subject: "priority to people in the same
# geographical area"): candidates are banded by distance and the score only orders
# them within a band, so tags/fame can't lift someone 500 km away above a neighbour.
AREA_BANDS_KM = (25, 100, 500)
_AREA_BANDS_SQL = "ARRAY[" + ", ".join(f"{km}.0" for km in AREA_BANDS_KM) + "]::float8[]"

# sort_by -> (output column, natural direction)
_SORTS: dict[str, tuple[str, str]] = {
    "score": ("score", "DESC"),
    "age": ("age", "ASC"),
    "distance": ("distance_km", "ASC"),
    "fame": ("fame_rating", "DESC"),
    "tags": ("shared_tags", "DESC"),
}


def _interested(gender: str, orientation: str, target: str) -> str:
    """SQL predicate: does a person (gender, orientation) want someone of gender `target`?"""
    return f"""(CASE {orientation}
        WHEN 'Heterosexual' THEN (
            {gender} IN ('Non-binary', 'Other')
            OR ({gender} = 'Man' AND {target} = 'Woman')
            OR ({gender} = 'Woman' AND {target} = 'Man'))
        WHEN 'Homosexual' THEN {target} = {gender}
        ELSE TRUE
    END)"""


_VIEWER_WANTS = _interested("v.gender", "v.orientation", "p.gender")
_CANDIDATE_WANTS = _interested("p.gender", "COALESCE(p.sexual_orientation, 'Bisexual')", "v.gender")

# $1 viewer id, $2 / $3 reference latitude / longitude (NULL => no distance).
_BASE = f"""
WITH viewer AS (
    SELECT gender, COALESCE(sexual_orientation, 'Bisexual') AS orientation
    FROM user_profiles WHERE user_id = $1
),
viewer_tags AS (
    SELECT tag_id FROM user_tags WHERE user_id = $1
),
candidates AS (
    SELECT
        u.id AS user_id, u.username, u.first_name, u.last_name,
        COALESCE(u.is_online, false) AS is_online, u.last_seen,
        p.bio, p.gender, p.sexual_orientation, p.location_label,
        COALESCE(p.fame_rating, 0)::float8 AS fame_rating,
        EXTRACT(YEAR FROM age(p.birth_date))::int AS age,
        CASE
            WHEN $2::float8 IS NULL OR $3::float8 IS NULL
                 OR p.latitude IS NULL OR p.longitude IS NULL THEN NULL
            ELSE 6371.0 * 2 * asin(LEAST(1.0, sqrt(
                power(sin(radians(g.lat - $2::float8) / 2), 2)
                + cos(radians($2::float8)) * cos(radians(g.lat))
                  * power(sin(radians(g.lon - $3::float8) / 2), 2))))
        END AS distance_km,
        (SELECT count(*) FROM user_tags ut
          WHERE ut.user_id = u.id AND ut.tag_id IN (SELECT tag_id FROM viewer_tags))::int AS shared_tags
    FROM users u
    JOIN user_profiles p ON p.user_id = u.id
    CROSS JOIN viewer v
    CROSS JOIN LATERAL (
        SELECT round(p.latitude / {GRID_DEG}) * {GRID_DEG} AS lat,
               round(p.longitude / {GRID_DEG}) * {GRID_DEG} AS lon
    ) g
    WHERE u.id <> $1
      AND u.is_validated
      AND p.gender IS NOT NULL
      AND EXISTS (SELECT 1 FROM photos ph WHERE ph.user_id = u.id AND ph.is_main)
      AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
             OR (b.blocker_id = u.id AND b.blocked_id = $1))
      AND {_VIEWER_WANTS}
      AND {_CANDIDATE_WANTS}
),
scored AS (
    SELECT c.*,
        0.5 * COALESCE(1.0 / (1.0 + c.distance_km / 10.0), 0)
        + 0.3 * c.shared_tags::float8 / GREATEST(1, (SELECT count(*) FROM viewer_tags))
        + 0.2 * c.fame_rating / 100.0 AS score,
        width_bucket(c.distance_km, {_AREA_BANDS_SQL}) AS area_band
    FROM candidates c
)
SELECT * FROM scored c
"""


class DiscoveryRepository:
    def __init__(self, db: Database):
        self.db = db

    async def find_candidates(
        self,
        viewer_id: int,
        ref_lat: Optional[float],
        ref_lon: Optional[float],
        q: DiscoveryQuery,
        exclude_liked: bool,
    ):
        params: list = [viewer_id, ref_lat, ref_lon]
        where: list[str] = []

        def bind(value) -> str:
            params.append(value)
            return f"${len(params)}"

        if q.min_age is not None:
            where.append(f"c.age >= {bind(q.min_age)}")
        if q.max_age is not None:
            where.append(f"c.age <= {bind(q.max_age)}")
        if q.max_distance_km is not None:
            where.append(f"c.distance_km <= {bind(q.max_distance_km)}")
        if q.min_fame is not None:
            where.append(f"c.fame_rating >= {bind(q.min_fame)}")
        if q.max_fame is not None:
            where.append(f"c.fame_rating <= {bind(q.max_fame)}")
        if q.tag_names:
            where.append(
                "EXISTS (SELECT 1 FROM user_tags ut JOIN tags t ON t.id = ut.tag_id"
                f" WHERE ut.user_id = c.user_id AND lower(t.name) = ANY({bind(q.tag_names)}::text[]))"
            )
        if exclude_liked:
            where.append("NOT EXISTS (SELECT 1 FROM likes l WHERE l.liker_id = $1 AND l.liked_id = c.user_id)")

        column, natural = _SORTS[q.sort_by]
        direction = q.order.upper() if q.order else natural

        query = _BASE
        if where:
            query += "WHERE " + " AND ".join(where) + "\n"
        # Score sorts within area bands (unknown distance last); explicit sorts don't band.
        band = "area_band ASC NULLS LAST, " if q.sort_by == "score" else ""
        query += f"ORDER BY {band}{column} {direction} NULLS LAST, c.user_id\n"
        query += f"LIMIT {bind(q.limit)} OFFSET {bind(q.offset)}"
        return await self.db.fetch_all(query, *params)

    async def get_viewer_location(self, viewer_id: int):
        return await self.db.fetch_one(
            "SELECT latitude, longitude FROM user_profiles WHERE user_id = $1", viewer_id
        )

    async def get_tags_for(self, user_ids: list[int]):
        return await self.db.fetch_all(
            """
            SELECT ut.user_id, t.name
            FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
            WHERE ut.user_id = ANY($1::int[])
            ORDER BY t.name
            """,
            user_ids,
        )

    async def get_photos_for(self, user_ids: list[int]):
        return await self.db.fetch_all(
            """
            SELECT id, user_id, url, "order", is_main
            FROM photos
            WHERE user_id = ANY($1::int[])
            ORDER BY user_id, is_main DESC, "order"
            """,
            user_ids,
        )
