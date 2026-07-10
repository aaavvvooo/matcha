from datetime import date, timezone
from fastapi import HTTPException, status

from application.database import Database
from application.repository.social_repo import SocialRepository
from application.repository.profile_repo import ProfileRepository
from application.repository.user_repo import UserRepository
from application.schema.users_schemas import (
    UserProfileResponse,
    LikeResponse,
    ViewerResponse,
    SimpleUserResponse,
)
from application.schema.profile_schemas import PhotoResponse


def _calculate_age(birth_date) -> int | None:
    if not birth_date:
        return None
    born = birth_date.astimezone(timezone.utc).date() if birth_date.tzinfo else birth_date.date()
    today = date.today()
    years = today.year - born.year
    if (today.month, today.day) < (born.month, born.day):
        years -= 1
    return years


class SocialService:
    def __init__(self, db: Database):
        self.db = db
        self.social_repo = SocialRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.user_repo = UserRepository(db)

    async def get_user_profile(self, viewer_id: int, user_id: int) -> UserProfileResponse:
        profile = await self.profile_repo.get_profile(user_id)
        if not profile or profile["gender"] is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        is_blocked_by_viewer = False
        is_blocking_viewer = False
        if viewer_id != user_id:
            is_blocked_by_viewer = await self.social_repo.is_blocked(viewer_id, user_id)
            is_blocking_viewer = await self.social_repo.is_blocked(user_id, viewer_id)
            if is_blocking_viewer:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")
            if not is_blocked_by_viewer:
                await self.social_repo.record_view(viewer_id, user_id)
                await self.social_repo.recalculate_fame(user_id)

        photos_rows = await self.profile_repo.get_user_photos(user_id)
        photos = [PhotoResponse(**dict(row)) for row in photos_rows]
        tag_names = await self.profile_repo.get_user_tag_names(user_id)
        is_liked_by_me = await self.social_repo.has_liked(viewer_id, user_id)
        liked_me = await self.social_repo.has_liked(user_id, viewer_id)
        # views_count/likes_count are private stats — only the profile owner may see them.
        if viewer_id == user_id:
            views_count = await self.social_repo.count_viewers(user_id)
            likes_count = await self.social_repo.count_likers(user_id)
        else:
            views_count = 0
            likes_count = 0
        fresh_fame = await self.db.fetch_val(
            "SELECT COALESCE(fame_rating, 0) FROM user_profiles WHERE user_id = $1", user_id
        )

        return UserProfileResponse(
            user_id=profile["user_id"],
            full_name=profile["full_name"],
            username=profile["username"],
            bio=profile["bio"],
            age=_calculate_age(profile["birth_date"]),
            gender=profile["gender"],
            sexual_orientation=profile["sexual_orientation"],
            fame_rating=fresh_fame if fresh_fame is not None else profile["fame_rating"],
            is_online=profile["is_online"] or False,
            last_seen=profile["last_seen"],
            location_label=profile["location_label"],
            tags=tag_names,
            photos=photos,
            is_liked_by_me=is_liked_by_me,
            liked_me=liked_me,
            views_count=views_count,
            likes_count=likes_count,
            is_blocked_by_me=is_blocked_by_viewer,
        )

    async def like(self, liker_id: int, liked_id: int) -> LikeResponse:
        if liker_id == liked_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot like yourself")
        target = await self.profile_repo.get_profile(liked_id)
        if not target or target["gender"] is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if await self.social_repo.is_blocked_either_way(liker_id, liked_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not found")
        photo_count = await self.profile_repo.count_photos(liker_id)
        if photo_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Add a profile picture before liking other users",
            )

        await self.social_repo.like_user(liker_id, liked_id)
        await self.social_repo.recalculate_fame(liked_id)

        is_match = await self.social_repo.has_liked(liked_id, liker_id)
        if is_match:
            await self.social_repo.create_connection(liker_id, liked_id)

        return LikeResponse(liked=True, is_match=is_match)

    async def unlike(self, liker_id: int, liked_id: int) -> LikeResponse:
        await self.social_repo.unlike_user(liker_id, liked_id)
        await self.social_repo.remove_connection(liker_id, liked_id)
        await self.social_repo.recalculate_fame(liked_id)
        return LikeResponse(liked=False, is_match=False)

    async def block(self, blocker_id: int, blocked_id: int):
        if blocker_id == blocked_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot block yourself")
        await self.social_repo.block_user(blocker_id, blocked_id)
        await self.social_repo.unlike_user(blocker_id, blocked_id)
        await self.social_repo.unlike_user(blocked_id, blocker_id)
        await self.social_repo.remove_connection(blocker_id, blocked_id)
        await self.social_repo.recalculate_fame(blocker_id)
        await self.social_repo.recalculate_fame(blocked_id)
        return {"blocked": True}

    async def unblock(self, blocker_id: int, blocked_id: int):
        await self.social_repo.unblock_user(blocker_id, blocked_id)
        return {"blocked": False}

    async def get_blocked_users(self, user_id: int):
        rows = await self.social_repo.get_blocked_users(user_id)
        return [SimpleUserResponse(**dict(row)) for row in rows]

    async def report(self, reporter_id: int, reported_id: int):
        if reporter_id == reported_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot report yourself")
        await self.social_repo.report_user(reporter_id, reported_id)
        return {"reported": True}

    async def get_viewers(self, requester_id: int, user_id: int):
        if requester_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        rows = await self.social_repo.get_viewers(user_id)
        return [ViewerResponse(**dict(row)) for row in rows]

    async def get_likers(self, requester_id: int, user_id: int):
        if requester_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
        rows = await self.social_repo.get_likers(user_id)
        return [SimpleUserResponse(**dict(row)) for row in rows]
