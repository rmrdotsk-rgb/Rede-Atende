export type PageMetadata = { title: string; description: string; canonicalPath?: string };
const suffix = ' | Rede Atende';
const description =
  'Demonstração acadêmica de demandas escolares em Itaíba–PE, sem vínculo com a Prefeitura. Use somente dados fictícios.';
const pages: Record<string, PageMetadata> = {
  '/': { title: 'Rede Atende | Demandas escolares de Itaíba', description, canonicalPath: '/' },
  '/informacoes': {
    title: 'Como funciona' + suffix,
    description:
      'Entenda como registrar e acompanhar uma solicitação fictícia no Rede Atende, projeto acadêmico para Itaíba–PE.',
    canonicalPath: '/informacoes',
  },
  '/entrar': {
    title: 'Entrar no atendimento' + suffix,
    description:
      'Acesse sua conta de demonstração ou crie uma conta fictícia de cidadão. Este é um projeto acadêmico.',
  },
  '/solicitar': { title: 'Nova solicitação' + suffix, description },
  '/acompanhar': {
    title: 'Meus protocolos' + suffix,
    description: 'Área privada para acompanhar solicitações fictícias da própria conta.',
  },
  '/admin': { title: 'Resumo dos atendimentos' + suffix, description },
  '/admin/demandas': { title: 'Demandas registradas' + suffix, description },
  '/admin/triagem': { title: 'Triagem e encaminhamento' + suffix, description },
  '/admin/unidades': { title: 'Unidades escolares' + suffix, description },
  '/admin/ordens': { title: 'Ordens de serviço' + suffix, description },
  '/admin/prazos': { title: 'Prazos e prioridades' + suffix, description },
  '/admin/agenda': { title: 'Agenda e vistorias' + suffix, description },
  '/admin/relatorios': { title: 'Relatórios' + suffix, description },
  '/admin/integracoes': { title: 'SEI simulado' + suffix, description },
};
export const ROBOTS_POLICY = 'noindex, nofollow, noarchive';
/** Query strings and record identifiers are never used in document metadata. */
export function getPageMetadata(path: string): PageMetadata {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return pages[pathname] ?? { title: 'Página não encontrada' + suffix, description };
}
