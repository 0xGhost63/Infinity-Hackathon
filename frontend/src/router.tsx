import { createBrowserRouter } from 'react-router-dom';
import { PublicOnlyRoute, RequireAuth, RequireRole } from '@/auth/guards';
import { RouteErrorView } from '@/components/feedback/StatusViews';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { TeamPage } from '@/pages/TeamPage';
import { TranscriptPage } from '@/pages/TranscriptPage';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      errorElement: <RouteErrorView />,
      children: [
        {
          path: 'login',
          element: (
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          ),
        },
        {
          element: <RequireAuth />,
          children: [
            {
              element: <AppShell />,
              children: [
                { index: true, element: <HomePage /> },
                { path: 'projects', element: <ProjectsPage /> },
                { path: 'projects/:projectId', element: <ProjectDetailPage /> },
                { path: 'team', element: <TeamPage /> },
                {
                  element: (
                    <RequireRole
                      roles={['ADMIN']}
                      title="Only the administrator can create projects"
                      description="Converting a meeting transcript is limited to the administrator account. Your own projects and tasks are on your home page."
                    />
                  ),
                  children: [{ path: 'transcript', element: <TranscriptPage /> }],
                },
                { path: '*', element: <NotFoundPage /> },
              ],
            },
          ],
        },
      ],
    },
  ],
  {
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
);
