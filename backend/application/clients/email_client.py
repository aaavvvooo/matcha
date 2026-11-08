import logging

import sib_api_v3_sdk
from jinja2 import Environment, FileSystemLoader
from pathlib import Path
from application.config import FRONTEND_URL, FROM_EMAIL

logger = logging.getLogger(__name__)


class EmailClient:
    def __init__(self, api_key: str):
        if FROM_EMAIL is None:
            raise RuntimeError("FROM_EMAIL must be set")
        self.configuration = sib_api_v3_sdk.Configuration()
        self.configuration.api_key["api-key"] = api_key
        self.api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(self.configuration)
        )
        self.frontend_url = FRONTEND_URL
        self.from_email = FROM_EMAIL

        self.template_dir = Path(__file__).parent.parent / "templates"
        self.jinja_env = Environment(loader=FileSystemLoader(self.template_dir))

    def _send_email(self, to: str, subject: str, html_content: str):
        # Brevo's ApiException propagates on purpose: the caller's retry loop
        # needs it, and it decides what to log (never the recipient address).
        send_mail = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to}],
            sender={"email": self.from_email, "name": "Matcha"},
            subject=subject,
            html_content=html_content,
        )
        self.api_instance.send_transac_email(send_smtp_email=send_mail)
        logger.info("Email sent: %s", subject)

    def _render_template(self, template_name: str, **kwargs):
        template = self.jinja_env.get_template(template_name)
        return template.render(**kwargs)

    def send_verification_email(self, to: str, username: str, token: str):
        url = f"{self.frontend_url}/verify-email?token={token}"
        html_content = self._render_template(
            "verification_email.html", **{"verification_url": url, "username": username}
        )
        self._send_email(to, "Verify your email", html_content)

    def send_password_reset_email(self, to: str, username: str, token: str):
        url = f"{self.frontend_url}/reset-password?token={token}"
        html_content = self._render_template(
            "password_reset_email.html",
            **{"url": url, "username": username},
        )
        self._send_email(to, "Password reset request", html_content)
