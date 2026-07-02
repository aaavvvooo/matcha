"""Seed the database with fake user profiles (data + photos) for evaluation.

Pulls generated people from randomuser.me (name, gender, dob, city, GPS, photo)
and writes them straight into the DB via the existing repositories, uploading
photos to MinIO through the existing minio_client.

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
from application.clients.minio_client import ensure_bucket, upload_photo  # noqa: E402

GENDER_MAP = {"male": "Man", "female": "Woman"}
ORIENTATIONS = ["Heterosexual", "Homosexual", "Bisexual", "Other"]
BIO_TEMPLATES = [
    "Always up for a coffee and a good conversation. {tag} enthusiast.",
    "Looking for someone to explore the city with. Into {tag} and good food.",
    "{tag} lover, weekend adventurer, terrible cook.",
    "Here for genuine connections. Big fan of {tag} and lazy Sundays.",
    "New in town, into {tag} and bad puns.",
    "Passionate about {tag}. Let's see where this goes.",
]
DEFAULT_PASSWORD = "Seed1234!"


def random_bio(tag_name: str):
    return random.choice(BIO_TEMPLATES).format(tag=tag_name)


def fetch_people(count: int) -> list[dict]:
    url = f"https://randomuser.me/api/?results={count}&inc=gender,name,picture,dob,location,login&noinfo"
    with urllib.request.urlopen(url, timeout=30) as resp:
        import json
        return json.load(resp)["results"]


_photo_cache: dict[str, str] = {}


def fetch_and_upload_photo(picture_url: str) -> str:
    if picture_url in _photo_cache:
        return _photo_cache[picture_url]
    with urllib.request.urlopen(picture_url, timeout=15) as resp:
        data = resp.read()
    minio_url = upload_photo(data, "image/jpeg")
    _photo_cache[picture_url] = minio_url
    return minio_url


async def load_existing_tags(profile_repo: ProfileRepository) -> list[dict]:
    rows = await profile_repo.get_all_tags()
    if not rows:
        raise RuntimeError(
            "No tags found in the database. Run scripts/seed_tags.py first."
        )
    return list(rows)


async def count_seed_profiles(db: Database) -> int:
    return await db.fetch_val(
        "SELECT COUNT(*) FROM users WHERE email LIKE '%@matcha-seed.dev'"
    )


async def seed(target: int, batch_size: int):
    db = Database()
    await db.connect()

    existing_count = await count_seed_profiles(db)
    to_create = target - existing_count
    if to_create <= 0:
        print(f"Already have {existing_count} seed profiles (target {target}). Nothing to do.")
        await db.disconnect()
        return

    print(f"Have {existing_count} seed profiles, creating {to_create} more to reach {target}.")
    ensure_bucket()

    user_repo = UserRepository(db)
    profile_repo = ProfileRepository(db)

    tags = await load_existing_tags(profile_repo)
    print(f"Tag pool ready: {len(tags)} tags")

    created = 0
    remaining = to_create
    hashed_password = get_password_hash(DEFAULT_PASSWORD)

    while remaining > 0:
        n = min(batch_size, remaining)
        people = fetch_people(n)

        for person in people:
            first = person["name"]["first"]
            last = person["name"]["last"]
            full_name = f"{first} {last}"
            username = f"{person['login']['username']}_{person['login']['uuid'][:8]}"
            email = f"{username}@matcha-seed.dev"

            existing = await user_repo.get_user_by_username(username)
            if existing:
                continue

            pool = db.require_pool()
            async with pool.acquire() as connection:
                async with connection.transaction():
                    user_record = await user_repo.create_user(
                        full_name, username, email, hashed_password, connection
                    )
                    user_id = user_record["id"]
                    await connection.execute(
                        "UPDATE users SET is_validated = true WHERE id = $1", user_id
                    )

            gender = GENDER_MAP.get(person["gender"], "Other")
            sexual_orientation = random.choice(ORIENTATIONS)
            birth_year = int(person["dob"]["date"][:4])
            birth_date = datetime(
                max(birth_year, 1950), 1, 1, tzinfo=timezone.utc
            )
            chosen_tags = random.sample(tags, k=min(len(tags), random.randint(3, 6)))
            bio = random_bio(chosen_tags[0]["name"])

            await db.execute(
                """
                INSERT INTO user_profiles
                    (user_id, bio, birth_date, gender, sexual_orientation, latitude, longitude, location_label, fame_rating)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                user_id, bio, birth_date, gender, sexual_orientation,
                float(person["location"]["coordinates"]["latitude"]),
                float(person["location"]["coordinates"]["longitude"]),
                f"{person['location']['city']}, {person['location']['country']}",
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
            if created % 50 == 0:
                print(f"  {created} profiles created...")

        remaining -= n

    await db.disconnect()
    print(f"Done. Created {created} profiles.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=500, help="minimum number of seed profiles to have")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()
    asyncio.run(seed(args.target, args.batch_size))
