import { useState } from 'react';
import { createLearningFeedback } from '../../api/client';
import type { Message } from '../../types';
import './ChatView.css';

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const [feedbackBusy, setFeedbackBusy] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');

  if (message.role === 'error') {
    return (
      <div className="message-row message-row--error">
        <div className="message-bubble message-bubble--error">
          ⚠️ {message.content}
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const canLearn = message.id !== 'greeting';

  const sendFeedback = async (kind: 'remember' | 'too_long' | 'misunderstood') => {
    if (feedbackBusy) return;
    setFeedbackBusy(kind);
    setFeedbackNote('');
    try {
      await createLearningFeedback({ kind, content: kind === 'remember' ? message.content : undefined });
      setFeedbackNote('已放进万能收件箱，等你确认');
      window.dispatchEvent(new CustomEvent('firefly:learning-updated'));
    } catch (error) {
      setFeedbackNote(error instanceof Error ? error.message : '暂时无法记录这次反馈');
    } finally {
      setFeedbackBusy(null);
    }
  };

  return (
    <div className={`message-row ${isUser ? 'message-row--user' : 'message-row--assistant'}`}>
      {!isUser && (
        <div className="message-avatar">
          <img src="./assets/firefly2.png" alt="Firefly" width={36} height={36} />
        </div>
      )}
      <div className="message-content">
        <div className="message-meta"><span>{isUser ? '你' : '流萤'}</span><time>{time}</time></div>
        <div className={`message-bubble ${isUser ? 'message-bubble--user' : 'message-bubble--assistant'}`}>
          {message.content}
        </div>
        {canLearn && <div className={`message-learning-actions${feedbackNote ? ' has-note' : ''}`}>
          {isUser
            ? <button type="button" disabled={Boolean(feedbackBusy)} onClick={() => sendFeedback('remember')}>◇ 记住</button>
            : <><button type="button" disabled={Boolean(feedbackBusy)} onClick={() => sendFeedback('too_long')}>简短些</button><button type="button" disabled={Boolean(feedbackBusy)} onClick={() => sendFeedback('misunderstood')}>理解错了</button></>}
          {feedbackNote && <span>{feedbackNote}</span>}
        </div>}
      </div>
      {isUser && (
        <div className="message-avatar message-avatar--user">
          <div className="avatar-placeholder">P</div>
        </div>
      )}
    </div>
  );
}

export default MessageBubble;
