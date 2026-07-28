const { execSync } = require('child_process');

try {
  console.log('Executando git add e commit...');
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "revert: restaurar formatacao visual completa dos cabecalhos e celulas das planilhas P2 e P3"', { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
  console.log('Push de restauração realizado com sucesso!');
} catch (err) {
  console.error('Erro no git:', err.message);
}
