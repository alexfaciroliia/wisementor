const { execSync } = require('child_process');

try {
  console.log('Executando git add e commit...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "fix: remover formatacoes customizadas e gerar planilhas P2 e P3 em formato padrao limpo do Excel"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('Push realizado com sucesso!');
} catch (err) {
  console.error('Erro no git:', err.message);
}
