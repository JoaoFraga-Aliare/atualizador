@echo off
setlocal EnableExtensions

rem Gera o painel e instala/atualiza a Central em DESTINO (padrao C:\UpdaterCentral).
rem Nao apaga nem sobrescreve: backend\.env, backend\data (banco, backups, chave de assinatura) e packages.
rem Uso: build-and-deploy.bat [DESTINO]

set "ORIGEM=%~dp0..\.."
set "DESTINO=%~1"
if not defined DESTINO set "DESTINO=C:\UpdaterCentral"

where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado no PATH. & exit /b 1)

echo == Gerando o painel ==
pushd "%ORIGEM%\frontend" || exit /b 1
call npm ci --no-audit --no-fund || (popd & exit /b 1)
call npm run build || (popd & exit /b 1)
popd

echo == Copiando para %DESTINO% ==
if not exist "%DESTINO%\backend" mkdir "%DESTINO%\backend"
if not exist "%DESTINO%\packages" mkdir "%DESTINO%\packages"
robocopy "%ORIGEM%\backend\src" "%DESTINO%\backend\src" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (echo [ERRO] Falha ao copiar o backend. & exit /b 1)
copy /Y "%ORIGEM%\backend\package.json" "%DESTINO%\backend\" >nul
copy /Y "%ORIGEM%\backend\package-lock.json" "%DESTINO%\backend\" >nul
copy /Y "%ORIGEM%\backend\.env.example" "%DESTINO%\backend\" >nul
robocopy "%ORIGEM%\frontend\out" "%DESTINO%\frontend" /MIR /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (echo [ERRO] Falha ao copiar o painel. & exit /b 1)

if not exist "%DESTINO%\backend\.env" (
    copy /Y "%ORIGEM%\backend\.env.example" "%DESTINO%\backend\.env" >nul
    echo [ATENCAO] Criado %DESTINO%\backend\.env a partir do exemplo. Troque senhas e segredos antes de iniciar.
)

echo == Instalando dependencias do backend ==
pushd "%DESTINO%\backend" || exit /b 1
call npm ci --omit=dev --no-audit --no-fund || (popd & exit /b 1)
popd

echo.
echo Concluido. Para rodar como servico (NSSM), uma unica vez:
echo   nssm install CentralAtualizacao "%%ProgramFiles%%\nodejs\node.exe" src\index.js
echo   nssm set CentralAtualizacao AppDirectory "%DESTINO%\backend"
echo   nssm start CentralAtualizacao
echo Depois de atualizar: nssm restart CentralAtualizacao
echo Nginx: use deploy\nginx\updater-windows.conf (ajuste dominio e certificados).
echo Faca backup de %DESTINO%\backend\data (banco, backups dos terminais e chave de assinatura).
endlocal
