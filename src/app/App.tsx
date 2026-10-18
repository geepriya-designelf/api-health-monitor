import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './AppShell';
import { ScopeProvider } from './ScopeContext';
import { TriageProvider } from './TriageContext';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ActivityPage } from '../features/activity/ActivityPage';
import { WebhooksPage } from '../features/webhooks/WebhooksPage';
import { AlertsPage } from '../features/alerts/AlertsPage';
import { IntegrationPage } from '../features/integration/IntegrationPage';

const TITLES: Record<string, string> = { '/': 'API Health Monitor', '/activity': 'API activity', '/webhooks': 'Webhooks', '/alerts': 'Alerts', '/integration': 'Integration' };

function Dashboard() {
  const { pathname } = useLocation();
  return (
    <AppShell title={TITLES[pathname] ?? 'API Health Monitor'}>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/webhooks" element={<WebhooksPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/integration" element={<IntegrationPage />} />
      </Routes>
    </AppShell>
  );
}

// HashRouter so the same build works from the dev server and as a single offline HTML file.
export function App() {
  return (
    <HashRouter>
      <ScopeProvider>
        <TriageProvider>
          <Routes>
            <Route path="/*" element={<Dashboard />} />
          </Routes>
        </TriageProvider>
      </ScopeProvider>
    </HashRouter>
  );
}
