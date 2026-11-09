import { Link } from 'react-router-dom';
export function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="max-w-xl mx-auto my-14 panel space-y-4">
      <p className="text-sm font-semibold text-slate-600">Página não encontrada · 404</p>
      <h1 className="text-2xl font-bold text-slate-900">Este endereço não existe.</h1>
      <p className="text-sm text-slate-700">
        Confira o link utilizado ou volte à página inicial. Nenhuma solicitação foi alterada.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link className="action" to="/">
          Voltar ao início
        </Link>
        <Link className="action secondary-action" to="/informacoes">
          Ajuda e informações
        </Link>
      </div>
    </main>
  );
}
