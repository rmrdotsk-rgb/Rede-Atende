/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - demonstração acadêmica de atendimento educacional
 * Disciplina: Front-End Frameworks (Prof. Rafael Pacheco Ferreira)
 * Instituição: UNINASSAU
 * Integrante: José Emerson Alves Saturno Barboza
 */

import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  createRoutesFromElements,
  RouterProvider,
  Outlet,
  Route,
} from 'react-router-dom';
import { CommunityLayout } from './components/layout/CommunityLayout';
import { AdminLayout } from './components/layout/AdminLayout';

const AdminWorkOrders = lazy(() =>
  import('./pages/admin/AdminWorkOrders').then((m) => ({
    default: m.AdminWorkOrders,
  })),
);
const AdminDeadlines = lazy(() =>
  import('./pages/admin/AdminDeadlines').then((m) => ({
    default: m.AdminDeadlines,
  })),
);

// Páginas da Comunidade
import { CommunityHome } from './pages/community/CommunityHome';
const NewRequest = lazy(() =>
  import('./pages/community/NewRequest').then((m) => ({ default: m.NewRequest })),
);
const TrackRequest = lazy(() =>
  import('./pages/community/TrackRequest').then((m) => ({ default: m.TrackRequest })),
);

// Páginas do Painel Administrativo SEDUC
const AdminDashboard = lazy(() =>
  import('./pages/admin/AdminDashboard').then((module) => ({
    default: module.AdminDashboard,
  })),
);
const AdminDemands = lazy(() =>
  import('./pages/admin/AdminDemands').then((module) => ({
    default: module.AdminDemands,
  })),
);
const AdminTriage = lazy(() =>
  import('./pages/admin/AdminTriage').then((module) => ({
    default: module.AdminTriage,
  })),
);
const AdminSchools = lazy(() =>
  import('./pages/admin/AdminSchools').then((module) => ({
    default: module.AdminSchools,
  })),
);
const AdminAgenda = lazy(() =>
  import('./pages/admin/AdminAgenda').then((module) => ({
    default: module.AdminAgenda,
  })),
);
const AdminReports = lazy(() =>
  import('./pages/admin/AdminReports').then((module) => ({
    default: module.AdminReports,
  })),
);
const AdminSeiIntegration = lazy(() =>
  import('./pages/admin/AdminSeiIntegration').then((module) => ({
    default: module.AdminSeiIntegration,
  })),
);

import { RouteScroll } from './components/common/RouteScroll';
import { WorkspaceBoundary } from './components/common/WorkspaceBoundary';
import { RequireAccess } from './components/common/RequireAccess';
import { Login } from './pages/community/Login';
import { InformationItaiba } from './pages/community/InformationItaiba';
import { NotFound } from './pages/community/NotFound';
import { NavigationGuardProvider } from './components/common/NavigationGuard';
import { RouteMetadata } from './components/common/RouteMetadata';

function ApplicationShell() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-slate-700">
          Carregando módulo...
        </p>
      }
    >
      <RouteScroll />
      <RouteMetadata />
      <NavigationGuardProvider>
        <WorkspaceBoundary>
          <Outlet />
        </WorkspaceBoundary>
      </NavigationGuardProvider>
    </Suspense>
  );
}
const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      element={<ApplicationShell />}
      errorElement={
        <main className="max-w-xl mx-auto p-6 space-y-4">
          <h1 className="text-xl font-bold">Não foi possível exibir esta página</h1>
          <p>Recarregue a página para tentar novamente.</p>
          <a href="/" className="action">
            Voltar ao início
          </a>
        </main>
      }
    >
      {/* Área da Comunidade Escolar (Pais, Alunos, Professores) */}
      <Route path="/" element={<CommunityLayout />}>
        <Route index element={<CommunityHome />} />
        <Route
          path="solicitar"
          element={
            <RequireAccess citizen>
              <NewRequest />
            </RequireAccess>
          }
        />
        <Route path="entrar" element={<Login />} />
        <Route path="informacoes" element={<InformationItaiba />} />
        <Route
          path="acompanhar"
          element={
            <RequireAccess>
              <TrackRequest />
            </RequireAccess>
          }
        />
      </Route>

      {/* Painel Administrativo da Secretaria Municipal de Educação (SEDUC) */}
      <Route
        path="/admin"
        element={
          <RequireAccess admin>
            <AdminLayout />
          </RequireAccess>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="demandas" element={<AdminDemands />} />
        <Route path="triagem" element={<AdminTriage />} />
        <Route path="unidades" element={<AdminSchools />} />
        <Route path="ordens" element={<AdminWorkOrders />} />
        <Route path="prazos" element={<AdminDeadlines />} />
        <Route path="agenda" element={<AdminAgenda />} />
        <Route path="relatorios" element={<AdminReports />} />
        <Route path="integracoes" element={<AdminSeiIntegration />} />
      </Route>

      {/* Redirecionamento de rotas desconhecidas */}
      <Route path="*" element={<NotFound />} />
    </Route>,
  ),
);
export default function App() {
  return <RouterProvider router={router} />;
}
