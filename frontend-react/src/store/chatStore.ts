import { create } from 'zustand';
import type { ChatHistoryItem, Message } from '../types';
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

function buildChatHistory(messages: Message[]): ChatHistoryItem[] {
  return messages
    .filter((message) => message.id !== 'greeting' && (message.role === 'user' || message.role === 'assistant'))
    .slice(-16)
    .map((message) => ({
      role: message.role as ChatHistoryItem['role'],
      content: message.content,
    }));
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [
    {
      id: 'greeting',
      role: 'assistant',
      content: '我在，Pilgrim。\n\n你慢慢说，我听着。',
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
      const data = await postChat(text, buildChatHistory(get().messages));
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
          content: '我在，Pilgrim。\n\n你慢慢说，我听着。',
          timestamp: Date.now(),
        },
      ],
      error: null,
    });
  },
}));
