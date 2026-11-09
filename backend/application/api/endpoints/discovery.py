from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from application.database import Database, get_db
from application.limiter import limiter
from application.schema.discovery_schemas import DiscoveryProfile, DiscoveryQuery, SearchQuery
from application.service.discovery_service import DiscoveryService
from application.utils import require_profile

router = APIRouter()


@router.get("/browse", response_model=list[DiscoveryProfile])
@limiter.limit("60/minute")
async def browse(
    request: Request,
    q: Annotated[DiscoveryQuery, Query()],
    db: Database = Depends(get_db),
    current_user: dict = Depends(require_profile),
):
    return await DiscoveryService(db).browse(current_user["user"]["id"], q)


@router.get("/search", response_model=list[DiscoveryProfile])
@limiter.limit("30/minute")
async def search(
    request: Request,
    q: Annotated[SearchQuery, Query()],
    db: Database = Depends(get_db),
    current_user: dict = Depends(require_profile),
):
    return await DiscoveryService(db).search(current_user["user"]["id"], q)
