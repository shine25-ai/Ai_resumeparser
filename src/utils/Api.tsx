const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

export const RESUME_UPLOAD = `${BASE_URL}/resumes/upload`;
export const RESUME_LIST = `${BASE_URL}/resumes`;
export const RESUME_MATCH = `${BASE_URL}/resumes/match`;
export const RESUME_SUMMARY = `${BASE_URL}/resumes/parsed-summary`;
export const RESUME_MERGE = (id: string) => `${BASE_URL}/resumes/${id}/merge`;
export const RESUME_DOCUMENTS = (id: string) => `${BASE_URL}/resumes/${id}/documents`;
export const RESUME_LOGS = (id: string) => `${BASE_URL}/resumes/${id}/logs`;
export const INTERVIEWS_URL = `${BASE_URL}/interviews`;
export const INTERVIEW_FEEDBACK_QUESTIONS_URL = `${BASE_URL}/interviews/feedback-questions`;

export const AUTH_LOGIN = `${BASE_URL}/auth/login`;
export const AUTH_REGISTER = `${BASE_URL}/auth/register`;
export const AUTH_REFRESH = `${BASE_URL}/auth/refresh`;

export const USER_ME = `${BASE_URL}/users/me`;
export const USERS_URL = `${BASE_URL}/users`;
export const ROLES_URL = `${BASE_URL}/roles`;
export const SETTINGS_EMAIL = `${BASE_URL}/settings/email`;
export const SETTINGS_EMAIL_TEST = `${BASE_URL}/settings/email/test`;
export const MAIL_TEMPLATES_URL = `${BASE_URL}/templates`;
export const DASHBOARD_METRICS = `${BASE_URL}/dashboard/metrics`;

export interface LoginPayload {
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCreatePayload {
  full_name: string;
  email: string;
  password: string;
  role?: string;
  is_active?: boolean;
}

export interface UserUpdatePayload {
  full_name?: string;
  email?: string;
  password?: string;
  role?: string;
  is_active?: boolean;
}

export interface RoleItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoleCreatePayload {
  name: string;
  slug?: string;
  description?: string;
  permissions: string[];
}

export interface RoleUpdatePayload {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface LoginApiResponse {
  success: boolean;
  message: string;
  data: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in_minutes: number;
  };
}

export interface AuthSuccessResult {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

const handleAuthError = (response: Response, resData: any) => {
  const isUnauthorized = response.status === 401;
  const detail = typeof resData?.detail === "string" ? resData.detail.toLowerCase() : "";
  const message = typeof resData?.message === "string" ? resData.message.toLowerCase() : "";
  const isAuthError = detail.includes("token") || detail.includes("signature") || detail.includes("authentication") ||
    message.includes("token") || message.includes("signature") || message.includes("authentication");

  if (isUnauthorized || isAuthError) {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    throw new Error("Session expired. Redirecting to login...");
  }
};

export const fetchUserProfile = async (accessToken: string): Promise<UserProfile> => {
  const response = await fetch(USER_ME, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch user profile");
  }

  // Handle standard envelope or direct object return
  return resData.data || resData;
};

export const loginUser = async (credentials: LoginPayload): Promise<AuthSuccessResult> => {
  const response = await fetch(AUTH_LOGIN, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  const resData: LoginApiResponse = await response.json();

  if (!response.ok || !resData.success) {
    throw new Error((resData as any).detail || resData.message || "Invalid email or password");
  }

  const { access_token, refresh_token, token_type } = resData.data;
  const user = await fetchUserProfile(access_token);

  return {
    access_token,
    refresh_token,
    token_type,
    user,
  };
};

export const getResumes = async (skip: number = 0, limit: number = 100) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${RESUME_LIST}?skip=${skip}&limit=${limit}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch resumes list");
  }

  return resData.data || resData;
};

export interface MatchFilterParams {
  job_title?: string[];
  min_experience?: number;
  max_experience?: number;
  location?: string[];
  employment_type?: string[];
  year_of_passing?: string[];
  skills?: string[];
  keywords?: string[];
}

export const matchResumes = async (params: MatchFilterParams = {}) => {
  const token = localStorage.getItem("access_token") || "";
  const queryParts: string[] = [];

  if (params.job_title && params.job_title.length > 0) {
    params.job_title.forEach((j) => {
      if (j.trim()) queryParts.push(`job_title=${encodeURIComponent(j.trim())}`);
    });
  }
  if (params.min_experience !== undefined) queryParts.push(`min_experience=${params.min_experience}`);
  if (params.max_experience !== undefined) queryParts.push(`max_experience=${params.max_experience}`);
  if (params.location && params.location.length > 0) {
    params.location.forEach((l) => {
      if (l.trim()) queryParts.push(`location=${encodeURIComponent(l.trim())}`);
    });
  }
  if (params.employment_type && params.employment_type.length > 0) {
    params.employment_type.forEach((e) => {
      if (e.trim()) queryParts.push(`employment_type=${encodeURIComponent(e.trim())}`);
    });
  }
  if (params.year_of_passing && params.year_of_passing.length > 0) {
    params.year_of_passing.forEach((y) => {
      if (y.trim()) queryParts.push(`year_of_passing=${encodeURIComponent(y.trim())}`);
    });
  }
  if (params.skills && params.skills.length > 0) {
    params.skills.forEach((s) => {
      if (s.trim()) queryParts.push(`skills=${encodeURIComponent(s.trim())}`);
    });
  }
  if (params.keywords && params.keywords.length > 0) {
    params.keywords.forEach((k) => {
      if (k.trim()) queryParts.push(`keywords=${encodeURIComponent(k.trim())}`);
    });
  }

  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

  console.log("[FRONTEND API matchResumes] Requesting URL:", `${RESUME_MATCH}${queryString}`);
  console.log("[FRONTEND API matchResumes] Filter Params:", params);

  const response = await fetch(`${RESUME_MATCH}${queryString}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  console.log("[FRONTEND API matchResumes] Response received:", resData);
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch matched resumes");
  }

  return resData.data || resData;
};

export const getParsedResumeSummary = async (skip: number = 0, limit: number = 100) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${RESUME_SUMMARY}?skip=${skip}&limit=${limit}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch parsed resume summary");
  }

  return resData.data || resData;
};

export const getResumeById = async (resumeId: string) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${RESUME_LIST}/${resumeId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch resume details");
  }

  return resData.data || resData;
};

export const getResumeLogs = async (resumeId: string) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(RESUME_LOGS(resumeId), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch resume logs");
  }

  return resData.data || resData;
};

export const getDashboardMetrics = async () => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(DASHBOARD_METRICS, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch dashboard metrics");
  }

  return resData.data || resData;
};

export const updateResume = async (resumeId: string, updateData: any) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${RESUME_LIST}/${resumeId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to update resume");
  }

  return resData.data || resData;
};

// INTERVIEW INTERFACES & API FUNCTIONS
import type {
  InterviewTypeEnum,
  InterviewStatusEnum,
  InterviewerItem,
  ClientFeedbackItem,
  InterviewItem,
  CreateInterviewPayload,
  CandidateInterviewItem,
  BatchCreateInterviewPayload,
  UpdateInterviewPayload,
  RescheduleInterviewPayload,
  SubmitFeedbackPayload,
  BulkFeedbackItemPayload,
  BulkSubmitFeedbackPayload,
  SendInterviewEmailPayload,
  SkillRatingItem,
  CategoryScoreItem,
} from "../types/interview";

export type {
  InterviewTypeEnum,
  InterviewStatusEnum,
  InterviewerItem,
  ClientFeedbackItem,
  InterviewItem,
  CreateInterviewPayload,
  CandidateInterviewItem,
  BatchCreateInterviewPayload,
  UpdateInterviewPayload,
  RescheduleInterviewPayload,
  SubmitFeedbackPayload,
  BulkFeedbackItemPayload,
  BulkSubmitFeedbackPayload,
  SendInterviewEmailPayload,
  SkillRatingItem,
  CategoryScoreItem,
};


export const getInterviews = async (params: {
  candidate_id?: string;
  interviewer_id?: string;
  status?: string;
  interview_type?: string;
  job_title?: string;
  date_from?: string;
  date_to?: string;
  skip?: number;
  limit?: number;
} = {}) => {
  const token = localStorage.getItem("access_token") || "";
  const queryParts: string[] = [];

  if (params.candidate_id) queryParts.push(`candidate_id=${encodeURIComponent(params.candidate_id)}`);
  if (params.interviewer_id) queryParts.push(`interviewer_id=${encodeURIComponent(params.interviewer_id)}`);
  if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params.interview_type) queryParts.push(`interview_type=${encodeURIComponent(params.interview_type)}`);
  if (params.job_title) queryParts.push(`job_title=${encodeURIComponent(params.job_title)}`);
  if (params.date_from) queryParts.push(`date_from=${encodeURIComponent(params.date_from)}`);
  if (params.date_to) queryParts.push(`date_to=${encodeURIComponent(params.date_to)}`);
  if (params.skip !== undefined) queryParts.push(`skip=${params.skip}`);
  if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);

  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

  const response = await fetch(`${INTERVIEWS_URL}${queryString}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch interviews");
  }

  return resData.data || resData;
};

export const createInterview = async (payload: CreateInterviewPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to schedule interview");
  }

  return resData.data || resData;
};

export const batchCreateInterviews = async (payload: BatchCreateInterviewPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/batch`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to batch schedule interviews");
  }

  return resData.data || resData;
};

export const getInterviewById = async (interviewId: string) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch interview details");
  }

  return resData.data || resData;
};

export const updateInterview = async (interviewId: string, payload: UpdateInterviewPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to update interview");
  }

  return resData.data || resData;
};

export const rescheduleInterview = async (interviewId: string, payload: RescheduleInterviewPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}/reschedule`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to reschedule interview");
  }

  return resData.data || resData;
};

export const submitInterviewFeedback = async (interviewId: string, payload: SubmitFeedbackPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}/feedback`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to submit interview feedback");
  }

  return resData.data || resData;
};

export const bulkSubmitInterviewFeedback = async (payload: BulkSubmitFeedbackPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/bulk-feedback`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to submit bulk interview feedback");
  }

  return resData.data || resData;
};


export const deleteInterview = async (interviewId: string) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to delete interview");
  }

  return resData.data || resData;
};

export const getCandidateInterviewHistory = async (candidateId: string) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/candidate/${candidateId}/history`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch candidate interview history");
  }

  return resData.data || resData;
};

export const sendInterviewEmail = async (interviewId: string, payload: SendInterviewEmailPayload) => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}/send-mail`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to send interview email");
  }

  return resData.data || resData;
};

export const getFeedbackQuestionsFromBackend = async (interviewType?: string) => {
  const token = localStorage.getItem("access_token") || "";
  const query = interviewType ? `?interview_type=${encodeURIComponent(interviewType)}` : "";
  const response = await fetch(`${INTERVIEW_FEEDBACK_QUESTIONS_URL}${query}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch feedback questions");
  }

  return resData.data || resData;
};

export const getNextRoundNumber = async (candidateId: string, interviewType?: string) => {
  const token = localStorage.getItem("access_token") || "";
  const query = interviewType ? `?interview_type=${encodeURIComponent(interviewType)}` : "";
  const response = await fetch(`${INTERVIEWS_URL}/candidate/${candidateId}/next-round-number${query}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch next round number");
  }

  return resData.data || resData;
};

export const checkCandidateActiveInterviewStatus = async (candidateId: string, candidateName?: string) => {
  const token = localStorage.getItem("access_token") || "";
  const query = candidateName ? `?candidate_name=${encodeURIComponent(candidateName)}` : "";
  const response = await fetch(`${INTERVIEWS_URL}/candidate/${candidateId}/active-status${query}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to check candidate active interview status");
  }

  return resData.data || resData;
};

// ROLE & USER MANAGEMENT API FUNCTIONS
export const getRoles = async (): Promise<RoleItem[]> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(ROLES_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch roles");
  }

  const data = resData.data || resData;
  return data.roles || data;
};

export const createRole = async (payload: RoleCreatePayload): Promise<RoleItem> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(ROLES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to create role");
  }

  return resData.data || resData;
};

export const updateRole = async (roleId: string, payload: RoleUpdatePayload): Promise<RoleItem> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${ROLES_URL}/${roleId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to update role");
  }

  return resData.data || resData;
};

export const deleteRole = async (roleId: string): Promise<void> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${ROLES_URL}/${roleId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to delete role");
  }
};

export const getUsers = async (): Promise<UserProfile[]> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(USERS_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch users");
  }

  const data = resData.data || resData;
  return data.users || data;
};

export const updateUserRole = async (userId: string, role: string): Promise<UserProfile> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${USERS_URL}/${userId}/role`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role }),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to update user role");
  }

  return resData.data || resData;
};

export const createUser = async (payload: UserCreatePayload): Promise<UserProfile> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(USERS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to create user account");
  }

  return resData.data || resData;
};

export const updateUser = async (userId: string, payload: UserUpdatePayload): Promise<UserProfile> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${USERS_URL}/${userId}`, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to update user details");
  }

  return resData.data || resData;
};

export const deleteUser = async (userId: string): Promise<void> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${USERS_URL}/${userId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to delete user account");
  }
};

