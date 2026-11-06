from typing import List, Optional
from pydantic import BaseModel, Field

class ExperienceItem(BaseModel):
    company: str = Field(description="Name of the company")
    designation: str = Field(description="Job title or designation")
    duration: str = Field(description="Duration of employment exactly as written (e.g., Jan 2020 - Present)")
    start_date: Optional[str] = Field(default=None, description="Start month as YYYY-MM (use YYYY if only the year is given)")
    end_date: Optional[str] = Field(default=None, description="End month as YYYY-MM, YYYY if only the year is given, or 'Present' if this is the current job")
    responsibilities: Optional[str] = Field(default=None, description="Summary of responsibilities")
    technologies_used: List[str] = Field(default_factory=list, description="Technologies used in this role")
    achievements: Optional[str] = Field(default=None, description="Major achievements or measurable outcomes")
    leadership_responsibilities: Optional[str] = Field(default=None, description="Leadership or mentoring responsibilities")
    business_domain: Optional[str] = Field(default=None, description="Business domain of the company or team")
    team_size: Optional[str] = Field(default=None, description="Size of the team, if available")

class EducationItem(BaseModel):
    degree: str = Field(description="Degree name (e.g., B.Tech, MCA)")
    specialization: Optional[str] = Field(default=None, description="Major or specialization")
    institution: str = Field(description="College or University name")
    year_of_passing: str = Field(description="Graduation year")
    score: Optional[str] = Field(default=None, description="Percentage or CGPA")

class CertificationItem(BaseModel):
    name: str = Field(description="Name of certification")
    issued_by: str = Field(description="Issuing organization")
    year: str = Field(description="Year of certification")

class ProjectItem(BaseModel):
    name: str = Field(description="Project name. Distinct from employment.")
    domain: Optional[str] = Field(default=None, description="Project domain (e.g., Banking, Healthcare)")
    duration: Optional[str] = Field(default=None, description="Duration of the project")
    role: Optional[str] = Field(default=None, description="Role played in the project")
    tech_stack: List[str] = Field(default_factory=list, description="Technologies used in the project")
    description: Optional[str] = Field(default=None, description="Brief description of the project")
    architecture: Optional[str] = Field(default=None, description="Architecture style used (e.g., Microservices, Event-driven)")
    scale: Optional[str] = Field(default=None, description="Scale of the project (e.g., number of users, transactions)")
    business_impact: Optional[str] = Field(default=None, description="Business impact or outcome of the project")
    candidate_ownership: Optional[str] = Field(default=None, description="Level of ownership candidate had in the project")

class BasicInfoSchema(BaseModel):
    full_name: str = Field(description="Candidate's full name")
    email: str = Field(description="Candidate's email address")
    phone: str = Field(description="Candidate's phone number")
    location: Optional[str] = Field(default=None, description="Current location")
    linkedin: Optional[str] = Field(default=None, description="LinkedIn profile URL")
    total_experience_years: float = Field(default=0.0, description="Total years of professional experience up to today, counting overlapping jobs once")
    relevant_experience_years: float = Field(default=0.0, description="Years of experience relevant to their primary domain")
    current_role: Optional[str] = Field(default=None, description="Current or most recent job title")
    seniority: Optional[str] = Field(default=None, description="Seniority level (e.g., Junior, Mid, Senior, Lead)")
    primary_domain: Optional[str] = Field(default=None, description="Primary business domain")
    specialization: Optional[str] = Field(default=None, description="Primary technical specialization")
    programming_languages: List[str] = Field(default_factory=list, description="Programming languages known")
    frameworks: List[str] = Field(default_factory=list, description="Frameworks and libraries known")
    databases: List[str] = Field(default_factory=list, description="Databases known")
    cloud_tech: List[str] = Field(default_factory=list, description="Cloud technologies (AWS, Azure, GCP, etc.)")
    devops_and_infrastructure: List[str] = Field(default_factory=list, description="DevOps and infrastructure tools")
    other_technologies: List[str] = Field(default_factory=list, description="Other technical skills (e.g., testing, security)")
    primary_skills: List[str] = Field(default_factory=list, description="Main skills for the candidate's own role (technical or not)")
    functional_skills: List[str] = Field(default_factory=list, description="Non-technical professional skills and business tools (e.g., Talent Acquisition, Payroll, Stakeholder Management, Financial Modelling, SAP SuccessFactors, Figma). Empty list if none.")

class WorkExperienceSchema(BaseModel):
    experience: List[ExperienceItem] = Field(default_factory=list, description="List of past professional work experience (employment at companies). DO NOT INCLUDE PROJECTS HERE.")

class ProjectsSchema(BaseModel):
    projects: List[ProjectItem] = Field(default_factory=list, description="List of projects worked on (personal, academic, or professional). SEPARATE THESE FROM EMPLOYMENT EXPERIENCE. Return empty list [] if none.")

class EducationSchema(BaseModel):
    education: List[EducationItem] = Field(default_factory=list, description="List of educational qualifications")
    certifications: List[CertificationItem] = Field(default_factory=list, description="List of certifications ONLY if explicitly mentioned. Return empty list [] if none.")

class ResumeSchema(BaseModel):
    full_name: str = Field(description="Candidate's full name")
    email: str = Field(description="Candidate's email address")
    phone: str = Field(description="Candidate's phone number")
    location: Optional[str] = Field(default=None, description="Current location")
    linkedin: Optional[str] = Field(default=None, description="LinkedIn profile URL")
    total_experience_years: float = Field(default=0.0, description="Total years of professional experience up to today, counting overlapping jobs once")
    relevant_experience_years: float = Field(default=0.0, description="Years of experience relevant to their primary domain")
    current_role: Optional[str] = Field(default=None, description="Current or most recent job title")
    seniority: Optional[str] = Field(default=None, description="Seniority level (e.g., Junior, Mid, Senior, Lead)")
    primary_domain: Optional[str] = Field(default=None, description="Primary business domain")
    specialization: Optional[str] = Field(default=None, description="Primary technical specialization")
    programming_languages: List[str] = Field(default_factory=list, description="Programming languages known")
    frameworks: List[str] = Field(default_factory=list, description="Frameworks and libraries known")
    databases: List[str] = Field(default_factory=list, description="Databases known")
    cloud_tech: List[str] = Field(default_factory=list, description="Cloud technologies (AWS, Azure, GCP, etc.)")
    devops_and_infrastructure: List[str] = Field(default_factory=list, description="DevOps and infrastructure tools")
    other_technologies: List[str] = Field(default_factory=list, description="Other technical skills (e.g., testing, security)")
    primary_skills: List[str] = Field(default_factory=list, description="Main skills for the candidate's own role (technical or not)")
    functional_skills: List[str] = Field(default_factory=list, description="Non-technical professional skills and business tools (e.g., Talent Acquisition, Payroll, Stakeholder Management, Financial Modelling, SAP SuccessFactors, Figma). Empty list if none.")
    experience: List[ExperienceItem] = Field(default_factory=list, description="List of past work experience. DO NOT INCLUDE ACADEMIC PROJECTS HERE.")
    projects: List[ProjectItem] = Field(default_factory=list, description="List of projects worked on. SEPARATE THESE FROM EXPERIENCE. Return empty list [] if none.")
    education: List[EducationItem] = Field(default_factory=list, description="List of educational qualifications")
    certifications: List[CertificationItem] = Field(default_factory=list, description="List of certifications ONLY if explicitly mentioned. Return empty list [] if none.")

class AIPersonalityScore(BaseModel):
    leadership: int = Field(default=0, description="Score 1-100 for leadership potential based on experience")
    team_player: int = Field(default=0, description="Score 1-100 for team collaboration")
    problem_solving: int = Field(default=0, description="Score 1-100 for problem solving ability")
    communication: int = Field(default=0, description="Score 1-100 for communication inference")

class CareerAnalysis(BaseModel):
    job_hopping_risk: str = Field(default="Unknown", description="Risk assessment: Low, Medium, High")
    career_stability: str = Field(default="Unknown", description="Overall stability inference")
    promotion_pattern: str = Field(default="Unknown", description="Any visible promotions in the same company?")
    recommended_upskilling: List[str] = Field(default_factory=list, description="Technologies the candidate should learn to grow")
    technology_recency: str = Field(default="Unknown", description="Are the candidate's skills current or outdated?")

class SkillProficiencyItem(BaseModel):
    skill_name: str = Field(description="Name of the skill")
    proficiency_level: str = Field(description="Beginner, Intermediate, Advanced, or Expert")
    years_used: Optional[float] = Field(default=None, description="Estimated years of usage")
    recent_usage: Optional[str] = Field(default=None, description="Where or when it was most recently used")

class ScoreBreakdown(BaseModel):
    skills_depth: int = Field(default=0, description="0-30: depth and breadth of the core skills for this role family")
    experience_relevance: int = Field(default=0, description="0-25: how relevant and progressive the work history is for this role family")
    impact_and_projects: int = Field(default=0, description="0-20: measurable outcomes, ownership, scale of work")
    skill_recency: int = Field(default=0, description="0-15: how current the skills and tools are")
    education_and_certifications: int = Field(default=0, description="0-10: relevant degrees and certifications")

class CandidateEvaluationSchema(BaseModel):
    role_family: str = Field(default="Other", description="The candidate's own role family, e.g. Software Engineering, Data, QA, DevOps, Product, Design, HR, Finance, Sales, Operations, Other")
    experience_level: str = Field(default="Unknown", description="Classification: Fresher, Junior, Mid-Level, Senior, Architect")
    score_breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown, description="Rubric scores; ai_technical_score is their sum")
    domain_expertise: List[str] = Field(default_factory=list, description="Top domains the candidate has worked in")
    ai_technical_score: int = Field(default=0, description="Overall score 0-100 for the candidate's own role family (sum of score_breakdown)")
    skill_strengths: List[str] = Field(default_factory=list, description="Candidate's strongest skills")
    skill_weaknesses: List[str] = Field(default_factory=list, description="Weak areas compared to typical roles in the candidate's own role family")
    skill_proficiency_analysis: List[SkillProficiencyItem] = Field(default_factory=list, description="Proficiency assessment for key skills")
    architecture_and_design_capabilities: Optional[str] = Field(default=None, description="Assessment of architecture and system design skills")
    problem_solving_ability: Optional[str] = Field(default=None, description="Evidence of solving technically difficult problems")
    leadership_analysis: Optional[str] = Field(default=None, description="Assessment of technical and people leadership")
    resume_red_flags: List[str] = Field(default_factory=list, description="Potential inconsistencies or red flags in the resume")
    interview_focus_areas: List[str] = Field(default_factory=list, description="Suggested areas to verify during an interview")
    personality_analysis: AIPersonalityScore = Field(default_factory=AIPersonalityScore)
    career_analysis: CareerAnalysis = Field(default_factory=CareerAnalysis)
