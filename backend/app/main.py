from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import database

app = FastAPI(title="My Full Stack App")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# @app.on_event("startup")
# async def startup():
#     # Create database tables
#     async with database.engine.begin() as conn:
#         await conn.run_sync(models.Base.metadata.create_all)


@app.get("/")
async def read_root():
    return {"message": "FastAPI Backend Connected to PostgreSQL", "database": "Connected"}


@app.get("/health")
async def health_check():
    try:
        # Test database connection
        async with database.AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}