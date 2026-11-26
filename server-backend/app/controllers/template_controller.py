from typing import List, Optional
from fastapi import HTTPException, UploadFile
from app.services.template_service import TemplateService
from app.services.settings_service import SettingsService
from app.schemas.mail_template import MailTemplateCreate, MailTemplateUpdate, MailTemplateResponse
from app.utils.encryption import decrypt_password
import smtplib
from email.message import EmailMessage
import os
from app.core.database import get_database
from app.services.mailer import address, branded_html, email_context

class TemplateController:
    def __init__(self):
        self.service = TemplateService()
        self.settings_service = SettingsService()

    async def get_all_templates(self) -> List[MailTemplateResponse]:
        # Ensure default templates are initialized
        await self.service.initialize_default_templates()
        return await self.service.get_all_templates()

    async def get_template(self, template_id: str) -> MailTemplateResponse:
        template = await self.service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
        return template

    async def create_template(self, data: MailTemplateCreate) -> MailTemplateResponse:
        return await self.service.create_template(data)

    async def update_template(self, template_id: str, data: MailTemplateUpdate) -> MailTemplateResponse:
        updated = await self.service.update_template(template_id, data)
        if not updated:
            raise HTTPException(status_code=404, detail="Template not found")
        return updated

    async def delete_template(self, template_id: str) -> dict:
        deleted = await self.service.delete_template(template_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Template not found")
        return {"status": "success", "message": "Template deleted"}

    async def send_test_email(self, template_id: str, to_emails: List[str], cc_emails: List[str] = None, bcc_emails: List[str] = None, attachments: List[UploadFile] = None) -> dict:
        template = await self.service.get_template(template_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")

        config_model = await self.settings_service.repository.get_email_config()
        if not config_model:
            raise HTTPException(status_code=400, detail="Email configuration not set. Please configure SMTP settings first.")

        try:
            password = decrypt_password(config_model.smtp_password)
            mail_ctx = await email_context(get_database())
            msg = EmailMessage()
            msg["Subject"] = template.subject
            address(msg, config_model, mail_ctx)
            msg["To"] = ", ".join(to_emails)
            
            if cc_emails:
                msg["Cc"] = ", ".join(cc_emails)
            
            # Note: Bcc headers are typically stripped by the MTA or not included in the message itself to hide them from other recipients.
            # But the smtplib.send_message will use it if it's in the EmailMessage. Or better, we explicitly pass the rcpt_options to send_message.
            
            # The HTML body
            msg.set_content("Please enable HTML to view this email.")
            # The company's branded layout around the template text (logo, colour, footer).
            msg.add_alternative(branded_html(mail_ctx, template.body), subtype='html')

            if attachments:
                for file in attachments:
                    content = await file.read()
                    msg.add_attachment(content, maintype='application', subtype='octet-stream', filename=file.filename)

            # Determine all recipients for the envelope
            all_recipients = to_emails.copy()
            if cc_emails:
                all_recipients.extend(cc_emails)
            if bcc_emails:
                all_recipients.extend(bcc_emails)

            if config_model.use_ssl:
                server = smtplib.SMTP_SSL(config_model.smtp_server, config_model.smtp_port)
            else:
                server = smtplib.SMTP(config_model.smtp_server, config_model.smtp_port)
                if config_model.use_tls:
                    server.starttls()
            
            server.login(config_model.smtp_username, password)
            server.send_message(msg, to_addrs=all_recipients)
            server.quit()
            
            return {"status": "success", "message": "Test template email sent successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
