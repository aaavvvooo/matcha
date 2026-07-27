from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse

from application.database import get_db, Database
from application.repository.profile_repo import ProfileRepository
from application.repository.social_repo import SocialRepository
from application.utils import get_current_user_from_cookie
from application.limiter import limiter


router = APIRouter()


@router.get("/photo/{key:path}")
@limiter.limit("120/minute")
async def get_photo(
    request: Request,
    key: str,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_cookie),
):
    from application.clients.minio_client import get_photo_object
    from botocore.exceptions import ClientError

    profile_repo = ProfileRepository(db)
    social_repo = SocialRepository(db)

    owner_id = await profile_repo.get_photo_owner_by_key(key)
    if owner_id is None:
        raise HTTPException(status_code=404, detail="Photo not found")

    viewer_id = current_user["user"]["id"]
    if viewer_id != owner_id:
        if await social_repo.is_blocked_either_way(viewer_id, owner_id):
            raise HTTPException(status_code=404, detail="Photo not found")

    try:
        obj = get_photo_object(key)
    except ClientError:
        raise HTTPException(status_code=404, detail="Photo not found")

    return StreamingResponse(
        obj["Body"].iter_chunks(),
        media_type=obj.get("ContentType", "application/octet-stream"),
    )
