import { useEffect, useState } from 'react';
import { getHealth } from '../../api/client';
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
                onClick={() => onNavigate(item.id)}
                aria-current={activePage === item.id ? 'page' : undefined}
              >
                <span className="nav-item-icon"><AppIcon name={item.id} /></span>
                <span className="nav-item-label">{item.label}</span>
                <span className="nav-item-mobile-label">{item.mobileLabel}</span>
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
