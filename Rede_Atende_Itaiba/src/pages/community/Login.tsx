import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { storageService } from '../../services/storage';
import { DemoGuide } from '../../components/common/DemoGuide';
export function Login() {
  const [register, setRegister] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [visible, setVisible] = useState(false),
    [ack, setAck] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate(),
    [query] = useSearchParams();
  return (
    <div className="max-w-lg mx-auto panel space-y-5">
      <div>
        <p className="text-sm font-bold text-blue-800">Rede Atende · demonstração acadêmica</p>
        <h1 className="text-2xl font-bold mt-2">
          {register ? 'Criar conta de cidadão' : 'Entrar no atendimento'}
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Use somente identidade e informações fictícias. Sua conta permite consultar as próprias
          solicitações em outros dispositivos.
        </p>
      </div>
      <DemoGuide />
      <form
        className="space-y-4"
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError('');
          if (register && password !== confirmation) {
            setError('As senhas não coincidem. Revise a confirmação.');
            return;
          }
          setBusy(true);
          try {
            if (register) await storageService.register(name, email, password);
            else await storageService.login(email, password);
            const next = query.get('voltar') ?? '',
              citizen = storageService.user?.role === 'cidadao';
            const paths = citizen
              ? ['/', '/acompanhar', '/solicitar']
              : [
                  '/',
                  '/admin',
                  '/admin/demandas',
                  '/admin/triagem',
                  '/admin/unidades',
                  '/admin/ordens',
                  '/admin/prazos',
                  '/admin/agenda',
                  '/admin/relatorios',
                  '/admin/integracoes',
                ];
            navigate(
              paths.includes(next.split('?')[0]) ? next : citizen ? '/acompanhar' : '/admin',
              { replace: true },
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {register && (
          <div>
            <label className="field-label" htmlFor="account-name">
              Nome fictício
            </label>
            <input
              className="field"
              id="account-name"
              required
              minLength={3}
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="account-email">
            E-mail de acesso
          </label>
          <input
            className="field"
            id="account-email"
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="account-password">
            Senha (mínimo 12 caracteres)
          </label>
          <input
            className="field"
            id="account-password"
            type={visible ? 'text' : 'password'}
            required
            minLength={12}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="text-blue-800 underline text-sm"
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            {visible ? 'Ocultar senha' : 'Mostrar senha'}
          </button>
        </div>
        {register && (
          <>
            <label className="field-label" htmlFor="account-confirmation">
              Confirmar senha
              <input
                className="field mt-1"
                id="account-confirmation"
                type={visible ? 'text' : 'password'}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="flex gap-3 items-start text-sm">
              <input
                type="checkbox"
                required
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-1"
                disabled={busy}
              />
              Entendo que este é um projeto acadêmico e utilizarei apenas dados fictícios.
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-800">
            {error}
          </p>
        )}
        <button className="action w-full" disabled={busy}>
          {busy ? 'Aguarde...' : register ? 'Cadastrar e entrar' : 'Entrar'}
        </button>
      </form>
      <button
        type="button"
        disabled={busy}
        className="text-blue-800 underline text-sm"
        onClick={() => {
          setRegister(!register);
          setError('');
          setConfirmation('');
        }}
      >
        {register ? 'Já tenho uma conta' : 'Criar conta fictícia de cidadão'}
      </button>
      <p className="text-sm text-slate-600">
        A recuperação por e-mail não faz parte deste MVP. Para uma conta de apresentação existente,
        procure o responsável pelo notebook.
      </p>
    </div>
  );
}
