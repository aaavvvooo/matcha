import asyncio

import pytest
from fastapi import HTTPException

from application.service.social_service import SocialService

ROUNDS = 25


async def _fame(db, user_id: int) -> float:
    return await db.fetch_val("SELECT fame_rating FROM user_profiles WHERE user_id = $1", user_id)


async def _connected(db) -> bool:
    return await db.fetch_val("SELECT count(*) FROM connections") > 0


async def _likes(db) -> int:
    return await db.fetch_val("SELECT count(*) FROM likes")


async def test_mutual_likes_connect_once(db, make_user):
    ann, bob = await make_user("ann"), await make_user("bob")
    service = SocialService(db)

    first = await service.like(ann, bob)
    second = await service.like(bob, ann)

    assert (first.is_match, second.is_match) == (False, True)
    assert await _connected(db)


async def test_a_match_counts_towards_the_fame_of_both(db, make_user):
    ann, bob = await make_user("ann"), await make_user("bob")
    service = SocialService(db)

    await service.like(ann, bob)
    await service.like(bob, ann)

    assert (await _fame(db, ann), await _fame(db, bob)) == (8, 8)  # like 3 + connection 5


async def test_an_unlike_lowers_the_fame_of_both(db, make_user):
    ann, bob = await make_user("ann"), await make_user("bob")
    service = SocialService(db)
    await service.like(ann, bob)
    await service.like(bob, ann)

    await service.unlike(ann, bob)

    assert await _fame(db, ann) == 3  # still liked by bob, no longer connected
    assert await _fame(db, bob) == 0


async def test_fame_is_capped_at_100(db, make_user):
    star = await make_user("star")
    for i in range(40):
        fan = await make_user(f"fan{i}")
        await db.execute("INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2)", fan, star)

    await SocialService(db).social_repo.recalculate_fame(star)

    assert await _fame(db, star) == 100


async def test_like_racing_unlike_never_leaves_a_one_sided_connection(db, make_user):
    ann, bob = await make_user("ann"), await make_user("bob")
    service = SocialService(db)
    for _ in range(ROUNDS):
        await db.execute("DELETE FROM likes; DELETE FROM connections")
        await service.like(bob, ann)

        await asyncio.gather(service.like(ann, bob), service.unlike(bob, ann))

        assert await _connected(db) == (await _likes(db) == 2)


async def test_like_racing_block_leaves_nothing_between_them(db, make_user):
    ann, bob = await make_user("ann"), await make_user("bob")
    service = SocialService(db)
    for _ in range(ROUNDS):
        await db.execute("DELETE FROM likes; DELETE FROM connections; DELETE FROM blocks")
        await service.like(bob, ann)

        await asyncio.gather(service.like(ann, bob), service.block(bob, ann), return_exceptions=True)

        assert not await _connected(db)
        assert await _likes(db) == 0


async def test_a_like_waits_for_a_block_in_progress(db, make_user):
    """Deterministic version of the race: the block holds the pair, the like must see it."""
    ann, bob = await make_user("ann"), await make_user("bob")
    service = SocialService(db)
    async with db.require_pool().acquire() as connection:
        transaction = connection.transaction()
        await transaction.start()
        await service.social_repo.lock_pair(ann, bob, connection)
        like = asyncio.create_task(service.like(ann, bob))
        await asyncio.sleep(0.2)
        assert not like.done()
        await service.social_repo.block_user(bob, ann, connection)
        await transaction.commit()

    with pytest.raises(HTTPException) as error:
        await like
    assert error.value.status_code == 404
    assert await _likes(db) == 0


async def test_simultaneous_views_are_all_counted(db, make_user):
    star = await make_user("star")
    fans = [await make_user(f"fan{i}") for i in range(12)]
    service = SocialService(db)

    await asyncio.gather(*(service.get_user_profile(fan, star) for fan in fans))

    assert await _fame(db, star) == len(fans)
