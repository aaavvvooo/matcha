"""Seed the database with fake user profiles (data + photos) for evaluation.

Pulls generated people from randomuser.me (name, gender, dob, city, GPS, photo)
and writes them straight into the DB via the existing repositories, uploading
photos to storage through the existing storage client.

randomuser.me only knows male/female — Non-binary/Other profiles borrow a
random male or female source profile (name/photo/dob) but keep their own
gender in the DB. Profiles are spread evenly across the 4 genders.

Idempotent: --target is the minimum number of seed profiles that should exist
(marked by @matcha-seed.dev emails); already-seeded rows are left untouched
and only the shortfall is created. Safe to run on every container start.

Run inside the backend container, where POSTGRES_HOST/MINIO_ENDPOINT resolve:
    docker compose exec backend python scripts/seed_profiles.py --target 500
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
from application.clients.storage import ensure_bucket  # noqa: E402
from scripts.seed_common import (  # noqa: E402
    ORIENTATIONS,
    DEFAULT_PASSWORD,
    random_bio,
    fetch_and_upload_photo,
    load_existing_tags,
    create_seed_user,
)

NATIONALITIES = "au,br,ca,ch,de,dk,es,fi,fr,gb,ie,in,mx,nl,no,nz,rs,tr,ua,us"
GENDER_LABELS = ["Man", "Woman", "Non-binary", "Other"]


def fetch_people(count: int, randomuser_gender: str | None = None) -> list[dict]:
    gender_param = f"&gender={randomuser_gender}" if randomuser_gender else ""
    url = (
        f"https://randomuser.me/api/?results={count}"
        f"&inc=gender,name,picture,dob,location,login&nat={NATIONALITIES}{gender_param}&noinfo"
    )
    with urllib.request.urlopen(url, timeout=30) as resp:
        import json
        return json.load(resp)["results"]


async def count_seed_profiles(db: Database, gender_label: str) -> int:
    return await db.fetch_val(
        """
        SELECT COUNT(*) FROM users u
        JOIN user_profiles up ON up.user_id = u.id
        WHERE u.email LIKE '%@matcha-seed.dev' AND up.gender = $1
        """,
        gender_label,
    )


async def seed_gender(
    db: Database,
    user_repo: UserRepository,
    profile_repo: ProfileRepository,
    tags: list[dict],
    hashed_password: str,
    gender_label: str,
    target: int,
    batch_size: int,
) -> int:
    existing_count = await count_seed_profiles(db, gender_label)
    to_create = target - existing_count
    if to_create <= 0:
        print(f"{gender_label}: already have {existing_count} (target {target}). Nothing to do.")
        return 0

    print(f"{gender_label}: have {existing_count}, creating {to_create} more.")
    # randomuser.me has no Non-binary/Other — borrow a random male/female source.
    randomuser_gender = "male" if gender_label == "Man" else "female" if gender_label == "Woman" else None

    created = 0
    remaining = to_create
    while remaining > 0:
        n = min(batch_size, remaining)
        people = fetch_people(n, randomuser_gender)

        for person in people:
            first = person["name"]["first"]
            last = person["name"]["last"]
            full_name = f"{first} {last}"
            username = f"{person['login']['username']}_{person['login']['uuid'][:8]}"
            email = f"{username}@matcha-seed.dev"

            user_id = await create_seed_user(
                user_repo, db, full_name, username, email, hashed_password
            )
            if user_id is None:
                continue

            sexual_orientation = random.choice(ORIENTATIONS)
            birth_year = int(person["dob"]["date"][:4])
            birth_date = datetime(
                max(birth_year, 1950), 1, 1, tzinfo=timezone.utc
            )
            chosen_tags = random.sample(tags, k=min(len(tags), random.randint(3, 6)))
            bio = random_bio(chosen_tags[0]["name"])

            latitude = float(person["location"]["coordinates"]["latitude"])
            longitude = float(person["location"]["coordinates"]["longitude"])
            # randomuser.me returns city/state/country pre-transliterated to Latin script.
            location_label = f"{person['location']['city']}, {person['location']['country']}"

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
                photo_url = fetch_and_upload_photo(user_id, person["picture"]["large"])
                photo_rows = await profile_repo.add_photos(user_id, [photo_url], start_order=1)
                if photo_rows:
                    await profile_repo.set_profile_picture(user_id, photo_rows[0]["id"])
            except Exception as e:
                print(f"  photo failed for {username}: {e}")

            await profile_repo.add_tags(user_id, [t["id"] for t in chosen_tags])

            created += 1
            if created % 50 == 0:
                print(f"  {gender_label}: {created}/{to_create} created...")

        remaining -= n

    return created


async def seed(target: int, batch_size: int):
    db = Database()
    await db.connect()
    ensure_bucket()

    user_repo = UserRepository(db)
    profile_repo = ProfileRepository(db)
    tags = await load_existing_tags(profile_repo)
    print(f"Tag pool ready: {len(tags)} tags")

    hashed_password = get_password_hash(DEFAULT_PASSWORD)
    per_gender_target = target // len(GENDER_LABELS)

    created_by_gender = {}
    for gender_label in GENDER_LABELS:
        created_by_gender[gender_label] = await seed_gender(
            db, user_repo, profile_repo, tags, hashed_password,
            gender_label, per_gender_target, batch_size,
        )

    await db.disconnect()
    total = sum(created_by_gender.values())
    summary = ", ".join(f"{n} {g}" for g, n in created_by_gender.items())
    print(f"Done. Created {total} profiles ({summary}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=500, help="minimum number of seed profiles to have (spread evenly across 4 genders)")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    asyncio.run(seed(args.target, args.batch_size))
