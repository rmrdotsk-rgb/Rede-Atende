/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Rede Atende - Página Inicial da Comunidade Escolar
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  Search,
  School,
  Clock,
  ArrowRight,
  Wrench,
  Bus,
  Apple,
  BookOpen,
  HeartHandshake,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { storageService } from '../../services/storage';
import { EducationalRequest, RequestCategory } from '../../types';
import { StatusBadge, PriorityBadge } from '../../components/common/Badge';
import { formatDateShort, CATEGORY_LABELS } from '../../utils/helpers';
import { ITAIBA_SOURCES } from '../../data/municipalSources';

const CATEGORY_ITEMS: {
  key: RequestCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: 'infraestrutura',
    label: 'Infraestrutura',
    icon: Wrench,
  },
  {
    key: 'transporte_escolar',
    label: 'Transporte escolar',
    icon: Bus,
  },
  {
    key: 'alimentacao_merenda',
    label: 'Alimentação escolar',
    icon: Apple,
  },
  {
    key: 'material_didatico',
    label: 'Materiais e livros',
    icon: BookOpen,
  },
  {
    key: 'apoio_pedagogico_inclusao',
    label: 'Educação inclusiva',
    icon: HeartHandshake,
  },
  {
    key: 'outros',
    label: 'Outros serviços',
    icon: FileText,
  },
  {
    key: 'documentacao_transferencia',
    label: 'Matrícula e documentos',
    icon: FileText,
  },
];

export const CommunityHome: React.FC = () => {
  const navigate = useNavigate();
  const [protocolInput, setProtocolInput] = useState('');
  const [protocolError, setProtocolError] = useState('');
  const [requests, setRequests] = useState<EducationalRequest[]>([]);

  useEffect(() => {
    setRequests(
      storageService
        .getRequests()
        .map((r) => storageService.getPublicRequestByProtocol(r.protocol)!)
        .filter(Boolean),
    );
    const unsubscribe = storageService.subscribe(() => {
      setRequests(
        storageService
          .getRequests()
          .map((r) => storageService.getPublicRequestByProtocol(r.protocol)!)
          .filter(Boolean),
      );
    });
    return unsubscribe;
  }, []);

  const handleSearchProtocol = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = protocolInput.trim().toUpperCase();
    if (!clean) {
      setProtocolError('Por favor, informe o número do protocolo.');
      return;
    }
    setProtocolError('');
    navigate(`/acompanhar?protocolo=${encodeURIComponent(clean)}`);
  };

  return (
    <div className="space-y-8">
      {/* Apresentação principal */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold mb-4 border border-blue-200">
            <School className="w-3.5 h-3.5" />
            <span>Projeto acadêmico · Itaíba–PE</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Solicitações escolares, do registro ao acompanhamento.
          </h1>
          <p className="mt-2 text-slate-600 text-sm sm:text-base leading-relaxed">
            Registre uma solicitação de teste, acompanhe o protocolo e conheça o fluxo de
            atendimento. Os registros são fictícios e não são enviados à Prefeitura de Itaíba.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              to="/solicitar"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm transition-all focus:ring-4 focus:ring-blue-100"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Nova solicitação</span>
            </Link>

            <Link
              to="/acompanhar"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all"
            >
              <Search className="w-4 h-4 text-slate-500" />
              <span>Acompanhar protocolo</span>
            </Link>
            <Link
              to="/informacoes"
              className="inline-flex items-center justify-center px-5 py-3 rounded-xl border border-slate-300 text-blue-800 font-semibold text-sm hover:bg-slate-50"
            >
              Como funciona
            </Link>
          </div>
        </div>
      </section>

      <section
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        aria-label="Como testar o atendimento"
      >
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-sm font-bold text-slate-900">1. Entre</p>
          <p className="mt-1 text-sm text-slate-700">
            Use uma conta fictícia ou o acesso local da apresentação.
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-sm font-bold text-slate-900">2. Registre</p>
          <p className="mt-1 text-sm text-slate-700">
            Escolha a escola e relate um problema fictício.
          </p>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4">
          <p className="text-sm font-bold text-slate-900">3. Acompanhe</p>
          <p className="mt-1 text-sm text-slate-700">
            Guarde o protocolo e veja o andamento do atendimento.
          </p>
        </div>
      </section>

      {/* Caixa de Busca Rápida de Protocolo */}
      <section className="bg-blue-50 rounded-2xl border border-blue-200 p-6 sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            <span>Consultar uma solicitação</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Digite o número do protocolo recebido (Exemplo:{' '}
            <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-blue-700">
              EDU-2026-000001
            </code>
            )
          </p>

          <form onSubmit={handleSearchProtocol} className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={protocolInput}
                onChange={(e) => {
                  setProtocolInput(e.target.value);
                  if (protocolError) setProtocolError('');
                }}
                placeholder="Ex: EDU-2026-000001"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm focus:border-blue-600 focus:ring-3 focus:ring-blue-100 focus:outline-hidden font-mono uppercase"
                aria-label="Número do Protocolo"
              />
              {protocolError && (
                <p className="mt-1 text-xs text-rose-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{protocolError}</span>
                </p>
              )}
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-colors shrink-0"
            >
              Consultar
            </button>
          </form>
        </div>
      </section>

      {/* Categorias Disponíveis */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Categorias de atendimento</h2>
            <p className="text-xs text-slate-500">
              Escolha o assunto para registrar e acompanhar uma solicitação fictícia.
            </p>
          </div>
          <Link
            to="/solicitar"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0 whitespace-nowrap"
          >
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="category-grid">
          {CATEGORY_ITEMS.map((cat) => {
            const Icon = cat.icon;
            return (
              <Link
                key={cat.key}
                to={`/solicitar?categoria=${cat.key}`}
                className="p-4 min-h-20 rounded-xl border border-slate-200 bg-white text-slate-800 flex flex-col items-start text-left gap-2 transition-colors group hover:border-blue-500 hover:bg-slate-50"
              >
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-800 shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-semibold leading-snug break-normal">
                  {cat.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Listagem Resumida das Solicitações da Comunidade */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {storageService.user?.role === 'cidadao'
                ? 'Minhas solicitações'
                : 'Solicitações de demonstração'}
            </h2>
            <p className="text-xs text-slate-500">
              {storageService.user?.role === 'cidadao'
                ? 'Somente os protocolos vinculados à sua conta fictícia.'
                : 'Exemplos fictícios disponíveis conforme o perfil de acesso.'}
            </p>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-600" />
            <span>Atualizado pelo servidor</span>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <p className="text-sm">Nenhuma solicitação encontrada no momento.</p>
            <Link
              to="/solicitar"
              className="mt-3 inline-block text-xs text-blue-600 font-semibold underline"
            >
              Criar a primeira solicitação agora
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.slice(0, 5).map((req) => (
              <div
                key={req.id}
                className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {req.protocol}
                    </span>
                    <StatusBadge status={req.status} size="sm" />
                    <PriorityBadge priority={req.priority} size="sm" />
                    <span className="text-xs text-slate-600">{formatDateShort(req.createdAt)}</span>
                  </div>

                  <h3 className="font-semibold text-sm text-slate-900 truncate">{req.subject}</h3>

                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <School className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="truncate">{req.schoolName}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500">{CATEGORY_LABELS[req.category]}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    to={`/acompanhar?protocolo=${req.protocol}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
                  >
                    <span>Ver andamento</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {requests.length > 5 && (
          <div className="pt-2 text-center">
            <Link
              to="/acompanhar"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
            >
              <span>Consultar outros protocolos da conta ({requests.length} registros)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Sobre as escolas de Itaíba</h2>
        <p className="text-sm text-slate-700">
          Os nomes e as localidades das unidades usadas na demonstração foram baseados na relação
          publicada pela Prefeitura. A situação atual de cada escola e os chamados apresentados aqui
          não são confirmados pelo cadastro municipal.
        </p>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link to="/informacoes" className="text-blue-800 underline">
            Orientações e contato oficial
          </Link>
          <a
            href={ITAIBA_SOURCES.schools}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-800 underline"
          >
            Consultar a lista municipal de escolas
          </a>
        </div>
      </section>
    </div>
  );
};
