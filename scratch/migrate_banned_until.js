const { Client } = require('pg');

// O pooler Supabase identifica o tenant pelo hostname SNI
// O formato CORRETO é: {project_ref}.pooler.supabase.com
const client = new Client({
  host: '54.94.90.106',
  port: 6543,
  user: 'postgres',
  password: 'th200156@200156',
  database: 'postgres',
  ssl: {
    rejectUnauthorized: false,
    servername: 'afivzlvybqpdfubjmvbo.pooler.supabase.com'
  }
});

async function main() {
  try {
    console.log('Tentando com SNI = afivzlvybqpdfubjmvbo.pooler.supabase.com...');
    await client.connect();
    console.log('✅ Conectado!');
    
    await client.query(`
      ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS banned_until timestamp with time zone;
    `);
    console.log('✅ Coluna banned_until adicionada!');

    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'profiles'
      ORDER BY ordinal_position;
    `);
    console.log('Colunas de profiles:', result.rows.map(r => r.column_name));

  } catch (err) {
    console.error('Erro:', err.message, '| Code:', err.code);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
