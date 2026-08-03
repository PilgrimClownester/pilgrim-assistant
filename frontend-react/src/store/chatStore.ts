import { create } from 'zustand';
import { getChatHistory, postChat } from '../api/client';
import { getChatCache, localTimestamp, saveChatCache } from '../api/offlineStore';
import type { ChatHistoryItem, Message } from '../types';

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  isHydrating: boolean;
  hydrated: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
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
    content: '我在，Pilgrim。\n\n你慢慢说，我听着。',
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

async function cacheMessages(messages: Message[]): Promise<void> {
  try {
    await saveChatCache({
      // 错误提示只属于当前设备，不上传；下一次联网时以云端交换记录为准。
      messages: messages.filter((message) => message.role !== 'error'),
      cachedAt: localTimestamp(),
    });
  } catch {
    // IndexedDB 不可用时，云端历史仍然可以正常工作。
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [greeting()],
  isLoading: false,
  isHydrating: false,
  hydrated: false,
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
        if (cachedMessages.length) set({ messages: withGreeting(cachedMessages) });
      } catch {
        // 没有本地缓存时继续尝试云端。
      }

      try {
        const remote = await getChatHistory(500);
        const messages = cloudMessages(remote.items);
        if (messages.length) {
          const restored = withGreeting(messages);
          set({ messages: restored });
          await cacheMessages(restored);
        } else if (!cachedMessages.length) {
          set({ messages: [greeting()] });
        }
      } catch {
        // 断网时保留 IndexedDB 中的最近对话；联网后下一次进入会继续拉取云端。
      } finally {
        set({ isHydrating: false, hydrated: true });
      }
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
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: messageText,
      timestamp: Date.now(),
    };
    const withUserMessage = [...previousMessages, userMsg];

    set({ messages: withUserMessage, isLoading: true, error: null });
    void cacheMessages(withUserMessage);

    try {
      // 当前消息不重复放进 history；后端会把它作为最后一条 user message 添加。
      const data = await postChat(messageText, buildChatHistory(previousMessages));
      const assistantMsg: Message = {
        id: genId(),
        role: 'assistant',
        content: data.answer,
        timestamp: Date.now(),
      };
      const nextMessages = [...get().messages, assistantMsg];
      set({ messages: nextMessages, isLoading: false });
      void cacheMessages(nextMessages);
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
      void cacheMessages(get().messages);
    }
  },

  clearMessages: () => {
    const next = [greeting()];
    set({ messages: next, error: null });
    void cacheMessages(next);
  },
}));
