import { NextResponse } from 'next/server'
import { Client } from 'pg'

export async function GET() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })

  try {
    await client.connect()
    
    // 1. Add banned_until to public.profiles
    await client.query(`
      ALTER TABLE public.profiles 
      ADD COLUMN IF NOT EXISTS banned_until timestamp with time zone;
    `)

    // 2. Add expires_at to public.invitations
    await client.query(`
      ALTER TABLE public.invitations 
      ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;
    `)

    await client.end()
    return NextResponse.json({ success: true, message: 'Database migrated successfully!' })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
