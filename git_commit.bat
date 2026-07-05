@echo off
chcp 65001 > nul

echo ====================================================
echo             WiseMentor - Assistente de Git
echo ====================================================
echo.

echo [1/4] Verificando alteracoes locais...
git status -s
echo.

git status --porcelain | findstr /R "^" > nul
if %errorlevel% neq 0 (
    echo Nao ha alteracoes para commitar ou enviar. O repositorio esta limpo.
    goto FIM
)

set /p PROSSEGUIR="Deseja preparar e enviar todas as alteracoes listadas? (S/N): "
if /i "%PROSSEGUIR%" NEQ "S" (
    echo.
    echo Operacao cancelada pelo usuario.
    goto FIM
)

echo.
echo [2/4] Adicionando arquivos ao commit...
git add .

echo.
set /p MENSAGEM="[3/4] Digite a mensagem para o commit: "
if "%MENSAGEM%"=="" (
    echo.
    echo Erro: O commit precisa de uma mensagem.
    goto FIM
)

echo.
git commit -m "%MENSAGEM%"
if %errorlevel% neq 0 (
    echo.
    echo Erro ao criar o commit local.
    goto FIM
)

echo.
echo [4/4] Enviando alteracoes para o GitHub (push)...
git push
if %errorlevel% neq 0 (
    echo.
    echo Erro ao enviar as alteracoes para o GitHub. Verifique sua conexao.
    goto FIM
)

echo.
echo ====================================================
echo      Sucesso! Suas alteracoes estao no GitHub.
echo ====================================================

:FIM
echo.
pause
