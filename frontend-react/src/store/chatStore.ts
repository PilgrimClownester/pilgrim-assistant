import { create } from 'zustand';
import { getChatHistory, postChat } from '../api/client';
import { getChatCache, localTimestamp, markChatLocallyCleared, saveChatCache } from '../api/offlineStore';
import type { ChatHistoryItem, Message } from '../types';

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  isHydrating: boolean;
  hydrated: boolean;
  localChatCleared: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  clearLocalChat: () => void;
}

let nextId = 1;
let hydrationPromise: Promise<void> | null = null;

function genId(): string {
  return `msg-${Date.now()}-${nextId++}`;
}

function greeting(): Message {
  return {
    id: 'greeting',
    role: 'assistant',
    content: '我在。\n\n你慢慢说，我听着。',
    timestamp: Date.now(),
  };
}

function withGreeting(messages: Message[]): Message[] {
  return [greeting(), ...messages.filter((message) => message.id !== 'greeting')];
}

function buildChatHistory(messages: Message[]): ChatHistoryItem[] {
  return messages
    .filter((message) => message.id !== 'greeting' && (message.role === 'user' || message.role === 'assistant'))
    .slice(-16)
    .map((message) => ({
      role: message.role as ChatHistoryItem['role'],
      content: message.content,
    }));
}

function cleanCachedMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return [];
  return value.filter((message): message is Message => (
    !!message
    && typeof message === 'object'
    && typeof (message as Message).id === 'string'
    && ['user', 'assistant', 'error'].includes((message as Message).role)
    && typeof (message as Message).content === 'string'
    && typeof (message as Message).timestamp === 'number'
  ));
}

function cloudMessages(items: Awaited<ReturnType<typeof getChatHistory>>['items']): Message[] {
  return items
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && item.content?.trim())
    .map((item, index) => {
      const parsed = Date.parse(item.created_at);
      return {
        id: item.id || `cloud-${index}`,
        role: item.role,
        content: item.content,
        timestamp: Number.isFinite(parsed) ? parsed : Date.now(),
      };
    });
}

let cacheWriteQueue = Promise.resolve();
let cacheWriteGeneration = 0;

function cacheMessages(messages: Message[], clearedLocally = false): Promise<void> {
  const generation = ++cacheWriteGeneration;
  cacheWriteQueue = cacheWriteQueue.then(async () => {
    // 清空操作优先级最高，避免较早的异步缓存写入把删除标记覆盖掉。
    if (generation !== cacheWriteGeneration) return;
    try {
      await saveChatCache({
        // 错误提示只属于当前渲染会话，不写入后端归档。
        messages: messages.filter((message) => message.role !== 'error'),
        cachedAt: localTimestamp(),
        clearedLocally,
      });
    } catch {
      // IndexedDB 不可用时，本地后端归档仍然可以正常工作。
    }
  });
  return cacheWriteQueue;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [greeting()],
  isLoading: false,
  isHydrating: false,
  hydrated: false,
  localChatCleared: false,
  error: null,

  hydrate: () => {
    if (get().hydrated) return Promise.resolve();
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
      set({ isHydrating: true });
      let cachedMessages: Message[] = [];

      try {
        const cached = await getChatCache();
        cachedMessages = cleanCachedMessages(cached.messages);
        set({ localChatCleared: cached.clearedLocally });
        if (cachedMessages.length) set({ messages: withGreeting(cachedMessages) });
      } catch {
        // 没有渲染层缓存时继续尝试从本地后端恢复。
      }

      if (!get().localChatCleared) {
        try {
          const remote = await getChatHistory(500);
          const messages = cloudMessages(remote.items);
          if (messages.length) {
            const restored = withGreeting(messages);
            set({ messages: restored });
            await cacheMessages(restored, false);
          } else if (!cachedMessages.length) {
            set({ messages: [greeting()] });
          }
        } catch {
          // 本地后端暂时不可用时，保留 IndexedDB 中的最近对话。
        }
      } else if (!cachedMessages.length) {
        set({ messages: [greeting()] });
      }
      set({ isHydrating: false, hydrated: true });
    })().finally(() => {
      hydrationPromise = null;
    });

    return hydrationPromise;
  },

  sendMessage: async (text: string) => {
    const messageText = text.trim();
    if (!messageText) return;
    await get().hydrate();

    const previousMessages = get().messages;
    const localChatCleared = get().localChatCleared;
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };
    const withUserMessage = [...previousMessages, userMsg];

    set({ messages: withUserMessage, isLoading: true, error: null });
    void cacheMessages(withUserMessage, localChatCleared);

    try {
      // 当前消息不重复放进 history；后端会把它作为最后一条 user message 添加。
      const data = await postChat(messageText, buildChatHistory(previousMessages), !localChatCleared);
      const assistantMsg: Message = {
        id: genId(),
        role: 'assistant',
        content: data.answer,
        timestamp: Date.now(),
      };
      const nextMessages = [...get().messages, assistantMsg];
      set({ messages: nextMessages, isLoading: false });
      void cacheMessages(nextMessages, localChatCleared);
      // The backend may have created a review-only learning candidate from the
      // user's explicit wording. Refresh the inbox badge without assuming it did.
      window.dispatchEvent(new CustomEvent('firefly:learning-updated'));
    } catch (err) {
      const errorMsg: Message = {
        id: genId(),
        role: 'error',
        content: err instanceof Error ? err.message : '请求失败，请检查后端是否启动。',
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
      void cacheMessages(get().messages, localChatCleared);
    }
  },

  clearMessages: () => {
    const next = [greeting()];
    set({ messages: next, error: null });
    void cacheMessages(next, get().localChatCleared);
  },

  clearLocalChat: () => {
    const next = [greeting()];
    markChatLocallyCleared();
    set({ messages: next, error: null, localChatCleared: true });
    // 只清除 Electron 渲染层缓存；后端归档保持不变，且不再自动加载旧记录。
    void cacheMessages(next, true);
  },
}));
