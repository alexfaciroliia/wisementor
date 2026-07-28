const { execSync } = require('child_process');

try {
  console.log('Executando git add e commit...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "fix: associar dinamicamente cada erro ao arquivo correto (Produtos Unicos vs Variantes) com base na classificacao final do produto"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('Push realizado com sucesso!');
} catch (err) {
  console.error('Erro no git:', err.message);
}
