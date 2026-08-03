import type { Message, ScheduleEvent, TodoItem } from '../types';

const DB_NAME = 'firefly-offline';
const STORE_NAME = 'state';
const DB_VERSION = 1;
const CHAT_LOCAL_CLEAR_MARKER = 'firefly:chat-local-cleared';

export interface ProductivityCache {
  todos: TodoItem[];
  schedule: ScheduleEvent[];
  deleted: { todos: Record<string, string>; schedule: Record<string, string> };
  cachedAt: string | null;
}

export interface EdgeAICache {
  completed: string[];
  pending: Record<string, boolean>;
  task_checks: Record<string, string[]>;
  pending_tasks: Record<string, boolean>;
  updated_at: string | null;
}

export interface ChatCache {
  messages: Message[];
  cachedAt: string | null;
  clearedLocally: boolean;
}

const emptyProductivity = (): ProductivityCache => ({
  todos: [], schedule: [], deleted: { todos: {}, schedule: {} }, cachedAt: null,
});

const emptyChat = (): ChatCache => ({ messages: [], cachedAt: null, clearedLocally: false });

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readOfflineValue<T>(key: string): Promise<T | null> {
  if (!('indexedDB' in window)) return null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function writeOfflineValue<T>(key: string, value: T): Promise<void> {
  if (!('indexedDB' in window)) return;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function getProductivityCache(): Promise<ProductivityCache> {
  const cached = await readOfflineValue<ProductivityCache>('productivity');
  return cached || emptyProductivity();
}

export async function saveProductivityCache(state: ProductivityCache): Promise<void> {
  await writeOfflineValue('productivity', state);
}

export async function getChatCache(): Promise<ChatCache> {
  const cached = await readOfflineValue<Partial<ChatCache>>('chat');
  return {
    messages: Array.isArray(cached?.messages) ? cached.messages : emptyChat().messages,
    cachedAt: cached?.cachedAt || null,
    clearedLocally: cached?.clearedLocally === true || isChatLocallyCleared(),
  };
}

export async function saveChatCache(state: ChatCache): Promise<void> {
  await writeOfflineValue('chat', state);
}

export function isChatLocallyCleared(): boolean {
  try {
    return window.localStorage.getItem(CHAT_LOCAL_CLEAR_MARKER) === '1';
  } catch {
    return false;
  }
}

export function markChatLocallyCleared(): void {
  try {
    window.localStorage.setItem(CHAT_LOCAL_CLEAR_MARKER, '1');
  } catch {
    // IndexedDB 仍会保存删除标记；某些隐私模式会禁用 localStorage。
  }
}

export async function getEdgeAICache(): Promise<EdgeAICache> {
  const cached = await readOfflineValue<Partial<EdgeAICache>>('edge-ai');
  return {
    completed: cached?.completed || [],
    pending: cached?.pending || {},
    task_checks: cached?.task_checks || {},
    pending_tasks: cached?.pending_tasks || {},
    updated_at: cached?.updated_at || null,
  };
}

export async function saveEdgeAICache(state: EdgeAICache): Promise<void> {
  await writeOfflineValue('edge-ai', state);
}

export function localTimestamp(): string {
  return new Date().toISOString();
}

export function localId(prefix: string): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}
