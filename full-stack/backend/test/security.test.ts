import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginSchema, passwordSchema, projectSchema, newToken, tokenHash } from '../src/security.js';
test('login normalizes email and rejects malformed input',()=>{
  assert.equal(loginSchema.parse({email:'PM@Example.com',password:'a'}).email,'pm@example.com');
  assert.equal(loginSchema.safeParse({email:'not-an-email',password:'a'}).success,false);
  assert.equal(loginSchema.safeParse({email:'pm@example.com',password:'a'.repeat(129)}).success,false);
});
test('password provisioning requires 12 characters',()=>{
  assert.equal(passwordSchema.safeParse('short').success,false);
  assert.equal(passwordSchema.safeParse('a-strong-password').success,true);
});
test('project dates and progress are validated',()=>{
  const p={code:'PRJ-1',name:'Migration',customer:'Customer',start_date:'2026-11-17',end_date:'2026-12-17'};
  assert.equal(projectSchema.safeParse(p).success,true);
  assert.equal(projectSchema.safeParse({...p,end_date:'2026-11-01'}).success,false);
  assert.equal(projectSchema.safeParse({...p,progress:101}).success,false);
  assert.equal(projectSchema.safeParse({...p,progress:4.5}).success,false);
  assert.equal(projectSchema.safeParse({...p,start_date:'2026-02-30'}).success,false);
});
test('session tokens are random and only their digest is stored',()=>{
  const a=newToken(), b=newToken(); assert.notEqual(a,b); assert.equal(a.length,43);
  assert.equal(tokenHash(a).length,64);assert.notEqual(tokenHash(a),a);
});
