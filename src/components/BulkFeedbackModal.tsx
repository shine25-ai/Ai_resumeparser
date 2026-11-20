import React, { useState, useEffect, useRef } from "react";
import {
  X, ChevronLeft, ChevronRight, UserCheck,
  Building2, DollarSign, Sparkles, HelpCircle, Plus, Trash2,
  FileText, Upload, Calendar, RefreshCw, ShieldCheck,
  AlignLeft, Briefcase, Eye, Loader2, CheckCircle2, AlertCircle
} from "lucide-react";
import {
  bulkSubmitInterviewFeedback,
  getUsers,
  uploadInterviewDocument,
  RECOMMENDATION_OPTIONS,
  type InterviewItem,
  type BulkFeedbackItemPayload,
  type InterviewerItem,
  type ClientFeedbackItem,
  type UserProfile,
} from "../utils/Api";
import type { CategoryScoreItem } from "../types/interview";
import { SkillRatingsEvaluation } from "./SkillRatingsEvaluation";
import { getFeedbackQuestionsAsync, getAutoRatingOutcome } from "../utils/feedbackHelpers";
import { useFeedback } from "./ui/Feedback";
import { RoundsTracker } from "./interview/RoundsTracker";

interface BulkFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInterviews: InterviewItem[];
  onSuccess: () => void;
}

interface SingleCandidateFeedbackForm {
  interview_id: string;
  candidate_name: string;
  candidate_email?: string;
  job_title: string;
  interview_type: string;
  round_number: number;
  scheduled_date?: string;
  scheduled_time?: string;
  meeting_platform?: string;
  meeting_link?: string;

  feedbackTab: "INTERVIEWER" | "CLIENT";
  
  // Single Primary Interviewer Feedback (Top level sync)
  rating: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  recommendation: string;
  
  // Multi Interviewer Panel List
  interviewersList: InterviewerItem[];

  // Single Primary Client Feedback (Top level sync)
  client_name: string;
  client_rating: number;
  client_feedback: string;
  client_strengths: string;
  client_weaknesses: string;
  client_recommendation: string;
  client_notes: string;
  client_feedback_date: string;
  
  // Multi Client Panel List
  clientsList: ClientFeedbackItem[];

  // Skill Ratings & AI Score
  skill_ratings: { skill_name: string; rating: number }[];
  category_scores: CategoryScoreItem[];
  ai_score: number;
  ai_recommendation: string;

  // Shared Candidate Info & Outcomes
  candidate_requested_date: string;
  candidate_requested_time: string;
  candidate_requested_role: string;
  salary_requested: string;
  final_fit_salary: string;
  joining_date: string;
  interview_document_files: string;
  interview_feedback_files: string;
  notes: string;
}

// The panel shows an empty "Client Evaluator 1" / "Interviewer 1" row so people can fill it in.
// Rows nobody filled in (no person, rating, comments or verdict) are not saved; they used to be
// stored as if a client or interviewer had given feedback.
const hasPerson = (id?: string, email?: string) => !!(id || (email && email.trim()));
const isFilledClient = (c: ClientFeedbackItem) =>
  hasPerson(c.client_id, c.client_email) ||
  !!c.client_rating ||
  !!(c.client_feedback && c.client_feedback.trim()) ||
  (c.client_strengths?.length ?? 0) > 0 ||
  (c.client_weaknesses?.length ?? 0) > 0 ||
  !!(c.client_recommendation && c.client_recommendation !== "Pending");
const isFilledInterviewer = (i: InterviewerItem) =>
  hasPerson(i.interviewer_id, i.interviewer_email) ||
  !!i.rating ||
  !!(i.feedback && i.feedback.trim()) ||
  (i.strengths?.length ?? 0) > 0 ||
  (i.weaknesses?.length ?? 0) > 0 ||
  !!(i.recommendation && i.recommendation !== "Pending") ||
  !/^Interviewer \d+$/.test(i.interviewer_name || "");

export const BulkFeedbackModal: React.FC<BulkFeedbackModalProps> = ({
  isOpen,
  onClose,
  selectedInterviews,
  onSuccess,
}) => {
  const { toast, confirm } = useFeedback();

  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0);
  const [formsData, setFormsData] = useState<SingleCandidateFeedbackForm[]>([]);
  // Verdicts the evaluator chose by hand, per candidate ("0:top", "0:int:1", ...)
  const pickedVerdictsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);

  const [questionOptions, setQuestionOptions] = useState<string[]>([]);
  const [isUploadingDocFile, setIsUploadingDocFile] = useState<boolean>(false);
  const [isUploadingFeedbackReportFile, setIsUploadingFeedbackReportFile] = useState<boolean>(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"panel" | "skills" | "offer_docs">("panel");
  const [weightageWarningList, setWeightageWarningList] = useState<{
    formIndex: number;
    candidateName: string;
    skillName: string;
    totalWeightage: number;
    unassigned: number;
  }[] | null>(null);

  // Auto-save & Draft restoration state
  const [restoredDraftsCount, setRestoredDraftsCount] = useState<number>(0);
  const [lastAutoSavedTime, setLastAutoSavedTime] = useState<string | null>(null);

  // User Authentication & Role Detection
  const userStr = localStorage.getItem("user");
  const currentUser: UserProfile | null = userStr ? JSON.parse(userStr) : null;
  const userRole = (currentUser?.role || "").toLowerCase();
  const isClientUser = userRole.includes("client");
  const isInterviewerUser = userRole.includes("interviewer");

  useEffect(() => {
    if (isClientUser) {
      setActiveWorkspaceTab("panel");
    }
  }, [isClientUser]);

  useEffect(() => {
    if (isOpen) {
      getUsers().then((users) => setSystemUsers(users)).catch(() => setSystemUsers([]));
    }
  }, [isOpen]);

  // Initialize form state when selectedInterviews change or modal opens
  useEffect(() => {
    if (selectedInterviews && selectedInterviews.length > 0) {
      let restoredCount = 0;
      const initialForms: SingleCandidateFeedbackForm[] = selectedInterviews.map((item) => {
        const uId = currentUser?.id || (currentUser as any)?._id || "";
        const uEmail = (currentUser?.email || "").trim().toLowerCase();
        const uName = (currentUser?.full_name || "").trim().toLowerCase();

        let initInterviewers: InterviewerItem[] = [];
        if (isInterviewerUser && currentUser) {
          const matched = (item.interviewers || []).filter((i) => {
            return (
              (i.interviewer_id && i.interviewer_id === uId) ||
              (i.interviewer_email && i.interviewer_email.trim().toLowerCase() === uEmail) ||
              (i.interviewer_name && i.interviewer_name.trim().toLowerCase() === uName)
            );
          });
          initInterviewers = matched.length > 0 ? matched : [{
            interviewer_id: uId,
            interviewer_name: currentUser.full_name || item.interviewer_name || "Interviewer 1",
            interviewer_email: currentUser.email || item.interviewer_email || "",
            rating: item.rating ? Number(item.rating) : undefined,
            feedback: item.feedback || "",
            recommendation: item.recommendation || "Pending",
            strengths: item.strengths || [],
            weaknesses: item.weaknesses || [],
          }];
        } else {
          initInterviewers = item.interviewers && item.interviewers.length > 0
            ? item.interviewers
            : [
                {
                  interviewer_name: item.interviewer_name || "Interviewer 1",
                  interviewer_email: item.interviewer_email || "",
                  rating: item.rating ? Number(item.rating) : undefined,
                  feedback: item.feedback || "",
                  recommendation: item.recommendation || "Pending",
                  strengths: item.strengths || [],
                  weaknesses: item.weaknesses || [],
                },
              ];
        }

        let initClients: ClientFeedbackItem[] = [];
        if (isClientUser && currentUser) {
          const matched = (item.clients || []).filter((c) => {
            return (
              (c.client_id && c.client_id === uId) ||
              (c.client_email && c.client_email.trim().toLowerCase() === uEmail) ||
              (c.client_name && c.client_name.trim().toLowerCase() === uName)
            );
          });
          initClients = matched.length > 0 ? matched : [{
            client_id: uId,
            client_name: currentUser.full_name || item.client_name || "Client Evaluator 1",
            client_email: currentUser.email || item.client_email || "",
            client_rating: item.client_rating ? Number(item.client_rating) : undefined,
            client_feedback: item.client_feedback || "",
            client_recommendation: item.client_recommendation || "Pending",
            client_notes: item.client_notes || "",
          }];
        } else {
          initClients = item.clients && item.clients.length > 0
            ? item.clients
            : [
                {
                  client_name: item.client_name || "Client Evaluator 1",
                  client_rating: item.client_rating ? Number(item.client_rating) : undefined,
                  client_feedback: item.client_feedback || "",
                  client_recommendation: item.client_recommendation || "Pending",
                  client_notes: item.client_notes || "",
                },
              ];
        }

        const initSkills =
          item.skill_ratings && item.skill_ratings.length > 0
            ? item.skill_ratings
            : [];

        const defaultForm: SingleCandidateFeedbackForm = {
          interview_id: item.id,
          candidate_name: item.candidate_name,
          candidate_email: item.candidate_email,
          job_title: item.job_title,
          interview_type: item.interview_type,
          round_number: item.round_number || 1,
          scheduled_date: item.scheduled_date,
          scheduled_time: item.scheduled_time,
          meeting_platform: item.meeting_platform,
          meeting_link: item.meeting_link,

          feedbackTab: isClientUser ? "CLIENT" : "INTERVIEWER",
          
          // 0 = not rated yet; only real ratings are saved
          rating: item.rating ?? 0,
          feedback: item.feedback || "",
          strengths: item.strengths ? item.strengths.join(", ") : "",
          weaknesses: item.weaknesses ? item.weaknesses.join(", ") : "",
          recommendation: item.recommendation || "Pending",
          interviewersList: initInterviewers,

          client_name: item.client_name || "",
          client_rating: item.client_rating ?? 0,
          client_feedback: item.client_feedback || "",
          client_strengths: item.client_strengths ? item.client_strengths.join(", ") : "",
          client_weaknesses: item.client_weaknesses ? item.client_weaknesses.join(", ") : "",
          client_recommendation: item.client_recommendation || "Pending",
          client_notes: item.client_notes || "",
          client_feedback_date: item.client_feedback_date || new Date().toISOString().split("T")[0],
          clientsList: initClients,

          skill_ratings: initSkills,
          category_scores: item.category_scores || [],
          ai_score: typeof item.ai_score === "number" ? item.ai_score : 0,
          ai_recommendation: item.ai_recommendation || "Pending",

          candidate_requested_date: item.candidate_requested_date || "",
          candidate_requested_time: item.candidate_requested_time || "",
          candidate_requested_role: item.candidate_requested_role || "",
          salary_requested: item.salary_requested || "",
          final_fit_salary: item.final_fit_salary || "",
          joining_date: item.joining_date || "",
          interview_document_files: item.interview_document_files ? Array.from(new Set(item.interview_document_files)).join("\n") : "",
          interview_feedback_files: item.interview_feedback_files ? Array.from(new Set(item.interview_feedback_files)).join("\n") : "",
          notes: item.notes || "",
        };

        // Check if a saved draft exists in localStorage for this interview (prevents loss on session expiry)
        try {
          const draftKey = `candidate_feedback_draft_${item.id}`;
          const savedDraftStr = localStorage.getItem(draftKey);
          if (savedDraftStr) {
            const parsedDraft = JSON.parse(savedDraftStr);
            if (parsedDraft?.form) {
              restoredCount++;
              return {
                ...defaultForm,
                ...parsedDraft.form,
                interview_id: item.id,
                candidate_name: item.candidate_name,
                candidate_email: item.candidate_email,
                job_title: item.job_title,
                interview_type: item.interview_type,
                round_number: item.round_number || 1,
              };
            }
          }
        } catch (e) {
          console.warn("Could not parse saved draft:", e);
        }

        return defaultForm;
      });

      setRestoredDraftsCount(restoredCount);
      setFormsData(initialForms);
      pickedVerdictsRef.current = new Set();
      setActiveCandidateIndex(0);
    }
  }, [selectedInterviews, isOpen]);

  // Real-time Auto-Save to localStorage so work is never lost if session expires or tab closes
  useEffect(() => {
    if (!isOpen || formsData.length === 0) return;

    const timer = setTimeout(() => {
      let savedCount = 0;
      formsData.forEach((form) => {
        if (!form.interview_id) return;
        const hasContent = Boolean(
          (form.rating && form.rating > 0) ||
          form.feedback?.trim() ||
          form.strengths?.trim() ||
          form.weaknesses?.trim() ||
          (form.recommendation && form.recommendation !== "Pending") ||
          (form.client_rating && form.client_rating > 0) ||
          form.client_feedback?.trim() ||
          form.client_notes?.trim() ||
          form.notes?.trim() ||
          (form.skill_ratings && form.skill_ratings.length > 0) ||
          (form.category_scores && form.category_scores.length > 0) ||
          form.salary_requested ||
          form.final_fit_salary ||
          form.joining_date
        );

        if (hasContent) {
          try {
            const draftPayload = {
              form,
              savedAt: Date.now(),
            };
            localStorage.setItem(`candidate_feedback_draft_${form.interview_id}`, JSON.stringify(draftPayload));
            savedCount++;
          } catch (err) {
            console.warn("Auto-save draft storage error:", err);
          }
        }
      });

      if (savedCount > 0) {
        setLastAutoSavedTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formsData, isOpen]);

  // Only load questions while the modal is open (it stays mounted while closed)
  const activeInterviewType = isOpen ? selectedInterviews?.[activeCandidateIndex]?.interview_type : undefined;
  useEffect(() => {
    if (activeInterviewType) {
      getFeedbackQuestionsAsync(activeInterviewType).then((opts) => setQuestionOptions(opts));
    }
  }, [activeInterviewType]);

  if (!isOpen || selectedInterviews.length === 0) return null;

  const currentForm = formsData[activeCandidateIndex] || formsData[0];

  // If formsData is initializing on first tick, display non-blocking modal loader
  if (!currentForm) {
    return (
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-2xl flex items-center gap-3 shadow-xl">
          <Loader2 className="animate-spin text-indigo-600" size={22} />
          <span className="text-xs font-bold text-slate-700">Loading candidate feedback workspace...</span>
        </div>
      </div>
    );
  }

  // A rating suggests a verdict, but never overwrites one the evaluator picked by hand
  const pickedVerdicts = pickedVerdictsRef.current;
  const pickKey = (part: string) => `${activeCandidateIndex}:${part}`;

  const handleCurrentFormChange = (field: keyof SingleCandidateFeedbackForm, value: any) => {
    if (field === "recommendation") pickedVerdicts.add(pickKey("top"));
    if (field === "client_recommendation") pickedVerdicts.add(pickKey("client"));

    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        const item: SingleCandidateFeedbackForm = {
          ...form,
          [field]: value,
        };

        if (field === "rating" && !pickedVerdicts.has(pickKey("top"))) {
          if (value !== undefined && Number(value) > 0) {
            const outcome = getAutoRatingOutcome(Number(value));
            item.recommendation = outcome.recommendation;
          } else {
            item.recommendation = "Pending";
          }
        }

        if (field === "client_rating" && !pickedVerdicts.has(pickKey("client"))) {
          if (value !== undefined && Number(value) > 0) {
            const outcome = getAutoRatingOutcome(Number(value));
            item.client_recommendation = outcome.clientRecommendation;
          } else {
            item.client_recommendation = "Pending";
          }
        }

        return item;
      });
    });
  };

  // Multi Interviewers Handlers
  const handleAddInterviewer = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        const currentList = form.interviewersList || [];
        const newInt: InterviewerItem = {
          interviewer_name: `Interviewer ${currentList.length + 1}`,
          rating: undefined,
          feedback: "",
          recommendation: "Pending",
        };
        return {
          ...form,
          interviewersList: [...currentList, newInt],
        };
      });
    });
    toast("New interviewer panel added.", "success");
  };

  const handleRemoveInterviewer = async (intIdx: number) => {
    const intName = currentForm.interviewersList[intIdx]?.interviewer_name || `Interviewer #${intIdx + 1}`;
    const ok = await confirm({
      title: "Remove Evaluator?",
      message: `Are you sure you want to remove "${intName}" from the panel?`,
      confirmLabel: "Yes, Remove",
      danger: true,
    });
    if (!ok) return;

    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        if (!form.interviewersList || form.interviewersList.length <= 1) return form;
        return {
          ...form,
          interviewersList: form.interviewersList.filter((_, idx2) => idx2 !== intIdx),
        };
      });
    });
    toast(`Evaluator "${intName}" removed.`, "info");
  };

  const handleInterviewerItemChange = (intIdx: number, field: keyof InterviewerItem, val: any) => {
    if (field === "recommendation") pickedVerdicts.add(pickKey(`int:${intIdx}`));

    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        const currentList = form.interviewersList || [];
        if (!currentList[intIdx]) return form;

        const updatedItem = { ...currentList[intIdx], [field]: val };
        if (field === "rating" && !pickedVerdicts.has(pickKey(`int:${intIdx}`))) {
          if (val !== undefined && Number(val) > 0) {
            const outcome = getAutoRatingOutcome(Number(val));
            updatedItem.recommendation = outcome.recommendation;
          } else {
            updatedItem.recommendation = "Pending";
          }
        }

        const nextList = currentList.map((item, i) => (i === intIdx ? updatedItem : item));

        const updatedForm: SingleCandidateFeedbackForm = {
          ...form,
          interviewersList: nextList,
        };

        if (intIdx === 0) {
          updatedForm.rating = Number(updatedItem.rating ?? 0);
          updatedForm.recommendation = updatedItem.recommendation || "Pending";
        }

        return updatedForm;
      });
    });
  };

  // Multi Client Handlers
  const handleAddClient = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        const currentList = form.clientsList || [];
        const newClient: ClientFeedbackItem = {
          client_name: `Client ${currentList.length + 1}`,
          client_rating: undefined,
          client_feedback: "",
          client_recommendation: "Pending",
        };
        return {
          ...form,
          clientsList: [...currentList, newClient],
        };
      });
    });
    toast("New client evaluator added.", "success");
  };

  const handleRemoveClient = async (clientIdx: number) => {
    const cName = currentForm.clientsList[clientIdx]?.client_name || `Client Evaluator #${clientIdx + 1}`;
    const ok = await confirm({
      title: "Remove Client Evaluator?",
      message: `Are you sure you want to remove "${cName}"?`,
      confirmLabel: "Yes, Remove",
      danger: true,
    });
    if (!ok) return;

    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        if (!form.clientsList || form.clientsList.length <= 1) return form;
        return {
          ...form,
          clientsList: form.clientsList.filter((_, idx2) => idx2 !== clientIdx),
        };
      });
    });
    toast(`Client evaluator "${cName}" removed.`, "info");
  };

  const handleClientItemChange = (clientIdx: number, field: keyof ClientFeedbackItem, val: any) => {
    if (field === "client_recommendation") pickedVerdicts.add(pickKey(`cli:${clientIdx}`));

    setFormsData((prev) => {
      return prev.map((form, idx) => {
        if (idx !== activeCandidateIndex) return form;
        const currentList = form.clientsList || [];
        if (!currentList[clientIdx]) return form;

        const updatedItem = { ...currentList[clientIdx], [field]: val };
        if (field === "client_rating" && !pickedVerdicts.has(pickKey(`cli:${clientIdx}`))) {
          if (val !== undefined && Number(val) > 0) {
            const outcome = getAutoRatingOutcome(Number(val));
            updatedItem.client_recommendation = outcome.clientDecision;
          } else {
            updatedItem.client_recommendation = "Pending";
          }
        }

        const nextList = currentList.map((item, i) => (i === clientIdx ? updatedItem : item));

        const updatedForm: SingleCandidateFeedbackForm = {
          ...form,
          clientsList: nextList,
        };

        if (clientIdx === 0) {
          updatedForm.client_rating = Number(updatedItem.client_rating ?? 0);
          updatedForm.client_name = updatedItem.client_name || "";
          updatedForm.client_recommendation = updatedItem.client_recommendation || "Pending";
        }

        return updatedForm;
      });
    });
  };

  // Document Upload Handler (Uploads directly to AWS S3)
  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingDocFile(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadInterviewDocument(file);
        if (res?.s3_url) {
          uploadedUrls.push(res.s3_url);
        }
      }
      if (uploadedUrls.length > 0) {
        setFormsData((prev) => {
          return prev.map((form, idx) => {
            if (idx !== activeCandidateIndex) return form;
            const existing = form.interview_document_files
              ? form.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)
              : [];
            const combined = Array.from(new Set([...existing, ...uploadedUrls])).join("\n");
            return {
              ...form,
              interview_document_files: combined,
            };
          });
        });
      }
    } catch (err: any) {
      console.error("Failed to upload document to S3:", err);
      toast(`Failed to upload document to S3: ${err.message || "Upload error"}`, "error");
    } finally {
      setIsUploadingDocFile(false);
      e.target.value = "";
    }
  };

  // Feedback Report Upload Handler (Uploads directly to AWS S3)
  const handleFeedbackReportFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingFeedbackReportFile(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadInterviewDocument(file);
        if (res?.s3_url) {
          uploadedUrls.push(res.s3_url);
        }
      }
      if (uploadedUrls.length > 0) {
        setFormsData((prev) => {
          return prev.map((form, idx) => {
            if (idx !== activeCandidateIndex) return form;
            const existing = form.interview_feedback_files
              ? form.interview_feedback_files.split("\n").map((s) => s.trim()).filter(Boolean)
              : [];
            const combined = Array.from(new Set([...existing, ...uploadedUrls])).join("\n");
            return {
              ...form,
              interview_feedback_files: combined,
            };
          });
        });
      }
    } catch (err: any) {
      console.error("Failed to upload feedback report to S3:", err);
      toast(`Failed to upload feedback report to S3: ${err.message || "Upload error"}`, "error");
    } finally {
      setIsUploadingFeedbackReportFile(false);
      e.target.value = "";
    }
  };

  const getUnbalancedSkills = (forms: SingleCandidateFeedbackForm[] = formsData) => {
    const warnings: {
      formIndex: number;
      candidateName: string;
      skillName: string;
      totalWeightage: number;
      unassigned: number;
    }[] = [];

    forms.forEach((f, fIdx) => {
      const candidateName =
        selectedInterviews[fIdx]?.candidate_name ||
        selectedInterviews[fIdx]?.candidate_email ||
        `Candidate #${fIdx + 1}`;

      (f.skill_ratings || []).forEach((skill) => {
        const sName = (skill.skill_name || "").trim();
        if (!sName) return;
        const sLower = sName.toLowerCase();

        const cats = (f.category_scores || []).filter((c) => {
          const cSkill = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
          if (cSkill) return cSkill === sLower;
          if (f.skill_ratings.length === 1 && f.skill_ratings[0].skill_name.trim().toLowerCase() === sLower) return true;
          return false;
        });

        if (cats.length > 0) {
          const totalW = cats.reduce((sum, item) => sum + (item.weightage || 0), 0);
          if (totalW !== 100) {
            warnings.push({
              formIndex: fIdx,
              candidateName,
              skillName: sName,
              totalWeightage: totalW,
              unassigned: 100 - totalW,
            });
          }
        }
      });
    });

    return warnings;
  };

  const executeSubmitAll = async (targetForms: SingleCandidateFeedbackForm[] = formsData) => {
    try {
      setLoading(true);
      setError(null);

      const uId = currentUser?.id || (currentUser as any)?._id || "";
      const uEmail = (currentUser?.email || "").trim().toLowerCase();
      const uName = (currentUser?.full_name || "").trim().toLowerCase();

      const itemsPayload: BulkFeedbackItemPayload[] = targetForms.map((f, fIdx) => {
        const docFilesArray = f.interview_document_files
          ? Array.from(new Set(f.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)))
          : [];
        const feedbackReportFilesArray = f.interview_feedback_files
          ? Array.from(new Set(f.interview_feedback_files.split("\n").map((s) => s.trim()).filter(Boolean)))
          : [];

        const origItem = selectedInterviews.find((i) => i.id === f.interview_id) || selectedInterviews[fIdx];

        let finalClientsList = f.clientsList;
        if (isClientUser && currentUser && origItem?.clients && origItem.clients.length > 0) {
          const otherClients = origItem.clients.filter((c) => {
            const matchId = c.client_id && c.client_id === uId;
            const matchEmail = c.client_email && c.client_email.trim().toLowerCase() === uEmail;
            const matchName = c.client_name && c.client_name.trim().toLowerCase() === uName;
            return !matchId && !matchEmail && !matchName;
          });
          finalClientsList = [...otherClients, ...(f.clientsList || [])];
        }

        let finalInterviewersList = f.interviewersList;
        if (isInterviewerUser && currentUser && origItem?.interviewers && origItem.interviewers.length > 0) {
          const otherInterviewers = origItem.interviewers.filter((i) => {
            const matchId = i.interviewer_id && i.interviewer_id === uId;
            const matchEmail = i.interviewer_email && i.interviewer_email.trim().toLowerCase() === uEmail;
            const matchName = i.interviewer_name && i.interviewer_name.trim().toLowerCase() === uName;
            return !matchId && !matchEmail && !matchName;
          });
          finalInterviewersList = [...otherInterviewers, ...(f.interviewersList || [])];
        }

        return {
          interview_id: f.interview_id,
          rating: f.rating ? Number(f.rating) : undefined,
          feedback: f.feedback || undefined,
          strengths: f.strengths ? f.strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          weaknesses: f.weaknesses ? f.weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          recommendation: f.recommendation || undefined,
          interviewers: (finalInterviewersList || []).filter(isFilledInterviewer),

          client_name: f.client_name || undefined,
          client_rating: f.client_rating ? Number(f.client_rating) : undefined,
          client_feedback: f.client_feedback || undefined,
          client_strengths: f.client_strengths ? f.client_strengths.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_weaknesses: f.client_weaknesses ? f.client_weaknesses.split(",").map((s) => s.trim()).filter(Boolean) : [],
          client_recommendation: f.client_recommendation || undefined,
          client_notes: f.client_notes || undefined,
          client_feedback_date: f.client_feedback_date || undefined,
          clients: (finalClientsList || []).filter(isFilledClient),

          skill_ratings: f.skill_ratings,
          category_scores: f.category_scores,
          ai_score: f.ai_score,
          ai_recommendation: f.ai_recommendation,

          candidate_requested_date: f.candidate_requested_date || undefined,
          candidate_requested_time: f.candidate_requested_time || undefined,
          candidate_requested_role: f.candidate_requested_role || undefined,
          salary_requested: f.salary_requested || undefined,
          final_fit_salary: f.final_fit_salary || undefined,
          joining_date: f.joining_date || undefined,
          interview_document_files: docFilesArray,
          interview_feedback_files: feedbackReportFilesArray,
          notes: f.notes || undefined,
        };
      });

      await bulkSubmitInterviewFeedback({ items: itemsPayload });

      // Clean up auto-saved drafts from localStorage on successful submission
      targetForms.forEach((f) => {
        if (f.interview_id) {
          try {
            localStorage.removeItem(`candidate_feedback_draft_${f.interview_id}`);
          } catch (e) {
            console.error(e);
          }
        }
      });
      setRestoredDraftsCount(0);

      toast("Feedback submitted successfully!", "success");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Bulk Feedback Submission Failed:", err);
      setError(err.message || "Failed to submit bulk interview feedback.");
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardDraft = async (interviewId: string) => {
    const ok = await confirm({
      title: "Discard Unsaved Draft?",
      message: "Are you sure you want to discard the auto-saved draft and restore the original evaluation details?",
      confirmLabel: "Yes, Discard Draft",
      danger: true,
    });
    if (!ok) return;

    try {
      localStorage.removeItem(`candidate_feedback_draft_${interviewId}`);
      toast("Unsaved draft discarded. Reset to original record.", "info");
      setFormsData((prev) => {
        return prev.map((f) => {
          if (f.interview_id !== interviewId) return f;
          const orig = selectedInterviews.find((i) => i.id === interviewId);
          if (!orig) return f;
          return {
            ...f,
            rating: orig.rating ?? 0,
            feedback: orig.feedback || "",
            strengths: orig.strengths ? orig.strengths.join(", ") : "",
            weaknesses: orig.weaknesses ? orig.weaknesses.join(", ") : "",
            recommendation: orig.recommendation || "Pending",
            client_rating: orig.client_rating ?? 0,
            client_feedback: orig.client_feedback || "",
            client_recommendation: orig.client_recommendation || "Pending",
            skill_ratings: orig.skill_ratings || [],
            category_scores: orig.category_scores || [],
          };
        });
      });
      setRestoredDraftsCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitAll = async () => {
    // 1. Inspect for unbalanced weightages
    const unbalanced = getUnbalancedSkills(formsData);
    if (unbalanced.length > 0) {
      setWeightageWarningList(unbalanced);
      toast("Action Required: Skill category weightages must total 100% before saving.", "warning");
      return;
    }

    await executeSubmitAll(formsData);
  };

  const handleAutoBalanceAndSubmit = async () => {
    const updatedFormsData = formsData.map((f) => {
      let updatedCatScores = [...(f.category_scores || [])];
      let updatedSkillRatings = [...(f.skill_ratings || [])];

      (f.skill_ratings || []).forEach((skill) => {
        const sName = (skill.skill_name || "").trim();
        if (!sName) return;
        const sLower = sName.toLowerCase();

        const skillCats = updatedCatScores.filter((c) => {
          const cSkill = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
          if (cSkill) return cSkill === sLower;
          if (f.skill_ratings.length === 1 && f.skill_ratings[0].skill_name.trim().toLowerCase() === sLower) return true;
          return false;
        });

        if (skillCats.length > 0) {
          const currentTotal = skillCats.reduce((sum, item) => sum + (item.weightage || 0), 0);
          if (currentTotal > 0 && currentTotal !== 100) {
            let runningSum = 0;
            const newWeights = skillCats.map((cat, idx) => {
              if (idx === skillCats.length - 1) {
                return Math.max(1, 100 - runningSum);
              }
              const scaled = Math.round((cat.weightage / currentTotal) * 100);
              runningSum += scaled;
              return scaled;
            });

            updatedCatScores = updatedCatScores.map((c) => {
              const cSkill = (c as any).skill_name ? (c as any).skill_name.trim().toLowerCase() : "";
              const matches =
                cSkill === sLower ||
                (f.skill_ratings.length === 1 && f.skill_ratings[0].skill_name.trim().toLowerCase() === sLower);
              if (matches) {
                const catIdx = skillCats.findIndex(
                  (sc) => (sc.category || "").trim().toLowerCase() === (c.category || "").trim().toLowerCase()
                );
                if (catIdx !== -1) {
                  const newWeight = newWeights[catIdx];
                  const newScore = Math.round(((c.rating || 0) / 5) * newWeight * 10) / 10;
                  return {
                    ...c,
                    weightage: newWeight,
                    score: newScore,
                  };
                }
              }
              return c;
            });

            const weightedSum = skillCats.reduce(
              (sum, c, idx) => sum + ((c.rating || 0) * newWeights[idx]),
              0
            );
            const newSkillRating = Math.round((weightedSum / 100) * 10) / 10;
            updatedSkillRatings = updatedSkillRatings.map((s) => {
              if (s.skill_name.trim().toLowerCase() === sLower) {
                return { ...s, rating: newSkillRating };
              }
              return s;
            });
          }
        }
      });

      const totalPoints = updatedCatScores.reduce((sum, item) => sum + (item.score || 0), 0);
      const newAiScore = Math.min(100, Math.round(totalPoints));
      let newRec = "Hire";
      if (newAiScore >= 85) newRec = "Strong Hire";
      else if (newAiScore >= 70) newRec = "Hire";
      else if (newAiScore >= 55) newRec = "Hold";
      else newRec = "No Hire";

      return {
        ...f,
        skill_ratings: updatedSkillRatings,
        category_scores: updatedCatScores,
        ai_score: newAiScore,
        ai_recommendation: newRec,
      };
    });

    setFormsData(updatedFormsData);
    setWeightageWarningList(null);
    await executeSubmitAll(updatedFormsData);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-50 p-2 md:p-4 font-sans animate-in fade-in duration-300">
      <div className="bg-slate-50 border border-slate-200 rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden relative text-slate-900">
        
        {/* 1. SLIM HIGH-CONTEXT HEADER */}
        <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
          {/* Candidate identity & metadata */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs shrink-0">
              {currentForm ? (currentForm.candidate_name ? currentForm.candidate_name.charAt(0).toUpperCase() : "C") : "F"}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-extrabold text-slate-900 tracking-tight truncate">
                  {currentForm ? currentForm.candidate_name : "Candidate Feedback"}
                </h2>
                {currentForm?.job_title && (
                  <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                    <Briefcase size={11} className="text-indigo-600" />
                    <span className="truncate max-w-[200px]">{currentForm.job_title}</span>
                  </span>
                )}
                {currentForm?.interview_type && (
                  <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
                    {currentForm.interview_type} (R{currentForm.round_number})
                  </span>
                )}
                {currentForm && (
                  <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                    currentForm.ai_recommendation === "Pending" || (currentForm.ai_score === 0 && currentForm.skill_ratings.length === 0)
                      ? "bg-slate-100 border-slate-200 text-slate-600"
                      : currentForm.ai_recommendation === "Strong Hire" || currentForm.ai_recommendation === "Selected"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : currentForm.ai_recommendation === "Hire"
                      ? "bg-teal-50 border-teal-200 text-teal-700"
                      : currentForm.ai_recommendation === "Hold"
                      ? "bg-amber-50 border-amber-200 text-amber-700"
                      : "bg-rose-50 border-rose-200 text-rose-700"
                  }`}>
                    {currentForm.ai_recommendation === "Pending" || (currentForm.ai_score === 0 && currentForm.skill_ratings.length === 0)
                      ? "Pending Evaluation"
                      : `${currentForm.ai_recommendation} (${currentForm.ai_score}/100)`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                {currentForm?.scheduled_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={11} className="text-slate-400" />
                    <span>{currentForm.scheduled_date}</span>
                    {currentForm.scheduled_time && <span>at {currentForm.scheduled_time}</span>}
                  </span>
                )}
                {formsData.length > 1 && (
                  <span className="text-indigo-600 font-bold">
                    • Candidate {activeCandidateIndex + 1} of {formsData.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stepper (if multiple candidates) and Save actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Real-time Auto-save & draft restoration status */}
            <div className="flex items-center gap-2">
              {restoredDraftsCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-[11px] font-bold shadow-2xs">
                  <span>Restored unsaved draft</span>
                  <button
                    type="button"
                    onClick={() => currentForm?.interview_id && handleDiscardDraft(currentForm.interview_id)}
                    className="text-amber-700 underline hover:text-amber-950 font-extrabold ml-0.5 cursor-pointer"
                    title="Discard saved draft and reload original"
                  >
                    Discard
                  </button>
                </div>
              )}

              <div
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold shadow-2xs"
                title={`All ratings and feedback are auto-saved to local browser storage in real-time.${lastAutoSavedTime ? ` Last saved at ${lastAutoSavedTime}.` : ""}`}
              >
                <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                <span>Auto-saved {lastAutoSavedTime ? `(${lastAutoSavedTime})` : ""}</span>
              </div>
            </div>

            {formsData.length > 1 && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 mr-1">
                <button
                  type="button"
                  disabled={activeCandidateIndex === 0}
                  onClick={() => setActiveCandidateIndex((prev) => prev - 1)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                  title="Previous candidate"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-bold text-slate-700 px-1.5">
                  {activeCandidateIndex + 1} / {formsData.length}
                </span>
                <button
                  type="button"
                  disabled={activeCandidateIndex === formsData.length - 1}
                  onClick={() => setActiveCandidateIndex((prev) => prev + 1)}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-30 cursor-pointer"
                  title="Next candidate"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer shadow-2xs"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmitAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-extrabold shadow-xs text-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>{selectedInterviews.length === 1 ? "Save Feedback" : `Save All (${selectedInterviews.length})`}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer ml-1"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* 2. SEGMENTED WORKSPACE TABS STRIP (Clean pill style matching Image 2) */}
        <div className="bg-slate-50/70 px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 flex-wrap">
          <div className="inline-flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-full border border-slate-200/80 shadow-2xs">
            {/* 1st Tab: Panel Feedback */}
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab("panel")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs transition-all cursor-pointer ${
                activeWorkspaceTab === "panel"
                  ? "bg-white text-indigo-600 font-extrabold shadow-xs border border-slate-200/70"
                  : "text-slate-700 hover:text-slate-900 font-bold"
              }`}
            >
              <UserCheck size={14} className={activeWorkspaceTab === "panel" ? "text-indigo-600" : "text-slate-500"} />
              <span>Panel Feedback</span>
            </button>

            {/* 2nd Tab: Skill Assessment */}
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab("skills")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs transition-all cursor-pointer ${
                activeWorkspaceTab === "skills"
                  ? "bg-white text-indigo-600 font-extrabold shadow-xs border border-slate-200/70"
                  : "text-slate-700 hover:text-slate-900 font-bold"
              }`}
            >
              <Sparkles size={14} className={activeWorkspaceTab === "skills" ? "text-indigo-600" : "text-slate-500"} />
              <span>Skill Assessment</span>
            </button>

            {/* 3rd Tab: Document & Notes */}
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab("offer_docs")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs transition-all cursor-pointer ${
                activeWorkspaceTab === "offer_docs"
                  ? "bg-white text-indigo-600 font-extrabold shadow-xs border border-slate-200/70"
                  : "text-slate-700 hover:text-slate-900 font-bold"
              }`}
            >
              <FileText size={14} className={activeWorkspaceTab === "offer_docs" ? "text-indigo-600" : "text-slate-500"} />
              <span>Document & Notes</span>
            </button>
          </div>

          <div className="text-xs font-semibold text-slate-500 hidden sm:flex items-center gap-2">
            <span>Interview:</span>
            <span className="font-extrabold text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-xl shadow-2xs">
              {currentForm?.interview_type || selectedInterviews[activeCandidateIndex]?.interview_type || "Technical Interview"} (Round {currentForm?.round_number || selectedInterviews[activeCandidateIndex]?.round_number || 1})
            </span>
          </div>
        </div>

        {/* 3. MAIN WORKSPACE CONTENT AREA FOR CURRENT CANDIDATE */}
        {currentForm && (
          <div className="flex-1 overflow-y-auto p-6 md:p-7">
            {error && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl font-bold flex items-center gap-2.5 shadow-2xs">
                <span>⚠️ {error}</span>
              </div>
            )}

            {/* 2-COLUMN SPLIT WORKSPACE GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7 items-start">

              {/* LEFT COLUMN: PRIMARY WORKSPACE (8 of 12 cols, ~67%) */}
              <div className="lg:col-span-8 space-y-6">

                {/* TAB 1: PANEL INTERVIEWER / CLIENT CARDS SECTION */}
                {activeWorkspaceTab === "panel" && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Prominent Section Heading for Tab 1 */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                            01
                          </div>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                              <span>Panel Feedback & Observations</span>
                              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Part 1: Qualitative Review
                              </span>
                            </h4>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                              Record individual ratings, key strengths, development areas, and interviewer notes
                            </p>
                          </div>
                        </div>

                        {/* Role View Sub-Switcher */}
                        {!isClientUser && !isInterviewerUser && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-full border border-slate-200/80 shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleCurrentFormChange("feedbackTab", "INTERVIEWER")}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                                  currentForm.feedbackTab === "INTERVIEWER"
                                    ? "bg-white text-indigo-600 shadow-xs border border-slate-200/70"
                                    : "text-slate-700 hover:text-slate-900 font-bold"
                                }`}
                              >
                                <UserCheck size={14} className={currentForm.feedbackTab === "INTERVIEWER" ? "text-indigo-600" : "text-slate-500"} />
                                <span>Panel Interviewers</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCurrentFormChange("feedbackTab", "CLIENT")}
                                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                                  currentForm.feedbackTab === "CLIENT"
                                    ? "bg-white text-teal-700 shadow-xs border border-slate-200/70"
                                    : "text-slate-700 hover:text-slate-900 font-bold"
                                }`}
                              >
                                <Building2 size={14} className={currentForm.feedbackTab === "CLIENT" ? "text-teal-600" : "text-slate-500"} />
                                <span>Client Evaluators</span>
                              </button>
                            </div>

                            {currentForm.feedbackTab === "INTERVIEWER" && !isInterviewerUser && (
                              <button
                                type="button"
                                onClick={handleAddInterviewer}
                                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 h-8.5"
                              >
                                <Plus size={13} /> Add Evaluator
                              </button>
                            )}

                            {currentForm.feedbackTab === "CLIENT" && !isClientUser && (
                              <button
                                type="button"
                                onClick={handleAddClient}
                                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 h-8.5"
                              >
                                <Plus size={13} /> Add Evaluator
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div id="sec-interviewer" className="space-y-6">
                      {currentForm.feedbackTab === "INTERVIEWER" && (
                        <div className="space-y-6">
                          {currentForm.interviewersList.map((interviewer, intIdx) => (
                            <div key={intIdx} className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-5 shadow-xs relative hover:border-indigo-300 transition-all">
                              {/* Evaluator Card Header */}
                              <div className="flex justify-between items-center border-b border-slate-100 pb-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-extrabold text-xs flex items-center justify-center">
                                    {interviewer.interviewer_name ? interviewer.interviewer_name.charAt(0).toUpperCase() : "I"}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-slate-900 text-sm">Interviewer #{intIdx + 1}</span>
                                    {interviewer.interviewer_name && (
                                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/80">
                                        {interviewer.interviewer_name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {!isInterviewerUser && currentForm.interviewersList.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveInterviewer(intIdx)}
                                    className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Trash2 size={13} /> Remove
                                  </button>
                                )}
                              </div>

                              {/* 1. Evaluator Selection Row: Full-width User Selector */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-bold text-slate-700">Select Registered User</label>
                                  <span className="text-[11px] text-slate-400 font-medium">Auto-populates name & email</span>
                                </div>
                                <select
                                  value={interviewer.interviewer_id || (interviewer.interviewer_name ? "custom" : "")}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "custom" || !val) {
                                      handleInterviewerItemChange(intIdx, "interviewer_id", undefined);
                                      handleInterviewerItemChange(intIdx, "interviewer_email", undefined);
                                    } else {
                                      const u = systemUsers.find((user) => user.id === val);
                                      if (u) {
                                        handleInterviewerItemChange(intIdx, "interviewer_id", u.id);
                                        handleInterviewerItemChange(intIdx, "interviewer_name", u.full_name);
                                        handleInterviewerItemChange(intIdx, "interviewer_email", u.email);
                                      }
                                    }
                                  }}
                                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
                                >
                                  <option value="">-- Choose Interviewer User --</option>
                                  {systemUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name} ({u.role ? u.role.replace(/_/g, " ") : u.email})
                                    </option>
                                  ))}
                                  <option value="custom">+ External / Custom</option>
                                </select>
                              </div>

                              {/* 2. Evaluator Name & Email Row (Balanced 2-Column Split) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Interviewer Name *</label>
                                  <input
                                    type="text"
                                    value={interviewer.interviewer_name}
                                    onChange={(e) => handleInterviewerItemChange(intIdx, "interviewer_name", e.target.value)}
                                    placeholder="Interviewer Name"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Interviewer Email</label>
                                  <input
                                    type="email"
                                    value={interviewer.interviewer_email || ""}
                                    onChange={(e) => handleInterviewerItemChange(intIdx, "interviewer_email", e.target.value)}
                                    placeholder="interviewer@company.com"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                                  />
                                </div>
                              </div>

                              {/* 3. Rating & Recommendation Controls (Exact Same Balanced 2-Column Split) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                {/* Left: Rating Control */}
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-700">
                                      Interviewer Rating (0.0 - 5.0)
                                    </label>
                                    {interviewer.rating !== undefined && (
                                      <button
                                        type="button"
                                        onClick={() => handleInterviewerItemChange(intIdx, "rating", undefined)}
                                        className="text-[10px] text-slate-400 hover:text-rose-600 font-bold transition-colors cursor-pointer bg-slate-100 px-1.5 py-0.5 rounded-md hover:bg-rose-50"
                                        title="Clear rating"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                  <div className="relative flex items-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={5}
                                      step={0.1}
                                      value={interviewer.rating !== undefined ? interviewer.rating : ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "" || val === null) {
                                          handleInterviewerItemChange(intIdx, "rating", undefined);
                                        } else {
                                          const parsed = parseFloat(val);
                                          if (!isNaN(parsed)) {
                                            handleInterviewerItemChange(intIdx, "rating", Math.min(5, Math.max(0, parsed)));
                                          }
                                        }
                                      }}
                                      placeholder="e.g. 4.5"
                                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 pr-28 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                      {interviewer.rating !== undefined && interviewer.rating > 0 ? (
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shadow-2xs whitespace-nowrap ${
                                          interviewer.rating >= 4.5
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : interviewer.rating >= 3.5
                                            ? "bg-teal-50 text-teal-700 border-teal-200"
                                            : interviewer.rating >= 2.5
                                            ? "bg-blue-50 text-blue-700 border-blue-200"
                                            : interviewer.rating >= 1.5
                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                            : "bg-rose-50 text-rose-700 border-rose-200"
                                        }`}>
                                          {interviewer.rating >= 4.5
                                            ? "Exceeds"
                                            : interviewer.rating >= 3.5
                                            ? "Strong Fit"
                                            : interviewer.rating >= 2.5
                                            ? "Meets"
                                            : interviewer.rating >= 1.5
                                            ? "Needs Dev"
                                            : "Below"}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-slate-400">Scale: 0 - 5.0</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Right: Outcome Recommendation */}
                                <div>
                                  <div className="mb-1.5">
                                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                      <CheckCircle2 size={13} className="text-indigo-600" />
                                      <span>Outcome Recommendation</span>
                                    </label>
                                  </div>
                                  <select
                                    value={interviewer.recommendation || "Pending"}
                                    onChange={(e) => {
                                      handleInterviewerItemChange(intIdx, "recommendation", e.target.value);
                                      if (intIdx === 0) {
                                        handleCurrentFormChange("recommendation", e.target.value);
                                      }
                                    }}
                                    className={`w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-extrabold focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs ${
                                      interviewer.recommendation === "Strong Hire" || interviewer.recommendation === "Selected"
                                        ? "text-emerald-700"
                                        : interviewer.recommendation === "Hire"
                                        ? "text-teal-700"
                                        : interviewer.recommendation === "Hold"
                                        ? "text-amber-700"
                                        : interviewer.recommendation === "No Hire" || interviewer.recommendation === "Rejected"
                                        ? "text-rose-700"
                                        : "text-slate-700"
                                    }`}
                                  >
                                    {RECOMMENDATION_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Conditional Multiple-Selection Observation Reasons Dropdown ONLY if rating was actually given and < 5 */}
                              {typeof interviewer.rating === "number" && interviewer.rating > 0 && interviewer.rating < 5 && (
                                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fadeIn">
                                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                    <HelpCircle size={14} className="text-amber-600" />
                                    Select Observations for Rating below 5/5 (Interview Type: {currentForm.interview_type})
                                  </label>
                                  <div className="max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                    {questionOptions
                                      .filter(opt => opt && !opt.startsWith("--"))
                                      .map((opt, optIdx) => {
                                        const isChecked = interviewer.feedback?.includes(opt);
                                        return (
                                          <label key={optIdx} className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 hover:text-slate-900">
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={(e) => {
                                                let currentFeedback = interviewer.feedback || "";
                                                if (e.target.checked) {
                                                  if (!currentFeedback.includes(opt)) {
                                                    currentFeedback = currentFeedback ? `${currentFeedback}\n- ${opt}` : `- ${opt}`;
                                                  }
                                                } else {
                                                  currentFeedback = currentFeedback
                                                    .replace(new RegExp(`\\n?- ${opt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g'), "")
                                                    .replace(new RegExp(`- ${opt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\n?`, 'g'), "")
                                                    .trim();
                                                }
                                                handleInterviewerItemChange(intIdx, "feedback", currentFeedback);
                                              }}
                                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <span>{opt}</span>
                                          </label>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}

                              {/* 3. SELECTABLE OBSERVATION CHIPS (Clean Card Strip) */}
                              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-indigo-600" />
                                    <span>Quick Observation Tags</span>
                                  </label>
                                  <span className="text-[10px] text-slate-400 font-medium">Click tag to append to comments</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {["Technical Skills", "Communication", "System Design", "Problem Solving", "Architecture", "Culture Fit", "Behavior"].map((chip, cIdx) => {
                                    const isIncluded = interviewer.feedback?.includes(chip);
                                    return (
                                      <button
                                        key={cIdx}
                                        type="button"
                                        onClick={() => {
                                          let current = interviewer.feedback || "";
                                          if (isIncluded) {
                                            current = current
                                              .replace(new RegExp(`\\n?Observation: ${chip}`, "g"), "")
                                              .replace(new RegExp(`\\n?- ${chip}`, "g"), "")
                                              .trim();
                                          } else {
                                            current = current ? `${current}\nObservation: ${chip}` : `Observation: ${chip}`;
                                          }
                                          handleInterviewerItemChange(intIdx, "feedback", current);
                                        }}
                                        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer select-none ${
                                          isIncluded
                                            ? "bg-indigo-600 text-white border-indigo-600 font-bold shadow-xs scale-[1.02]"
                                            : "bg-white hover:bg-indigo-50/70 hover:border-indigo-200 border-slate-200 text-slate-700 font-semibold shadow-2xs"
                                        }`}
                                      >
                                        {isIncluded ? (
                                          <CheckCircle2 size={12} className="text-white" />
                                        ) : (
                                          <Plus size={12} className="text-slate-400" />
                                        )}
                                        <span>{chip}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* 4. Strengths & Weaknesses Row */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    <span>Key Strengths (Comma-separated)</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={interviewer.strengths ? (Array.isArray(interviewer.strengths) ? interviewer.strengths.join(", ") : interviewer.strengths) : ""}
                                    onChange={(e) => {
                                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                      handleInterviewerItemChange(intIdx, "strengths", list);
                                    }}
                                    placeholder="e.g. Problem Solving, React, System Design"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    <span>Areas for Improvement / Weaknesses</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={interviewer.weaknesses ? (Array.isArray(interviewer.weaknesses) ? interviewer.weaknesses.join(", ") : interviewer.weaknesses) : ""}
                                    onChange={(e) => {
                                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                      handleInterviewerItemChange(intIdx, "weaknesses", list);
                                    }}
                                    placeholder="e.g. System Design edge cases, Scalability"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-2xs"
                                  />
                                </div>
                              </div>

                              {/* 5. Detailed Comments Textarea */}
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                  <FileText size={13} className="text-slate-500" />
                                  <span>Interviewer Round Feedback Comments</span>
                                </label>
                                <textarea
                                  rows={3}
                                  value={interviewer.feedback || ""}
                                  onChange={(e) => handleInterviewerItemChange(intIdx, "feedback", e.target.value)}
                                  placeholder="Provide technical evaluation feedback, observations, and key takeaways..."
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none leading-relaxed shadow-2xs min-h-[96px]"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {currentForm.feedbackTab === "CLIENT" && (
                        <div className="space-y-6">
                          {currentForm.clientsList.map((client, clientIdx) => (
                            <div key={clientIdx} className="bg-white border border-slate-200/90 rounded-2xl p-6 space-y-5 shadow-xs relative hover:border-teal-300 transition-all">
                              <div className="flex justify-between items-center border-b border-slate-100 pb-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 font-extrabold text-xs flex items-center justify-center">
                                    {client.client_name ? client.client_name.charAt(0).toUpperCase() : "C"}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-slate-900 text-sm">Client Evaluator #{clientIdx + 1}</span>
                                    {client.client_name && (
                                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/80">
                                        {client.client_name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {!isClientUser && currentForm.clientsList.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveClient(clientIdx)}
                                    className="text-rose-500 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Trash2 size={13} /> Remove
                                  </button>
                                )}
                              </div>

                              {/* 1. Evaluator Selection Row: Full-width User Selector */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-xs font-bold text-slate-700">Select Registered User</label>
                                  <span className="text-[11px] text-slate-400 font-medium">Auto-populates name & email</span>
                                </div>
                                <select
                                  value={client.client_id || (client.client_name ? "custom" : "")}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "custom" || !val) {
                                      handleClientItemChange(clientIdx, "client_id", undefined);
                                      handleClientItemChange(clientIdx, "client_email", undefined);
                                    } else {
                                      const u = systemUsers.find((user) => user.id === val);
                                      if (u) {
                                        handleClientItemChange(clientIdx, "client_id", u.id);
                                        handleClientItemChange(clientIdx, "client_name", u.full_name);
                                        handleClientItemChange(clientIdx, "client_email", u.email);
                                      }
                                    }
                                  }}
                                  className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs text-slate-800 font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer shadow-2xs"
                                >
                                  <option value="">-- Choose Client User --</option>
                                  {systemUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.full_name} ({u.role ? u.role.replace(/_/g, " ") : u.email})
                                    </option>
                                  ))}
                                  <option value="custom">+ External / Custom</option>
                                </select>
                              </div>

                              {/* 2. Evaluator Name & Email Row (Balanced 2-Column Split) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Client Name / Company</label>
                                  <input
                                    type="text"
                                    value={client.client_name}
                                    onChange={(e) => handleClientItemChange(clientIdx, "client_name", e.target.value)}
                                    placeholder="Client Evaluator Name"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-2xs"
                                  />
                                </div>

                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Client Email</label>
                                  <input
                                    type="email"
                                    value={client.client_email || ""}
                                    onChange={(e) => handleClientItemChange(clientIdx, "client_email", e.target.value)}
                                    placeholder="client@company.com"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-2xs"
                                  />
                                </div>
                              </div>

                              {/* 3. Rating & Recommendation Controls (Exact Same Balanced 2-Column Split) */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                                {/* Left: Rating Control */}
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-700">
                                      Client Rating (0.0 - 5.0)
                                    </label>
                                    {client.client_rating !== undefined && (
                                      <button
                                        type="button"
                                        onClick={() => handleClientItemChange(clientIdx, "client_rating", undefined)}
                                        className="text-[10px] text-slate-400 hover:text-rose-600 font-bold transition-colors cursor-pointer bg-slate-100 px-1.5 py-0.5 rounded-md hover:bg-rose-50"
                                        title="Clear rating"
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                  <div className="relative flex items-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={5}
                                      step={0.1}
                                      value={client.client_rating !== undefined ? client.client_rating : ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === "" || val === null) {
                                          handleClientItemChange(clientIdx, "client_rating", undefined);
                                        } else {
                                          const parsed = parseFloat(val);
                                          if (!isNaN(parsed)) {
                                            handleClientItemChange(clientIdx, "client_rating", Math.min(5, Math.max(0, parsed)));
                                          }
                                        }
                                      }}
                                      placeholder="e.g. 4.5"
                                      className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 pr-28 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-2xs"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                                      {client.client_rating !== undefined && client.client_rating > 0 ? (
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shadow-2xs whitespace-nowrap ${
                                          client.client_rating >= 4.5
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : client.client_rating >= 3.5
                                            ? "bg-teal-50 text-teal-700 border-teal-200"
                                            : client.client_rating >= 2.5
                                            ? "bg-blue-50 text-blue-700 border-blue-200"
                                            : client.client_rating >= 1.5
                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                            : "bg-rose-50 text-rose-700 border-rose-200"
                                        }`}>
                                          {client.client_rating >= 4.5
                                            ? "Exceeds"
                                            : client.client_rating >= 3.5
                                            ? "Strong Fit"
                                            : client.client_rating >= 2.5
                                            ? "Meets"
                                            : client.client_rating >= 1.5
                                            ? "Needs Dev"
                                            : "Below"}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-bold text-slate-400">Scale: 0 - 5.0</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Right: Client Recommendation */}
                                <div>
                                  <div className="mb-1.5">
                                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                      <CheckCircle2 size={13} className="text-teal-600" />
                                      <span>Client Recommendation</span>
                                    </label>
                                  </div>
                                  <select
                                    value={client.client_recommendation || "Pending"}
                                    onChange={(e) => handleClientItemChange(clientIdx, "client_recommendation", e.target.value)}
                                    className={`w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-extrabold focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer shadow-2xs ${
                                      client.client_recommendation === "Strong Hire" || client.client_recommendation === "Selected"
                                        ? "text-teal-700"
                                        : client.client_recommendation === "Hire"
                                        ? "text-teal-700"
                                        : client.client_recommendation === "Hold"
                                        ? "text-amber-700"
                                        : client.client_recommendation === "No Hire" || client.client_recommendation === "Rejected"
                                        ? "text-rose-700"
                                        : "text-slate-700"
                                    }`}
                                  >
                                    {RECOMMENDATION_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Conditional Multiple-Selection Observation Reasons Dropdown ONLY if rating was given and < 5 */}
                              {typeof client.client_rating === "number" && client.client_rating > 0 && client.client_rating < 5 && (
                                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fadeIn">
                                  <label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                    <HelpCircle size={14} className="text-amber-600" />
                                    Select Observations for Client Rating below 5/5 (Interview Type: {currentForm.interview_type})
                                  </label>
                                  <div className="max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                                    {questionOptions
                                      .filter(opt => opt && !opt.startsWith("--"))
                                      .map((opt, optIdx) => {
                                        const isChecked = client.client_feedback?.includes(opt);
                                        return (
                                          <label key={optIdx} className="flex items-start gap-2.5 cursor-pointer text-xs font-medium text-slate-700 hover:text-slate-900">
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={(e) => {
                                                let currentFeedback = client.client_feedback || "";
                                                if (e.target.checked) {
                                                  if (!currentFeedback.includes(opt)) {
                                                    currentFeedback = currentFeedback ? `${currentFeedback}\n- ${opt}` : `- ${opt}`;
                                                  }
                                                } else {
                                                  currentFeedback = currentFeedback
                                                    .replace(new RegExp(`\\n?- ${opt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'g'), "")
                                                    .replace(new RegExp(`- ${opt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\n?`, 'g'), "")
                                                    .trim();
                                                }
                                                handleClientItemChange(clientIdx, "client_feedback", currentFeedback);
                                              }}
                                              className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                            />
                                            <span>{opt}</span>
                                          </label>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}

                              {/* 3. Strengths & Weaknesses Row */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                                    <span>Key Strengths (Comma-separated)</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={client.client_strengths ? (Array.isArray(client.client_strengths) ? client.client_strengths.join(", ") : client.client_strengths) : ""}
                                    onChange={(e) => {
                                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                      handleClientItemChange(clientIdx, "client_strengths", list);
                                    }}
                                    placeholder="e.g. Domain knowledge, Communication"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-2xs"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    <span>Areas for Improvement / Weaknesses</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={client.client_weaknesses ? (Array.isArray(client.client_weaknesses) ? client.client_weaknesses.join(", ") : client.client_weaknesses) : ""}
                                    onChange={(e) => {
                                      const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                                      handleClientItemChange(clientIdx, "client_weaknesses", list);
                                    }}
                                    placeholder="e.g. English fluency, Industry tooling"
                                    className="w-full h-10 bg-slate-50 border border-slate-200 rounded-xl px-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-2xs"
                                  />
                                </div>
                              </div>

                              {/* 4. Detailed Comments Textarea */}
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                                  <FileText size={13} className="text-slate-500" />
                                  <span>Client Detailed Feedback Comments</span>
                                </label>
                                <textarea
                                  rows={3}
                                  value={client.client_feedback || ""}
                                  onChange={(e) => handleClientItemChange(clientIdx, "client_feedback", e.target.value)}
                                  placeholder="Provide client detailed feedback notes, candidate fit, and observations..."
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none leading-relaxed shadow-2xs min-h-[96px]"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Panel Tab Footer */}
                    <div className="flex items-center justify-between p-4 sm:p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
                      <span className="text-xs text-slate-500 font-medium">
                        Record evaluator notes & ratings before continuing to skill assessment.
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceTab("skills")}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <span>Continue to Skill Assessment</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: SKILL ASSESSMENT & COMPETENCIES */}
                {activeWorkspaceTab === "skills" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div id="sec-skills">
                      <SkillRatingsEvaluation
                        skillRatings={currentForm.skill_ratings}
                        onChangeSkills={(newSkills) => handleCurrentFormChange("skill_ratings", newSkills)}
                        categoryScores={currentForm.category_scores}
                        onChangeCategoryScores={(newCatScores) => handleCurrentFormChange("category_scores", newCatScores)}
                        currentRoundNumber={currentForm.round_number}
                        currentInterviewType={currentForm.interview_type}
                        hrCallVerification={selectedInterviews[activeCandidateIndex]?.hr_call_verification}
                        onAiScoreCalculated={(score, rec) => {
                          setFormsData((prev) =>
                            prev.map((form, idx) =>
                              idx === activeCandidateIndex
                                ? { ...form, ai_score: score, ai_recommendation: rec }
                                : form
                            )
                          );
                        }}
                      />
                    </div>

                    {/* Skills Tab Footer */}
                    <div className="flex items-center justify-between p-4 sm:p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceTab("panel")}
                        className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
                      >
                        <ChevronLeft size={14} />
                        <span>Back to Panel Feedback</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceTab("offer_docs")}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-4.5 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <span>Continue to Document & Notes</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 3: OFFER DETAILS, DOCUMENTS & NOTES */}
                {activeWorkspaceTab === "offer_docs" && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Prominent Section Heading for Tab 3 */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-sm flex items-center justify-center shrink-0 shadow-2xs">
                          03
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                            <span>Document & Notes</span>
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Part 3: Stage Logistics & Files
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                            Record requested compensation, agreed salary fit, expected joining date, and candidate slot preferences
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Box 1: Compensation Comparison */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                            <DollarSign size={15} className="text-emerald-600" />
                            Compensation Fit
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Annual / CTC</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-amber-800">Requested Salary</label>
                            <input
                              type="text"
                              value={currentForm.salary_requested}
                              onChange={(e) => handleCurrentFormChange("salary_requested", e.target.value)}
                              placeholder="e.g. 50,000"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-extrabold text-amber-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-emerald-800">Offered / Fit Salary</label>
                            <input
                              type="text"
                              value={currentForm.final_fit_salary}
                              onChange={(e) => handleCurrentFormChange("final_fit_salary", e.target.value)}
                              placeholder="e.g. 45,000"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-extrabold text-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Box 2: Role & Timeline */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                            <Briefcase size={15} className="text-indigo-600" />
                            Role & Onboarding
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Timeline</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-700">Requested Role</label>
                            <input
                              type="text"
                              value={currentForm.candidate_requested_role}
                              onChange={(e) => handleCurrentFormChange("candidate_requested_role", e.target.value)}
                              placeholder="e.g. Senior Tech Lead"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-700">Expected Joining</label>
                            <input
                              type="date"
                              value={currentForm.joining_date}
                              onChange={(e) => handleCurrentFormChange("joining_date", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Box 3: Candidate Slot Availability */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3 md:col-span-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <span className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                            <Calendar size={15} className="text-indigo-600" />
                            Candidate Interview Slot Preferences
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">Availability requested by candidate</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-700">Requested Date</label>
                            <input
                              type="date"
                              value={currentForm.candidate_requested_date}
                              onChange={(e) => handleCurrentFormChange("candidate_requested_date", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-700">Requested Time</label>
                            <input
                              type="time"
                              value={currentForm.candidate_requested_time}
                              onChange={(e) => handleCurrentFormChange("candidate_requested_time", e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* DOCUMENTS & NOTES SECTION */}
                    <div id="sec-documents" className="space-y-5">
                      {/* CARD 1: SESSION & CANDIDATE ATTACHED DOCUMENTS */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
                          <div className="flex items-center gap-2.5">
                            <FileText size={18} className="text-rose-600" />
                            <h3 className="text-sm font-extrabold text-slate-900">Session & Candidate Attached Documents</h3>
                          </div>
                          <label className={`inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs px-3.5 py-1.5 rounded-xl cursor-pointer font-bold transition-all shadow-xs ${isUploadingDocFile ? "opacity-60 pointer-events-none" : ""}`}>
                            {isUploadingDocFile ? (
                              <>
                                <Loader2 size={13} className="animate-spin text-indigo-600" />
                                <span>Uploading to S3...</span>
                              </>
                            ) : (
                              <>
                                <Upload size={13} />
                                <span>Browse / Attach File</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              onChange={handleDocFileUpload}
                              disabled={isUploadingDocFile}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* ATTACHED FILES LIST CARDS WITH VIEW BUTTON */}
                        {(() => {
                          const attachedList = currentForm.interview_document_files
                            ? Array.from(new Set(currentForm.interview_document_files.split("\n").map((s) => s.trim()).filter(Boolean)))
                            : [];
                          if (attachedList.length === 0) return null;
                          return (
                            <div className="space-y-2 mb-2 mt-1">
                              {attachedList.map((fileStr, idx) => {
                                const isUrl = fileStr.startsWith("http://") || fileStr.startsWith("https://");
                                const rawName = fileStr.split("/").pop() || fileStr;
                                const displayName = decodeURIComponent(rawName).replace(/^[a-f0-9]{8,32}_/, "");
                                return (
                                  <div key={idx} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 shadow-2xs">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <FileText size={16} className="text-rose-600 shrink-0" />
                                      <span className="text-xs font-semibold text-slate-800 truncate" title={fileStr}>
                                        {displayName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {isUrl && (
                                        <a
                                          href={fileStr}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs px-3 py-1 rounded-lg font-bold transition-all shadow-2xs"
                                        >
                                          <Eye size={13} />
                                          <span>View</span>
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = attachedList.filter((_, i) => i !== idx).join("\n");
                                          handleCurrentFormChange("interview_document_files", updated);
                                        }}
                                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                                        title="Remove attachment"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      {/* CARD 2: INTERVIEW FEEDBACK & ROUND ASSESSMENT REPORTS */}
                      <div className="bg-amber-50/40 border border-amber-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b border-amber-200 pb-3.5">
                          <div className="flex items-center gap-2.5 text-amber-900">
                            <ShieldCheck size={18} className="text-amber-600" />
                            <h3 className="text-sm font-extrabold">Interview Feedback & Round Assessment Reports</h3>
                          </div>
                          <label className={`inline-flex items-center gap-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-xs px-3.5 py-1.5 rounded-xl cursor-pointer font-bold transition-all shadow-xs ${isUploadingFeedbackReportFile ? "opacity-60 pointer-events-none" : ""}`}>
                            {isUploadingFeedbackReportFile ? (
                              <>
                                <Loader2 size={13} className="animate-spin text-amber-700" />
                                <span>Uploading to S3...</span>
                              </>
                            ) : (
                              <>
                                <Upload size={13} />
                                <span>Browse / Attach Feedback File</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              onChange={handleFeedbackReportFileUpload}
                              disabled={isUploadingFeedbackReportFile}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {/* FEEDBACK REPORT FILES CARDS WITH VIEW BUTTON */}
                        {(() => {
                          const feedbackReportList = currentForm.interview_feedback_files
                            ? Array.from(new Set(currentForm.interview_feedback_files.split("\n").map((s) => s.trim()).filter(Boolean)))
                            : [];
                          if (feedbackReportList.length === 0) return null;
                          return (
                            <div className="space-y-2 mb-2 mt-1">
                              {feedbackReportList.map((fileStr, idx) => {
                                const isUrl = fileStr.startsWith("http://") || fileStr.startsWith("https://");
                                const rawName = fileStr.split("/").pop() || fileStr;
                                const displayName = decodeURIComponent(rawName).replace(/^[a-f0-9]{8,32}_/, "");
                                return (
                                  <div key={idx} className="flex items-center justify-between gap-3 bg-white border border-amber-200/90 rounded-xl px-4 py-2.5 shadow-2xs">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <FileText size={16} className="text-amber-600 shrink-0" />
                                      <span className="text-xs font-semibold text-slate-800 truncate" title={fileStr}>
                                        {displayName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {isUrl && (
                                        <a
                                          href={fileStr}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs px-3 py-1 rounded-lg font-bold transition-all shadow-2xs"
                                        >
                                          <Eye size={13} />
                                          <span>View</span>
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = feedbackReportList.filter((_, i) => i !== idx).join("\n");
                                          handleCurrentFormChange("interview_feedback_files", updated);
                                        }}
                                        className="text-slate-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                                        title="Remove attachment"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                          <AlignLeft size={16} className="text-indigo-600" /> Special Prep Notes & Instructions
                        </span>
                        <textarea
                          rows={3}
                          value={currentForm.notes}
                          onChange={(e) => handleCurrentFormChange("notes", e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none min-h-[96px] resize-none"
                          placeholder="Enter candidate prep notes or internal evaluator instructions..."
                        />
                      </div>
                    </div>

                    {/* Offer & Docs Footer */}
                    <div className="flex items-center justify-between p-4 sm:p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceTab("skills")}
                        className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
                      >
                        <ChevronLeft size={14} />
                        <span>Back to Skill Assessment</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitAll}
                        disabled={loading}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Saving Feedback...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={14} />
                            <span>Save Feedback</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* RIGHT STICKY SIDEBAR (4 of 12 cols, ~33%) */}
              <div className="lg:col-span-4 space-y-5 sticky top-0 self-start">
                
                {/* 1. CLEAN EXECUTIVE AI SCORE CARD */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                        <Sparkles size={13} />
                      </div>
                      <span className="text-xs font-extrabold text-slate-900 tracking-tight">AI Evaluation Index</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      currentForm.ai_score === 0 && currentForm.skill_ratings.length === 0
                        ? "bg-slate-100 border-slate-200 text-slate-600"
                        : currentForm.ai_recommendation === "Strong Hire" || currentForm.ai_recommendation === "Selected"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : currentForm.ai_recommendation === "Hire"
                        ? "bg-teal-50 border-teal-200 text-teal-700"
                        : currentForm.ai_recommendation === "Hold"
                        ? "bg-amber-50 border-amber-200 text-amber-700"
                        : "bg-rose-50 border-rose-200 text-rose-700"
                    }`}>
                      {currentForm.ai_score === 0 && currentForm.skill_ratings.length === 0
                        ? "Pending"
                        : currentForm.ai_recommendation}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-900 tracking-tight">
                          {currentForm.ai_score === 0 && currentForm.skill_ratings.length === 0 ? "--" : currentForm.ai_score}
                        </span>
                        <span className="text-xs font-bold text-slate-400">/ 100</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                        Live Weighted Score
                      </span>
                    </div>

                    <div className="w-28 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          currentForm.ai_score >= 80
                            ? "bg-emerald-600"
                            : currentForm.ai_score >= 60
                            ? "bg-indigo-600"
                            : currentForm.ai_score >= 40
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, currentForm.ai_score))}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
                    <div className="flex justify-between items-center text-slate-600 text-xs">
                      <span className="font-medium">Skills Evaluated</span>
                      <span className="font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/60">
                        {currentForm.skill_ratings.length} Configured
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 text-xs">
                      <span className="font-medium">Panel Evaluators</span>
                      <span className="font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/60">
                        {currentForm.interviewersList.length} Member(s)
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 text-xs">
                      <span className="font-medium">Client Evaluators</span>
                      <span className="font-extrabold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200/60">
                        {currentForm.clientsList.length} Member(s)
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. REAL ROUNDS TRACKER */}
                <RoundsTracker
                  candidateId={selectedInterviews[activeCandidateIndex]?.candidate_id}
                  currentInterviewId={currentForm.interview_id}
                />

              </div>

            </div>

          </div>
        )}
        {/* WEIGHTAGE VALIDATION WARNING MODAL */}
        {weightageWarningList && weightageWarningList.length > 0 && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 text-slate-900">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                    Weightage Not 100% Balanced
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">
                    Evaluation categories must total 100% weightage for accurate score calculation. The following evaluated skill(s) are incomplete:
                  </p>
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {weightageWarningList.map((w, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div>
                      <span className="font-extrabold text-slate-900">{w.skillName}</span>
                      {formsData.length > 1 && (
                        <span className="text-[11px] text-slate-500 block">Candidate: {w.candidateName}</span>
                      )}
                    </div>
                    <span
                      className={`font-black text-xs px-2.5 py-0.5 rounded-full border ${
                        w.totalWeightage < 100
                          ? "bg-amber-50 border-amber-200 text-amber-700"
                          : "bg-rose-50 border-rose-200 text-rose-700"
                      }`}
                    >
                      {w.totalWeightage}% ({w.unassigned > 0 ? `${w.unassigned}% unassigned` : `+${Math.abs(w.unassigned)}% excess`})
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 font-medium">
                You can auto-balance weights to 100% now, go back to edit them manually, or choose to save anyway.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const firstWarning = weightageWarningList[0];
                    if (firstWarning) {
                      setActiveCandidateIndex(firstWarning.formIndex);
                      setActiveWorkspaceTab("skills");
                    }
                    setWeightageWarningList(null);
                  }}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Go Back to Edit
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWeightageWarningList(null);
                    executeSubmitAll();
                  }}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Save Anyway
                </button>

                <button
                  type="button"
                  onClick={handleAutoBalanceAndSubmit}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4.5 py-2 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Sparkles size={13} />
                  <span>Auto-Balance & Save</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
