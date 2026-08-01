import type { Message } from '../../types';
import './ChatView.css';

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
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
