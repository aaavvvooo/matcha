from fastapi import APIRouter, Depends, Query, Request

from application.database import Database, get_db
from application.limiter import limiter
from application.schema.notification_schemas import MarkReadResponse, NotificationResponse, UnreadCountResponse
from application.service.notification_service import NotificationService
from application.utils import get_current_user

router = APIRouter()


@router.get("", response_model=list[NotificationResponse])
@limiter.limit("60/minute")
async def list_notifications(
    request: Request,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await NotificationService(db).list(current_user["user"]["id"], limit, offset)


@router.get("/unread-count", response_model=UnreadCountResponse)
@limiter.limit("60/minute")
async def unread_count(
    request: Request,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return UnreadCountResponse(unread=await NotificationService(db).unread_count(current_user["user"]["id"]))


@router.post("/read", response_model=MarkReadResponse)
@limiter.limit("60/minute")
async def mark_read(
    request: Request,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    updated = await NotificationService(db).mark_all_read(current_user["user"]["id"])
    return MarkReadResponse(updated=updated)
