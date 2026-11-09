import { PageLoading } from '../common/PageLoading';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Layout administrativo do Rede Atende
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  Building,
  Calendar,
  BarChart3,
  Share2,
  X,
  GraduationCap,
  Wrench,
  Settings,
} from 'lucide-react';
import { Header } from '../common/Header';

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || [],
      );
    focusable()[0]?.focus();
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
      }
      if (event.key === 'Tab') {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      document.removeEventListener('keydown', handleKeys);
      previous?.focus();
    };
  }, [sidebarOpen]);

  const menuItems = [
    { to: '/admin', label: 'Resumo dos atendimentos', icon: LayoutDashboard, end: true },
    { to: '/admin/demandas', label: 'Demandas', icon: FileText, end: false },
    {
      to: '/admin/triagem',
      label: 'Triagem e encaminhamento',
      icon: CheckSquare,
      end: false,
    },
    {
      to: '/admin/unidades',
      label: 'Unidades Escolares',
      icon: Building,
      end: false,
    },
    {
      to: '/admin/ordens',
      label: 'Ordens de serviço',
      icon: Wrench,
      end: false,
    },
    {
      to: '/admin/prazos',
      label: 'Prazos e prioridades',
      icon: Settings,
      end: false,
    },
    {
      to: '/admin/agenda',
      label: 'Agenda e vistorias',
      icon: Calendar,
      end: false,
    },
    {
      to: '/admin/relatorios',
      label: 'Relatórios',
      icon: BarChart3,
      end: false,
    },
    {
      to: '/admin/integracoes',
      label: 'SEI simulado',
      icon: Share2,
      end: false,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      <Header
        mode="admin"
        onOpenAdminMenu={() => setSidebarOpen(true)}
        adminMenuOpen={sidebarOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Backdrop para mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar Administrativo (Azul-Marinho institucional SEDUC) */}
        <aside
          ref={sidebarRef}
          id="admin-navigation"
          role={sidebarOpen ? 'dialog' : undefined}
          aria-modal={sidebarOpen || undefined}
          aria-label="Módulos de gestão"
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex-col lg:static lg:flex ${
            sidebarOpen ? 'flex' : 'hidden'
          } border-r border-slate-800`}
        >
          {/* Topo do Sidebar */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-white leading-tight">Rede Atende</h2>
                <span className="text-xs text-slate-400">Educação · Itaíba–PE</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-slate-400 hover:text-white rounded"
              aria-label="Fechar menu lateral"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Lista de Navegação */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <div className="px-3 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Módulos de Gestão
            </div>
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-700 text-xs space-y-3">
            <p className="text-slate-300">Visão de gestão · dados no servidor</p>
            <Link to="/" className="block text-slate-200 underline">
              Ir para a Comunidade
            </Link>
          </div>
        </aside>

        {/* Área de Conteúdo Administrativo */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50">
          <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 lg:p-8">
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
};
