import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const loginSchema = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) });
export const passwordSchema = z.string().min(12).max(128);
export const projectSchema = z.object({
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(3).max(150), customer: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).default(''),
  status: z.enum(['planning','active','at_risk','completed']).default('planning'),
  start_date: z.iso.date(), end_date: z.iso.date(), progress: z.number().int().min(0).max(100).default(0),
}).refine(v => v.end_date >= v.start_date, { message: 'Tanggal selesai harus setelah tanggal mulai.', path: ['end_date'] });
export type User = { id: string; email: string; name: string; role: 'admin' | 'pm' | 'viewer'; must_change_password?:boolean };
