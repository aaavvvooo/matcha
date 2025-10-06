from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from contextlib import asynccontextmanager
import asyncpg
from application.api.router import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler for startup and shutdown"""
    # Startup
    await database.connect()
    print("✅ Database connection pool created")
    
    yield
    
    # Shutdown
    await database.disconnect()
    print("❌ Database connection pool closed")

from .database import database


app = FastAPI(title="My Full Stack App",
              lifespan=lifespan)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def read_root():
    return {"message": "FastAPI Backend Connected to PostgreSQL", "database": "Connected"}


@app.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint
    Checks database connection and returns pool stats
    """
    try:
        # Check if pool exists
        if not database.pool:
            raise HTTPException(
                status_code=503,
                detail="Database pool not initialized"
            )
        
        # Test database query
        result = await database.fetch_val("SELECT 1")
        
        
        # Get pool statistics
        pool_size = database.pool.get_size()
        pool_free = database.pool.get_idle_size()
        pool_used = pool_size - pool_free
        
        # Check database version
        db_version = await database.fetch_val("SELECT version()")
        
        return {
            "status": "healthy",
            "database": {
                "connected": True,
                "test_query": result == 1,
                "version": db_version.split(',')[0] if db_version else "unknown"
            },
            "connection_pool": {
                "size": pool_size,
                "used": pool_used,
                "free": pool_free,
                "max_size": database.pool.get_max_size(),
                "min_size": database.pool.get_min_size()
            }
        }
        
    except asyncpg.PostgresError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "database": {
                    "connected": False,
                    "error": str(e)
                }
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unhealthy",
                "error": str(e)
            }
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