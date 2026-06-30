import { useEffect, useState } from 'react';
import { getHealth } from '../../api/client';
import './Sidebar.css';

type PageId = 'chat' | 'todo' | 'schedule' | 'tools' | 'settings';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

interface NavSection {
  title: string;
  items: { id: PageId; label: string; icon: string }[];
}

const navSections: NavSection[] = [
  {
    title: '主功能',
    items: [
      { id: 'chat', label: '对话', icon: '💬' },
    ],
  },
  {
    title: '效率',
    items: [
      { id: 'todo', label: 'TodoList', icon: '📋' },
      { id: 'schedule', label: '日程安排', icon: '📅' },
    ],
  },
  {
    title: '工具',
    items: [
      { id: 'tools', label: '八字插件', icon: '🔮' },
    ],
  },
  {
    title: '设置',
    items: [
      { id: 'settings', label: '设置', icon: '⭐' },
    ],
  },
];

function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await getHealth();
        setBackendOnline(res?.status === 'ok');
      } catch {
        setBackendOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-avatar">
          <img src="/assets/firefly2.png" alt="Firefly" />
        </div>
        <div className="sidebar-brand-text">
          <h1 className="sidebar-title">Firefly</h1>
          <p className="sidebar-subtitle">Pilgrim 的个人搭档</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.title} className="nav-section">
            <span className="nav-section-title">{section.title}</span>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activePage === item.id ? 'nav-item--active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                <span className="nav-item-icon">{item.icon}</span>
                <span className="nav-item-label">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className={`status-dot ${backendOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
        <span className="status-text">
          {backendOnline ? '已连接' : '未连接'}
        </span>
      </div>
    </aside>
  );
}

export default Sidebar;
