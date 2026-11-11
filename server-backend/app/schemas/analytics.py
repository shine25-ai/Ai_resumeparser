from typing import List, Optional
from pydantic import BaseModel

class StatItem(BaseModel):
    label: str
    value: str
    change: str
    color: str

class ResumeSourceData(BaseModel):
    name: str
    percentage: str
    count: int
    color: str

class PipelineTrendData(BaseModel):
    """Counts for one week, starting on the Monday shown in `date`."""
    date: str
    Resumes: int
    Interviews: int
    Selected: int
    Offers: int

class SkillData(BaseModel):
    name: str
    count: int
    width: str

class ExpDistributionData(BaseModel):
    name: str
    percentage: str
    count: int
    color: str

class AnalyticsResponse(BaseModel):
    stats: List[StatItem]
    resumeSourceData: List[ResumeSourceData]
    pipelineTrendData: List[PipelineTrendData]
    topSkills: List[SkillData]
    expDistribution: List[ExpDistributionData]
    successRate: int
    rangeDays: Optional[int] = None
