import { useState } from 'react';
import MainLayout from './components/layout/MainLayout';
import Sidebar from './components/layout/Sidebar';
import RightPanel from './components/layout/RightPanel';
import ChatView from './components/chat/ChatView';
import TodoView from './components/todo/TodoView';
import ScheduleView from './components/schedule/ScheduleView';
import ToolsView from './components/tools/ToolsView';
import SettingsView from './components/settings/SettingsView';
import DesktopPet from './components/pet/DesktopPet';
import './App.css';

type PageId = 'chat' | 'todo' | 'schedule' | 'tools' | 'settings';

function App() {
  const isPetWindow = new URLSearchParams(window.location.search).get('pet') === '1' || window.location.hash === '#pet';
  const [activePage, setActivePage] = useState<PageId>('chat');

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
      case 'chat':
        return <ChatView />;
      case 'todo':
        return <TodoView />;
      case 'schedule':
        return <ScheduleView />;
      case 'tools':
        return <ToolsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <ChatView />;
    }
  };

  return (
    <div className="app-root">
      <MainLayout
        sidebar={<Sidebar activePage={activePage} onNavigate={setActivePage} />}
        rightPanel={<RightPanel />}
      >
        <div className="page-container animate-fade-in" key={activePage}>
          {renderPage()}
        </div>
      </MainLayout>
    </div>
  );
}

export default App;
