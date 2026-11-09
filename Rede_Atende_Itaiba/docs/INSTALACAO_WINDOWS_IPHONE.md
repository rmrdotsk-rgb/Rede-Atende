# Windows e iPhone — Rede Atende

Site web com API e banco no notebook, sem Expo/React Native. Demonstração portátil dispensa Docker e PostgreSQL nativo. Use dados e contas fictícios: HTTP local não cifra o tráfego.

Instale Node compatível (22.18+ da série 22 ou 24.11+; prefira Node 24), extraia o ZIP e abra no VS Code a pasta interna `Rede_Atende_Itaiba`, contendo `package.json`. Em **Terminal → Novo Terminal**, PowerShell:

```powershell
Test-Path .\package.json
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run setup -- --embedded
Get-Content .local\demo-access.txt
npm.cmd run build
npm.cmd start
```

Se Test-Path for False, corrija a pasta. Setup cria `.env` portátil quando inexistente, prepara banco e gera acessos de cidadão/gestor/operador/auditor em `.local\demo-access.txt`, fora do ZIP. Não projete esse arquivo. O cadastro pela tela cria somente cidadão.

Abra `http://localhost:3001`. Clique em **Entrar** e use a conta desejada. Deixe o terminal aberto. Pare com `Ctrl+C`; reinicie só com `npm.cmd start`, sem apagar `.local`. `npm run preview` isolado não é a demonstração completa com backend.

## Safari no iPhone 16

Notebook por cabo ou Wi-Fi e iPhone por Wi-Fi devem estar no mesmo roteador, com comunicação permitida. No notebook:

```powershell
ipconfig
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Format-Table InterfaceAlias,IPAddress
Test-NetConnection localhost -Port 3001
```

Copie o IPv4 da Ethernet/Wi-Fi conectado, não de VPN/adaptador virtual. No Safari abra `http://SEU-IPV4:3001`, substituindo pelo valor real. **localhost no iPhone é o próprio iPhone.** Entre como cidadão no celular e gestor em outra sessão no notebook: ambos usam o mesmo banco.

Permita Node.js na rede privada quando solicitado. Se necessário, em PowerShell **como administrador**, para rede já marcada como privada:

```powershell
New-NetFirewallRule -DisplayName "Rede Atende local TCP 3001" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Private -RemoteAddress LocalSubnet
```

Se não conectar: confirme API ligada, IPv4, porta e isolamento de convidados. Não desative todo o firewall. Porta ocupada: pare a execução anterior; não inicie duas APIs no mesmo PGlite. Se alterar PORT, ajuste URL/firewall. Desenvolvimento usa API 3001 e Vite 3000; veja README.

## Atualização e banco opcional

Pare a API e preserve `.env` e `.local` privados. Setup não converte `.env` PostgreSQL existente. Não troque de motor esperando conversão automática. O servidor reaplica migrações aditivas ao iniciar.

PostgreSQL nativo opcional: configure `.env.example`/DATABASE_URL, DB_MODE=postgres e execute setup/build/start, conforme README. A demonstração portátil usa PGlite. Windows, iPhone físico e PostgreSQL externo precisam ser verificados no ambiente de uso. Uma implantação pública exige HTTPS, COOKIE_SECURE=true e revisão de infraestrutura/processos.

Teste a rede física antes da aula. Abra Entrar → Conhecer a demonstração e siga o [roteiro de apresentação](ROTEIRO_DEMONSTRACAO_ATUAL.md). Os [comandos de testes](COMO_TESTAR_NO_WINDOWS.md) permitem conferir o funcionamento no seu ambiente.

O polling consulta dados limitados por rota/perfil, pausa com a aba oculta e usa backoff. A emulação de navegador não substitui o teste físico no telefone.
