from typing import List
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
    date: str
    Resumes: int
    Shortlisted: int
    Interviewed: int
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
