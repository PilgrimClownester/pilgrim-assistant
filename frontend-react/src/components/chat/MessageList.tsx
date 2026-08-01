import { useEffect, useRef } from 'react';
import type { Message } from '../../types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  onPrompt: (text: string) => void;
}

const prompts = ['帮我理清今天要做的事', '陪我聊聊现在的心情', '把一个想法变成计划'];

function MessageList({ messages, onPrompt }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="message-list">
      <div className="chat-day-divider"><span>今天</span></div>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {messages.length === 1 && (
        <section className="chat-starters" aria-label="对话建议">
          <span>可以从这里开始</span>
          <div>{prompts.map((prompt) => <button key={prompt} onClick={() => onPrompt(prompt)}>{prompt}<b>→</b></button>)}</div>
        </section>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
