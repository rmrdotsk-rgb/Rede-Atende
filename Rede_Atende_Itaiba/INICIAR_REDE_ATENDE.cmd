@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
  echo ERRO: Execute este arquivo dentro da pasta Rede_Atende_Itaiba.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo ERRO: Node.js nao encontrado. Instale Node 24.11 ou superior.
  pause
  exit /b 1
)
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERRO: npm nao encontrado. Reinstale Node.js com npm.
  pause
  exit /b 1
)
node -e "const [m,n]=process.versions.node.split('.').map(Number);process.exit((m===22&&n>=18)||(m===24&&n>=11)||m>24?0:1)"
if errorlevel 1 (
  echo ERRO: Versao do Node incompativel com as dependencias deste projeto.
  node --version
  echo Use Node 22.18+ LTS ou Node 24.11+ LTS ^(recomendado^).
  echo Node 23 e Node 24 anterior a 24.11 nao atendem ao Babel 8.
  pause
  exit /b 1
)
npm.cmd --version >nul 2>&1
if errorlevel 1 (
  echo ERRO: npm esta instalado, mas nao funciona.
  pause
  exit /b 1
)
echo === Rede Atende - Itaiba ^(prototipo academico^) ===
echo Conferindo instalacao e versoes das dependencias...
call npm.cmd ls --depth=0 >nul 2>&1
if errorlevel 1 (
  echo Dependencias ausentes, incompletas ou incompativeis: executando npm ci...
  call npm.cmd ci
  if errorlevel 1 goto :erro
)
echo Preparando banco PGlite local sem apagar dados existentes...
call npm.cmd run setup -- --embedded
if errorlevel 1 goto :erro
echo Verificando codigo e compilando aplicacao...
call npm.cmd run build
if errorlevel 1 goto :erro
if exist ".local\demo-access.txt" echo Credenciais locais: .local\demo-access.txt ^(NUNCA as compartilhe^).
echo.
echo Navegador do notebook: http://127.0.0.1:3001
echo Ctrl+C encerra o servidor. Feche esta janela somente depois de terminar.
echo.
call npm.cmd start
if errorlevel 1 goto :erro
exit /b 0
:erro
echo.
echo ERRO: Falha na preparacao/inicializacao. Leia a mensagem anterior.
echo Nenhum comando de exclusao do banco foi executado pelo iniciador.
pause
exit /b 1
