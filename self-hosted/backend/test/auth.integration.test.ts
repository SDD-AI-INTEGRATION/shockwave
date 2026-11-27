import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';

test('real PostgreSQL: sessions, CSRF, RBAC, project ownership, progress, rate limits', {skip:!process.env.DATABASE_URL}, async ()=>{
  const schema=`test_${randomUUID().replaceAll('-','')}`;
  const adminPool=new Pool({connectionString:process.env.DATABASE_URL});
  await adminPool.query(`CREATE SCHEMA ${schema}`);
  const pool=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`});
  const app=await createApp(pool);
  try {
    await pool.query(readFileSync(resolve('../database/001-core.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
    await pool.query(readFileSync(resolve('../database/002-prototype-features.sql'),'utf8'));
    await pool.query(readFileSync(resolve('../database/003-documents-and-administration.sql'),'utf8'));
    const hash=await argon2.hash('correct-test-password',{memoryCost:65536,timeCost:3,parallelism:1});
    for(const role of ['admin','pm','viewer']) await pool.query('INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$2)',[`${role}@example.com`,role,hash]);
    await app.listen(0,'127.0.0.1'); const url=await app.getUrl();
    const origin=process.env.APP_ORIGIN||'http://localhost:3000';
    async function call(path:string,method='GET',body?:unknown,cookie='',requestOrigin=origin){return fetch(`${url}/api${path}`,{method,headers:{'Content-Type':'application/json',Origin:requestOrigin,Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});}
    async function login(role:string){const res=await call('/auth/login','POST',{email:`${role}@example.com`,password:'correct-test-password'});assert.equal(res.status,200);const setCookie=res.headers.get('set-cookie')!;assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Strict/i);return setCookie.split(';')[0];}
    assert.equal((await call('/projects')).status,401);
    assert.equal((await call('/auth/login','POST',{email:'admin@example.com',password:'wrong'})).status,401);
    assert.equal((await call('/auth/login','POST',{},'','https://evil.test')).status,403);
    const adminCookie=await login('admin'),pmCookie=await login('pm'),viewerCookie=await login('viewer');
    assert.equal((await call('/auth/me','GET',undefined,adminCookie)).status,200);
    const project={code:'TEST-1',name:'Project test',customer:'Customer test',start_date:'2026-11-17',end_date:'2026-12-17',progress:10};
    assert.equal((await call('/projects','POST',project,viewerCookie)).status,403);
    assert.equal((await call('/projects','POST',project,adminCookie,'https://evil.test')).status,403);
    const created=await call('/projects','POST',project,adminCookie);assert.equal(created.status,201);const p=await created.json() as {id:string};
    assert.equal((await call('/projects','POST',project,adminCookie)).status,409);
    const visible=await (await call('/projects','GET',undefined,pmCookie)).json() as {projects:unknown[]};assert.equal(visible.projects.length,0);
    assert.equal((await call(`/projects/${p.id}/progress`,'PATCH',{progress:50},pmCookie)).status,403);
    assert.equal((await call(`/projects/${p.id}/progress`,'PATCH',{progress:101},adminCookie)).status,400);
    assert.equal((await call(`/projects/${p.id}/progress`,'PATCH',{progress:50},adminCookie)).status,200);
    assert.equal((await pool.query('SELECT * FROM progress_updates')).rowCount,2);
    assert.equal((await call('/auth/logout','POST',undefined,adminCookie)).status,200);
    assert.equal((await call('/auth/me','GET',undefined,adminCookie)).status,401);
    for(let i=0;i<5;i++) assert.equal((await call('/auth/login','POST',{email:'missing@example.com',password:'wrong'})).status,401);
    assert.equal((await call('/auth/login','POST',{email:'missing@example.com',password:'wrong'})).status,429);
    assert.equal((await pool.query(`SELECT * FROM audit_logs WHERE action='project.progress_updated'`)).rowCount,1);
  } finally {
    await app.close();await pool.end();
    assert.match(schema,/^test_[a-f0-9]{32}$/);
    await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);await adminPool.end();
  }
});
