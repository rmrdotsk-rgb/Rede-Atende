import { useState } from 'react';
import { Modal } from './Modal';
export function DemoGuide() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="action secondary-action w-full"
        onClick={() => setOpen(true)}
      >
        Conhecer a demonstração
      </button>
      {open && (
        <Modal titleId="demo-title" onClose={() => setOpen(false)}>
          <section className="panel space-y-5">
            <h2 id="demo-title" className="text-2xl font-bold">
              Conheça o Rede Atende
            </h2>
            <p>
              Dados fictícios para uma apresentação acadêmica sobre demandas educacionais de
              Itaíba–PE. Este ambiente não atende a Prefeitura. A integração SEI é simulada.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="text-left font-semibold mb-2">
                  O que cada conta pode fazer
                </caption>
                <thead>
                  <tr>
                    <th className="p-2">Perfil</th>
                    <th className="p-2">Uso na demonstração</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Cidadão', 'Registra, acompanha e avalia suas próprias solicitações.'],
                    ['Operador', 'Faz triagem, ordens de serviço e agendamentos.'],
                    [
                      'Gestor',
                      'Atende, reabre solicitações e configura regras, escolas e cenários.',
                    ],
                    ['Auditor', 'Consulta o atendimento e a auditoria, sem alterar dados.'],
                  ].map(([role, description]) => (
                    <tr className="border-t border-slate-200" key={role}>
                      <th className="p-2">{role}</th>
                      <td className="p-2">{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ol className="list-decimal pl-6 space-y-3">
              <li>
                Crie uma conta fictícia para começar sem solicitações. O cidadão de demonstração
                preparado no notebook já tem exemplos.
              </li>
              <li>
                Registre uma demanda, guarde o protocolo e abra o painel em outra sessão, com uma
                conta da equipe.
              </li>
              <li>
                A equipe pede informação, planeja a execução e conclui. O cidadão acompanha as
                mudanças e avalia o atendimento.
              </li>
            </ol>
            <p className="text-sm text-slate-600">
              Peça ao responsável os acessos gerados na preparação do projeto. No notebook da
              apresentação, ele pode consultá-los no arquivo <code>.local/demo-access.txt</code>.
              Esses acessos não ficam publicados nesta página.
            </p>
            <p className="text-sm text-slate-600">
              Cenários fictícios adicionais ficam na área do gestor e acrescentam exemplos sem
              apagar solicitações.
            </p>
            <button className="action" onClick={() => setOpen(false)}>
              Voltar ao acesso
            </button>
          </section>
        </Modal>
      )}
    </>
  );
}
