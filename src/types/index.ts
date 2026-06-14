export interface Resume {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  content: string;
  parsedData: ParsedResume;
  uploadedAt: Date;
}

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  jobTitle?: string;       // target role (used in DOCX header)
  summary?: string;
  coreCompetencies?: string[];  // 10-15 keyword phrases after summary
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications?: string[];
  raw: string;
}

export interface ExperienceItem {
  title: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: string[];
}

export interface EducationItem {
  degree: string;
  school: string;
  location?: string;
  graduationDate?: string;
}

export interface JobDescription {
  title: string;
  company: string;
  location?: string;
  description: string;
  requirements: string[];
  keywords: string[];
  url: string;
}

export interface ATSScoring {
  atsKeywords: number;
  experienceRelevance: number;
  achievements: number;
  formatting: number;
  educationCerts: number;
  total: number;
}

export interface OptimizedResume {
  id: string;
  originalResumeId: string;
  jobDescriptionUrl: string;
  optimizedContent: ParsedResume;
  atsScore: number;
  keywordMatches: KeywordMatch[];
  scoring?: ATSScoring;
  gaps?: string[];
  recommendations?: string[];
  createdAt: Date;
}

export interface KeywordMatch {
  keyword: string;
  inResume: boolean;
  importance: 'high' | 'medium' | 'low';
}

export interface CoverLetter {
  id: string;
  jobDescriptionUrl: string;
  content: string;
  tone: 'professional' | 'enthusiastic' | 'technical' | 'creative';
  createdAt: Date;
}

export interface CreditBalance {
  total: number;
  used: number;
  remaining: number;
  transactions: CreditTransaction[];
}

export interface CreditTransaction {
  id: string;
  type: 'purchase' | 'usage' | 'bonus' | 'refund';
  amount: number;
  description: string;
  timestamp: Date;
}

export interface UserSettings {
  // apiKey removed — the platform Anthropic key is now stored in Supabase secrets
  defaultTone: CoverLetter['tone'];
  autoDetectJob: boolean;
  showATSScore: boolean;
}

export interface ApplicationRecord {
  id: string;
  jobTitle: string;
  company: string;
  url: string;
  appliedAt: Date;
  resumeId: string;
  coverLetterId?: string;
  status: 'applied' | 'interviewing' | 'rejected' | 'accepted';
  notes?: string;
}
