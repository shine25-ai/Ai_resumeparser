import { getFeedbackQuestionsFromBackend } from "./Api";

/**
 * Feedback Helpers for Interview & Client Ratings, Question Selections, and Auto Status / Recommendation.
 */

export interface AutoRatingOutcome {
  recommendation: "Selected" | "Hold" | "Rejected";
  clientRecommendation: "Selected" | "Hold" | "Rejected";
  status: "COMPLETED" | "SCHEDULED" | "RESCHEDULED" | "CANCELLED" | "PENDING";
  clientDecision: "Selected" | "On Hold" | "Rejected";
}

/**
 * Async function to GET feedback questions from backend JSON endpoint based on interviewType.
 * Falls back to static defaults if network/API fails.
 */
export async function getFeedbackQuestionsAsync(interviewType?: string): Promise<string[]> {
  try {
    const data = await getFeedbackQuestionsFromBackend(interviewType);
    let questions: string[] = [];
    if (Array.isArray(data)) {
      questions = data;
    } else if (data && Array.isArray(data.questions)) {
      questions = data.questions;
    }

    if (questions.length > 0) {
      return ["-- Select Reason / Skill Observation --", ...questions];
    }
  } catch (err) {
    console.warn("Backend feedback questions fetch failed, falling back to static questions:", err);
  }

  return getFeedbackQuestionsByInterviewType(interviewType);
}

/**
 * Returns tailored observation / reason options when rating is 1 to 4.5 stars (Static Fallback).
 */
export function getFeedbackQuestionsByInterviewType(interviewType?: string): string[] {
  const normType = (interviewType || "").toUpperCase().trim();

  if (normType.includes("TECH") || normType.includes("CODING")) {
    return [
      "-- Select Reason / Skill Observation --",
      "The candidate technical skill level is low / below expectation",
      "Problem solving & coding logic needs improvement",
      "System architecture & design knowledge gap",
      "Hands-on framework / tool depth insufficient",
      "Technical concept explanation & communication gap",
      "Code quality & optimization standards not met",
    ];
  }

  if (normType.includes("HR") || normType.includes("SCREENING") || normType.includes("INITIAL")) {
    return [
      "-- Select Reason / Skill Observation --",
      "Communication / language proficiency below requirement",
      "Salary expectation mismatch with budget",
      "Notice period / immediate availability issue",
      "Culture fit & professional attitude concerns",
      "Job stability / frequent job hopping risk",
      "Relocation / work location preference constraint",
    ];
  }

  if (normType.includes("MANAGERIAL") || normType.includes("CULTURE") || normType.includes("LEADERSHIP")) {
    return [
      "-- Select Reason / Skill Observation --",
      "Leadership & team management experience insufficient",
      "Conflict resolution & situational response gap",
      "Ownership & project delivery experience low",
      "Behavioral alignment & culture fit concerns",
      "Strategic thinking & decision-making skills weak",
    ];
  }

  // Final Round / Client Round / Default
  return [
    "-- Select Reason / Skill Observation --",
    "Candidate technical & domain depth low for client requirement",
    "Client communication & presentation confidence low",
    "Domain & project experience alignment gap",
    "Overall interview performance below expectation",
    "Experience gap for target role seniority",
    "Role expectations & client deliverables mismatch",
  ];
}

/**
 * Auto-suggests Recommendation and Status based on rating score (1 to 5).
 * - Rating 4.5 to 5.0 -> Selected / COMPLETED
 * - Rating 3.0 to 4.0 -> Hold / PENDING
 * - Rating 1.0 to 2.5 -> Rejected / CANCELLED
 */
export function getAutoRatingOutcome(rating: number): AutoRatingOutcome {
  if (rating >= 4.5) {
    return {
      recommendation: "Selected",
      clientRecommendation: "Selected",
      status: "COMPLETED",
      clientDecision: "Selected",
    };
  } else if (rating >= 3.0) {
    return {
      recommendation: "Hold",
      clientRecommendation: "Hold",
      status: "RESCHEDULED",
      clientDecision: "On Hold",
    };
  } else {
    return {
      recommendation: "Rejected",
      clientRecommendation: "Rejected",
      status: "CANCELLED",
      clientDecision: "Rejected",
    };
  }
}
