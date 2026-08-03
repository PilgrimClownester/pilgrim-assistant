import { useEffect, useState } from 'react';
import MainLayout from './components/layout/MainLayout';
import Sidebar from './components/layout/Sidebar';
import RightPanel from './components/layout/RightPanel';
import ChatView from './components/chat/ChatView';
import TodoView from './components/todo/TodoView';
import ScheduleView from './components/schedule/ScheduleView';
import ToolsView from './components/tools/ToolsView';
import SettingsView from './components/settings/SettingsView';
import DesktopPet from './components/pet/DesktopPet';
import HomeDashboard from './components/home/HomeDashboard';
import EdgeAILearning from './components/home/EdgeAILearning';
import FocusOverlay from './components/focus/FocusOverlay';
import ReminderWatcher from './components/reminders/ReminderWatcher';
import GrowthView from './components/growth/GrowthView';
import CreativeView from './components/creative/CreativeView';
import TreeholeView from './components/treehole/TreeholeView';
import InboxView from './components/inbox/InboxView';
import ProjectsView from './components/projects/ProjectsView';
import WeeklyReviewView from './components/review/WeeklyReviewView';
import NetworkStatus from './components/shared/NetworkStatus';
import AmbientMusicPlayer from './components/music/AmbientMusicPlayer';
import type { PageId } from './types';
import './App.css';
import './styles/mobile.css';
import './styles/polish.css';

function App() {
  const isPetWindow = new URLSearchParams(window.location.search).get('pet') === '1' || window.location.hash === '#pet';
  const [activePage, setActivePage] = useState<PageId>('home');
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  useEffect(() => {
    // Electron 关闭窗口时实际是隐藏进程；显式归位也能纠正开发热更新保留的旧 chat 状态。
    setActivePage('home');
  }, []);

  if (isPetWindow) {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return (
      <div className="pet-window-root">
        <DesktopPet windowMode />
      </div>
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <HomeDashboard onNavigate={setActivePage} onStartFocus={setFocusTarget} />;
      case 'edge-ai':
        return <main className="edge-learning-page"><EdgeAILearning /></main>;
      case 'chat':
        return <ChatView />;
      case 'todo':
        return <TodoView onStartFocus={setFocusTarget} />;
      case 'schedule':
        return <ScheduleView onStartFocus={setFocusTarget} />;
      case 'inbox':
        return <InboxView />;
      case 'projects':
        return <ProjectsView onStartFocus={setFocusTarget} />;
      case 'review':
        return <WeeklyReviewView />;
      case 'growth':
        return <GrowthView />;
      case 'creative':
        return <CreativeView />;
      case 'treehole':
        return <TreeholeView />;
      case 'tools':
        return <ToolsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeDashboard onNavigate={setActivePage} onStartFocus={setFocusTarget} />;
    }
  };

  return (
    <div className="app-root">
      <MainLayout
        sidebar={<Sidebar activePage={activePage} onNavigate={setActivePage} />}
        rightPanel={['edge-ai', 'inbox', 'projects', 'review'].includes(activePage) ? null :
          <RightPanel
            mode={activePage === 'tools' ? 'fortune' : activePage === 'home' ? 'home' : 'productivity'}
            onOpenDaily={() => setActivePage('tools')}
          />
        }
      >
        <div className="page-container animate-fade-in" key={activePage}>
          {renderPage()}
        </div>
      </MainLayout>
      <AmbientMusicPlayer />
      <ReminderWatcher />
      <NetworkStatus />
      <FocusOverlay task={focusTarget} onClose={() => setFocusTarget(null)} />
    </div>
  );
}

export default App;
