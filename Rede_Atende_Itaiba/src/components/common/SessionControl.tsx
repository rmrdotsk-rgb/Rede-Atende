import { useState } from 'react';
import { useSafeAction } from './NavigationGuard';
import { Link, useNavigate } from 'react-router-dom';
import { storageService } from '../../services/storage';
export function SessionControl() {
  const navigate = useNavigate(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const runWhenSafe = useSafeAction();
  const user = storageService.user;
  if (!user)
    return (
      <Link
        className="text-blue-800 border border-blue-200 rounded-lg px-3 py-2 text-xs font-semibold"
        to="/entrar"
      >
        Entrar
      </Link>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="hidden md:inline text-slate-700 max-w-48">
        {user.name} ·{' '}
        {
          { cidadao: 'Cidadão', operador: 'Operador', gestor: 'Gestor', auditor: 'Auditor' }[
            user.role
          ]
        }
      </span>
      <button
        className="border border-slate-300 rounded-lg px-3 py-2 min-h-11"
        title={`Sair da conta de ${user.name}`}
        disabled={busy}
        onClick={() =>
          runWhenSafe(async () => {
            setBusy(true);
            try {
              await storageService.logout();
              navigate('/entrar', { replace: true });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          })
        }
      >
        Sair
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
