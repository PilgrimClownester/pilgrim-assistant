import { useEffect, useState } from 'react';
import { getNapcatStatus, startNapcat, stopNapcat } from '../../api/client';
import { useChatStore } from '../../store/chatStore';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ChatBackground from './ChatBackground';
import LoadingDots from '../shared/LoadingDots';

function ChatView() {
  const { messages, isLoading, isHydrating, hydrate, sendMessage, clearLocalChat } = useChatStore();
  const [qqEnabled, setQqEnabled] = useState(false);
  const [qqLoading, setQqLoading] = useState(true);
  const hasLocalChat = messages.some((message) => message.id !== 'greeting' && message.role !== 'error');

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    getNapcatStatus()
      .then((status) => setQqEnabled(status.enabled))
      .catch(() => {})
      .finally(() => setQqLoading(false));
  }, []);

  const toggleQqChat = async () => {
    setQqLoading(true);
    try {
      const status = qqEnabled ? await stopNapcat() : await startNapcat();
      setQqEnabled(status.enabled);
    } catch {
      // 详细配置提示在“设置 → QQ 对话”中展示，避免打断本地聊天。
    } finally {
      setQqLoading(false);
    }
  };

  const handleClearLocalChat = () => {
    if (!hasLocalChat || isLoading || isHydrating) return;
    if (window.confirm('只删除这台手机上的聊天缓存，不会删除云端记录。确定吗？')) clearLocalChat();
  };

  return (
    <div className="chat-view">
      <ChatBackground />
      <div className="chat-header">
        <div className="chat-mobile-identity">
          <span className="chat-mobile-avatar"><img src="./assets/firefly-wave.png" alt="" /></span>
          <div><strong>流萤</strong><span><i />在线陪你</span></div>
        </div>
        <div className="chat-header-copy">
          <span className="chat-header-eyebrow">FIREFLY COMPANION</span>
          <span className="chat-header-title"><span aria-hidden="true">✦</span> 对话</span>
        </div>
        <button
          type="button"
          onClick={toggleQqChat}
          disabled={qqLoading}
          className={`chat-qq-button${qqEnabled ? ' chat-qq-button--active' : ''}`}
        >
          <span className="chat-qq-label--desktop">{qqLoading ? 'QQ 连接中…' : qqEnabled ? 'QQ 对话：已开启' : '开启 QQ 对话'}</span>
          <span className="chat-qq-label--mobile">{qqLoading ? '连接中…' : qqEnabled ? 'QQ 已开启' : '连接 QQ'}</span>
        </button>
        <button
          type="button"
          onClick={handleClearLocalChat}
          disabled={!hasLocalChat || isLoading || isHydrating}
          className="chat-clear-local-button"
          aria-label="删除本地聊天"
          title="删除本地聊天"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8m-9 0h10M9 5v-1h6v1m-8 3 1 12h6l1-12M10 10v7m4-7v7" /></svg>
        </button>
      </div>
      <MessageList messages={messages} onPrompt={sendMessage} />
      {isLoading && (
        <div className="chat-loading">
          <LoadingDots />
        </div>
      )}
      <ChatInput onSend={sendMessage} disabled={isLoading || isHydrating} />
    </div>
  );
}

export default ChatView;
