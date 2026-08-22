from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime

class StatItem(BaseModel):
    label: str
    value: str
    change: str
    changeColor: str

class PipelineItem(BaseModel):
    stage: str
    count: str
    width: str
    bg: str

class StatusItem(BaseModel):
    name: str
    percentage: str
    count: int
    color: str

class ActivityItem(BaseModel):
    title: str
    time: str
    icon_type: str # string representation of the icon (e.g., 'file', 'sparkles', 'check', 'video')
    bg: str

class UpcomingInterviewItem(BaseModel):
    time: str
    role: str
    candidate: str

class DashboardMetricsResponse(BaseModel):
    stats: List[StatItem]
    pipelineData: List[PipelineItem]
    statusData: List[StatusItem]
    seniorityDistribution: Optional[List[StatusItem]] = []
    domainDistribution: Optional[List[StatusItem]] = []
    recentActivities: List[ActivityItem]
    upcomingInterviews: List[UpcomingInterviewItem]
