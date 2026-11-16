export type ProviderRow = {
  id: string; slot_name: string; preset: string; kind: 'openai' | 'gemini'; base_url: string; models: string[]; model_filter: string | null;
  priority: number; enabled: boolean; status: 'unknown' | 'ok' | 'cooldown' | 'invalid'; cooldown_until: string | null; last_error: string | null;
  last_used_at: string | null; daily_limit: number | null; req_today: number; tokens_today: number; total_requests: number; total_failures: number; has_key: boolean;
};
export type AgentRow = {
  key: string; name: string; icon: string; description: string; persona: string; data_access: string[]; proposal_kinds: string[];
  preferred_provider: string | null; enabled: boolean; builtin: boolean; sort_order: number;
};
export type ProposalKind = 'content' | 'message' | 'social_post' | 'sql' | 'code' | 'setting';
export type ProposalStatus = 'PENDING' | 'APPLYING' | 'PR_OPEN' | 'APPLIED' | 'FAILED' | 'DECLINED';
export type Proposal = {
  id: string; agent_key: string; kind: ProposalKind; title: string; summary: string; payload: Record<string, any>; risk: 'low' | 'medium' | 'high';
  status: ProposalStatus; test_result: { ok: boolean; note?: string; error?: string } | null; result: Record<string, any> | null; note?: string | null;
  created_at: string; decided_at?: string | null; applied_at?: string | null;
};
export type Conversation = { id: string; agent_key: string; title: string; updated_at: string };
export type ChatMsg = { id?: number; role: 'user' | 'assistant'; content: string; agent_key?: string | null; provider_slot?: string | null; model?: string | null };
export type Overview = {
  providers: ProviderRow[]; agents: AgentRow[]; proposals: Proposal[]; conversations: Conversation[];
  settings: Record<string, string>; secrets: Record<string, boolean>;
};
export type ActivityRow = { id: number; at: string; actor: string; event: string; detail: Record<string, any> };
