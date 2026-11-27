import { z } from 'zod';

export const riskLevels = ['Rendah', 'Sedang', 'Tinggi'] as const;

const riskRow = z.object({
  id: z.string().min(1),
  description: z.string(),
  impacts: z.array(z.string()),
  severity: z.enum(riskLevels),
  probability: z.enum(riskLevels),
  response: z.string(),
});

export const riskRegisterSchema = z.object({
  fields: z.record(z.string(), z.string()),
  projectId: z.string(),
  risks: z.array(riskRow).refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
});
