from celery import Celery
from .config import REDIS_URL

celery_app = Celery(
    "matcha",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["application.tasks.email_tasks"]
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000
)