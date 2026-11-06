// One place to read candidate fields from the AI parser's output (gap G10).
// The parser writes `current_role`, `total_experience_years` and the skill lists below;
// `designation`, `role`, `years_of_experience` and `skills` only exist on older or hand-edited records.

type Parsed = Record<string, any> | null | undefined;

const isNumber = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

/** Current job title, falling back to the latest job. Never shows the email. */
export function getCandidateRole(p: Parsed, fallback = "Role not specified"): string {
  return p?.current_role || p?.designation || p?.role || p?.experience?.[0]?.designation || fallback;
}

/** Years of experience as a label. 0 is a real value (freshers), not "missing". */
export function formatExperience(p: Parsed, unit = "Yrs", missing = "N/A"): string {
  const years = isNumber(p?.total_experience_years) ? p!.total_experience_years
    : isNumber(p?.years_of_experience) ? p!.years_of_experience : null;
  return years === null ? missing : `${years} ${unit}`;
}

export const SKILL_FIELDS = [
  "primary_skills", "functional_skills", "programming_languages", "frameworks", "databases",
  "cloud_tech", "devops_and_infrastructure", "other_technologies", "skills",
];

/** Every skill on the profile, technical and non-technical, without duplicates. */
export function getAllSkills(p: Parsed): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of SKILL_FIELDS) {
    for (const s of Array.isArray(p?.[field]) ? p![field] : []) {
      const key = String(s).trim().toLowerCase();
      if (key && !seen.has(key)) { seen.add(key); out.push(String(s).trim()); }
    }
  }
  return out;
}

/** Score 0 is a real score, so only a missing score shows the placeholder. */
export function formatScore(score: unknown, missing = "N/A"): string {
  return isNumber(score) ? String(score) : missing;
}
