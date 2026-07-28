const { execSync } = require('child_process');

try {
  console.log('Executando git add e commit...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "feat: adicionar item de menu dedicado Armazem do Supabase na sidebar e rota /armazem"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('Push realizado com sucesso!');
} catch (err) {
  console.error('Erro no git:', err.message);
}
