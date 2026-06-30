import { useChatStore } from '../../store/chatStore';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatBackground from './ChatBackground';
import LoadingDots from '../shared/LoadingDots';

function ChatView() {
  const { messages, isLoading, sendMessage } = useChatStore();

  return (
    <div className="chat-view">
      <ChatBackground />
      <div className="chat-header">
        <span>💬 对话</span>
      </div>
      <MessageList messages={messages} />
      {isLoading && (
        <div className="chat-loading">
          <LoadingDots />
        </div>
      )}
      <ChatInput onSend={sendMessage} disabled={isLoading} />
    </div>
  );
}

export default ChatView;
