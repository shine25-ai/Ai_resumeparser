from typing import List, Optional
from datetime import datetime
from app.repositories.template_repository import TemplateRepository
from app.models.mail_template import MailTemplateModel
from app.schemas.mail_template import MailTemplateCreate, MailTemplateUpdate, MailTemplateResponse

class TemplateService:
    def __init__(self):
        self.repository = TemplateRepository()

    async def initialize_default_templates(self):
        defaults = [
            {
                "name": "Interview Invitation",
                "subject": "Interview Invitation: {{job_title}} - {{candidate_name}}",
                "body": (
                    "<p>Dear {{candidate_name}},</p>"
                    "<p>We are pleased to invite you for an interview for the position of <b>{{job_title}}</b> at {{company_name}}.</p>"
                    "<h3>Interview Schedule Details:</h3>"
                    "<ul>"
                    "<li><b>Date:</b> {{scheduled_date}}</li>"
                    "<li><b>Time:</b> {{scheduled_time}} ({{timezone}})</li>"
                    "<li><b>Duration:</b> {{duration_minutes}} Minutes</li>"
                    "<li><b>Interviewer:</b> {{interviewer_name}}</li>"
                    "<li><b>Meeting Link / Location:</b> {{meeting_link}}</li>"
                    "</ul>"
                    "<p><b>Schedule Notes:</b><br/>{{notes}}</p>"
                    "<p>Please confirm your availability for this session.</p>"
                    "<p>Best regards,<br/>Recruitment Team</p>"
                ),
                "variables": [
                    "candidate_name", "job_title", "company_name", "scheduled_date",
                    "scheduled_time", "timezone", "duration_minutes", "interviewer_name",
                    "meeting_link", "notes"
                ]
            },
            {
                "name": "Interviewer Schedule Notification",
                "subject": "Interview Assigned: {{job_title}} - {{candidate_name}}",
                "body": (
                    "<p>Hello {{interviewer_name}},</p>"
                    "<p>You have been assigned to conduct an interview with candidate <b>{{candidate_name}}</b> for the <b>{{job_title}}</b> position.</p>"
                    "<h3>Interview Schedule Details:</h3>"
                    "<ul>"
                    "<li><b>Candidate:</b> {{candidate_name}} ({{candidate_email}})</li>"
                    "<li><b>Date:</b> {{scheduled_date}}</li>"
                    "<li><b>Time:</b> {{scheduled_time}} ({{timezone}})</li>"
                    "<li><b>Duration:</b> {{duration_minutes}} Minutes</li>"
                    "<li><b>Meeting Link / Location:</b> {{meeting_link}}</li>"
                    "</ul>"
                    "<p><b>Schedule Notes:</b><br/>{{notes}}</p>"
                    "<p>Please ensure to update candidate rating and feedback post-interview.</p>"
                    "<p>Best regards,<br/>Recruitment Team</p>"
                ),
                "variables": [
                    "interviewer_name", "candidate_name", "candidate_email", "job_title",
                    "scheduled_date", "scheduled_time", "timezone", "duration_minutes",
                    "meeting_link", "notes"
                ]
            },
            {
                "name": "Rejection Letter",
                "subject": "Update on your application for {{job_title}}",
                "body": "<p>Dear {{candidate_name}},</p><p>Thank you for your interest in the <b>{{job_title}}</b> position. We regret to inform you that we will not be moving forward with your application at this time.</p><p>We wish you the best in your future endeavors.</p><p>Best regards,<br/>HR Team</p>",
                "variables": ["candidate_name", "job_title"]
            },
            {
                "name": "Offer Letter",
                "subject": "Offer of Employment - {{job_title}}",
                "body": "<p>Dear {{candidate_name}},</p><p>We are thrilled to offer you the position of <b>{{job_title}}</b> at {{company_name}}.</p><p>Please find the offer details attached to this email.</p><p>Best regards,<br/>HR Team</p>",
                "variables": ["candidate_name", "company_name", "job_title"]
            }
        ]

        for temp in defaults:
            existing = await self.repository.get_template_by_name(temp["name"])
            if not existing:
                model = MailTemplateModel(**temp)
                await self.repository.create_template(model)
            elif "{{scheduled_date}}" not in existing.body and temp["name"] in ["Interview Invitation", "Interviewer Schedule Notification"]:
                existing.subject = temp["subject"]
                existing.body = temp["body"]
                existing.variables = temp["variables"]
                existing.updated_at = datetime.utcnow()
                await self.repository.update_template(existing.id, existing)

    async def get_all_templates(self) -> List[MailTemplateResponse]:
        templates = await self.repository.get_all_templates()
        return [self._map_to_response(t) for t in templates]

    async def get_template(self, template_id: str) -> Optional[MailTemplateResponse]:
        template = await self.repository.get_template_by_id(template_id)
        if template:
            return self._map_to_response(template)
        return None

    async def create_template(self, data: MailTemplateCreate) -> MailTemplateResponse:
        variables = self._extract_variables(data.subject + " " + data.body)
        model = MailTemplateModel(
            name=data.name,
            subject=data.subject,
            body=data.body,
            variables=variables
        )
        created = await self.repository.create_template(model)
        return self._map_to_response(created)

    async def update_template(self, template_id: str, data: MailTemplateUpdate) -> Optional[MailTemplateResponse]:
        existing = await self.repository.get_template_by_id(template_id)
        if not existing:
            return None
            
        variables = self._extract_variables(data.subject + " " + data.body)
        
        existing.name = data.name
        existing.subject = data.subject
        existing.body = data.body
        existing.variables = variables
        existing.updated_at = datetime.utcnow()
        
        updated = await self.repository.update_template(template_id, existing)
        if updated:
            return self._map_to_response(updated)
        return None

    async def delete_template(self, template_id: str) -> bool:
        return await self.repository.delete_template(template_id)

    def _map_to_response(self, model: MailTemplateModel) -> MailTemplateResponse:
        return MailTemplateResponse(
            id=model.id,
            name=model.name,
            subject=model.subject,
            body=model.body,
            variables=model.variables,
            created_at=model.created_at,
            updated_at=model.updated_at
        )

    def _extract_variables(self, text: str) -> List[str]:
        import re
        # Find all {{variable_name}} patterns
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, text)
        # Return unique stripped variables
        return list(set(m.strip() for m in matches))

