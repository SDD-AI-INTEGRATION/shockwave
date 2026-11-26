import { z } from 'zod';

export const workspaceMenus=[
  ['projects','Proyek'],['meetings','Rapat korporat'],['assignment','Penunjukan PM'],
  ['risk','Daftar risiko'],['operations','Operasional'],['mom','Notulen (MOM)'],
  ['bast','BAST'],['assistant','Tanya asisten'],
] as const;
export type WorkspaceMenu=typeof workspaceMenus[number][0];
const menu=z.enum(['projects','meetings','assignment','risk','operations','mom','bast','assistant']);
export const administratorId='workspace-admin';
export const groupSchema=z.object({
  name:z.string().trim().min(1).max(80),
  menus:z.array(menu).min(1).max(workspaceMenus.length).refine(values=>new Set(values).size===values.length),
  edit:z.boolean(),
});
export type WorkspaceGroup=z.infer<typeof groupSchema>&{id:string;builtin?:boolean};
export type WorkspacePerson={id:string;name:string;email:string;groupId:string};
export const administratorGroup:WorkspaceGroup={
  id:administratorId,name:'Administrator PMO',menus:workspaceMenus.map(([id])=>id),edit:true,builtin:true,
};
export const newPersonSchema=z.object({
  name:z.string().trim().min(1).max(100),
  email:z.string().trim().toLowerCase().email().max(180),
  password:z.string().min(12).max(128),
  groupId:z.string().uuid(),
});
export const assignGroupSchema=z.object({groupId:z.string().uuid()});
export const normalizedProjectName=(name:string)=>name.trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('id');
