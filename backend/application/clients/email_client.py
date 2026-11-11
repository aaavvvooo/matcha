import logging
from datetime import datetime, timezone
from urllib.parse import urlencode

import sib_api_v3_sdk
from jinja2 import Environment, FileSystemLoader, select_autoescape
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
        self.jinja_env = build_template_env(self.template_dir)

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
        return render_template(self.jinja_env, template_name, **kwargs)

    def _link(self, path: str, token: str) -> str:
        return f"{(self.frontend_url or '').rstrip('/')}{path}?{urlencode({'token': token})}"

    def send_verification_email(self, to: str, username: str, token: str):
        html_content = self._render_template(
            "verification_email.html",
            verification_url=self._link("/verify-email", token),
            username=username,
            email_change=False,
        )
        self._send_email(to, "Verify your email", html_content)

    def send_email_change_email(self, to: str, username: str, token: str):
        """Sent to the NEW address of a pending email change."""
        html_content = self._render_template(
            "verification_email.html",
            verification_url=self._link("/verify-email", token),
            username=username,
            email_change=True,
        )
        self._send_email(to, "Confirm your new email address", html_content)

    def send_password_reset_email(self, to: str, username: str, token: str):
        html_content = self._render_template(
            "password_reset_email.html",
            url=self._link("/reset-password", token),
            user_name=username,
            expires_in="60 minutes",
        )
        self._send_email(to, "Password reset request", html_content)


def build_template_env(template_dir: Path) -> Environment:
    """Autoescaping on: usernames, names and links are user-influenced and must never become markup."""
    return Environment(
        loader=FileSystemLoader(template_dir),
        autoescape=select_autoescape(["html", "xml"]),
    )


def render_template(env: Environment, template_name: str, **kwargs) -> str:
    kwargs.setdefault("year", datetime.now(timezone.utc).year)
    return env.get_template(template_name).render(**kwargs)
