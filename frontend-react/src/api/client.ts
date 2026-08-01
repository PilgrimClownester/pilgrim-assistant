const API_BASE = import.meta.env.VITE_FIREFLY_API_BASE || 'http://127.0.0.1:8000';
const CHAT_SESSION_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

export function getHealth(): Promise<{ status: string }> {
  return request('/health');
}

export function getNapcatStatus() {
  return request<{ enabled: boolean; allowed_qq: string }>('/qq/napcat');
}

export function startNapcat() {
  return request<{ enabled: boolean; allowed_qq: string }>('/qq/napcat/start', { method: 'POST' });
}

export function stopNapcat() {
  return request<{ enabled: boolean; allowed_qq: string }>('/qq/napcat/stop', { method: 'POST' });
}

export function getProfile() {
  return request('/profile');
}

export function saveProfile(profile: unknown) {
  return request('/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function postChat(message: string, history: unknown[] = []) {
  return request<{ type: string; message: string; answer: string }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, session_id: CHAT_SESSION_ID }),
  });
}

export async function exportChatArchive(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/chat/archive/export`);
  if (!res.ok) throw new Error(`导出失败（${res.status}）`);
  return res.blob();
}

export function postBaziChart(birthInfo: unknown) {
  return request('/bazi/chart', {
    method: 'POST',
    body: JSON.stringify(birthInfo),
  });
}

export function postBaziAnalyze(requestData: unknown) {
  return request('/bazi/analyze', {
    method: 'POST',
    body: JSON.stringify(requestData),
  });
}

export function postBaziAsk(requestData: unknown) {
  return request('/bazi/ask', {
    method: 'POST',
    body: JSON.stringify(requestData),
  });
}

export function postTarot(question: string, spread = 'three') {
  return request('/fortune/tarot', {
    method: 'POST',
    body: JSON.stringify({ question, spread }),
  });
}

export function postYijing(question: string) {
  return request('/fortune/yijing', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export interface DailyFortuneResult {
  type: 'daily';
  seed: {
    date: string;
    keyword?: string;
    energy?: number;
    focus?: string;
  };
  answer: string;
  generated_at?: string;
  cached: boolean;
}

export function getDailyFortune(): Promise<DailyFortuneResult> {
  return request('/fortune/daily');
}

export function getSavedDailyFortune(): Promise<{ available: boolean; date: string; result: DailyFortuneResult | null }> {
  return request('/fortune/daily/today');
}

export interface FortuneSyncEntry {
  tool: 'bazi' | 'tarot' | 'yijing';
  date: string;
  result: Record<string, unknown>;
  updated_at: string;
}

export function getSavedFortuneResults(): Promise<{ date: string; entries: FortuneSyncEntry[] }> {
  return request('/fortune/results/today');
}

export function syncFortuneResults(entries: FortuneSyncEntry[]): Promise<{ date: string; entries: FortuneSyncEntry[] }> {
  return request('/fortune/results/sync', {
    method: 'POST',
    body: JSON.stringify({ entries }),
  });
}

export function getTodos() {
  return request('/todos');
}

export function createTodo(todo: unknown) {
  return request('/todos', {
    method: 'POST',
    body: JSON.stringify(todo),
  });
}

export function updateTodo(id: string, patch: unknown) {
  return request(`/todos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteTodo(id: string) {
  return request(`/todos/${id}`, {
    method: 'DELETE',
  });
}

export function getSchedule() {
  return request('/schedule');
}

export function createScheduleEvent(event: unknown) {
  return request('/schedule', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export function updateScheduleEvent(id: string, patch: unknown) {
  return request(`/schedule/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteScheduleEvent(id: string) {
  return request(`/schedule/${id}`, {
    method: 'DELETE',
  });
}

export function getReflections() {
  return request('/companion/reflections');
}

export function saveReflection(reflection: unknown) {
  return request('/companion/reflections', { method: 'POST', body: JSON.stringify(reflection) });
}

export function getMemories() {
  return request('/companion/memories');
}

export function createMemory(memory: unknown) {
  return request('/companion/memories', { method: 'POST', body: JSON.stringify(memory) });
}

export function deleteMemory(id: string) {
  return request(`/companion/memories/${id}`, { method: 'DELETE' });
}

export function getFocusSessions() {
  return request('/companion/focus');
}

export function saveFocusSession(session: unknown) {
  return request('/companion/focus', { method: 'POST', body: JSON.stringify(session) });
}

export function getWeeklySummary() {
  return request('/companion/weekly');
}

export function getDashboard(period: 'week' | 'month' = 'week') { return request(`/dashboard?period=${period}`); }
export function saveMood(payload: unknown) { return request('/moods', { method: 'POST', body: JSON.stringify(payload) }); }
export function saveExpense(payload: unknown) { return request('/expenses', { method: 'POST', body: JSON.stringify(payload) }); }
export function getHabits() { return request('/habits'); }
export function createHabit(payload: unknown) { return request('/habits', { method: 'POST', body: JSON.stringify(payload) }); }
export function checkinHabit(id: string) { return request(`/habits/${id}/checkin`, { method: 'POST', body: '{}' }); }
export function deleteHabit(id: string) { return request(`/habits/${id}`, { method: 'DELETE' }); }
export function getGoals() { return request('/goals'); }
export function createGoal(payload: unknown) { return request('/goals', { method: 'POST', body: JSON.stringify(payload) }); }
export function toggleMilestone(goalId: string, milestoneId: string, done: boolean) { return request(`/goals/${goalId}/milestones/${milestoneId}`, { method: 'PATCH', body: JSON.stringify({ done }) }); }
export function deleteGoal(id: string) { return request(`/goals/${id}`, { method: 'DELETE' }); }
export function getIdeas() { return request('/ideas'); }
export function createIdea(payload: unknown) { return request('/ideas', { method: 'POST', body: JSON.stringify(payload) }); }
export function getRandomIdea() { return request('/ideas/random'); }
export function deleteIdea(id: string) { return request(`/ideas/${id}`, { method: 'DELETE' }); }
export function generateCreative(payload: unknown) { return request('/creative/generate', { method: 'POST', body: JSON.stringify(payload) }); }
export function getTreeholeStatus() { return request('/treehole/status'); }
export function sealTreehole(payload: unknown) { return request('/treehole/write', { method: 'POST', body: JSON.stringify(payload) }); }
export function unlockTreehole(payload: unknown) { return request('/treehole/unlock', { method: 'POST', body: JSON.stringify(payload) }); }

export function parseInbox(text: string) { return request('/inbox/parse', { method: 'POST', body: JSON.stringify({ text }) }); }
export function commitInbox(payload: unknown) { return request('/inbox/commit', { method: 'POST', body: JSON.stringify(payload) }); }
export function getInboxActions(limit = 20) { return request(`/inbox/actions?limit=${limit}`); }
export function undoInboxAction(id: string) { return request(`/inbox/actions/${id}`, { method: 'DELETE' }); }

export function getProjects(includeArchived = false) { return request(`/projects?include_archived=${includeArchived}`); }
export function getProject(id: string) { return request(`/projects/${id}`); }
export function createProject(payload: unknown) { return request('/projects', { method: 'POST', body: JSON.stringify(payload) }); }
export function updateProject(id: string, payload: unknown) { return request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); }
export function deleteProject(id: string) { return request(`/projects/${id}`, { method: 'DELETE' }); }
export function addProjectMilestone(id: string, payload: unknown) { return request(`/projects/${id}/milestones`, { method: 'POST', body: JSON.stringify(payload) }); }
export function toggleProjectMilestone(id: string, milestoneId: string, done: boolean) { return request(`/projects/${id}/milestones/${milestoneId}`, { method: 'PATCH', body: JSON.stringify({ done }) }); }
export function addProjectTask(id: string, payload: unknown) { return request(`/projects/${id}/tasks`, { method: 'POST', body: JSON.stringify(payload) }); }
export function addProjectEvent(id: string, payload: unknown) { return request(`/projects/${id}/events`, { method: 'POST', body: JSON.stringify(payload) }); }
export function linkProjectIdea(id: string, ideaId: string) { return request(`/projects/${id}/ideas`, { method: 'POST', body: JSON.stringify({ idea_id: ideaId }) }); }
export function addProjectRisk(id: string, payload: unknown) { return request(`/projects/${id}/risks`, { method: 'POST', body: JSON.stringify(payload) }); }
export function addProjectDecision(id: string, payload: unknown) { return request(`/projects/${id}/decisions`, { method: 'POST', body: JSON.stringify(payload) }); }
export function addProjectLink(id: string, payload: unknown) { return request(`/projects/${id}/links`, { method: 'POST', body: JSON.stringify(payload) }); }
export function resolveProjectRisk(id: string, riskId: string, resolved: boolean) { return request(`/projects/${id}/risks/${riskId}`, { method: 'PATCH', body: JSON.stringify({ resolved }) }); }

export function getWeeklyReview(start?: string) { return request(`/reviews/weekly${start ? `?start=${start}` : ''}`); }
export function getWeeklyReviewHistory(limit = 12) { return request(`/reviews/weekly/history?limit=${limit}`); }
export function saveWeeklyReview(payload: unknown) { return request('/reviews/weekly', { method: 'POST', body: JSON.stringify(payload) }); }
export function applyWeeklyPlan(payload: unknown) { return request('/reviews/weekly/plan', { method: 'POST', body: JSON.stringify(payload) }); }
