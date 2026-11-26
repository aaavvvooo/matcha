import asyncio

import pytest
from fastapi import HTTPException

from application.service.auth_service import MAX_SESSIONS_PER_USER, MAX_TOKENS_PER_SESSION, AuthService
from application.utils.tokens import decode_token


@pytest.fixture
async def signed_in(db, make_user):
    """The auth service and a function that signs the same person in on one more device."""
    user_id = await make_user("ann")
    service = AuthService(db)

    async def sign_in() -> str:
        _, refresh = await service.issue_session(user_id, 0)
        return refresh

    return service, sign_in


async def _refused(service: AuthService, token: str) -> bool:
    try:
        await service.refresh(token)
    except HTTPException as error:
        assert error.status_code == 401
        return True
    return False


async def _rows(db) -> int:
    return await db.fetch_val("SELECT count(*) FROM refresh_tokens")


async def _end_grace(db) -> None:
    await db.execute(
        "UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE expires_at < now() + interval '1 hour'"
    )


async def test_a_second_device_does_not_end_the_first(signed_in):
    service, sign_in = signed_in
    laptop, phone = await sign_in(), await sign_in()

    assert not await _refused(service, laptop)
    assert not await _refused(service, phone)


async def test_tokens_minted_together_are_different(signed_in, db):
    service, sign_in = signed_in
    tokens = [await service.issue_session(1, 0) for _ in range(5)]

    assert len({access for access, _ in tokens}) == 5
    assert len({refresh for _, refresh in tokens}) == 5


async def test_two_tabs_refreshing_at_once_both_stay_signed_in(signed_in):
    service, sign_in = signed_in
    cookie = await sign_in()

    results = await asyncio.gather(service.refresh(cookie), service.refresh(cookie))

    for _, refresh in results:
        assert not await _refused(service, refresh)


async def test_a_rotated_token_dies_after_the_grace_period(signed_in, db):
    service, sign_in = signed_in
    old = await sign_in()
    _, new = await service.refresh(old)
    await _end_grace(db)

    assert await _refused(service, old)
    assert not await _refused(service, new)


async def test_replaying_a_rotated_token_does_not_extend_its_grace(signed_in, db):
    service, sign_in = signed_in
    old = await sign_in()
    await service.refresh(old)
    shortest = "SELECT min(expires_at) FROM refresh_tokens"
    first = await db.fetch_val(shortest)

    await asyncio.sleep(0.05)
    await service.refresh(old)

    assert await db.fetch_val(shortest) == first


async def test_logout_ends_this_device_only(signed_in):
    service, sign_in = signed_in
    laptop, phone = await sign_in(), await sign_in()

    await service.logout(None, laptop)

    assert await _refused(service, laptop)
    assert not await _refused(service, phone)


async def test_logout_also_ends_the_tokens_this_device_rotated_away_from(signed_in):
    service, sign_in = signed_in
    old = await sign_in()
    _, new = await service.refresh(old)

    await service.logout(None, new)

    assert await _refused(service, old)  # still inside its grace period
    assert await _refused(service, new)


async def test_logout_without_the_cookie_ends_every_session(signed_in):
    service, sign_in = signed_in
    phone = await sign_in()
    access, laptop = await service.issue_session(1, 0)

    await service.logout(access, None)

    assert await _refused(service, laptop)
    assert await _refused(service, phone)


async def test_someone_elses_cookie_cannot_end_my_session(db, make_user):
    ann, bob = await make_user("ann"), await make_user("bob")
    service = AuthService(db)
    _, anns = await service.issue_session(ann, 0)
    bobs_access, _ = await service.issue_session(bob, 0)

    await service.logout(bobs_access, anns)

    assert not await _refused(service, anns)


async def test_sessions_per_user_are_capped_dropping_the_oldest(signed_in, db):
    service, sign_in = signed_in
    tokens = [await sign_in() for _ in range(MAX_SESSIONS_PER_USER + 2)]

    assert await _rows(db) == MAX_SESSIONS_PER_USER
    assert await _refused(service, tokens[0])
    assert not await _refused(service, tokens[-1])


async def test_hammering_refresh_does_not_pile_up_rows(signed_in, db):
    service, sign_in = signed_in
    cookie = await sign_in()
    for _ in range(20):
        await _refused(service, cookie)

    assert await _rows(db) <= MAX_TOKENS_PER_SESSION


async def test_a_password_change_ends_every_session(signed_in, db):
    service, sign_in = signed_in
    tokens = [await sign_in(), await sign_in()]
    await db.execute("UPDATE users SET token_version = 1")

    assert [await _refused(service, token) for token in tokens] == [True, True]


async def test_an_access_token_is_not_a_refresh_token(signed_in):
    service, _ = signed_in
    access, refresh = await service.issue_session(1, 0)

    assert await _refused(service, access)
    assert decode_token(refresh)["type"] == "refresh"


async def test_logout_racing_a_refresh_leaves_nothing_alive(signed_in):
    service, sign_in = signed_in
    for _ in range(40):
        cookie = await sign_in()

        rotated, _ = await asyncio.gather(
            service.refresh(cookie), service.logout(None, cookie), return_exceptions=True
        )

        if not isinstance(rotated, BaseException):
            assert await _refused(service, rotated[1])
        assert await _refused(service, cookie)


async def test_a_stale_cookie_at_logout_does_not_end_other_devices(signed_in, db):
    service, sign_in = signed_in
    phone = await sign_in()
    access, laptop = await service.issue_session(1, 0)
    await service.logout(None, laptop)  # its row is gone

    await service.logout(access, laptop)

    assert not await _refused(service, phone)


async def test_a_refresh_cannot_outlive_a_password_reset_that_lands_meanwhile(signed_in, db, monkeypatch):
    service, sign_in = signed_in
    cookie = await sign_in()
    read_user = service.user_repo.get_user_by_id

    async def read_then_reset(user_id):
        user = await read_user(user_id)
        await db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = $1", user_id)
        return user

    monkeypatch.setattr(service.user_repo, "get_user_by_id", read_then_reset)

    assert await _refused(service, cookie)
    assert await _rows(db) == 1
