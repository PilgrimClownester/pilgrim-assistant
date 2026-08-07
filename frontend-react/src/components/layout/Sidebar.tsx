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
  items: { id: PageId; label: string; mobileLabel: string }[];
}

const navSections: NavSection[] = [
  {
    title: '主功能',
    items: [
      { id: 'home', label: '今日首页', mobileLabel: '首页' },
      { id: 'edge-ai', label: 'Edge AI Learning', mobileLabel: '学习' },
      { id: 'chat', label: '对话', mobileLabel: '对话' },
    ],
  },
  {
    title: '工作台',
    items: [
      { id: 'inbox', label: '万能收件箱', mobileLabel: '收件箱' },
      { id: 'projects', label: '项目驾驶舱', mobileLabel: '项目' },
      { id: 'todo', label: '任务清单', mobileLabel: '待办' },
      { id: 'schedule', label: '日程安排', mobileLabel: '日程' },
    ],
  },
  {
    title: '成长',
    items: [
      { id: 'review', label: '每周复盘', mobileLabel: '复盘' },
      { id: 'growth', label: '成长面板', mobileLabel: '成长' },
      { id: 'treehole', label: '加密树洞', mobileLabel: '树洞' },
    ],
  },
  {
    title: '工具',
    items: [
      { id: 'creative', label: '创作工坊', mobileLabel: '创作' },
      { id: 'tools', label: '运势参考', mobileLabel: '占卜' },
    ],
  },
  {
    title: '设置',
    items: [
      { id: 'settings', label: '设置', mobileLabel: '设置' },
    ],
  },
];

// The phone dock is intentionally small. Less-used tools stay one tap away in
// the More sheet instead of competing for every pixel at the bottom of the
// screen.
const mobilePrimaryItems: NavSection['items'] = [
  navSections[0].items[0],
  navSections[0].items[1],
  navSections[0].items[2],
  navSections[1].items[2],
  navSections[1].items[3],
];

const mobileMoreItems: NavSection['items'] = [
  navSections[1].items[0],
  navSections[1].items[1],
  navSections[2].items[0],
  navSections[2].items[1],
  navSections[2].items[2],
  navSections[3].items[0],
  navSections[3].items[1],
  navSections[4].items[0],
];

function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const [backendOnline, setBackendOnline] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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
    setMobileMoreOpen(false);
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

      <nav className="sidebar-nav sidebar-nav--desktop">
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
                <span className="nav-item-mobile-label">{item.mobileLabel}</span>
                {item.id === 'inbox' && learningPending > 0 && <span className="nav-pending-count" aria-label={`${learningPending} 条学习候选`}>{Math.min(learningPending, 99)}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <nav className="sidebar-nav--mobile" aria-label="主要页面">
        {mobilePrimaryItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item nav-item--${item.id} ${activePage === item.id ? 'nav-item--active' : ''}`}
            onClick={() => navigate(item.id)}
            aria-current={activePage === item.id ? 'page' : undefined}
          >
            <span className="nav-item-icon"><AppIcon name={item.id} /></span>
            <span className="nav-item-mobile-label">{item.mobileLabel}</span>
          </button>
        ))}
        <button
          type="button"
          className={`nav-item nav-item--more ${mobileMoreItems.some((item) => item.id === activePage) ? 'nav-item--active' : ''}`}
          onClick={() => setMobileMoreOpen((open) => !open)}
          aria-expanded={mobileMoreOpen}
          aria-label="打开更多页面"
        >
          <span className="nav-item-icon"><span className="nav-more-dots" aria-hidden="true"><i /><i /><i /></span></span>
          <span className="nav-item-mobile-label">更多</span>
          {learningPending > 0 && <span className="nav-pending-dot" aria-label={`${learningPending} 条学习候选`} />}
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="mobile-more-layer" role="dialog" aria-label="更多页面" onClick={() => setMobileMoreOpen(false)}>
          <div className="mobile-more-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-more-head"><strong>更多</strong><button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="关闭">×</button></div>
            <div className="mobile-more-grid">
              {mobileMoreItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mobile-more-item ${activePage === item.id ? 'is-active' : ''}`}
                  onClick={() => navigate(item.id)}
                >
                  <span className="nav-item-icon"><AppIcon name={item.id} /></span>
                  <span>{item.mobileLabel}</span>
                  {item.id === 'inbox' && learningPending > 0 && <span className="mobile-more-count">{Math.min(learningPending, 99)}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

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
