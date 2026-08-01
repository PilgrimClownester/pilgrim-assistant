import { useState, useRef, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const updateText = (value: string) => {
    setText(value);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 112)}px`;
    });
  };

  return (
    <div className="chat-input-bar">
      <div className="chat-input-wrapper">
        <span className="chat-input-spark" aria-hidden="true">✦</span>
        <textarea
          ref={inputRef}
          className="chat-input"
          value={text}
          onChange={(e) => updateText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="和流萤说点什么…"
          rows={1}
          disabled={disabled}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
        >
          <span className="chat-send-label">发送</span><span className="chat-send-icon" aria-hidden="true">↑</span>
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
