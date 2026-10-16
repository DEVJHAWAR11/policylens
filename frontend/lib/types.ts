export type PolicyState = 'queued' | 'processing' | 'ready' | 'failed';

export interface PolicyStatus {
  status: PolicyState;
  progress?: number;
  message?: string;
}

// Row from GET /api/policies
export interface PolicyRow {
  policy_id: string;
  policy_name?: string | null;
  filename?: string | null;
  policy_type?: string | null;
  insurer?: string | null;
  status: PolicyState;
  progress?: number | null;
  message?: string | null;
  created_at: string;
}

export interface Policy {
  id: string;
  name: string;
  createdAt: string;
  status: PolicyState;
  progress: number;
  message?: string | null;
  insurer?: string | null;
  policyType?: string | null;
}

export interface Source {
  section: string | null;
  page_number: number | null;
  highlight_text: string;
  snippet: string;
  relevance_score: number | null;
}

export interface PolicySummary {
  policy_name?: string;
  policy_type?: string;
  insurer?: string;
  uin?: string | null;
  key_benefits?: string[];
  exclusions?: string[];
  death_benefit?: string | null;
  survival_benefit?: string | null;
  surrender_value?: string | null;
  loan_facility?: string | null;
  free_look_period?: string | null;
  tax_benefit?: string | null;
  important_conditions?: string[];
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  sourcesState?: 'loading' | 'ready' | 'none';
  error?: boolean;
  streaming?: boolean;
}

export interface HistoryRow {
  id: string;
  policy_id: string;
  question: string;
  answer: string;
  sources?: Source[] | null;
  created_at: string;
}
