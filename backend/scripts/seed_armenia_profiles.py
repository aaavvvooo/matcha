"""Seed fake profiles located in Armenia, for testing location-based features
against a single country/region. --count profiles are created for each of the
4 genders (Man, Woman, Non-binary, Other) — default 50 each, 200 total.

randomuser.me has no Armenian nationality and no Non-binary/Other gender, so
this pulls people from the same Latin-script nationality pool as
scripts/seed_profiles.py (for name/photo/dob only — Non-binary/Other borrow a
random male or female source profile) and overrides their location with real
Armenian city coordinates + a Latin-script "City, Armenia" label.

Idempotent per gender: --count is the minimum number of Armenia-seed profiles
that should exist per gender (marked by @matcha-seed-am.dev emails).

Run inside the backend container:
    docker compose exec backend python scripts/seed_armenia_profiles.py --count 50
"""
import argparse
import asyncio
import random
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from application.database import Database  # noqa: E402
from application.repository.user_repo import UserRepository  # noqa: E402
from application.repository.profile_repo import ProfileRepository  # noqa: E402
from application.utils.password import get_password_hash  # noqa: E402
from application.clients.minio_client import ensure_bucket  # noqa: E402
from scripts.seed_common import (  # noqa: E402
    ORIENTATIONS,
    DEFAULT_PASSWORD,
    random_bio,
    fetch_and_upload_photo,
    load_existing_tags,
    create_seed_user,
)

# Source nationality pool for name/photo/dob only — none of these affect the
# location, which is always overridden to a real Armenian city below.
NATIONALITIES = "au,br,ca,ch,de,dk,es,fi,fr,gb,ie,in,mx,nl,no,nz,rs,tr,ua,us"

ARMENIAN_CITIES = [
    ("Yerevan", 40.1792, 44.4991),
    ("Gyumri", 40.7942, 43.8452),
    ("Vanadzor", 40.8128, 44.4894),
    ("Vagharshapat", 40.1596, 44.2934),
    ("Hrazdan", 40.4972, 44.7614),
    ("Abovyan", 40.2725, 44.6222),
    ("Kapan", 39.2064, 46.4064),
    ("Armavir", 40.1553, 44.0422),
]


def random_armenian_location() -> tuple[float, float, str]:
    city, lat, lon = random.choice(ARMENIAN_CITIES)
    jittered_lat = lat + random.uniform(-0.05, 0.05)
    jittered_lon = lon + random.uniform(-0.05, 0.05)
    return jittered_lat, jittered_lon, f"{city}, Armenia"


def fetch_people(count: int, gender: str) -> list[dict]:
    url = (
        f"https://randomuser.me/api/?results={count}&gender={gender}"
        f"&inc=gender,name,picture,dob,login&nat={NATIONALITIES}&noinfo"
    )
    with urllib.request.urlopen(url, timeout=30) as resp:
        import json
        return json.load(resp)["results"]


async def count_seed_profiles(db: Database, gender_label: str) -> int:
    return await db.fetch_val(
        """
        SELECT COUNT(*) FROM users u
        JOIN user_profiles up ON up.user_id = u.id
        WHERE u.email LIKE '%@matcha-seed-am.dev' AND up.gender = $1
        """,
        gender_label,
    )


async def seed_gender(
    db: Database,
    user_repo: UserRepository,
    profile_repo: ProfileRepository,
    tags: list[dict],
    hashed_password: str,
    randomuser_gender: str,
    gender_label: str,
    target: int,
) -> int:
    existing_count = await count_seed_profiles(db, gender_label)
    to_create = target - existing_count
    if to_create <= 0:
        print(f"{gender_label}: already have {existing_count} (target {target}). Nothing to do.")
        return 0

    print(f"{gender_label}: have {existing_count}, creating {to_create} more.")

    created = 0
    while created < to_create:
        people = fetch_people(min(50, to_create - created), randomuser_gender)

        for person in people:
            first = person["name"]["first"]
            last = person["name"]["last"]
            full_name = f"{first} {last}"
            username = f"am_{person['login']['username']}_{person['login']['uuid'][:8]}"
            email = f"{username}@matcha-seed-am.dev"

            user_id = await create_seed_user(
                user_repo, db, full_name, username, email, hashed_password
            )
            if user_id is None:
                continue

            sexual_orientation = random.choice(ORIENTATIONS)
            birth_year = int(person["dob"]["date"][:4])
            birth_date = datetime(max(birth_year, 1950), 1, 1, tzinfo=timezone.utc)
            chosen_tags = random.sample(tags, k=min(len(tags), random.randint(3, 6)))
            bio = random_bio(chosen_tags[0]["name"])
            latitude, longitude, location_label = random_armenian_location()

            await db.execute(
                """
                INSERT INTO user_profiles
                    (user_id, bio, birth_date, gender, sexual_orientation, latitude, longitude, location_label, fame_rating)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                user_id, bio, birth_date, gender_label, sexual_orientation,
                latitude, longitude, location_label,
                round(random.uniform(0, 60), 1),
            )

            try:
                photo_url = fetch_and_upload_photo(person["picture"]["large"])
                photo_rows = await profile_repo.add_photos(user_id, [photo_url], start_order=1)
                if photo_rows:
                    await profile_repo.set_profile_picture(user_id, photo_rows[0]["id"])
            except Exception as e:
                print(f"  photo failed for {username}: {e}")

            await profile_repo.add_tags(user_id, [t["id"] for t in chosen_tags])

            created += 1
            if created % 10 == 0:
                print(f"  {gender_label}: {created}/{to_create} created...")

    return created


async def seed(count: int):
    db = Database()
    await db.connect()
    ensure_bucket()

    user_repo = UserRepository(db)
    profile_repo = ProfileRepository(db)
    tags = await load_existing_tags(profile_repo)
    print(f"Tag pool ready: {len(tags)} tags")

    hashed_password = get_password_hash(DEFAULT_PASSWORD)

    # randomuser.me only knows male/female — Non-binary/Other borrow a random
    # male or female source profile (name/photo/dob) but keep their own
    # gender_label in the DB.
    plan = [
        ("male", "Man"),
        ("female", "Woman"),
        (random.choice(["male", "female"]), "Non-binary"),
        (random.choice(["male", "female"]), "Other"),
    ]

    created_by_gender = {}
    for randomuser_gender, gender_label in plan:
        created_by_gender[gender_label] = await seed_gender(
            db, user_repo, profile_repo, tags, hashed_password,
            randomuser_gender, gender_label, count,
        )

    await db.disconnect()
    summary = ", ".join(f"{n} {g}" for g, n in created_by_gender.items())
    print(f"Done. Created {summary} in Armenia.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=50, help="minimum profiles per gender")
    args = parser.parse_args()
    asyncio.run(seed(args.count))
