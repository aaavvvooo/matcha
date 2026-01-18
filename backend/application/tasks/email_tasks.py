from celery import Task
from application.clients import EmailClient
from application.celery_app import celery_app
from application.config import BREVO_API_KEY


class EmailTask(Task):
    _email_service = None

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
    default_retry_delay=10
)
def send_verification_email_task(self, to: str, username: str, token: str):
    try:
        self.email_service.send_verification_email(to, username, token)
        print(f"Email sent successfully to {to}")
        return {"status": "success", "send_to": to}
    except Exception as e:
        print(f"Error sending email to {to}: {e}")
        self.retry(exc=e)



    
