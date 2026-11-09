import { Link } from 'react-router-dom';
import { ExternalLink, FileText, MapPin, Phone, Mail, Clock, ShieldCheck } from 'lucide-react';
import { EDUCATION_CONTACT, ITAIBA_SOURCES } from '../../data/municipalSources';

/** Page of official references. No social post is shown without a verifiable permalink. */
export function InformationItaiba() {
  return (
    <div className="max-w-5xl mx-auto space-y-7">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-blue-800">Orientações e referências verificadas</p>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Como usar o Rede Atende</h1>
        <p className="text-slate-700 leading-relaxed max-w-3xl">
          Esta é uma demonstração acadêmica para Itaíba–PE. Os chamados, as senhas, as providências
          e os indicadores pertencem somente ao ambiente de testes. O site não encaminha
          solicitações reais para a Prefeitura.
        </p>
      </header>

      <section className="panel" aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-lg font-bold text-slate-900">
          Três passos para testar
        </h2>
        <ol className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 list-none">
          <li className="rounded-lg border border-slate-200 p-4 space-y-2">
            <strong className="block text-slate-900">1. Entre com uma conta fictícia</strong>
            <p className="text-sm text-slate-700">
              Cadastre um cidadão ou peça ao responsável os acessos locais de demonstração.
            </p>
            <Link className="text-blue-800 underline font-semibold text-sm" to="/entrar">
              Entrar ou cadastrar
            </Link>
          </li>
          <li className="rounded-lg border border-slate-200 p-4 space-y-2">
            <strong className="block text-slate-900">2. Registre uma solicitação</strong>
            <p className="text-sm text-slate-700">
              Selecione a escola e a categoria, descreva uma situação fictícia e guarde o protocolo.
            </p>
            <Link className="text-blue-800 underline font-semibold text-sm" to="/solicitar">
              Registrar solicitação
            </Link>
          </li>
          <li className="rounded-lg border border-slate-200 p-4 space-y-2">
            <strong className="block text-slate-900">3. Acompanhe o resultado</strong>
            <p className="text-sm text-slate-700">
              Consulte o histórico e responda a pedidos de complemento no mesmo acesso.
            </p>
            <Link className="text-blue-800 underline font-semibold text-sm" to="/acompanhar">
              Acompanhar protocolos
            </Link>
          </li>
        </ol>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="panel space-y-3" aria-labelledby="reference-title">
          <h2
            id="reference-title"
            className="text-lg font-bold text-slate-900 flex gap-2 items-center"
          >
            <ShieldCheck className="w-5 h-5 text-blue-700" /> Informações públicas confirmadas
          </h2>
          <p className="text-sm text-slate-700">
            Referências externas da Prefeitura e do DesafioPE; não são serviços oferecidos por este
            protótipo.
          </p>
          <ul className="space-y-3 text-sm">
            <li>
              <a
                className="inline-flex items-center gap-2 text-blue-800 underline"
                target="_blank"
                rel="noopener noreferrer"
                href={ITAIBA_SOURCES.challenge}
              >
                <FileText className="w-4 h-4" />
                Desafio oficial de Itaíba (21/09/2026)
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-2 text-blue-800 underline"
                target="_blank"
                rel="noopener noreferrer"
                href={ITAIBA_SOURCES.schools}
              >
                <FileText className="w-4 h-4" />
                Relação municipal de escolas
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-2 text-blue-800 underline"
                target="_blank"
                rel="noopener noreferrer"
                href={ITAIBA_SOURCES.schoolSelection}
              >
                <FileText className="w-4 h-4" />
                Seleção de gestores escolares — edital 2026
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
            <li>
              <a
                className="inline-flex items-center gap-2 text-blue-800 underline"
                target="_blank"
                rel="noopener noreferrer"
                href={ITAIBA_SOURCES.news}
              >
                <FileText className="w-4 h-4" />
                Notícias publicadas pela Prefeitura
                <ExternalLink className="w-3 h-3" />
              </a>
            </li>
          </ul>
          <p className="text-xs text-slate-600">
            A listagem pública de escolas é mais extensa que o catálogo demonstrativo de seis
            unidades. A presença na lista não garante funcionamento atual.
          </p>
        </section>
        <section className="panel space-y-3" aria-labelledby="contact-title">
          <h2 id="contact-title" className="text-lg font-bold text-slate-900">
            Contato oficial da Educação
          </h2>
          <p className="text-sm text-slate-700">
            Estes dados são publicados no site da Prefeitura, não são o suporte do Rede Atende.
            Confirme antes de se deslocar.
          </p>
          <address className="not-italic space-y-3 text-sm text-slate-800">
            <p className="flex gap-2 items-start">
              <MapPin className="w-4 h-4 shrink-0" />
              {EDUCATION_CONTACT.location}
            </p>
            <p className="flex gap-2 items-start">
              <Phone className="w-4 h-4 shrink-0" />
              <a href="tel:+5587998670711" className="text-blue-800 underline">
                {EDUCATION_CONTACT.phone}
              </a>
            </p>
            <p className="flex gap-2 items-start">
              <Mail className="w-4 h-4 shrink-0" />
              <a
                href={`mailto:${EDUCATION_CONTACT.email}`}
                className="text-blue-800 underline break-all"
              >
                {EDUCATION_CONTACT.email}
              </a>
            </p>
            <p className="flex gap-2 items-start">
              <Clock className="w-4 h-4 shrink-0" />
              Atendimento informado: {EDUCATION_CONTACT.hours}
            </p>
          </address>
          <p className="text-xs text-slate-600">
            A página da Educação informa Rua Manoel Martins, s/n. Já o rodapé geral da Prefeitura
            cita Praça Francisco Martins, s/n para a sede municipal. Confirme o endereço antes da
            visita.
          </p>
          <a
            className="inline-flex gap-2 items-center text-blue-800 underline font-semibold text-sm"
            href={EDUCATION_CONTACT.source}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver contato na fonte oficial <ExternalLink className="w-4 h-4" />
          </a>
        </section>
      </div>
      <section className="rounded-lg border border-slate-300 bg-slate-50 p-4 space-y-2">
        <h2 className="font-bold text-slate-900">O que ainda não funciona como serviço público</h2>
        <p className="text-sm text-slate-700">
          Não há integração oficial ao SEI, aplicativo Android/iOS nativo, notificações por
          SMS/push, geolocalização nem envio de pedidos à Prefeitura. Para informações atuais, siga
          os links institucionais acima. Não inserimos publicações de redes sociais sem confirmação
          da conta e do endereço da postagem.
        </p>
      </section>
    </div>
  );
}
