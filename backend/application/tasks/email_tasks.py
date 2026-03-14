from celery import Task
from typing import Optional
from application.clients import EmailClient
from application.celery_app import celery_app
from application.config import BREVO_API_KEY


class EmailTask(Task):
    _email_service: Optional[EmailClient] = None

    @property
    def email_service(self):
        if not self._email_service:
            self._email_service = EmailClient(api_key=BREVO_API_KEY)
        return self._email_service


@celery_app.task(
    bind=True,
    base=EmailTask,
    name="send_verification_email",
    max_retries=3,
    default_retry_delay=10,
)
def send_verification_email_task(self, to: str, username: str, token: str):
    try:
        self.email_service.send_verification_email(to, username, token)
        return {"status": "success", "send_to": to}
    except Exception as e:
        self.retry(exc=e)


@celery_app.task(
    bind=True,
    base=EmailTask,
    name="send_password_reset_email",
    max_retries=3,
    default_retry_delay=10,
)
def send_password_reset_email_task(self, to: str, username: str, token: str):
    try:
        self.email_service.send_password_reset_email(to, username, token)
        return {"status": "success", "send_to": to}
    except Exception as e:
        self.retry(exc=e)
