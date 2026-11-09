import { SchoolEditor } from '../../components/common/SchoolEditor';
/** @license SPDX-License-Identifier: Apache-2.0 */
import { useEffect, useState } from 'react';
import { storageService } from '../../services/storage';
export function AdminSchools() {
  const [schools, setSchools] = useState(() => storageService.getSchools());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  useEffect(() => storageService.subscribe(() => setSchools(storageService.getSchools())), []);
  const list = schools.filter(
    (s) =>
      `${s.name} ${s.locality || s.address}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')) &&
      (filter === 'all' || s.verification === filter),
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Unidades escolares de Itaíba</h1>
        <p className="text-sm mt-1 text-slate-600">
          Referências municipais para a simulação. Nomes de escolas reais não indicam que os
          chamados de exemplo tenham ocorrido.
        </p>
      </div>
      <div className="panel space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="schools-search" className="field-label">
              Buscar escola ou localidade
            </label>
            <input
              id="schools-search"
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="schools-verification" className="field-label">
              Filtrar por verificação
            </label>
            <select
              id="schools-verification"
              className="field"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todas as referências</option>
              <option value="evidencia_2026">Mencionadas em fonte de 2026</option>
              <option value="situacao_nao_confirmada">Situação atual não confirmada</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-600">
          Relação municipal consultada novamente em 05/11/2026. Fonte de 2026: edital municipal de
          seleção de gestores. A relação municipal não informa a situação cadastral atual de todas
          as escolas. Não foram importados contatos, direção ou códigos INEP sem confirmação
          individual no catálogo.
        </p>
        <a
          href="https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/inep-data/catalogo-de-escolas/"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-800 underline"
        >
          Consultar o Catálogo de Escolas do Inep
        </a>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((school) => (
          <article key={school.id} className="panel flex flex-col gap-3">
            <h2 className="font-bold text-sm">{school.name}</h2>
            <p className="text-sm text-slate-700">{school.locality || school.address}</p>
            <p
              className={`text-xs font-semibold ${school.verification === 'evidencia_2026' ? 'text-blue-800' : 'text-amber-900'}`}
            >
              {school.verification === 'evidencia_2026'
                ? 'Mencionada em fonte municipal de 2026'
                : 'Situação atual de funcionamento não confirmada'}
            </p>
            <p className="text-xs text-slate-600">
              {school.activeRequestsCount} demandas demonstrativas em aberto
            </p>
            <div className="mt-auto flex flex-wrap gap-3 text-xs">
              {school.sourceUrl && (
                <a
                  className="text-blue-800 underline"
                  href={school.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Relação municipal
                </a>
              )}
              {school.evidenceUrl && (
                <a
                  className="text-blue-800 underline"
                  href={school.evidenceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Evidência de 2026
                </a>
              )}
            </div>
            <SchoolEditor school={school} />
          </article>
        ))}
      </div>
      {list.length === 0 && (
        <p className="panel text-sm">Nenhuma escola encontrada neste filtro.</p>
      )}
    </div>
  );
}
