from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request

from application.database import Database, get_db
from application.limiter import limiter
from application.schema.date_schemas import DateCreate, DateResponse
from application.schema.fields import PathId
from application.schema.value_sets import DateStatus
from application.service.date_service import DateService
from application.utils import get_current_user

router = APIRouter()


@router.post("", response_model=DateResponse, status_code=201)
@limiter.limit("10/minute")
async def propose_date(
    request: Request,
    body: DateCreate,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await DateService(db).propose(current_user["user"]["id"], body)


@router.get("", response_model=list[DateResponse])
@limiter.limit("60/minute")
async def list_dates(
    request: Request,
    status: Optional[DateStatus] = Query(None),
    upcoming: Optional[bool] = Query(None),
    order: Literal["asc", "desc"] = Query("asc"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await DateService(db).list_dates(
        current_user["user"]["id"], status, upcoming, order, limit, offset
    )


@router.post("/{date_id}/accept", response_model=DateResponse)
@limiter.limit("30/minute")
async def accept_date(
    request: Request,
    date_id: PathId,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await DateService(db).accept(current_user["user"]["id"], date_id)


@router.post("/{date_id}/decline", response_model=DateResponse)
@limiter.limit("30/minute")
async def decline_date(
    request: Request,
    date_id: PathId,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await DateService(db).decline(current_user["user"]["id"], date_id)


@router.post("/{date_id}/cancel", response_model=DateResponse)
@limiter.limit("30/minute")
async def cancel_date(
    request: Request,
    date_id: PathId,
    db: Database = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    return await DateService(db).cancel(current_user["user"]["id"], date_id)
