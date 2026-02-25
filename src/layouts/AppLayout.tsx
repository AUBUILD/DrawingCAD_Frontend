import React from 'react';

interface AppLayoutProps {
  header: React.ReactNode;
  left: React.ReactNode;
  right: React.ReactNode;
  statusBar: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  header,
  left,
  right,
  statusBar,
}) => {
  return (
    <div className="layout">
      {header}
      <main className="content">
        <div className="mainGrid">
          {left}
          {right}
        </div>
      </main>
      {statusBar}
    </div>
  );
};
