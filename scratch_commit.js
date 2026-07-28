const { execSync } = require('child_process');

try {
  console.log('Executando git add e commit...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "fix: deixar coluna Preco de varejo em branco quando for 0 na Planilha 2 (Col E) e Planilha 3 (Col P)"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('Push realizado com sucesso!');
} catch (err) {
  console.error('Erro no git:', err.message);
}
