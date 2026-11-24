import 'reflect-metadata';
import { BadRequestException, Body, Controller, Get, Inject, Module, Param, Patch, Post, Req, Res, UnauthorizedException, ForbiddenException, ConflictException, ServiceUnavailableException, HttpCode } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import pg, { Pool } from 'pg';

// DATE columns stay 'YYYY-MM-DD' strings. Parsing them as local-midnight Date
// objects shifts calendar dates by a day whenever the server is not on UTC.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);
import type { Request, Response } from 'express';
import argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { loginSchema, newToken, projectSchema, tokenHash, type User } from './security.js';
import { z } from 'zod';
import { PmoController } from './pmo-controller.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {AdministrationController} from './administration.js';
import {DocumentsController} from './documents.js';
import { ApprovalsController } from './approvals.js';
import { ChangesController } from './changes.js';
import { ActionsController } from './actions.js';
import { FinanceController } from './finance.js';
import { NotificationsController } from './notifications.js';
import { PortfolioController } from './portfolio.js';
import { ClosureController } from './closure.js';
import { AssistantController } from './assistant.js';
import {currentUser,checkOrigin,projectAccess as requireProjectAccess} from './access.js';
import {randomUUID} from 'node:crypto';

const COOKIE = 'sw_session';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.COOKIE_SECURE==='false'?false:process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/' });
const uuid = (id: string) => { if (!z.uuid().safeParse(id).success) throw new BadRequestException('ID tidak valid.'); return id; };

@Controller('api')
class ApiController {
  constructor(@Inject('DB') private readonly db: Pool) {}
  private origin(req: Request) {
    checkOrigin(req);
  }
  private async user(req: Request): Promise<User> {
    return currentUser(this.db,req);
  }
  private async projectAccess(user: User, id: string) {
    await requireProjectAccess(this.db,user,id);
  }
  @Get('health') async health() {
    try { await this.db.query('SELECT 1'); return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Database belum tersedia.'); }
  }
  @Post('auth/login') @HttpCode(200)
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    this.origin(req);
    const input = loginSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Email atau password tidak valid.');
    const key = tokenHash(`${req.ip}:${input.data.email}`);
    const attempt = await this.db.query(`INSERT INTO login_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END, window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`, [key]);
    if (attempt.rows[0].attempts > 5) { res.setHeader('Retry-After','900'); res.status(429); return { message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' }; }
    const result = await this.db.query('SELECT * FROM users WHERE email=$1', [input.data.email]);
    const account = result.rows[0];
    // Equal-cost hashing for unknown accounts reduces account enumeration through timing.
    const valid = account ? await argon2.verify(account.password_hash,input.data.password) : (await argon2.hash(input.data.password, { memoryCost: 65536, timeCost: 3, parallelism: 1 }), false);
    if (!valid || !account.active) throw new UnauthorizedException('Email atau password salah.');
    const token = newToken();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sessions WHERE expires_at<now()');
      if(req.cookies?.[COOKIE]) await client.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(String(req.cookies[COOKIE]))]);
      await client.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')`, [tokenHash(token),account.id]);
      await client.query('DELETE FROM login_attempts WHERE key=$1 OR window_start<now()-interval \'1 day\'', [key]);
      await client.query(`INSERT INTO audit_logs(user_id,action) VALUES($1,'auth.login')`, [account.id]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    res.cookie(COOKIE,token,{ ...cookieOptions(), maxAge: 8*60*60*1000 });
    return { user: { id: account.id, email: account.email, name: account.name, role: account.role,must_change_password:account.must_change_password } };
  }
  @Get('auth/me') async me(@Req() req: Request) { return { user: await this.user(req) }; }
  @Post('auth/logout') @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.origin(req);
    if (req.cookies?.[COOKIE]) await this.db.query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(String(req.cookies[COOKIE]))]);
    res.clearCookie(COOKIE,cookieOptions()); return { success: true };
  }
  @Get('projects') async projects(@Req() req: Request) {
    const user = await this.user(req);
    const result = await this.db.query(`SELECT p.*,u.name AS manager_name FROM projects p JOIN users u ON u.id=p.manager_id WHERE p.archived_at IS NULL AND ($1='admin' OR p.manager_id=$2 OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$2)) ORDER BY p.created_at DESC`,[user.role,user.id]);
    return { projects: result.rows };
  }
  @Post('projects') async createProject(@Req() req: Request, @Body() body: unknown) {
    this.origin(req); const user = await this.user(req);
    if (user.role === 'viewer') throw new ForbiddenException('Akses hanya baca.');
    const parsed = projectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map(i=>i.message).join(' '));
    const p = parsed.data; const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO projects(code,name,customer,description,status,start_date,end_date,progress,manager_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[p.code,p.name,p.customer,p.description,p.status,p.start_date,p.end_date,p.progress,user.id]);
      await client.query('INSERT INTO progress_updates(project_id,progress,user_id) VALUES($1,$2,$3)',[result.rows[0].id,p.progress,user.id]);
      await client.query(`INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'project.created',$2)`,[user.id,result.rows[0].id]);
      await client.query('COMMIT'); return result.rows[0];
    } catch(error) { await client.query('ROLLBACK'); if ((error as {code:string}).code==='23505') throw new ConflictException('Kode proyek sudah digunakan.'); throw error; } finally { client.release(); }
  }
  @Patch('projects/:id/progress') async progress(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    this.origin(req); const user = await this.user(req);
    if(user.role === 'viewer') throw new ForbiddenException('Akses hanya baca.');
    await this.projectAccess(user,id);
    const input = z.object({ progress: z.number().int().min(0).max(100) }).safeParse(body);
    if(!input.success) throw new BadRequestException('Progres harus 0–100.');
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE projects SET progress=$1 WHERE id=$2',[input.data.progress,id]);
      await client.query('INSERT INTO progress_updates(project_id,progress,user_id) VALUES($1,$2,$3)',[id,input.data.progress,user.id]);
      await client.query(`INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'project.progress_updated',$2)`,[user.id,id]);
      await client.query('COMMIT'); return { success: true };
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  @Get('activity') async activity(@Req() req: Request) {
    const user = await this.user(req);
    const result = await this.db.query(`SELECT a.id,a.action,a.created_at,u.name FROM audit_logs a JOIN users u ON u.id=a.user_id WHERE a.user_id=$1 OR $2='admin' ORDER BY a.created_at DESC LIMIT 8`,[user.id,user.role]);
    return { activity: result.rows };
  }
}

export async function createApp(pool: Pool) {
  @Module({ controllers: [ApiController,PmoController,AdministrationController,DocumentsController,ApprovalsController,ChangesController,ActionsController,FinanceController,NotificationsController,PortfolioController,ClosureController,AssistantController], providers: [{ provide: 'DB', useValue: pool }] }) class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error','warn','log'] });
  app.useBodyParser('json',{limit:'2mb'});
  app.use(helmet()); app.use(cookieParser());
  app.use((req:Request,res:Response,next:()=>void)=>{const requestId=randomUUID(),started=performance.now();res.setHeader('X-Request-ID',requestId);if(process.env.LOG_REQUESTS==='true')res.on('finish',()=>console.log(JSON.stringify({time:new Date().toISOString(),request_id:requestId,method:req.method,path:req.path,status:res.statusCode,duration_ms:Math.round(performance.now()-started)})));next();});
  app.use('/api', (_req: Request,res: Response,next: () => void) => { res.setHeader('Cache-Control','no-store'); next(); });
  // No public CORS: browser traffic uses the same-origin Next.js /api proxy.
  return app;
}
