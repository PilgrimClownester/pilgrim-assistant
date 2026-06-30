import { create } from 'zustand';
import type { Message } from '../types';
import { postChat } from '../api/client';

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
}

let nextId = 1;
function genId(): string {
  return `msg-${Date.now()}-${nextId++}`;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [
    {
      id: 'greeting',
      role: 'assistant',
      content: '我在，Pilgrim。\n\n今天想先处理什么？学习、项目、日程，还是只是想随便说几句，我都可以陪你。',
      timestamp: Date.now(),
    },
  ],
  isLoading: false,
  error: null,

  sendMessage: async (text: string) => {
    const userMsg: Message = {
      id: genId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isLoading: true,
      error: null,
    }));

    try {
      const data = await postChat(text);
      const assistantMsg: Message = {
        id: genId(),
        role: 'assistant',
        content: data.answer,
        timestamp: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isLoading: false,
      }));
    } catch (err) {
      const errorMsg: Message = {
        id: genId(),
        role: 'error',
        content: err instanceof Error ? err.message : '请求失败，请检查后端是否启动。',
        timestamp: Date.now(),
      };
      set((s) => ({
        messages: [...s.messages, errorMsg],
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  },

  clearMessages: () => {
    set({
      messages: [
        {
          id: 'greeting',
          role: 'assistant',
          content: '我在，Pilgrim。\n\n今天想先处理什么？学习、项目、日程，还是只是想随便说几句，我都可以陪你。',
          timestamp: Date.now(),
        },
      ],
      error: null,
    });
  },
}));
