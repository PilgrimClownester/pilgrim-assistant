import { ReactNode } from 'react';

interface MainLayoutProps {
  sidebar: ReactNode;
  rightPanel: ReactNode;
  children: ReactNode;
}

function MainLayout({ sidebar, rightPanel, children }: MainLayoutProps) {
  return (
    <div className="main-layout">
      {sidebar}
      <div className="content-area">
        {children}
      </div>
      {rightPanel}
    </div>
  );
}

export default MainLayout;
