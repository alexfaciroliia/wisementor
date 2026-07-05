@echo off
chcp 65001 > nul

echo ====================================================
echo         WiseMentor - Assistente de Atualizacao (Pull)
echo ====================================================
echo.

echo [1/3] Buscando atualizacoes no GitHub...
git fetch origin
if %errorlevel% neq 0 (
    echo.
    echo Erro ao conectar com o GitHub. Verifique sua conexao a internet.
    goto FIM
)

echo.
echo [2/3] Verificando diferencas locais...
git status -s
echo.

echo [3/3] Atualizando seus arquivos locais para a versao do GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo.
    echo Ocorreu um erro ao atualizar os arquivos.
    echo Se voce tiver alteracoes locais nao commitadas que conflitam com o GitHub,
    echo salve-as antes de atualizar ou faca o commit delas usando o 'git_commit.bat'.
    goto FIM
)

echo.
echo ====================================================
echo    Sucesso! Seu projeto local esta 100%% atualizado.
echo ====================================================

:FIM
echo.
pause
