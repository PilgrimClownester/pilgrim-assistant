import { useEffect, useState } from 'react';
import { getHealth, getLearningCandidates } from '../../api/client';
import type { PageId } from '../../types';
import AppIcon from '../shared/AppIcon';
import './Sidebar.css';

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

interface NavSection {
  title: string;
  items: { id: PageId; label: string }[];
}

const navSections: NavSection[] = [
  {
    title: '主功能',
    items: [
      { id: 'home', label: '今日首页' },
      { id: 'edge-ai', label: 'Edge AI Learning' },
      { id: 'chat', label: '对话' },
    ],
  },
  {
    title: '工作台',
    items: [
      { id: 'inbox', label: '万能收件箱' },
      { id: 'projects', label: '项目驾驶舱' },
      { id: 'todo', label: '任务清单' },
      { id: 'schedule', label: '日程安排' },
    ],
  },
  {
    title: '成长',
    items: [
      { id: 'review', label: '每周复盘' },
      { id: 'growth', label: '成长面板' },
      { id: 'treehole', label: '加密树洞' },
    ],
  },
  {
    title: '工具',
    items: [
      { id: 'creative', label: '创作工坊' },
      { id: 'tools', label: '运势参考' },
    ],
  },
  {
    title: '设置',
    items: [
      { id: 'settings', label: '设置' },
    ],
  },
];

function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [backendOnline, setBackendOnline] = useState(false);
  const [learningPending, setLearningPending] = useState(0);

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

  useEffect(() => {
    const checkLearning = () => getLearningCandidates('pending', 100)
      .then((result) => setLearningPending((result as { items: unknown[] }).items.length))
      .catch(() => undefined);
    const handleUpdate = () => { void checkLearning(); };
    void checkLearning();
    const interval = window.setInterval(checkLearning, 30000);
    window.addEventListener('firefly:learning-updated', handleUpdate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('firefly:learning-updated', handleUpdate);
    };
  }, []);

  const navigate = (page: PageId) => {
    onNavigate(page);
  };

  return (
    <aside className="sidebar">
      <button type="button" className="sidebar-brand" onClick={() => onNavigate('home')} aria-label="返回今日首页">
        <div className="sidebar-brand-avatar">
          <img src="./assets/firefly2.png" alt="Firefly" />
        </div>
        <div className="sidebar-brand-text">
          <h1 className="sidebar-title">Firefly</h1>
          <p className="sidebar-subtitle">你的本地智能搭档</p>
        </div>
      </button>

      <nav className="sidebar-nav">
        {navSections.map((section) => (
          <div key={section.title} className="nav-section">
            <span className="nav-section-title">{section.title}</span>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item nav-item--${item.id} ${activePage === item.id ? 'nav-item--active' : ''}`}
                onClick={() => navigate(item.id)}
                aria-current={activePage === item.id ? 'page' : undefined}
              >
                <span className="nav-item-icon"><AppIcon name={item.id} /></span>
                <span className="nav-item-label">{item.label}</span>
                {item.id === 'inbox' && learningPending > 0 && <span className="nav-pending-count" aria-label={`${learningPending} 条学习候选`}>{Math.min(learningPending, 99)}</span>}
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
