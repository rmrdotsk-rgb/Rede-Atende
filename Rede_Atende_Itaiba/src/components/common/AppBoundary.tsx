import { Component, type ReactNode } from 'react';
export class AppBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : 'Não foi possível abrir os dados.' };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="max-w-xl mx-auto my-12 p-6 bg-white border border-rose-300 rounded-2xl space-y-4">
        <h1 className="text-xl font-bold">Rede Atende — não foi possível abrir seus dados</h1>
        <p role="alert">{this.state.error}</p>
        <p className="text-sm">
          Os dados existentes foram preservados. Tente recarregar a aplicação. Se o problema
          persistir, verifique se o servidor e o banco estão disponíveis.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="px-4 py-2 rounded-lg border" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }
}
