import { supabase } from '../lib/supabase';
import type { ActivityRow, ChatMsg, Overview } from './types';

/** Every call is owner-gated on the server; the passcode is re-checked each time. */
export type FnResult<T = any> = { ok: boolean; error?: string; data?: T };

async function fn<T = any>(passcode: string, action: string, body: Record<string, unknown> = {}): Promise<T & { error?: string; ok?: boolean }> {
  const { data, error } = await supabase.functions.invoke('agent-hub', { body: { passcode, action, ...body } });
  if (error) {
    // supabase-js hides the JSON body of non-2xx replies inside error.context
    try { const j = await (error as any).context?.json?.(); if (j) return j; } catch { /* fall through */ }
    return { ok: false, error: 'Could not reach the Hub server. Is the "agent-hub" function deployed?' } as any;
  }
  return data as any;
}

async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.rpc(name, args);
  return { data: (data as T) ?? null, error: error ? error.message : null };
}

export const hub = {
  overview: (p: string) => rpc<Overview>('admin_hub_overview', { p_passcode: p }),
  activity: (p: string) => rpc<ActivityRow[]>('admin_hub_activity', { p_passcode: p, p_limit: 100 }),
  messages: (p: string, id: string) => rpc<ChatMsg[]>('admin_hub_messages', { p_passcode: p, p_conversation: id }),
  deleteConversation: (p: string, id: string) => rpc('admin_hub_delete_conversation', { p_passcode: p, p_id: id }),
  saveProvider: (p: string, provider: Record<string, unknown>, apiKey?: string) => rpc<string>('admin_hub_save_provider', { p_passcode: p, p_provider: provider, p_api_key: apiKey || null }),
  deleteProvider: (p: string, id: string) => rpc('admin_hub_delete_provider', { p_passcode: p, p_id: id }),
  saveAgent: (p: string, agent: Record<string, unknown>) => rpc<string>('admin_hub_save_agent', { p_passcode: p, p_agent: agent }),
  deleteAgent: (p: string, key: string) => rpc('admin_hub_delete_agent', { p_passcode: p, p_key: key }),
  setSecret: (p: string, name: string, value: string) => rpc('admin_hub_set_secret', { p_passcode: p, p_name: name, p_value: value }),
  setSetting: (p: string, key: string, value: string) => rpc('admin_hub_set_setting', { p_passcode: p, p_key: key, p_value: value }),
  decline: (p: string, id: string) => rpc('admin_hub_decline_proposal', { p_passcode: p, p_id: id, p_note: null }),
  chat: (p: string, agent_key: string, message: string, conversation_id: string | null) => fn(p, 'chat', { agent_key, message, conversation_id }),
  testProvider: (p: string, provider_id: string) => fn(p, 'test_provider', { provider_id }),
  testProposal: (p: string, id: string) => fn(p, 'proposal_test', { id }),
  apply: (p: string, id: string, confirm: boolean) => fn(p, 'proposal_apply', { id, confirm }),
  deploy: (p: string, id: string) => fn(p, 'proposal_deploy', { id }),
  undo: (p: string, id: string) => fn(p, 'proposal_undo', { id }),
  githubCheck: (p: string) => fn(p, 'github_check'),
};
