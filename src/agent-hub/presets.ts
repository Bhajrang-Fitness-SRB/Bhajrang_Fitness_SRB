/** Free-tier providers. URLs and limits are set by each provider and can change: every field stays editable. */
export type Preset = { id: string; label: string; kind: 'openai' | 'gemini'; base_url: string; filter?: string; signup: string; note: string };
export const PRESETS: Preset[] = [
  { id: 'gemini', label: 'Google Gemini', kind: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', signup: 'https://aistudio.google.com/apikey', note: 'Free key from Google AI Studio.' },
  { id: 'groq', label: 'Groq', kind: 'openai', base_url: 'https://api.groq.com/openai/v1', signup: 'https://console.groq.com/keys', note: 'Very fast, generous free tier.' },
  { id: 'openrouter', label: 'OpenRouter (free models)', kind: 'openai', base_url: 'https://openrouter.ai/api/v1', filter: ':free$', signup: 'https://openrouter.ai/keys', note: 'Only models ending in ":free" are used.' },
  { id: 'cerebras', label: 'Cerebras', kind: 'openai', base_url: 'https://api.cerebras.ai/v1', signup: 'https://cloud.cerebras.ai', note: 'Free tier with daily limits.' },
  { id: 'mistral', label: 'Mistral', kind: 'openai', base_url: 'https://api.mistral.ai/v1', signup: 'https://console.mistral.ai/api-keys', note: 'Free experimental tier.' },
  { id: 'sambanova', label: 'SambaNova', kind: 'openai', base_url: 'https://api.sambanova.ai/v1', signup: 'https://cloud.sambanova.ai/apis', note: 'Free tier.' },
  { id: 'nvidia', label: 'NVIDIA NIM', kind: 'openai', base_url: 'https://integrate.api.nvidia.com/v1', signup: 'https://build.nvidia.com', note: 'Free credits for hosted models.' },
  { id: 'custom', label: 'Custom (any OpenAI-compatible)', kind: 'openai', base_url: '', signup: '', note: 'Paste the provider\'s base URL and a model name.' },
];

export const INTEL_KINDS: { id: string; label: string; hint: string }[] = [
  { id: 'content', label: 'Drafts (text, flyers, plans)', hint: 'Copy-ready text. Harmless.' },
  { id: 'message', label: 'Messages to members', hint: 'Email / push / Telegram / WhatsApp links.' },
  { id: 'social_post', label: 'Facebook / Instagram posts', hint: 'Posts to your page after approval.' },
  { id: 'setting', label: 'App settings', hint: 'One gym setting value.' },
  { id: 'sql', label: 'Database changes (SQL)', hint: 'Powerful. Always shown in full.' },
  { id: 'code', label: 'App / website code changes', hint: 'Opens a GitHub pull request.' },
];
export const DATA_ACCESS: { id: string; label: string }[] = [
  { id: 'gym_health', label: 'Gym health counters (anonymous)' },
  { id: 'money', label: 'Money overview' },
  { id: 'repo', label: 'App code (read via GitHub)' },
];

export const AGENT_TEMPLATES: { key: string; name: string; icon: string; description: string; persona: string; data_access: string[]; proposal_kinds: string[] }[] = [
  { key: 'support', name: 'Member Support', icon: '💬', description: 'Answers common member questions and drafts replies.', persona: 'You are the member support assistant for Bhajrang Fitness. Draft short, kind, accurate replies about timings, packages, renewals, freezes and rules. If you do not know a fact, say the owner must confirm it.', data_access: [], proposal_kinds: ['content', 'message'] },
  { key: 'hr', name: 'Staff & HR', icon: '🧑‍💼', description: 'Staff schedules, trainer targets, job posts and onboarding notes.', persona: 'You help the gym owner manage staff: duty rosters, trainer performance targets, job advertisements, interview questions and onboarding checklists. Be fair and practical.', data_access: [], proposal_kinds: ['content'] },
  { key: 'store', name: 'Store & Inventory', icon: '🛒', description: 'Supplement and merchandise stock, reorder and offers.', persona: 'You manage the gym store: reorder suggestions, bundle offers, slow-moving stock ideas and product descriptions. Use only figures you are given.', data_access: ['money'], proposal_kinds: ['content', 'social_post'] },
  { key: 'reputation', name: 'Reviews & Reputation', icon: '⭐', description: 'Google review replies, testimonials, local SEO.', persona: 'You help the gym grow its reputation: polite replies to Google reviews, asking happy members for reviews, local SEO tips and Google Business post ideas. Never invent reviews.', data_access: [], proposal_kinds: ['content', 'message'] },
  { key: 'blank', name: 'Blank agent', icon: '🤖', description: 'Your own agent — write what it should do.', persona: '', data_access: [], proposal_kinds: ['content'] },
];

export const QUICK_PROMPTS: Record<string, string[]> = {
  master: ['How is the gym doing today? What needs my attention?', 'Make a 7-day Instagram plan for the new member offer', 'Find what is broken or slow in my app and tell me what to fix'],
  developer: ['Look at the member portal and suggest 3 small improvements', 'Add a "last visited" column to the members table (with undo)', 'Why might the kiosk check-in feel slow?'],
  money: ['Review my last 30 days and tell me where I am losing money', 'Which dues should I chase first this week?'],
  marketing: ['Write a Diwali offer post for Facebook and Instagram', 'Give me 10 reel ideas for transformations'],
  followup: ['Write a renewal reminder for members expiring in 7 days', 'Write a win-back message for members who left 6+ months ago'],
  events: ['Plan a 30-day transformation challenge with prizes under ₹20,000'],
  website: ['Review my website home page copy and suggest improvements'],
};
