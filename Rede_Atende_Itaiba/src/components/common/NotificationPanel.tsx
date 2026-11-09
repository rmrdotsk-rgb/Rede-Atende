import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { storageService } from '../../services/storage';
import { formatDatePtBr } from '../../utils/helpers';
export function NotificationPanel({
  audience,
  requestId,
}: {
  audience: 'comunidade' | 'gestao';
  requestId?: string;
}) {
  const [items, setItems] = useState(() => storageService.getNotifications(audience, requestId));
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => setItems(storageService.getNotifications(audience, requestId));
    load();
    return storageService.subscribe(load);
  }, [audience, requestId]);
  const unread = requestId
    ? items.filter((n) => !n.readAt).length
    : storageService.getUnreadCount();
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        aria-label={`Notificações: ${unread} não lidas (demonstração)`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative rounded-lg border border-slate-300 p-2 text-slate-700"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-blue-700 text-white text-xs px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          aria-label="Notificações internas"

          className="notification-panel absolute top-full mt-3 right-0 w-80 max-h-96 overflow-y-auto bg-white rounded-xl border border-slate-300 p-4 shadow-xl z-50"
        >
          <h2 className="text-sm font-bold mb-3">Atualizações da demonstração</h2>
          <p className="text-xs text-slate-600 mb-3">Eventos fictícios registrados nesta conta.</p>
          {error && <p role="alert">{error}</p>}
          {items.length === 0 && (
            <p className="text-xs text-slate-600">Nenhuma notificação por enquanto.</p>
          )}
          {items.slice(0, 30).map((n) => {
            const request =
              storageService.getRequestById(n.requestId) ??
              (n.protocol ? { id: n.requestId, protocol: n.protocol } : undefined);
            return (
              <div
                key={n.id}
                className={`py-3 border-t border-slate-200 text-xs ${n.readAt ? 'text-slate-600' : 'text-slate-900'}`}
              >
                <p>
                  {audience === 'gestao'
                    ? n.message
                    : 'Houve uma atualização neste protocolo de demonstração. Consulte o andamento.'}
                </p>
                <p className="text-xs mt-1">{formatDatePtBr(n.createdAt)}</p>
                <div className="flex flex-wrap gap-3 mt-2">
                  {request && (
                    <Link
                      className="text-blue-800 underline"
                      to={
                        audience === 'gestao'
                          ? `/admin/triagem?demandaId=${request.id}`
                          : `/acompanhar?protocolo=${request.protocol}`
                      }
                      onClick={() => setOpen(false)}
                    >
                      {request.protocol}
                    </Link>
                  )}
                  {!n.readAt && (
                    <button
                      className="text-blue-800 underline"
                      onClick={async () => {
                        try {
                          await storageService.markNotificationRead(n.id);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Marcar como lida
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className="mt-3 text-xs underline"
          >
            Fechar notificações
          </button>
        </section>
      )}
    </div>
  );
}
