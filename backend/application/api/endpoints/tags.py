from fastapi import APIRouter, Depends
from application.database import get_db, Database
from application.repository.tag_repo import TagRepository
from application.schema.tag_schemas import TagResponse
from application.utils import get_current_user
from typing import List

router = APIRouter()


@router.get("", response_model=List[TagResponse])
async def list_tags(
    db: Database = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    repo = TagRepository(db)
    return await repo.get_all_tags()
