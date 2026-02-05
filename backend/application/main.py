from .database import database
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncpg
from application.api.router import router
from typing import Any, cast


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    await database.connect()
    print("✅ Database connection pool created")

    yield

    await database.disconnect()
    print("❌ Database connection pool closed")


app = FastAPI(title="Matcha", lifespan=lifespan)


app.add_middleware(
    cast(Any, CORSMiddleware),
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)


@app.get("/")
async def read_root():
    return {
        "message": "FastAPI Backend Connected to PostgreSQL",
        "database": "Connected",
    }


@app.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint
    Checks database connection and returns pool stats
    """
    try:
        if not database.pool:
            raise HTTPException(status_code=503, detail="Database pool not initialized")

        result = await database.fetch_val("SELECT 1")

        pool_size = database.pool.get_size()
        pool_free = database.pool.get_idle_size()
        pool_used = pool_size - pool_free

        db_version = await database.fetch_val("SELECT version()")

        return {
            "status": "healthy",
            "database": {
                "connected": True,
                "test_query": result == 1,
                "version": db_version.split(",")[0] if db_version else "unknown",
            },
            "connection_pool": {
                "size": pool_size,
                "used": pool_used,
                "free": pool_free,
                "max_size": database.pool.get_max_size(),
                "min_size": database.pool.get_min_size(),
            },
        }

    except asyncpg.PostgresError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "database": {"connected": False, "error": str(e)},
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=503, detail={"status": "unhealthy", "error": str(e)}
        )


@app.get("/health/simple")
async def health_check_simple():
    """
    Simple health check - just ping database
    Useful for load balancers
    """
    try:
        await database.fetch_val("SELECT 1")
        return {"status": "ok"}
    except Exception:
        raise HTTPException(status_code=503, detail={"status": "error"})
