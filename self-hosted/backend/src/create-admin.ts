import 'dotenv/config';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { passwordSchema } from './security.js';
import { z } from 'zod';
async function main() {
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
  const name = z.string().trim().min(2).max(100).parse(process.env.ADMIN_NAME || 'Administrator');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,'admin')`,[email,name,await argon2.hash(password,{memoryCost:65536,timeCost:3,parallelism:1})]);
    console.log('Akun admin berhasil dibuat.');
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Gagal membuat admin. Periksa email unik, password minimal 12 karakter, dan koneksi database.'); process.exitCode=1; });
