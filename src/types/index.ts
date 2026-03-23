export interface Analysis {
  analysisId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  matchScore?: number;
  presentKeywords?: string[];
  missingKeywords?: string[];
  suggestions?: Suggestion[];
  topMissing?: TopMissingKeyword[];
  scoreBreakdown?: ScoreBreakdown;
  matchedCount?: number;
  totalCount?: number;
  scoreSummary?: string;
  scoreSummaryShort?: string;
  originalText?: string;
  suggestedText?: string;
  jobDescription?: string;
  createdAt: string;
  timestamp?: string;
  fileName?: string;
  experienceCheck?: {
    requiredYears: string | null;
    resumeStatedYears: string | null;
    actualYears: string;
    hasMismatch: boolean;
    warning: string | null;
    recommendation: string | null;
  }
  tokenUsage?: {
    estimatedCost: string | number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    [key: string]: unknown;
  }
}

export interface TopMissingKeyword {
  keyword: string;
  importanceScore: number;
  reason: string;
}

export interface ScoreBreakdown {
  technical: number;
  tools: number;
  softSkills: number;
  experience: number;
}

export interface Suggestion {
  keyword: string;
  reason: string;
  whereToAdd: string;
}

export interface UploadResponse {
  uploadUrl: string;
  analysisId: string;
}
