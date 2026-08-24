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
export const INTERVIEW_TYPES_URL = `${BASE_URL}/interview-types`;
export const SETTINGS_EMAIL = `${BASE_URL}/settings/email`;
export const SETTINGS_EMAIL_TEST = `${BASE_URL}/settings/email/test`;
export const SETTINGS_AI = `${BASE_URL}/settings/ai`;
export const SETTINGS_AI_USAGE = `${BASE_URL}/settings/ai/usage`;
export const SETTINGS_APP = `${BASE_URL}/settings/app`;
export const ANALYTICS_REPORTS_URL = `${BASE_URL}/analytics/reports`;
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

export interface CandidateQueryParams {
  page?: number;
  limit?: number;
  skip?: number;
  search?: string;
  name?: string;
  email?: string;
  role?: string;
  experience?: number;
  min_experience?: number;
  max_experience?: number;
}

export interface PaginatedResumesResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  resumes: any[];
}

export const getResumes = async (params: CandidateQueryParams | number = 1, limitParam: number = 10): Promise<PaginatedResumesResponse> => {
  const token = localStorage.getItem("access_token") || "";
  let page = 1;
  let limit = limitParam;
  let search = "";
  let name = "";
  let email = "";
  let role = "";
  let experience: number | undefined = undefined;

  if (typeof params === "object" && params !== null) {
    page = params.page || 1;
    limit = params.limit || limitParam;
    search = params.search || "";
    name = params.name || "";
    email = params.email || "";
    role = params.role || "";
    experience = params.experience;
  } else if (typeof params === "number") {
    page = params;
  }

  const queryParts: string[] = [
    `page=${page}`,
    `limit=${limit}`,
  ];
  if (search && search.trim()) queryParts.push(`search=${encodeURIComponent(search.trim())}`);
  if (name && name.trim()) queryParts.push(`name=${encodeURIComponent(name.trim())}`);
  if (email && email.trim()) queryParts.push(`email=${encodeURIComponent(email.trim())}`);
  if (role && role.trim()) queryParts.push(`role=${encodeURIComponent(role.trim())}`);
  if (experience !== undefined) queryParts.push(`experience=${experience}`);

  const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

  const response = await fetch(`${RESUME_LIST}${queryString}`, {
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

  const dataPayload = resData.data || resData;
  const resumesList = Array.isArray(dataPayload.resumes)
    ? dataPayload.resumes
    : Array.isArray(dataPayload)
      ? dataPayload
      : [];
  const totalVal = typeof dataPayload.total === "number" ? dataPayload.total : resumesList.length;
  const totalPagesVal = typeof dataPayload.total_pages === "number"
    ? dataPayload.total_pages
    : Math.ceil(totalVal / limit) || 1;

  return {
    total: totalVal,
    page: dataPayload.page || page,
    limit: dataPayload.limit || limit,
    total_pages: totalPagesVal,
    resumes: resumesList,
  };
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

export const exportResumesApi = async (format: "csv" | "zip" = "csv", filters: any = {}) => {
  const token = localStorage.getItem("access_token") || "";
  const queryParts: string[] = [`format=${format}`];
  if (filters.search) queryParts.push(`search=${encodeURIComponent(filters.search)}`);
  if (filters.name) queryParts.push(`name=${encodeURIComponent(filters.name)}`);
  if (filters.email) queryParts.push(`email=${encodeURIComponent(filters.email)}`);
  if (filters.role) queryParts.push(`role=${encodeURIComponent(filters.role)}`);

  const response = await fetch(`${RESUME_LIST}/export?${queryParts.join("&")}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to export candidate records.");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = format === "zip" ? "candidate_resumes_export.zip" : "candidate_database_export.csv";
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
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
import { RECOMMENDATION_OPTIONS } from "../types/interview";
import type {
  InterviewTypeEnum,
  InterviewStatusEnum,
  InterviewRecommendationEnum,
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
  CheckConflictPayload,
  CheckConflictResponse,
} from "../types/interview";

export { RECOMMENDATION_OPTIONS };
export type {
  InterviewTypeEnum,
  InterviewStatusEnum,
  InterviewRecommendationEnum,
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
  CheckConflictPayload,
  CheckConflictResponse,
};

export const performClientSideConflictCheck = async (payload: CheckConflictPayload): Promise<CheckConflictResponse> => {
  try {
    const data = await getInterviews({ limit: 100 });
    const items: InterviewItem[] = Array.isArray(data) ? data : (data.interviews || data.items || []);

    const targetPersons = new Set<string>();
    const addPerson = (id?: string, name?: string) => {
      if (id && id.trim()) targetPersons.add(`id:${id.trim().toLowerCase()}`);
      if (name && name.trim()) targetPersons.add(`name:${name.trim().toLowerCase()}`);
    };

    addPerson(payload.interviewer_id, payload.interviewer_name);
    addPerson(payload.client_id, payload.client_name);

    if (payload.interviewers) {
      payload.interviewers.forEach((i) => addPerson(i.interviewer_id, i.interviewer_name));
    }
    if (payload.clients) {
      payload.clients.forEach((c) => addPerson(c.client_id, c.client_name));
    }

    if (targetPersons.size === 0) {
      return { has_conflict: false };
    }

    const normTime = (t?: string) => {
      if (!t) return "";
      const parts = t.trim().split(":");
      if (parts.length < 2) return t.trim();
      return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
    };

    const targetDate = payload.scheduled_date;
    const targetTime = normTime(payload.scheduled_time);

    for (const doc of items) {
      if (payload.exclude_interview_id && doc.id === payload.exclude_interview_id) {
        continue;
      }
      if (doc.status === "CANCELLED") {
        continue;
      }

      const docDate = doc.scheduled_date;
      const docTime = normTime(doc.scheduled_time);

      if (docDate === targetDate && docTime === targetTime) {
        const docPersons = new Set<string>();
        const addDocPerson = (id?: string, name?: string) => {
          if (id && id.trim()) docPersons.add(`id:${id.trim().toLowerCase()}`);
          if (name && name.trim()) docPersons.add(`name:${name.trim().toLowerCase()}`);
        };

        addDocPerson(doc.interviewer_id, doc.interviewer_name);
        addDocPerson(doc.client_id, doc.client_name);

        if (doc.interviewers) {
          doc.interviewers.forEach((i) => addDocPerson(i.interviewer_id, i.interviewer_name));
        }
        if (doc.clients) {
          doc.clients.forEach((c) => addDocPerson(c.client_id, c.client_name));
        }

        for (const p of targetPersons) {
          if (docPersons.has(p)) {
            const rawName = p.startsWith("name:")
              ? p.replace("name:", "")
              : (doc.interviewer_name || doc.client_name || "Person");
            const capitalized = rawName.charAt(0).toUpperCase() + rawName.slice(1);

            return {
              has_conflict: true,
              conflict_type: "interviewer",
              conflict_message: `Schedule Conflict: ${capitalized} is already assigned to an interview at ${payload.scheduled_time} on ${payload.scheduled_date}.`,
              conflicting_interviews: [doc],
            };
          }
        }
      }
    }

    return { has_conflict: false };
  } catch (err) {
    console.error("Client side conflict check error:", err);
    return { has_conflict: false };
  }
};

export const checkInterviewConflictGet = async (payload: CheckConflictPayload): Promise<CheckConflictResponse> => {
  const token = localStorage.getItem("access_token") || "";

  let invId = payload.interviewer_id;
  let invName = payload.interviewer_name;
  let cliId = payload.client_id;
  let cliName = payload.client_name;

  if (!invName && payload.interviewers && payload.interviewers.length > 0) {
    const validInv = payload.interviewers.find((i) => i.interviewer_name && i.interviewer_name.trim());
    if (validInv) {
      invName = validInv.interviewer_name;
      invId = invId || validInv.interviewer_id;
    }
  }

  if (!cliName && payload.clients && payload.clients.length > 0) {
    const validCli = payload.clients.find((c) => c.client_name && c.client_name.trim());
    if (validCli) {
      cliName = validCli.client_name;
      cliId = cliId || validCli.client_id;
    }
  }

  const queryParts: string[] = [
    `scheduled_date=${encodeURIComponent(payload.scheduled_date)}`,
    `scheduled_time=${encodeURIComponent(payload.scheduled_time)}`,
  ];

  if (invId) queryParts.push(`interviewer_id=${encodeURIComponent(invId)}`);
  if (invName) queryParts.push(`interviewer_name=${encodeURIComponent(invName)}`);
  if (cliId) queryParts.push(`client_id=${encodeURIComponent(cliId)}`);
  if (cliName) queryParts.push(`client_name=${encodeURIComponent(cliName)}`);
  if (payload.exclude_interview_id) queryParts.push(`exclude_interview_id=${encodeURIComponent(payload.exclude_interview_id)}`);

  const response = await fetch(`${INTERVIEWS_URL}/check-conflict?${queryParts.join("&")}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 405 || response.status === 404) {
    return await performClientSideConflictCheck(payload);
  }

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    return await performClientSideConflictCheck(payload);
  }

  return resData.data || resData;
};

export interface CancelInterviewPayload {
  send_email?: boolean;
  reason?: string;
  email_recipients?: string[];
}

export const cancelInterview = async (
  interviewId: string,
  payload: CancelInterviewPayload = {}
): Promise<any> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEWS_URL}/${interviewId}/cancel`, {
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
    throw new Error(resData.detail || resData.message || "Failed to cancel interview session");
  }

  return resData.data || resData;
};

export const checkInterviewConflict = async (payload: CheckConflictPayload): Promise<CheckConflictResponse> => {
  const token = localStorage.getItem("access_token") || "";
  try {
    const response = await fetch(`${INTERVIEWS_URL}/check-conflict`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 405 || response.status === 404) {
      return await checkInterviewConflictGet(payload);
    }

    const resData = await response.json();
    handleAuthError(response, resData);

    if (!response.ok) {
      return await checkInterviewConflictGet(payload);
    }

    return resData.data || resData;
  } catch {
    try {
      return await checkInterviewConflictGet(payload);
    } catch {
      return await performClientSideConflictCheck(payload);
    }
  }
};



export const getInterviews = async (params: {
  candidate_id?: string;
  interviewer_id?: string;
  client_id?: string;
  status?: string;
  interview_type?: string;
  job_title?: string;
  name?: string;
  email?: string;
  scheduled_date?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  recommendation?: string;
  page?: number;
  skip?: number;
  limit?: number;
} = {}) => {
  const token = localStorage.getItem("access_token") || "";
  const queryParts: string[] = [];

  if (params.candidate_id) queryParts.push(`candidate_id=${encodeURIComponent(params.candidate_id)}`);
  if (params.interviewer_id) queryParts.push(`interviewer_id=${encodeURIComponent(params.interviewer_id)}`);
  if (params.client_id) queryParts.push(`client_id=${encodeURIComponent(params.client_id)}`);
  if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
  if (params.interview_type) queryParts.push(`interview_type=${encodeURIComponent(params.interview_type)}`);
  if (params.job_title) queryParts.push(`job_title=${encodeURIComponent(params.job_title)}`);
  if (params.name) queryParts.push(`name=${encodeURIComponent(params.name)}`);
  if (params.email) queryParts.push(`email=${encodeURIComponent(params.email)}`);
  if (params.scheduled_date) queryParts.push(`scheduled_date=${encodeURIComponent(params.scheduled_date)}`);
  if (params.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
  if (params.date_from) queryParts.push(`date_from=${encodeURIComponent(params.date_from)}`);
  if (params.date_to) queryParts.push(`date_to=${encodeURIComponent(params.date_to)}`);
  if (params.recommendation) queryParts.push(`recommendation=${encodeURIComponent(params.recommendation)}`);
  if (params.page !== undefined) queryParts.push(`page=${params.page}`);
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

export const uploadInterviewDocument = async (file: File) => {
  const token = localStorage.getItem("access_token") || "";
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${INTERVIEWS_URL}/upload-document`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
    body: formData,
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to upload document to S3");
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

export const getNextRoundNumber = async (candidateId: string, interviewType?: string, interviewTypeId?: string) => {
  const token = localStorage.getItem("access_token") || "";
  const params = new URLSearchParams();
  if (interviewType) params.append("interview_type", interviewType);
  if (interviewTypeId) params.append("interview_type_id", interviewTypeId);
  const query = params.toString() ? `?${params.toString()}` : "";
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

export const SKILLS_EVALUATIONS_URL = `${BASE_URL}/skills-evaluations`;

export interface CategoryWeightagePayload {
  category: string;
  weightage: number;
}

export interface SkillsEvaluationPayload {
  skill_name: string;
  categories: CategoryWeightagePayload[];
}

export interface SkillsEvaluationResponseData {
  id: string;
  skill_name: string;
  categories: CategoryWeightagePayload[];
  created_at: string;
  updated_at: string;
}

export const getSkillsEvaluations = async (
  search?: string,
  includeCategories: boolean = false
): Promise<SkillsEvaluationResponseData[]> => {
  const token = localStorage.getItem("access_token") || "";
  const params = new URLSearchParams();
  if (search && search.trim()) {
    params.append("search", search.trim());
  }
  if (includeCategories) {
    params.append("include_categories", "true");
  }

  const queryString = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${SKILLS_EVALUATIONS_URL}${queryString}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch skills evaluations");
  }

  return resData.data || resData;
};

export const saveSkillsEvaluation = async (payload: SkillsEvaluationPayload): Promise<SkillsEvaluationResponseData> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(SKILLS_EVALUATIONS_URL, {
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
    throw new Error(resData.detail || "Failed to save skills evaluation template");
  }

  return resData.data || resData;
};

export const deleteSkillsEvaluation = async (skillId: string): Promise<void> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${SKILLS_EVALUATIONS_URL}/${skillId}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to delete skills evaluation template");
  }
};

// INTERVIEW TYPE MANAGEMENT API
export interface InterviewTypeItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  color?: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface InterviewTypeCreatePayload {
  name: string;
  code?: string;
  description?: string;
  color?: string;
  is_active?: boolean;
}

export interface InterviewTypeUpdatePayload {
  name?: string;
  code?: string;
  description?: string;
  color?: string;
  is_active?: boolean;
}

export const getInterviewTypes = async (includeInactive: boolean = true): Promise<InterviewTypeItem[]> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEW_TYPES_URL}?include_inactive=${includeInactive}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to fetch interview types");
  }

  const payload = resData.data || resData;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.interview_types)) return payload.interview_types;
  return [];
};

export const createInterviewType = async (payload: InterviewTypeCreatePayload): Promise<InterviewTypeItem> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(INTERVIEW_TYPES_URL, {
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
    throw new Error(resData.detail || "Failed to create interview type");
  }

  return resData.data || resData;
};

export const updateInterviewType = async (id: string, payload: InterviewTypeUpdatePayload): Promise<InterviewTypeItem> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEW_TYPES_URL}/${id}`, {
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
    throw new Error(resData.detail || "Failed to update interview type");
  }

  return resData.data || resData;
};

export const deleteInterviewType = async (id: string): Promise<void> => {
  const token = localStorage.getItem("access_token") || "";
  const response = await fetch(`${INTERVIEW_TYPES_URL}/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const resData = await response.json();
  handleAuthError(response, resData);

  if (!response.ok) {
    throw new Error(resData.detail || "Failed to delete interview type");
  }
};



