/** @license SPDX-License-Identifier: Apache-2.0 */
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Settings2 } from 'lucide-react';
import { SessionControl } from './SessionControl';
import { NotificationPanel } from './NotificationPanel';
import { AccessibilityToolbar } from './AccessibilityToolbar';
import { InstitutionalMark } from './InstitutionalMark';
import { storageService } from '../../services/storage';
export function Header({
  mode,
  onOpenAdminMenu,
  adminMenuOpen = false,
}: {
  mode: 'community' | 'admin';
  onOpenAdminMenu?: () => void;
  adminMenuOpen?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [optionsOpen, setOptionsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null),
    optionsButton = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null),
    optionsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const location = useLocation(),
    community = mode === 'community';
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      document.documentElement.style.setProperty(
        '--app-header-height',
        `${Math.ceil(header.getBoundingClientRect().height)}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--app-header-height');
    };
  }, []);
  useEffect(() => {
    setOpen(false);
    setOptionsOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!open && !optionsOpen) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.notification-panel')) return;
      if (optionsOpen) {
        setOptionsOpen(false);
        optionsButton.current?.focus();
      }
      if (open) {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (optionsOpen && !optionsRef.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    const wide = window.matchMedia('(min-width: 1024px)');
    const closeWide = () => {
      if (wide.matches) {
        setOpen(false);
        setOptionsOpen(false);
      }
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside);
    wide.addEventListener('change', closeWide);
    if (open) navRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside);
      wide.removeEventListener('change', closeWide);
    };
  }, [open, optionsOpen]);
  const links = (
    <>
      <NavLink to="/" end>
        Início
      </NavLink>
      <NavLink to="/solicitar">Nova solicitação</NavLink>
      <NavLink to="/acompanhar">Meus protocolos</NavLink>
      <NavLink to="/informacoes">Como funciona</NavLink>
    </>
  );
  return (
    <header
      ref={headerRef}
      className="app-header sticky top-0 z-40 bg-white border-b border-slate-200"
    >
      <p className="bg-blue-950 text-white text-center text-xs py-1 px-3">
        Protótipo acadêmico · sem vínculo com a Prefeitura
      </p>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Pular para o conteúdo
      </a>
      <div className="header-content max-w-screen-2xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-2">
        <Link
          to="/"
          aria-label="Rede Atende — início"
          className="header-brand flex items-center mr-auto text-slate-900 font-extrabold"
        >
          <InstitutionalMark compact />
        </Link>
        {community && (
          <nav
            aria-label="Navegação principal"
            className="primary-nav hidden lg:flex items-center gap-1"
          >
            {links}
          </nav>
        )}
        <div className="header-session">
          <SessionControl />
        </div>
        <div ref={optionsRef} className="header-options-container">
          <button
            ref={optionsButton}
            type="button"
            aria-label="Abrir opções de acessibilidade e notificações"
            aria-expanded={optionsOpen}
            aria-controls="header-options"
            className="lg:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-slate-300"
            onClick={() => {
              setOptionsOpen((v) => !v);
              setOpen(false);
            }}
          >
            <Settings2 className="w-5 h-5" />
          </button>
          <div id="header-options" className={'header-tools ' + (optionsOpen ? 'is-open' : '')}>
            <p className="w-full lg:hidden text-sm font-semibold text-slate-800">
              Opções de acesso
            </p>
            {storageService.user && (
              <NotificationPanel audience={community ? 'comunidade' : 'gestao'} />
            )}
            <AccessibilityToolbar />
            {(!community || storageService.user?.role !== 'cidadao') && (
              <Link
                to={community ? '/admin' : '/'}
                aria-label={community ? 'Área restrita da equipe' : 'Visão da comunidade'}
                className="min-h-11 inline-flex items-center border border-blue-200 rounded-lg bg-blue-50 text-blue-800 px-3 text-xs font-semibold"
              >
                {community ? 'Gestão' : 'Comunidade'}
              </Link>
            )}
          </div>
        </div>
        <button
          ref={toggleRef}
          type="button"
          onClick={(event) => {
            event.currentTarget.focus();
            setOptionsOpen(false);
            if (community) setOpen((v) => !v);
            else onOpenAdminMenu?.();
          }}
          aria-label={
            community
              ? open
                ? 'Fechar menu de navegação'
                : 'Abrir menu de navegação'
              : 'Abrir menu lateral'
          }
          aria-expanded={community ? open : adminMenuOpen}
          aria-controls={community ? 'mobile-navigation' : 'admin-navigation'}
          className="header-menu lg:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border border-slate-300"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <nav
          ref={navRef}
          id="mobile-navigation"
          aria-label="Navegação da comunidade"
          className="primary-nav flex flex-col lg:hidden px-4 pb-3"
        >
          {links}
        </nav>
      )}
    </header>
  );
}
