from application.celery_app import celery_app
from application.database import database


@celery_app.task(name="cleanup_expired_tokens")
def cleanup_expired_tokens():
    import asyncio

    async def _run():
        await database.execute(
            """
            DELETE FROM verification_tokens
            WHERE used = TRUE OR expires_at < NOW()
            """
        )

    asyncio.run(_run())
