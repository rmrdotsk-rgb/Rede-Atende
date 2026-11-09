/** @license SPDX-License-Identifier: Apache-2.0 */
import { useState } from 'react';
import { storageService } from '../../services/storage';
import { Link } from 'react-router-dom';
import { ITAIBA_SOURCES } from '../../data/municipalSources';
export function Footer() {
  const [feedback, setFeedback] = useState('');
  const load = async (scenario: 'transporte' | 'merenda') => {
    try {
      const protocol = await storageService.loadDemoScenario(scenario);
      setFeedback(
        `Cenário carregado: ${protocol}. Abra o painel SEDUC ou a consulta de protocolo.`,
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao carregar cenário.');
    }
  };
  return (
    <footer className="app-footer mt-auto bg-white border-t border-slate-200 text-xs text-slate-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <p className="font-bold text-slate-800">Rede Atende · Itaíba–PE</p>
          <p className="mt-1">
            Projeto acadêmico independente; nenhum chamado é encaminhado à Prefeitura.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-sm">
            <Link className="text-blue-800 underline" to="/informacoes">
              Como usar e contatos oficiais
            </Link>
            <a
              className="text-blue-800 underline"
              href={ITAIBA_SOURCES.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Site da Prefeitura
            </a>
          </div>
        </div>
        {storageService.user?.role === 'gestor' && (
          <details className="max-w-xl no-print border border-amber-300 rounded-lg p-3 bg-amber-50">
            <summary className="font-bold text-amber-950">Adicionar cenário fictício</summary>
            <p className="text-xs text-amber-900 mt-2">
              Cada cenário acrescenta registros fictícios e preserva os existentes. Nenhuma
              informação é enviada à Prefeitura.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                className="action secondary-action text-xs"
                onClick={() => load('transporte')}
              >
                Crise no transporte · Serra de Santana (fictícia)
              </button>
              <button
                type="button"
                className="action secondary-action text-xs"
                onClick={() => load('merenda')}
              >
                Manutenção de merenda (fictícia)
              </button>
            </div>
            {feedback && (
              <p role="status" className="text-xs mt-2 text-slate-800">
                {feedback}
              </p>
            )}
          </details>
        )}
        <details className="max-w-xl">
          <summary className="font-semibold">Sobre o projeto e créditos</summary>
          <div className="mt-3 space-y-2">
            <p>Front-End Frameworks · Prof. Rafael Pacheco Ferreira · UNINASSAU.</p>
            <p>
              Integrantes: Itallo Thiago Herculano da Silva, Raimundo Anthoni Carvalho Alves Cruz e
              José Emerson Alves Saturno Barboza.
            </p>
            <p>
              Dados fictícios gravados no servidor. Anexos privados vinculados à sua conta. Não
              utilize dados pessoais reais.
            </p>
            <p>
              Referência: desafio DesafioPE / Desafios Day, Prefeitura Municipal de Itaíba. SEI
              exclusivamente simulado.
            </p>
            <a
              className="text-blue-800 underline"
              href="https://itaiba.pe.gov.br/relacao-de-escolas/"
              target="_blank"
              rel="noreferrer"
            >
              Fonte das unidades escolares
            </a>
          </div>
        </details>
      </div>
    </footer>
  );
}
