import uuid
import os
from fastapi import HTTPException, UploadFile, status
from application.database import Database
from application.repository.photo_repo import PhotoRepository, MAX_PHOTOS

IMAGES_DIR = "/app/images"

_ALLOWED_SIGNATURES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG": "png",
    b"RIFF": "webp",   # checked more specifically below
}


def _detect_extension(header: bytes) -> str:
    if header[:3] == b"\xff\xd8\xff":
        return "jpg"
    if header[:4] == b"\x89PNG":
        return "png"
    if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Only JPEG, PNG, and WEBP images are allowed",
    )


class PhotoService:
    def __init__(self, db: Database):
        self.repo = PhotoRepository(db)

    async def upload_photo(self, user_id: int, file: UploadFile) -> dict:
        if await self.repo.count_photos(user_id) >= MAX_PHOTOS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum of {MAX_PHOTOS} photos allowed",
            )

        header = await file.read(12)
        ext = _detect_extension(header)
        remaining = await file.read()
        content = header + remaining

        filename = f"{uuid.uuid4().hex}.{ext}"
        user_dir = os.path.join(IMAGES_DIR, str(user_id))
        os.makedirs(user_dir, exist_ok=True)
        filepath = os.path.join(user_dir, filename)

        with open(filepath, "wb") as f:
            f.write(content)

        url = f"/images/{user_id}/{filename}"
        order = await self.repo.count_photos(user_id) + 1
        photo = await self.repo.create_photo(user_id, url, order)
        return photo

    async def delete_photo(self, user_id: int, photo_id: int) -> None:
        photo = await self.repo.get_photo(photo_id)
        if not photo:
            raise HTTPException(status_code=404, detail="Photo not found")
        if photo["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your photo")

        await self.repo.clear_profile_picture_if_deleted(photo_id, user_id)
        await self.repo.delete_photo(photo_id)

        filepath = os.path.join(IMAGES_DIR, photo["url"].lstrip("/images/"))
        if os.path.exists(filepath):
            os.remove(filepath)

    async def set_profile_picture(self, user_id: int, photo_id: int) -> None:
        photo = await self.repo.get_photo(photo_id)
        if not photo:
            raise HTTPException(status_code=404, detail="Photo not found")
        if photo["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your photo")

        await self.repo.set_main_photo(photo_id, user_id)
