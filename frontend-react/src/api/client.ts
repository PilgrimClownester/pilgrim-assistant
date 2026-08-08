import type { ScheduleEvent, TodoItem } from '../types';
import type { ProductivityCache } from './offlineStore';
import { getEdgeAICache, getProductivityCache, localId, localTimestamp, saveEdgeAICache, saveProductivityCache } from './offlineStore';

const API_BASE = import.meta.env.VITE_FIREFLY_API_BASE || 'http://127.0.0.1:8000';
function getChatSessionId(): string {
  const storageKey = 'firefly:chat-session';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(storageKey, value);
    return value;
  } catch {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

const CHAT_SESSION_ID = getChatSessionId();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    if (res.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('firefly:unauthorized'));
    }
    throw new Error(`API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

export interface AuthStatus {
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
}

export function getAuthStatus(): Promise<AuthStatus> {
  return request('/auth/status');
}

export async function login(username: string, password: string): Promise<{ authenticated: boolean; username: string }> {
  try {
    return await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('429')) throw new Error('尝试次数过多，请稍后再试');
    if (message.includes('401')) throw new Error('用户名或密码不正确');
    throw new Error('无法登录，请检查网络后重试');
  }
}

export function logout(): Promise<{ authenticated: boolean }> {
  return request('/auth/logout', { method: 'POST' });
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

export function postChat(message: string, history: unknown[] = [], usePersistentContext = true) {
  return request<{ type: string; message: string; answer: string }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, session_id: CHAT_SESSION_ID, use_persistent_context: usePersistentContext }),
  });
}

export interface CloudChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  type?: string;
}

export function getChatHistory(limit = 500): Promise<{ items: CloudChatMessage[] }> {
  const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
  return request(`/chat/history?limit=${safeLimit}`);
}

export async function exportChatArchive(): Promise<Blob> {
  const res = await fetch(`${API_BASE}/chat/archive/export`, { credentials: 'include' });
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
  method_version?: number;
  seed: {
    date: string;
    keyword?: string;
    energy?: number;
    focus?: string;
  };
  yijing?: {
    date?: string;
    method?: string;
    lines?: number[];
    moving_lines?: number[];
    changed_lines?: number[];
    main_hexagram?: Record<string, unknown>;
    changed_hexagram?: Record<string, unknown>;
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
  return cachedProductivity('todos');
}

export interface EdgeAILearningProgress {
  completed: string[];
  task_checks: Record<string, string[]>;
  updated_at: string | null;
}

export function getEdgeAILearningProgress(): Promise<EdgeAILearningProgress> {
  return getEdgeAICache().then(async (cached) => {
    void syncEdgeAI();
    if (cached.updated_at || Object.keys(cached.pending).length || Object.keys(cached.pending_tasks).length) return { completed: cached.completed, task_checks: cached.task_checks, updated_at: cached.updated_at };
    return syncEdgeAI();
  });
}

export async function updateEdgeAIStage(stageId: string, done: boolean): Promise<EdgeAILearningProgress> {
  const cached = await getEdgeAICache();
  const completed = new Set(cached.completed);
  done ? completed.add(stageId) : completed.delete(stageId);
  const next = { ...cached, completed: [...completed], pending: { ...cached.pending, [stageId]: done }, updated_at: localTimestamp() };
  await saveEdgeAICache(next);
  void syncEdgeAI();
  return { completed: next.completed, task_checks: next.task_checks, updated_at: next.updated_at };
}

export async function updateEdgeAITask(stageId: string, taskId: string, checked: boolean): Promise<EdgeAILearningProgress> {
  const cached = await getEdgeAICache();
  const checks = new Set(cached.task_checks[stageId] || []);
  checked ? checks.add(taskId) : checks.delete(taskId);
  const next = {
    ...cached,
    task_checks: { ...cached.task_checks, [stageId]: [...checks] },
    pending_tasks: { ...cached.pending_tasks, [taskId]: checked },
    updated_at: localTimestamp(),
  };
  await saveEdgeAICache(next);
  void syncEdgeAI();
  return { completed: next.completed, task_checks: next.task_checks, updated_at: next.updated_at };
}

export async function createTodo(todo: unknown) {
  const state = await getProductivityCache();
  const now = localTimestamp();
  const item = { id: localId('todo'), done: false, created_at: now, completed_at: null, updated_at: now, ...(todo as object) } as TodoItem;
  state.todos.push(item);
  state.cachedAt = now;
  await saveProductivityCache(state);
  announceProductivity(state);
  void syncProductivity();
  return { item };
}

export async function updateTodo(id: string, patch: unknown) {
  const state = await getProductivityCache();
  const index = state.todos.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('任务不存在或尚未缓存');
  const changes = patch as Partial<TodoItem>;
  const doneChanged = typeof changes.done === 'boolean';
  const item = { ...state.todos[index], ...changes, updated_at: localTimestamp(), ...(doneChanged ? { completed_at: changes.done ? localTimestamp() : null } : {}) };
  state.todos[index] = item;
  state.cachedAt = localTimestamp();
  await saveProductivityCache(state);
  announceProductivity(state);
  void syncProductivity();
  return { item };
}

export async function deleteTodo(id: string) {
  const state = await getProductivityCache();
  state.todos = state.todos.filter((item) => item.id !== id);
  state.deleted.todos[id] = localTimestamp();
  state.cachedAt = localTimestamp();
  await saveProductivityCache(state);
  announceProductivity(state);
  void syncProductivity();
  return { ok: true };
}

export function getSchedule() {
  return cachedProductivity('schedule');
}

export async function createScheduleEvent(event: unknown) {
  const state = await getProductivityCache();
  const now = localTimestamp();
  const item = { id: localId('event'), done: false, created_at: now, completed_at: null, updated_at: now, ...(event as object) } as ScheduleEvent;
  state.schedule.push(item);
  state.cachedAt = now;
  await saveProductivityCache(state);
  announceProductivity(state);
  void syncProductivity();
  return { item };
}

export async function updateScheduleEvent(id: string, patch: unknown) {
  const state = await getProductivityCache();
  const index = state.schedule.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('日程不存在或尚未缓存');
  const changes = patch as Partial<ScheduleEvent>;
  const doneChanged = typeof changes.done === 'boolean';
  const item = { ...state.schedule[index], ...changes, updated_at: localTimestamp(), ...(doneChanged ? { completed_at: changes.done ? localTimestamp() : null } : {}) };
  state.schedule[index] = item;
  state.cachedAt = localTimestamp();
  await saveProductivityCache(state);
  announceProductivity(state);
  void syncProductivity();
  return { item };
}

export async function deleteScheduleEvent(id: string) {
  const state = await getProductivityCache();
  state.schedule = state.schedule.filter((item) => item.id !== id);
  state.deleted.schedule[id] = localTimestamp();
  state.cachedAt = localTimestamp();
  await saveProductivityCache(state);
  announceProductivity(state);
  void syncProductivity();
  return { ok: true };
}

let productivitySync: Promise<ProductivityCache> | null = null;

async function cachedProductivity(collection: 'todos' | 'schedule') {
  const cached = await getProductivityCache();
  if (cached.cachedAt) {
    void syncProductivity();
    return { items: cached[collection] };
  }
  const synced = await syncProductivity();
  return { items: synced[collection] };
}

function announceProductivity(state: ProductivityCache, synced = false) {
  window.dispatchEvent(new CustomEvent('firefly:productivity-cache', {
    detail: { todos: state.todos, schedule: state.schedule, synced },
  }));
}

export function syncProductivity(): Promise<ProductivityCache> {
  if (productivitySync) return productivitySync;
  productivitySync = (async () => {
    const local = await getProductivityCache();
    window.dispatchEvent(new CustomEvent('firefly:sync-status', { detail: 'syncing' }));
    try {
      const remote = await request<{ todos: TodoItem[]; schedule: ScheduleEvent[]; deleted: ProductivityCache['deleted'] }>('/sync/productivity', {
        method: 'POST',
        body: JSON.stringify({ todos: local.todos, schedule: local.schedule, deleted: local.deleted }),
      });
      const state: ProductivityCache = {
        todos: remote.todos,
        schedule: remote.schedule,
        deleted: remote.deleted,
        cachedAt: localTimestamp(),
      };
      await saveProductivityCache(state);
      announceProductivity(state, true);
      window.dispatchEvent(new CustomEvent('firefly:sync-status', { detail: 'synced' }));
      return state;
    } catch (error) {
      window.dispatchEvent(new CustomEvent('firefly:sync-status', { detail: 'offline' }));
      throw error;
    } finally {
      productivitySync = null;
    }
  })();
  productivitySync.catch(() => undefined);
  return productivitySync;
}

let edgeAISync: Promise<EdgeAILearningProgress> | null = null;

export function syncEdgeAI(): Promise<EdgeAILearningProgress> {
  if (edgeAISync) return edgeAISync;
  edgeAISync = (async () => {
    const snapshot = await getEdgeAICache();
    for (const [stageId, done] of Object.entries(snapshot.pending)) {
      await request(`/learning/edge-ai/${stageId}`, { method: 'PATCH', body: JSON.stringify({ done }) });
    }
    for (const [taskId, checked] of Object.entries(snapshot.pending_tasks)) {
      const stageId = taskId.match(/^stage-\d+/)?.[0];
      if (stageId) await request(`/learning/edge-ai/${stageId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ checked }) });
    }
    const remote = await request<EdgeAILearningProgress>('/learning/edge-ai');
    const latest = await getEdgeAICache();
    const pending = { ...latest.pending };
    const pendingTasks = { ...latest.pending_tasks };
    Object.keys(snapshot.pending).forEach((stageId) => delete pending[stageId]);
    Object.keys(snapshot.pending_tasks).forEach((taskId) => delete pendingTasks[taskId]);
    const completed = new Set(remote.completed);
    Object.entries(pending).forEach(([stageId, done]) => done ? completed.add(stageId) : completed.delete(stageId));
    const taskChecks: Record<string, string[]> = { ...remote.task_checks };
    Object.entries(pendingTasks).forEach(([taskId, checked]) => {
      const stageId = taskId.match(/^stage-\d+/)?.[0];
      if (!stageId) return;
      const checks = new Set(taskChecks[stageId] || []);
      checked ? checks.add(taskId) : checks.delete(taskId);
      taskChecks[stageId] = [...checks];
    });
    const state = { completed: [...completed], pending, task_checks: taskChecks, pending_tasks: pendingTasks, updated_at: remote.updated_at || localTimestamp() };
    await saveEdgeAICache(state);
    window.dispatchEvent(new CustomEvent('firefly:edge-ai-cache', { detail: state }));
    return { completed: state.completed, task_checks: state.task_checks, updated_at: state.updated_at };
  })().finally(() => { edgeAISync = null; });
  edgeAISync.catch(() => undefined);
  return edgeAISync;
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

export function updateMemory(id: string, memory: unknown) {
  return request(`/companion/memories/${id}`, { method: 'PATCH', body: JSON.stringify(memory) });
}

export function deleteMemory(id: string) {
  return request(`/companion/memories/${id}`, { method: 'DELETE' });
}

export function getLearningCandidates(status: 'pending' | 'confirmed' | 'rejected' | 'all' = 'pending', limit = 50) {
  return request(`/learning/candidates?status=${status}&limit=${limit}`);
}

export function createLearningFeedback(payload: { kind: 'remember' | 'too_long' | 'misunderstood'; content?: string }) {
  return request('/learning/feedback', { method: 'POST', body: JSON.stringify(payload) });
}

export function confirmLearningCandidate(id: string, payload: unknown) {
  return request(`/learning/candidates/${id}/confirm`, { method: 'POST', body: JSON.stringify(payload) });
}

export function rejectLearningCandidate(id: string) {
  return request(`/learning/candidates/${id}/reject`, { method: 'POST', body: '{}' });
}

export function getLearningPreferences() { return request('/learning/preferences'); }
export function updateLearningPreferences(enabled: boolean) {
  return request('/learning/preferences', { method: 'PATCH', body: JSON.stringify({ enabled }) });
}
export function getLearningWeeklySummary() { return request('/learning/weekly'); }

export function getDailyBrief(date: string, hour: number, minute: number) {
  const query = new URLSearchParams({ day: date, hour: String(hour), minute: String(minute) });
  return request(`/companion/today?${query.toString()}`);
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
