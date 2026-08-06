"""
Interview service handling interview scheduling, rescheduling, feedback, filtering, and status updates.
"""

import smtplib
from email.message import EmailMessage
from typing import Any, Dict, List, Optional
from fastapi import HTTPException
from loguru import logger
from app.core.exceptions import NotFoundError
from app.models.interview import InterviewDocument
from app.repositories.interview_repository import InterviewRepository
from app.schemas.interview import (
    BulkInterviewFeedbackRequest,
    CandidateFullHistoryResponse,
    InterviewBatchCreateRequest,
    InterviewCreateRequest,
    InterviewFeedbackRequest,
    InterviewListResponse,
    InterviewRescheduleRequest,
    InterviewResponse,
    InterviewUpdateRequest,
    SendInterviewEmailRequest,
)
from app.services.settings_service import SettingsService
from app.services.template_service import TemplateService
from app.utils.encryption import decrypt_password
from app.utils.enums import InterviewStatus, InterviewType
from app.utils.helpers import utc_now


class InterviewService:
    """Service handling interview business logic."""

    def __init__(self, interview_repo: InterviewRepository):
        self.interview_repo = interview_repo

    async def create_interview(self, payload: InterviewCreateRequest, created_by: Optional[str] = None) -> InterviewResponse:
        """Schedule a new interview document."""
        interview_doc = InterviewDocument(
            candidate_id=payload.candidate_id,
            candidate_name=payload.candidate_name,
            candidate_email=payload.candidate_email,
            resume_id=payload.resume_id,
            job_id=payload.job_id,
            job_title=payload.job_title,
            job_location=payload.job_location,
            job_type=payload.job_type,
            interview_type=payload.interview_type,
            round_number=payload.round_number,
            scheduled_date=payload.scheduled_date,
            scheduled_time=payload.scheduled_time,
            timezone=payload.timezone,
            duration_minutes=payload.duration_minutes,
            interviewer_id=payload.interviewer_id,
            interviewer_name=payload.interviewer_name,
            interviewer_email=payload.interviewer_email,
            meeting_link=payload.meeting_link,
            meeting_platform=payload.meeting_platform,
            location=payload.location or payload.interview_location,
            interview_location=payload.interview_location or payload.location,
            hr_call_verification=payload.hr_call_verification,
            candidate_requested_date_time=payload.candidate_requested_date_time,
            candidate_requested_date=payload.candidate_requested_date,
            candidate_requested_time=payload.candidate_requested_time,
            candidate_requested_role=payload.candidate_requested_role,
            salary_requested=payload.salary_requested,
            final_fit_salary=payload.final_fit_salary,
            joining_date=payload.joining_date,
            interview_document_files=payload.interview_document_files,
            recommendation=payload.recommendation or "Pending",
            status=InterviewStatus.SCHEDULED,
            client_rating=payload.client_rating,
            client_feedback=payload.client_feedback,
            client_strengths=payload.client_strengths,
            client_weaknesses=payload.client_weaknesses,
            client_recommendation=payload.client_recommendation,
            client_notes=payload.client_notes,
            client_name=payload.client_name,
            client_feedback_date=payload.client_feedback_date,
            notes=payload.notes,
            created_by=created_by,
            updated_by=created_by,
        )

        created = await self.interview_repo.create(interview_doc.to_dict())
        logger.info(f"Scheduled new interview ID '{interview_doc.id}' for candidate '{payload.candidate_name}'")
        return InterviewResponse.model_validate(created)

    async def batch_create_interviews(
        self, payload: InterviewBatchCreateRequest, created_by: Optional[str] = None
    ) -> List[InterviewResponse]:
        """Batch schedule interviews for multiple candidates globally."""
        created_interviews: List[InterviewResponse] = []

        for candidate in payload.candidates:
            loc = candidate.interview_location or candidate.location or payload.interview_location or payload.location
            interview_doc = InterviewDocument(
                candidate_id=candidate.candidate_id,
                candidate_name=candidate.candidate_name,
                resume_id=candidate.resume_id,
                job_id=payload.job_id,
                job_title=payload.job_title,
                job_location=payload.job_location,
                job_type=payload.job_type,
                interview_type=payload.interview_type,
                round_number=payload.round_number,
                scheduled_date=payload.scheduled_date,
                scheduled_time=payload.scheduled_time,
                timezone=payload.timezone,
                duration_minutes=payload.duration_minutes,
                interviewer_id=payload.interviewer_id,
                interviewer_name=payload.interviewer_name,
                interviewer_email=payload.interviewer_email,
                meeting_link=payload.meeting_link,
                meeting_platform=payload.meeting_platform,
                location=loc,
                interview_location=loc,
                hr_call_verification=payload.hr_call_verification,
                candidate_requested_date_time=payload.candidate_requested_date_time,
                candidate_requested_date=payload.candidate_requested_date,
                candidate_requested_time=payload.candidate_requested_time,
                candidate_requested_role=payload.candidate_requested_role,
                salary_requested=payload.salary_requested,
                final_fit_salary=payload.final_fit_salary,
                joining_date=payload.joining_date,
                interview_document_files=payload.interview_document_files,
                recommendation=payload.recommendation or "Pending",
                status=InterviewStatus.SCHEDULED,
                client_rating=payload.client_rating,
                client_feedback=payload.client_feedback,
                client_strengths=payload.client_strengths,
                client_weaknesses=payload.client_weaknesses,
                client_recommendation=payload.client_recommendation,
                client_notes=payload.client_notes,
                client_name=payload.client_name,
                client_feedback_date=payload.client_feedback_date,
                notes=payload.notes,
                created_by=created_by,
                updated_by=created_by,
            )

            created = await self.interview_repo.create(interview_doc.to_dict())
            created_interviews.append(InterviewResponse.model_validate(created))

        logger.info(f"Batch scheduled {len(created_interviews)} interviews for job '{payload.job_title}'")
        return created_interviews

    async def get_interview_by_id(self, interview_id: str) -> InterviewResponse:
        """Fetch details for a single interview by ID."""
        interview = await self.interview_repo.get_by_id(interview_id)
        if not interview:
            raise NotFoundError("Interview not found.")
        return InterviewResponse.model_validate(interview)

    async def filter_interviews(
        self,
        candidate_id: Optional[str] = None,
        interviewer_id: Optional[str] = None,
        status: Optional[InterviewStatus] = None,
        interview_type: Optional[InterviewType] = None,
        job_title: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> InterviewListResponse:
        """Filter and list interviews matching parameters."""
        interviews = await self.interview_repo.filter_interviews(
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            status=status,
            interview_type=interview_type,
            job_title=job_title,
            date_from=date_from,
            date_to=date_to,
            skip=skip,
            limit=limit,
        )
        total = await self.interview_repo.count_interviews(
            candidate_id=candidate_id,
            interviewer_id=interviewer_id,
            status=status,
        )
        items = [InterviewResponse.model_validate(i) for i in interviews]
        return InterviewListResponse(total=total, interviews=items)

    async def update_interview(
        self,
        interview_id: str,
        payload: InterviewUpdateRequest,
        updated_by: Optional[str] = None,
    ) -> InterviewResponse:
        """Update fields of an existing interview document."""
        existing = await self.interview_repo.get_by_id(interview_id)
        if not existing:
            raise NotFoundError("Interview not found.")

        update_fields = payload.model_dump(exclude_unset=True)
        if "status" in update_fields and isinstance(update_fields["status"], InterviewStatus):
            update_fields["status"] = update_fields["status"].value
        if "interview_type" in update_fields and isinstance(update_fields["interview_type"], InterviewType):
            update_fields["interview_type"] = update_fields["interview_type"].value

        update_fields["updated_by"] = updated_by
        update_fields["updated_at"] = utc_now().isoformat()

        updated_doc = await self.interview_repo.update(interview_id, update_fields)
        logger.info(f"Updated interview record '{interview_id}'")
        return InterviewResponse.model_validate(updated_doc)

    async def reschedule_interview(
        self,
        interview_id: str,
        payload: InterviewRescheduleRequest,
        updated_by: Optional[str] = None,
    ) -> InterviewResponse:
        """Reschedule an existing interview and push entry into reschedule history."""
        existing = await self.interview_repo.get_by_id(interview_id)
        if not existing:
            raise NotFoundError("Interview not found.")

        history_entry = {
            "previous_date": existing.get("scheduled_date"),
            "previous_time": existing.get("scheduled_time"),
            "new_date": payload.scheduled_date,
            "new_time": payload.scheduled_time,
            "reason": payload.reason,
            "rescheduled_at": utc_now().isoformat(),
            "rescheduled_by": updated_by,
        }

        updated_doc = await self.interview_repo.reschedule_interview(
            interview_id=interview_id,
            new_date=payload.scheduled_date,
            new_time=payload.scheduled_time,
            timezone=payload.timezone or existing.get("timezone", "Asia/Kolkata"),
            duration_minutes=payload.duration_minutes or existing.get("duration_minutes", 60),
            history_entry=history_entry,
            updated_by=updated_by,
        )

        logger.info(f"Rescheduled interview ID '{interview_id}' to date {payload.scheduled_date} at {payload.scheduled_time}")
        return InterviewResponse.model_validate(updated_doc)

    async def submit_feedback(
        self,
        interview_id: str,
        payload: InterviewFeedbackRequest,
        updated_by: Optional[str] = None,
    ) -> InterviewResponse:
        """Submit rating, feedback, strengths, and weaknesses for an interview (Round Interviewer and/or Client)."""
        existing = await self.interview_repo.get_by_id(interview_id)
        if not existing:
            raise NotFoundError("Interview not found.")

        updated_doc = await self.interview_repo.submit_feedback(
            interview_id=interview_id,
            rating=payload.rating,
            feedback=payload.feedback,
            strengths=payload.strengths,
            weaknesses=payload.weaknesses,
            recommendation=payload.recommendation,
            notes=payload.notes,
            client_rating=payload.client_rating,
            client_feedback=payload.client_feedback,
            client_strengths=payload.client_strengths,
            client_weaknesses=payload.client_weaknesses,
            client_recommendation=payload.client_recommendation,
            client_notes=payload.client_notes,
            client_name=payload.client_name,
            client_feedback_date=payload.client_feedback_date,
            updated_by=updated_by,
            candidate_requested_date=payload.candidate_requested_date,
            candidate_requested_time=payload.candidate_requested_time,
            candidate_requested_role=payload.candidate_requested_role,
            salary_requested=payload.salary_requested,
            final_fit_salary=payload.final_fit_salary,
            joining_date=payload.joining_date,
            interview_document_files=payload.interview_document_files,
        )

        logger.info(f"Submitted feedback for interview ID '{interview_id}'")
        return InterviewResponse.model_validate(updated_doc)

    async def bulk_submit_feedback(
        self,
        payload: BulkInterviewFeedbackRequest,
        updated_by: Optional[str] = None,
    ) -> List[InterviewResponse]:
        """Submit feedback for multiple candidate interviews in bulk."""
        updated_interviews: List[InterviewResponse] = []

        for item in payload.items:
            res = await self.submit_feedback(
                interview_id=item.interview_id,
                payload=item,
                updated_by=updated_by,
            )
            updated_interviews.append(res)

        logger.info(f"Bulk submitted feedback for {len(updated_interviews)} interviews.")
        return updated_interviews



    async def delete_interview(self, interview_id: str) -> bool:
        """Delete interview record from database."""
        existing = await self.interview_repo.get_by_id(interview_id)
        if not existing:
            raise NotFoundError("Interview not found.")

        deleted = await self.interview_repo.delete(interview_id)
        logger.info(f"Deleted interview document ID '{interview_id}'")
        return deleted

    async def get_candidate_history(self, candidate_id: str) -> CandidateFullHistoryResponse:
        """Retrieve complete candidate profile and all interview rounds sorted by round number."""
        raw_interviews = await self.interview_repo.get_by_candidate_id(candidate_id, skip=0, limit=200)
        if not raw_interviews:
            raise NotFoundError(f"No interview records found for candidate ID '{candidate_id}'.")

        # Sort rounds by round_number ascending
        sorted_docs = sorted(raw_interviews, key=lambda x: x.get("round_number", 1))
        
        # Aggregate candidate info across all rounds to make sure we don't display empty/null values at top level
        candidate_name = next((d.get("candidate_name") for d in sorted_docs if d.get("candidate_name")), "Unknown")
        job_id = next((d.get("job_id") for d in sorted_docs if d.get("job_id")), None)
        job_title = next((d.get("job_title") for d in sorted_docs if d.get("job_title")), None)
        job_location = next((d.get("job_location") for d in sorted_docs if d.get("job_location")), None)
        job_type = next((d.get("job_type") for d in sorted_docs if d.get("job_type")), None)
        
        location = next((d.get("location") for d in sorted_docs if d.get("location")), None)
        interview_location = next((d.get("interview_location") for d in sorted_docs if d.get("interview_location")), None)
        
        hr_call_verification = next((d.get("hr_call_verification") for d in sorted_docs if d.get("hr_call_verification") and d.get("hr_call_verification") != "Pending"), "Pending")
        if hr_call_verification == "Pending":
            hr_call_verification = next((d.get("hr_call_verification") for d in sorted_docs if d.get("hr_call_verification")), "Pending")

        candidate_requested_date = next((d.get("candidate_requested_date") for d in sorted_docs if d.get("candidate_requested_date")), None)
        candidate_requested_time = next((d.get("candidate_requested_time") for d in sorted_docs if d.get("candidate_requested_time")), None)
        candidate_requested_role = next((d.get("candidate_requested_role") for d in sorted_docs if d.get("candidate_requested_role")), None)
        salary_requested = next((d.get("salary_requested") for d in sorted_docs if d.get("salary_requested")), None)
        final_fit_salary = next((d.get("final_fit_salary") for d in sorted_docs if d.get("final_fit_salary")), None)
        joining_date = next((d.get("joining_date") for d in sorted_docs if d.get("joining_date")), None)

        merged_files = []
        for d in sorted_docs:
            files = d.get("interview_document_files") or []
            for f in files:
                if f not in merged_files:
                    merged_files.append(f)

        rounds = [InterviewResponse.model_validate(doc) for doc in sorted_docs]

        return CandidateFullHistoryResponse(
            candidate_id=candidate_id,
            candidate_name=candidate_name,
            job_id=job_id,
            job_title=job_title,
            job_location=job_location,
            job_type=job_type,
            location=location or interview_location,
            interview_location=interview_location or location,
            hr_call_verification=hr_call_verification,
            candidate_requested_date=candidate_requested_date,
            candidate_requested_time=candidate_requested_time,
            candidate_requested_role=candidate_requested_role,
            salary_requested=salary_requested,
            final_fit_salary=final_fit_salary,
            joining_date=joining_date,
            interview_document_files=merged_files,
            total_rounds=len(rounds),
            rounds=rounds,
        )

    async def send_interview_email(
        self,
        interview_id: str,
        payload: SendInterviewEmailRequest,
    ) -> Dict[str, Any]:
        """Send interview schedule notification emails to candidate and/or interviewer using dynamic template values."""
        existing = await self.interview_repo.get_by_id(interview_id)
        if not existing:
            raise NotFoundError("Interview not found.")

        template_service = TemplateService()
        await template_service.initialize_default_templates()

        # Determine emails
        candidate_email = payload.candidate_email or existing.get("candidate_email")
        if not candidate_email and existing.get("resume_id"):
            try:
                db = self.interview_repo.collection.database
                resume_doc = await db.resumes.find_one({"_id": existing.get("resume_id")})
                if resume_doc:
                    parsed = resume_doc.get("parsed_data") or {}
                    candidate_email = parsed.get("email") or resume_doc.get("email")
            except Exception as err:
                logger.warning(f"Could not fetch resume email: {err}")

        interviewer_email = payload.interviewer_email or existing.get("interviewer_email")

        # Fetch SMTP config
        settings_service = SettingsService()
        config_model = await settings_service.repository.get_email_config()
        if not config_model:
            raise HTTPException(status_code=400, detail="Email configuration not set. Please configure SMTP settings in Settings first.")

        # Prepare replacement dictionary
        notes_content = payload.custom_notes or existing.get("notes") or "N/A"
        meeting_link = existing.get("meeting_link") or existing.get("location") or "Will be shared shortly"

        replacements = {
            "candidate_name": existing.get("candidate_name", ""),
            "candidate_email": candidate_email or "N/A",
            "interviewer_name": existing.get("interviewer_name", "Interviewer"),
            "interviewer_email": interviewer_email or "N/A",
            "job_title": existing.get("job_title", ""),
            "scheduled_date": existing.get("scheduled_date", ""),
            "scheduled_time": existing.get("scheduled_time", ""),
            "timezone": existing.get("timezone", "Asia/Kolkata"),
            "duration_minutes": str(existing.get("duration_minutes", 60)),
            "meeting_platform": existing.get("meeting_platform", "Google Meet"),
            "meeting_link": meeting_link,
            "location": existing.get("location") or existing.get("interview_location") or "Online",
            "interview_type": str(existing.get("interview_type", "")).replace("_", " "),
            "round_number": str(existing.get("round_number", 1)),
            "notes": notes_content,
            "company_name": config_model.sender_name or "HR Team",
        }

        def render_text(text: str) -> str:
            rendered = text
            for key, val in replacements.items():
                rendered = rendered.replace(f"{{{{{key}}}}}", str(val))
            return rendered

        all_templates = await template_service.get_all_templates()
        sent_recipients = []

        try:
            password = decrypt_password(config_model.smtp_password)
            
            # Helper function for executive HTML layout
            def build_professional_email_html(
                header_badge: str,
                header_title: str,
                body_content: str,
                schedule_items: List[Dict[str, str]],
                meeting_url: str = "",
                notes_text: Optional[str] = None,
                sender_company: str = "Recruitment Team"
            ) -> str:
                rows_html = ""
                for item in schedule_items:
                    label = item.get("label", "")
                    val = item.get("value", "")
                    if val and val != "N/A":
                        rows_html += f"""
                        <tr>
                          <td style="padding: 10px 12px; color: #64748b; font-weight: 600; width: 140px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">{label}</td>
                          <td style="padding: 10px 12px; color: #0f172a; font-weight: 700; border-bottom: 1px solid #f1f5f9; vertical-align: top;">{val}</td>
                        </tr>
                        """

                cta_html = ""
                if meeting_url and meeting_url.startswith("http"):
                    cta_html = f"""
                    <tr>
                      <td align="center" style="padding: 0 36px 28px 36px;">
                        <a href="{meeting_url}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%); color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                          🎥 Join Interview Meeting &rarr;
                        </a>
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 10px;">Direct Link: <a href="{meeting_url}" style="color: #4f46e5; text-decoration: underline;">{meeting_url}</a></div>
                      </td>
                    </tr>
                    """
                elif meeting_url and meeting_url != "N/A" and meeting_url != "Will be shared shortly":
                    rows_html += f"""
                    <tr>
                      <td style="padding: 10px 12px; color: #64748b; font-weight: 600; width: 140px; border-bottom: 1px solid #f1f5f9; vertical-align: top;">Location</td>
                      <td style="padding: 10px 12px; color: #0f172a; font-weight: 700; border-bottom: 1px solid #f1f5f9; vertical-align: top;">{meeting_url}</td>
                    </tr>
                    """

                notes_html = ""
                if notes_text and notes_text.strip() and notes_text.strip() != "N/A":
                    notes_html = f"""
                    <tr>
                      <td style="padding: 0 36px 28px 36px;">
                        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; border-radius: 10px; padding: 16px 20px; font-size: 13px; color: #92400e;">
                          <div style="font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; color: #b45309;">📌 Schedule Notes</div>
                          <div style="line-height: 1.5; color: #78350f; font-weight: 500;">{notes_text.strip()}</div>
                        </div>
                      </td>
                    </tr>
                    """

                return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 28px 36px; text-align: left;">
              <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.2px; padding: 4px 12px; border-radius: 20px;">{header_badge}</span>
              <h1 style="color: #ffffff; font-size: 20px; font-weight: 800; margin: 10px 0 0 0; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">{header_title}</h1>
            </td>
          </tr>

          <!-- Main Text Body -->
          <tr>
            <td style="padding: 32px 36px 20px 36px; color: #334155; font-size: 14px; line-height: 1.6;">
              {body_content}
            </td>
          </tr>

          <!-- Schedule Table Card -->
          <tr>
            <td style="padding: 0 36px 24px 36px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #4f46e5;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">📅 Interview Details</div>
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 13px; border-collapse: collapse;">
                      {rows_html}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          {cta_html}

          <!-- Schedule Notes -->
          {notes_html}

          <!-- Footer Signature -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 36px; text-align: center; color: #64748b; font-size: 12px;">
              <p style="margin: 0; font-weight: 700; color: #334155;">{sender_company}</p>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 11px;">Automated Interview System • AI Recruiter</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

            # 1. SEND TO CANDIDATE
            if payload.send_to_candidate:
                if not candidate_email:
                    raise HTTPException(status_code=400, detail="Candidate email is missing. Please enter candidate email.")

                cand_template = None
                if payload.template_id:
                    cand_template = await template_service.get_template(payload.template_id)
                if not cand_template:
                    cand_template = next((t for t in all_templates if "Invitation" in t.name or "Candidate" in t.name), all_templates[0] if all_templates else None)

                cand_subject = render_text(cand_template.subject if cand_template else f"Interview Invitation: {existing.get('job_title')} - {existing.get('candidate_name')}")
                cand_raw_body = render_text(cand_template.body if cand_template else f"<p>Dear <b>{existing.get('candidate_name')}</b>,</p><p>We are pleased to invite you for an interview for the <b>{existing.get('job_title')}</b> position.</p>")

                cand_schedule_items = [
                    {"label": "Candidate", "value": existing.get("candidate_name", "")},
                    {"label": "Job Position", "value": existing.get("job_title", "")},
                    {"label": "Interview Round", "value": f"Round {existing.get('round_number', 1)} ({str(existing.get('interview_type', '')).replace('_', ' ')})"},
                    {"label": "Scheduled Date", "value": replacements['scheduled_date']},
                    {"label": "Scheduled Time", "value": f"{replacements['scheduled_time']} ({replacements['timezone']})"},
                    {"label": "Duration", "value": f"{replacements['duration_minutes']} Minutes"},
                    {"label": "Interviewer", "value": replacements['interviewer_name']},
                ]

                cand_final_html = build_professional_email_html(
                    header_badge="Candidate Invitation",
                    header_title=f"Interview Invitation - {existing.get('job_title')}",
                    body_content=cand_raw_body,
                    schedule_items=cand_schedule_items,
                    meeting_url=meeting_link,
                    notes_text=notes_content,
                    sender_company=config_model.sender_name or "Recruitment Team"
                )

                msg_cand = EmailMessage()
                msg_cand["Subject"] = cand_subject
                msg_cand["From"] = f"{config_model.sender_name} <{config_model.sender_email}>"
                msg_cand["To"] = candidate_email.strip()
                msg_cand.set_content("Please enable HTML to view this email.")
                msg_cand.add_alternative(cand_final_html, subtype='html')

                if config_model.use_ssl:
                    server = smtplib.SMTP_SSL(config_model.smtp_server, config_model.smtp_port)
                else:
                    server = smtplib.SMTP(config_model.smtp_server, config_model.smtp_port)
                    if config_model.use_tls:
                        server.starttls()

                server.login(config_model.smtp_username, password)
                server.send_message(msg_cand, to_addrs=[candidate_email.strip()])
                server.quit()
                sent_recipients.append(f"Candidate ({candidate_email.strip()})")

            # 2. SEND TO INTERVIEWER
            if payload.send_to_interviewer:
                if not interviewer_email:
                    raise HTTPException(status_code=400, detail="Interviewer email is missing. Please enter interviewer email.")

                interviewer_template = next((t for t in all_templates if "Interviewer" in t.name), None)

                if interviewer_template:
                    int_subject = render_text(interviewer_template.subject)
                    int_raw_body = render_text(interviewer_template.body)
                else:
                    int_subject = f"Interview Assigned: {existing.get('job_title')} - {existing.get('candidate_name')}"
                    int_raw_body = f"""
                    <p>Hello <b>{replacements['interviewer_name']}</b>,</p>
                    <p>You have been assigned to conduct an interview with candidate <b>{replacements['candidate_name']}</b> for the <b>{replacements['job_title']}</b> position.</p>
                    <p>Please ensure to update candidate rating and feedback post-interview.</p>
                    """

                int_schedule_items = [
                    {"label": "Candidate", "value": f"{existing.get('candidate_name', '')} ({candidate_email or 'N/A'})"},
                    {"label": "Job Position", "value": existing.get("job_title", "")},
                    {"label": "Interview Round", "value": f"Round {existing.get('round_number', 1)} ({str(existing.get('interview_type', '')).replace('_', ' ')})"},
                    {"label": "Scheduled Date", "value": replacements['scheduled_date']},
                    {"label": "Scheduled Time", "value": f"{replacements['scheduled_time']} ({replacements['timezone']})"},
                    {"label": "Duration", "value": f"{replacements['duration_minutes']} Minutes"},
                ]

                int_final_html = build_professional_email_html(
                    header_badge="Interviewer Assignment",
                    header_title=f"Interview Assigned: {existing.get('candidate_name')}",
                    body_content=int_raw_body,
                    schedule_items=int_schedule_items,
                    meeting_url=meeting_link,
                    notes_text=notes_content,
                    sender_company=config_model.sender_name or "Recruitment Team"
                )

                msg_int = EmailMessage()
                msg_int["Subject"] = int_subject
                msg_int["From"] = f"{config_model.sender_name} <{config_model.sender_email}>"
                msg_int["To"] = interviewer_email.strip()
                msg_int.set_content("Please enable HTML to view this email.")
                msg_int.add_alternative(int_final_html, subtype='html')

                if config_model.use_ssl:
                    server = smtplib.SMTP_SSL(config_model.smtp_server, config_model.smtp_port)
                else:
                    server = smtplib.SMTP(config_model.smtp_server, config_model.smtp_port)
                    if config_model.use_tls:
                        server.starttls()

                server.login(config_model.smtp_username, password)
                server.send_message(msg_int, to_addrs=[interviewer_email.strip()])
                server.quit()
                sent_recipients.append(f"Interviewer ({interviewer_email.strip()})")

            if not sent_recipients:
                raise HTTPException(status_code=400, detail="No email recipients selected.")

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to send interview email: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

        logger.info(f"Sent interview email for interview '{interview_id}' to: {sent_recipients}")
        return {
            "status": "success",
            "message": f"Interview email sent successfully to {', '.join(sent_recipients)}",
            "recipients": sent_recipients,
        }

    async def get_feedback_questions(self, interview_type: Optional[str] = None) -> Dict[str, Any]:
        """Load and return feedback questions structured by interview type from JSON file."""
        import json
        from pathlib import Path
        json_path = Path(__file__).resolve().parent.parent / "data" / "feedback_questions.json"
        
        questions_dict = {}
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                questions_dict = json.load(f)

        if not interview_type:
            return questions_dict

        norm_type = interview_type.upper().strip()
        
        if norm_type in questions_dict:
            questions = questions_dict[norm_type]
        elif "TECH" in norm_type or "CODING" in norm_type:
            questions = questions_dict.get("TECHNICAL", questions_dict.get("DEFAULT", []))
        elif "HR" in norm_type or "SCREENING" in norm_type:
            questions = questions_dict.get("HR", questions_dict.get("DEFAULT", []))
        elif "MANAGERIAL" in norm_type or "CULTURE" in norm_type:
            questions = questions_dict.get("MANAGERIAL", questions_dict.get("DEFAULT", []))
        elif "FINAL" in norm_type or "CLIENT" in norm_type:
            questions = questions_dict.get("FINAL_ROUND", questions_dict.get("DEFAULT", []))
        else:
            questions = questions_dict.get("DEFAULT", [])

        return {
            "interview_type": norm_type,
            "questions": questions
        }


