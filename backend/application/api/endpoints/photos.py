import asyncio
from typing import Iterator

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse

from application.database import get_db, Database
from application.repository.profile_repo import ProfileRepository
from application.repository.social_repo import SocialRepository
from application.utils import get_current_user_from_cookie
from application.utils.image import SNIFF_BYTES, detect_image_type
from application.limiter import limiter


router = APIRouter()

# A photo is only ever an image: even if someone could write arbitrary bytes or metadata into the
# bucket, this response can't run script on the API origin or be rendered as a document.
_PHOTO_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
}


def _sniff(chunks: Iterator[bytes]) -> tuple[bytes, Iterator[bytes]]:
    """Reads at least SNIFF_BYTES from the stream (blocking: run in a thread). Returns the bytes
    read and the iterator for the rest."""
    head = b""
    for chunk in chunks:
        head += chunk
        if len(head) >= SNIFF_BYTES:
            break
    return head, chunks


def _replay(head: bytes, rest: Iterator[bytes]) -> Iterator[bytes]:
    yield head
    yield from rest


@router.get("/photo/{key:path}")
@limiter.limit("120/minute")
async def get_photo(
    request: Request,
    key: str,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_cookie),
):
    from application.clients.storage import PhotoNotFound, get_photo_object

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
        photo = await asyncio.to_thread(get_photo_object, key)
        head, rest = await asyncio.to_thread(_sniff, photo.chunks)
    except PhotoNotFound:
        raise HTTPException(status_code=404, detail="Photo not found")

    # The type comes from the bytes, never from the stored object metadata.
    media_type = detect_image_type(head)
    if media_type is None:
        raise HTTPException(status_code=404, detail="Photo not found")

    return StreamingResponse(_replay(head, rest), media_type=media_type, headers=_PHOTO_HEADERS)
