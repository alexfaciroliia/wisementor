const { execSync } = require('child_process');

try {
  console.log('Executando git add e commit...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "fix: filtrar os erros da aba Erros para incluir apenas ocorrencias da planilha correspondente (Produtos Unicos vs Variantes)"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('Push realizado com sucesso!');
} catch (err) {
  console.error('Erro no git:', err.message);
}
