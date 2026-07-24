import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import '@lark-apaas/client-toolkit/runtime';

import { AppContainer } from '@lark-apaas/client-toolkit/components/AppContainer';
import { ErrorRender } from '@lark-apaas/client-toolkit/components/ErrorRender';

// Dev-only: inject default appId so the auth SDK can resolve the mock account endpoint
(window as any).appId = (window as any).appId || 'demo-app-local';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';

const CLIENT_BASE_PATH = process.env.CLIENT_BASE_PATH || '/';

const MainApp = () => {
  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      <AppContainer defaultTheme="light">
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => {
            console.error('[ErrorBoundary] caught error:', error);
            return (
              <ErrorRender
                error={error as Error}
                resetErrorBoundary={resetErrorBoundary}
              />
            );
          }}
        >
          <ThemeProvider>
            <RoutesComponent />
          </ThemeProvider>
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </AppContainer>
    </BrowserRouter>
  );
};

const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);
root.render(<MainApp />);
