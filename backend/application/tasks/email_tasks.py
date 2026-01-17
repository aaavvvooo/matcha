from celery import Task
from application.celery_app import celery_app
from application.clients.email_client import EmailClient
from application.config import RESEND_API_KEY
import asyncio

class EmailTask(Task):
    """Base task with email service"""
    _email_service = None
    
    @property
    def email_service(self):
        if self._email_service is None:
            self._email_service = EmailClient(api_key=RESEND_API_KEY)
        return self._email_service


@celery_app.task(
    bind=True,
    base=EmailTask,
    name='send_verification_email',
    max_retries=3,
    default_retry_delay=60
)
def send_verification_email_task(self, email: str, username: str, token: str):
    """
    Celery task to send verification email safely.
    """
    subject = "Please verify your email"

    try:
        asyncio.run(
            self.email_service.send_verification_email(email, username, subject, token)
        )
        print(f"✅ Verification email sent to {email}")
        return {"status": "success", "email": email}

    except Exception as exc:
        print(f"❌ Failed to send verification email to {email}: {exc}")
        raise self.retry(exc=exc)
    

@celery_app.task(
    bind=True,
    base=EmailTask,
    name='send_password_reset_email',
    max_retries=3,
    default_retry_delay=60
)
def send_forget_password_email_task(self, email: str):
    try: 
        asyncio.run(
            self.email_service.send_forget_password_email(email)
        )
        return {"status": "success", "email": email}

    except Exception as exc:
        print(f"❌ Failed to send forget password email to {email}: {exc}")
        raise self.retry(exc=exc)