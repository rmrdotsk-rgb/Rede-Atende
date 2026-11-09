import { Navigate, useLocation, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { storageService } from '../../services/storage';
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
  if (admin && user.role === 'cidadao')
    return (
      <section className="panel max-w-lg mx-auto">
        <h1 className="font-bold text-xl">Acesso restrito à equipe</h1>
        <p className="mt-3">
          Sua conta possui acesso às próprias solicitações na área da comunidade.
        </p>
      </section>
    );
  return (
    <div className={admin && user.role === 'auditor' ? 'auditor-view' : undefined}>{children}</div>
  );
}
