export type InterviewTypeEnum =
  | "TECHNICAL"
  | "HR"
  | "MANAGERIAL"
  | "CULTURE_FIT"
  | "FINAL_ROUND"
  | "INITIAL_SCREENING"
  | "CODING_TEST"
  | "CLIENT_ROUND"
  | "SYSTEM_DESIGN"
  | "BEHAVIORAL"
  | (string & {});

export type InterviewStatusEnum =
  | "PENDING"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "RESCHEDULED"
  | "NO_SHOW";

export interface SkillRatingItem {
  skill_name: string;
  rating: number; // 1 to 5 stars
  category?: string;
}

export interface CategoryScoreItem {
  category: string;
  weightage: number; // e.g. 20 (for 20%)
  rating: number; // 1 to 5
  score: number; // calculated score out of weightage, e.g. 16/20
  feedback?: string;
}

export interface InterviewerItem {
  interviewer_id?: string;
  interviewer_name: string;
  interviewer_email?: string;
  rating?: number;
  feedback?: string;
  strengths?: string[];
  weaknesses?: string[];
  skill_ratings?: SkillRatingItem[];
  category_scores?: CategoryScoreItem[];
  ai_score?: number;
  ai_recommendation?: string;
  recommendation?: string;
  reason_note?: string;
}

export interface ClientFeedbackItem {
  client_id?: string;
  client_name: string;
  client_email?: string;
  client_rating?: number;
  client_feedback?: string;
  client_strengths?: string[];
  client_weaknesses?: string[];
  client_recommendation?: string;
  client_notes?: string;
  client_feedback_date?: string;
  reason_note?: string;
}

export interface InterviewItem {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email?: string;
  resume_id?: string;
  job_id?: string;
  job_title: string;
  job_location?: string;
  job_type?: string;
  interview_type: InterviewTypeEnum;
  interview_type_id?: string;
  round_number: number;
  scheduled_date: string;
  scheduled_time: string;
  timezone: string;
  duration_minutes: number;
  interviewer_id?: string;
  interviewer_name: string;
  interviewer_email?: string;
  meeting_link?: string;
  meeting_platform?: string;
  location?: string;
  interview_location?: string;
  hr_call_verification?: string;
  candidate_requested_date_time?: string;
  candidate_requested_date?: string;
  candidate_requested_time?: string;
  candidate_requested_role?: string;
  salary_requested?: string;
  final_fit_salary?: string;
  joining_date?: string;
  interview_document_files?: string[];
  interview_feedback_files?: string[];
  status: InterviewStatusEnum;
  // Interviewer / Round Feedback
  rating?: number;
  feedback?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendation?: string; // Selected / Rejected / Pending / Hold

  // Dynamic Skill Ratings & Weighted Category Scores & AI Calculation
  skill_ratings?: SkillRatingItem[];
  category_scores?: CategoryScoreItem[];
  ai_score?: number;
  ai_recommendation?: string;

  // Client Feedback
  client_rating?: number;
  client_feedback?: string;
  client_strengths?: string[];
  client_weaknesses?: string[];
  client_recommendation?: string;
  client_notes?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_feedback_date?: string;

  // Multiple Interviewers & Clients Panel Support
  interviewers?: InterviewerItem[];
  clients?: ClientFeedbackItem[];

  notes?: string;
  reschedule_history?: any[];
  email_sent_count?: number;
  last_email_sent_at?: string;
  email_sent_history?: Array<{ sent_at: string; recipients_count?: number; recipients?: string[]; email_type?: string }>;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateInterviewPayload {
  candidate_id: string;
  candidate_name: string;
  candidate_email?: string;
  resume_id?: string;
  job_id?: string;
  job_title: string;
  job_location?: string;
  job_type?: string;
  interview_type?: InterviewTypeEnum;
  interview_type_id?: string;
  round_number?: number;
  scheduled_date: string;
  scheduled_time: string;
  timezone?: string;
  duration_minutes?: number;
  interviewer_id?: string;
  interviewer_name: string;
  interviewer_email?: string;
  meeting_link?: string;
  meeting_platform?: string;
  location?: string;
  interview_location?: string;
  hr_call_verification?: string;
  candidate_requested_date_time?: string;
  candidate_requested_date?: string;
  candidate_requested_time?: string;
  candidate_requested_role?: string;
  salary_requested?: string;
  final_fit_salary?: string;
  joining_date?: string;
  interview_document_files?: string[];
  recommendation?: string;
  client_rating?: number;
  client_feedback?: string;
  client_strengths?: string[];
  client_weaknesses?: string[];
  client_recommendation?: string;
  client_notes?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_feedback_date?: string;

  interviewers?: InterviewerItem[];
  clients?: ClientFeedbackItem[];
  skill_ratings?: SkillRatingItem[];
  category_scores?: CategoryScoreItem[];
  ai_score?: number;
  ai_recommendation?: string;

  notes?: string;
}

export interface CandidateInterviewItem {
  candidate_id: string;
  candidate_name: string;
  resume_id?: string;
  location?: string;
  interview_location?: string;
}

export interface BatchCreateInterviewPayload {
  candidates: CandidateInterviewItem[];
  job_id?: string;
  job_title: string;
  job_location?: string;
  job_type?: string;
  interview_type?: InterviewTypeEnum;
  interview_type_id?: string;
  round_number?: number;
  scheduled_date: string;
  scheduled_time: string;
  timezone?: string;
  duration_minutes?: number;
  interviewer_id?: string;
  interviewer_name: string;
  interviewer_email?: string;
  meeting_link?: string;
  meeting_platform?: string;
  location?: string;
  interview_location?: string;
  hr_call_verification?: string;
  candidate_requested_date_time?: string;
  candidate_requested_date?: string;
  candidate_requested_time?: string;
  candidate_requested_role?: string;
  salary_requested?: string;
  final_fit_salary?: string;
  joining_date?: string;
  interview_document_files?: string[];
  interview_feedback_files?: string[];
  recommendation?: string;
  client_rating?: number;
  client_feedback?: string;
  client_strengths?: string[];
  client_weaknesses?: string[];
  client_recommendation?: string;
  client_notes?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_feedback_date?: string;

  interviewers?: InterviewerItem[];
  clients?: ClientFeedbackItem[];
  skill_ratings?: SkillRatingItem[];
  category_scores?: CategoryScoreItem[];
  ai_score?: number;
  ai_recommendation?: string;

  notes?: string;
  email_sent_count?: number;
  last_email_sent_at?: string;
  email_sent_history?: Array<{ sent_at: string; recipients_count?: number; recipients?: string[]; email_type?: string }>;
}

export interface UpdateInterviewPayload {
  candidate_name?: string;
  job_title?: string;
  job_location?: string;
  job_type?: string;
  interview_type?: InterviewTypeEnum;
  interview_type_id?: string;
  round_number?: number;
  scheduled_date?: string;
  scheduled_time?: string;
  timezone?: string;
  duration_minutes?: number;
  interviewer_id?: string;
  interviewer_name?: string;
  interviewer_email?: string;
  meeting_link?: string;
  meeting_platform?: string;
  location?: string;
  interview_location?: string;
  hr_call_verification?: string;
  candidate_requested_date_time?: string;
  candidate_requested_date?: string;
  candidate_requested_time?: string;
  candidate_requested_role?: string;
  salary_requested?: string;
  final_fit_salary?: string;
  joining_date?: string;
  interview_document_files?: string[];
  interview_feedback_files?: string[];
  recommendation?: string;
  rating?: number;
  feedback?: string;
  strengths?: string[];
  weaknesses?: string[];
  client_rating?: number;
  client_feedback?: string;
  client_strengths?: string[];
  client_weaknesses?: string[];
  client_recommendation?: string;
  client_notes?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_feedback_date?: string;

  interviewers?: InterviewerItem[];
  clients?: ClientFeedbackItem[];
  skill_ratings?: SkillRatingItem[];
  category_scores?: CategoryScoreItem[];
  ai_score?: number;
  ai_recommendation?: string;

  status?: InterviewStatusEnum;
  notes?: string;
}

export interface RescheduleInterviewPayload {
  scheduled_date: string;
  scheduled_time: string;
  timezone?: string;
  duration_minutes?: number;
  reason?: string;
}

export interface SubmitFeedbackPayload {
  rating?: number;
  feedback?: string;
  strengths?: string[];
  weaknesses?: string[];
  recommendation?: string;
  notes?: string;
  client_rating?: number;
  client_feedback?: string;
  client_strengths?: string[];
  client_weaknesses?: string[];
  client_recommendation?: string;
  client_notes?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_feedback_date?: string;
  candidate_requested_date?: string;
  candidate_requested_time?: string;
  candidate_requested_role?: string;
  salary_requested?: string;
  final_fit_salary?: string;
  joining_date?: string;
  interview_document_files?: string[];
  interview_feedback_files?: string[];

  interviewers?: InterviewerItem[];
  clients?: ClientFeedbackItem[];
  skill_ratings?: SkillRatingItem[];
  category_scores?: CategoryScoreItem[];
  ai_score?: number;
  ai_recommendation?: string;
}

export interface BulkFeedbackItemPayload extends SubmitFeedbackPayload {
  interview_id: string;
}

export interface BulkSubmitFeedbackPayload {
  items: BulkFeedbackItemPayload[];
}

export interface SendInterviewEmailPayload {
  send_to_candidate: boolean;
  candidate_email?: string;
  send_to_interviewer: boolean;
  interviewer_email?: string;
  template_id?: string;
  custom_notes?: string;
}

export interface CheckConflictPayload {
  scheduled_date: string;
  scheduled_time: string;
  interviewer_id?: string;
  interviewer_name?: string;
  client_id?: string;
  client_name?: string;
  interviewers?: InterviewerItem[];
  clients?: ClientFeedbackItem[];
  exclude_interview_id?: string;
}

export interface CheckConflictResponse {
  has_conflict: boolean;
  conflict_type?: "interviewer" | "client" | "both";
  conflict_message?: string;
  conflicting_interviews?: InterviewItem[];
}

