"""Shared helpers for scripts/seed_profiles.py and scripts/seed_armenia_profiles.py."""
import random
import urllib.request

from application.repository.user_repo import UserRepository
from application.repository.profile_repo import ProfileRepository
from application.clients.minio_client import upload_photo

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

_photo_cache: dict[str, str] = {}


def random_bio(tag_name: str) -> str:
    return random.choice(BIO_TEMPLATES).format(tag=tag_name)


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


async def create_seed_user(
    user_repo: UserRepository,
    db,
    full_name: str,
    username: str,
    email: str,
    hashed_password: str,
) -> int | None:
    """Creates the user + marks it validated. Returns None if username taken."""
    existing = await user_repo.get_user_by_username(username)
    if existing:
        return None

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
    return user_id
