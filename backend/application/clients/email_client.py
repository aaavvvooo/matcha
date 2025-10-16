import resend
from jinja2 import Environment, FileSystemLoader
from pathlib import Path
from application.config import REACT_APP_API_URL, FROM_EMAIL


class EmailClient:
    def __init__(self, api_key: str):
        resend.api_key = api_key
        self.frontend_url = REACT_APP_API_URL
        self.from_email = FROM_EMAIL

        template_dir = Path(__file__).parent.parent / "templates" 
        self.jinja_env = Environment(loader=FileSystemLoader(template_dir))


    async def send_verification_email(self, to: str, username: str, subject: str, token: str):
        verification_url = f"{self.frontend_url}/verify?token={token}"
        print(verification_url)
        html_content = self._render_email_template("email_confirmation.html", {
            "verification_url": verification_url,
            "username": username
        })
        
        await self._send_email(to, subject, html_content)

    async def _send_email(self, to: str, subject: str, html_content: str):
        try:
            params = {
                "from": self.from_email, 
                "to": to,
                "subject": subject,
                "html": html_content
            }
            await resend.Emails.send(params)
            print(f"✅ Email to {to} sent successfully")

        except Exception as e:
            print(f"❌ Failed to send email to {to}: {e}")
            raise e




    def _render_email_template(self, template_name: str, context: dict):
        template = self.jinja_env.get_template(template_name)
        return template.render(**context)