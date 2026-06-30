const API_BASE = import.meta.env.VITE_FIREFLY_API_BASE || 'http://127.0.0.1:8000';

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

export function getProfile() {
  return request('/profile');
}

export function saveProfile(profile: unknown) {
  return request('/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
}

export function postChat(message: string) {
  return request<{ type: string; message: string; answer: string }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
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

export function getDailyFortune() {
  return request('/fortune/daily');
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
