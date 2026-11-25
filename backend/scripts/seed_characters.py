"""Seed 300 parody profiles of famous fictional characters (scripts/characters/*.psv).

Adult characters only; every bio and "red flag" is original and the photos are drawn from
emoji, so no existing artwork is used. Half of them live in Armenia, the rest worldwide.

Idempotent: complete characters are skipped, half-made ones are finished.

Run inside the backend container:
    docker compose exec backend python scripts/seed_characters.py
"""
import asyncio
import random
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from asyncpg import Record  # noqa: E402
from pydantic import TypeAdapter  # noqa: E402

from application.clients.storage import ensure_bucket, upload_photo  # noqa: E402
from application.database import Database  # noqa: E402
from application.repository.profile_repo import ProfileRepository  # noqa: E402
from application.repository.user_repo import UserRepository  # noqa: E402
from application.schema.fields import PersonName, Username  # noqa: E402
from application.schema.profile_schemas import Bio  # noqa: E402
from application.utils.password import get_password_hash  # noqa: E402
from scripts.character_art import draw_portrait, draw_red_flag, emoji_file  # noqa: E402
from scripts.seed_armenia_profiles import random_armenian_location  # noqa: E402
from scripts.seed_common import (  # noqa: E402
    DEFAULT_PASSWORD,
    SEED_DOMAIN_CHARACTERS,
    back_fame_with_views,
    create_seed_user,
    load_existing_tags,
)
from scripts.seed_profiles import CITIES_BY_NAT, random_city_location  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent / "characters"
# others.psv alternates between the two.
GENDERS_BY_FILE = {"women": ("Woman",), "men": ("Man",), "others": ("Non-binary", "Other")}
# They are famous, after all.
FAME_RANGE = (55, 100)
MIN_AGE, MAX_AGE = 21, 99


@dataclass(frozen=True)
class Character:
    first_name: str
    last_name: str
    username: str
    gender: str
    age: int
    portrait: str
    prop: str
    tags: tuple[str, ...]
    bio: str
    red_flag: str

    @property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}"


def _username(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", ".", ascii_name).strip(".")


def _parse(line: str, gender: str) -> Character:
    name, age, portrait, prop, tags, bio, red_flag = line.split("|")
    first_name, last_name = name.split(" ", 1)
    character = Character(
        first_name=TypeAdapter(PersonName).validate_python(first_name),
        last_name=TypeAdapter(PersonName).validate_python(last_name),
        username=TypeAdapter(Username).validate_python(_username(name)),
        gender=gender,
        age=int(age),
        portrait=portrait,
        prop=prop,
        tags=tuple(tags.split(",")),
        bio=TypeAdapter(Bio).validate_python(f"{bio} Red flag: {red_flag}"),
        red_flag=red_flag,
    )
    if not MIN_AGE <= character.age <= MAX_AGE:
        raise ValueError(f"{name}: age must be {MIN_AGE}-{MAX_AGE}")
    for emoji in (portrait, prop):
        if not emoji_file(emoji).is_file():
            raise ValueError(f"{name}: no picture for {emoji}")
    return character


def load_characters() -> list[Character]:
    """Every character, checked against the same rules as a real sign-up."""
    characters: list[Character] = []
    for stem, genders in GENDERS_BY_FILE.items():
        text = (DATA_DIR / f"{stem}.psv").read_text(encoding="utf-8")
        lines = [line for line in text.splitlines() if line and not line.startswith("#")]
        characters.extend(_parse(line, genders[i % len(genders)]) for i, line in enumerate(lines))
    usernames = [c.username for c in characters]
    duplicates = {u for u in usernames if usernames.count(u) > 1}
    if duplicates:
        raise ValueError(f"duplicate characters: {sorted(duplicates)}")
    return characters


async def _add_profile(
    db: Database, profile_repo: ProfileRepository, tag_ids: dict[str, int],
    user_id: int, character: Character, in_armenia: bool,
) -> None:
    latitude, longitude, location_label = (
        random_armenian_location() if in_armenia else random_city_location(random.choice(list(CITIES_BY_NAT)))
    )
    birth_date = datetime(datetime.now(timezone.utc).year - character.age, 1, 1, tzinfo=timezone.utc)
    # Bisexual: matches every gender the viewer could be, so everyone meets them.
    await db.execute(
        """
        INSERT INTO user_profiles
            (user_id, bio, birth_date, gender, sexual_orientation, latitude, longitude, location_label, fame_rating)
        VALUES ($1, $2, $3, $4, 'Bisexual', $5, $6, $7, $8)
        """,
        user_id, character.bio, birth_date, character.gender,
        latitude, longitude, location_label, float(random.randint(*FAME_RANGE)),
    )
    await profile_repo.add_tags(user_id, [tag_ids[t] for t in character.tags])


async def _add_photos(profile_repo: ProfileRepository, user_id: int, character: Character) -> None:
    photos = [
        draw_portrait(character.name, character.portrait, character.prop),
        draw_red_flag(character.portrait, character.red_flag),
    ]
    urls = [upload_photo(user_id, photo, "image/jpeg") for photo in photos]
    rows = await profile_repo.add_photos(user_id, urls, start_order=1)
    await profile_repo.set_profile_picture(user_id, rows[0]["id"])


async def _existing(db: Database) -> dict[str, Record]:
    """Character accounts already in the database, by email, and what each still lacks."""
    rows = await db.fetch_all(
        """
        SELECT u.id, u.email,
               EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id) AS has_profile,
               EXISTS (SELECT 1 FROM photos ph WHERE ph.user_id = u.id) AS has_photos
        FROM users u
        WHERE split_part(u.email, '@', 2) = $1
        """,
        SEED_DOMAIN_CHARACTERS,
    )
    return {row["email"]: row for row in rows}


async def seed() -> None:
    characters = load_characters()
    db = Database()
    await db.connect()
    try:
        ensure_bucket()
        user_repo, profile_repo = UserRepository(db), ProfileRepository(db)
        tag_ids = {t["name"]: t["id"] for t in await load_existing_tags(profile_repo)}
        unknown = {t for c in characters for t in c.tags} - tag_ids.keys()
        if unknown:
            raise ValueError(f"unknown tags: {sorted(unknown)}")
        hashed_password = get_password_hash(DEFAULT_PASSWORD)
        existing = await _existing(db)

        completed = failed = 0
        for index, character in enumerate(characters):
            email = f"{character.username}@{SEED_DOMAIN_CHARACTERS}"
            account = existing.get(email)
            if account and account["has_profile"] and account["has_photos"]:
                continue
            # An interrupted run can leave an account without its profile or photos: finish it.
            try:
                user_id = account["id"] if account else await create_seed_user(
                    user_repo, db, character.first_name, character.last_name,
                    character.username, email, hashed_password,
                )
                if user_id is None:
                    print(f"  skipped {character.username}: username taken by another account")
                    continue
                if not (account and account["has_profile"]):
                    await _add_profile(db, profile_repo, tag_ids, user_id, character, in_armenia=index % 2 == 0)
                if not (account and account["has_photos"]):
                    await _add_photos(profile_repo, user_id, character)
            except Exception as e:  # one bad character must not cost the others; the next run retries it
                failed += 1
                print(f"  {character.username} failed: {type(e).__name__}: {e}")
                continue
            completed += 1
            if completed % 50 == 0:
                print(f"  {completed} characters added...")
        await back_fame_with_views(db)
        print(f"Done. Added {completed} of {len(characters)} characters, {failed} failed.")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(seed())
