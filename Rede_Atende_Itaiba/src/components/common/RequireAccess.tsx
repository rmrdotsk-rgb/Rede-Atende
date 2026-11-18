import { Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { storageService } from '../../services/storage';
import { Header } from './Header';
import { Footer } from './Footer';

function TeamAccessDenied() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Header mode="community" />
      <main id="main-content" tabIndex={-1} className="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
        <section className="panel space-y-5" aria-labelledby="team-access-title">
          <p className="text-sm font-semibold text-blue-800">Rede Atende · área da equipe</p>
          <h1 id="team-access-title" className="font-bold text-2xl">
            Acesso restrito à equipe
          </h1>
          <p>
            Sua conta de cidadão permite registrar e acompanhar suas próprias solicitações. Para
            abrir a gestão, entre com uma conta da equipe.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/" className="action secondary-action">
              Voltar à comunidade
            </Link>
            <button
              type="button"
              className="action"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError('');
                try {
                  await storageService.logout();
                  navigate('/entrar?voltar=%2Fadmin', { replace: true });
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : 'Não foi possível encerrar a sessão. Tente novamente.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Encerrando sessão...' : 'Trocar para uma conta da equipe'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-rose-800">
              {error}
            </p>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
export function RequireAccess({
  admin = false,
  citizen = false,
  children,
}: {
  admin?: boolean;
  citizen?: boolean;
  children: ReactNode;
}) {
  const location = useLocation(),
    user = storageService.user;
  if (!user)
    return (
      <Navigate
        to={`/entrar?voltar=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (citizen && user.role !== 'cidadao')
    return (
      <section className="panel max-w-lg mx-auto space-y-3">
        <h1 className="font-bold text-xl">Use uma conta de cidadão para solicitar</h1>
        <p>
          Esta conta é da equipe. Para registrar um pedido de teste, entre com uma conta de cidadão
          em uma janela separada.
        </p>
        <Link to="/admin" className="action">
          Ir para a gestão
        </Link>
      </section>
    );
  if (admin && user.role === 'cidadao') return <TeamAccessDenied />;
  return (
    <div className={admin && user.role === 'auditor' ? 'auditor-view' : undefined}>{children}</div>
  );
}
