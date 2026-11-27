import { z } from 'zod';

export const workspaceMenus=[
  ['projects','Proyek'],['meetings','Rapat korporat'],['assignment','Penunjukan PM'],
  ['risk','Daftar risiko'],['operations','Operasional'],['mom','Notulen (MOM)'],
  ['bast','BAST'],['lesson-learned','Lesson Learned'],['assistant','Tanya asisten'],
] as const;
export type WorkspaceMenu=typeof workspaceMenus[number][0];
const menu=z.enum(['projects','meetings','assignment','risk','operations','mom','bast','lesson-learned','assistant']);
export const administratorId='workspace-admin';
export const superAdminId='workspace-super-admin';
export const groupSchema=z.object({
  name:z.string().trim().min(1).max(80),
  menus:z.array(menu).min(1).max(workspaceMenus.length).refine(values=>new Set(values).size===values.length),
  edit:z.boolean(),
});
export type WorkspaceGroup=z.infer<typeof groupSchema>&{id:string;builtin?:boolean};
export type WorkspacePerson={id:string;name:string;email:string;groupId:string;builtin?:boolean;pendingActivation?:boolean};
export type MeetingModerator = {id:string;label:string;group:string};
export const administratorGroup:WorkspaceGroup={
  id:administratorId,name:'Administrator PMO',menus:workspaceMenus.map(([id])=>id),edit:true,builtin:true,
};
export const superAdminGroup:WorkspaceGroup={...administratorGroup,id:superAdminId,name:'Super Admin'};
export const previewSuperAdmin:WorkspacePerson={
  id:'preview-super-admin',name:'Super Admin Preview',email:'superadmin@shockwave.test',groupId:superAdminId,pendingActivation:true,
};
const groupId=z.union([z.literal(administratorId),z.literal(superAdminId),z.string().uuid()]);
export const newPersonSchema=z.object({
  name:z.string().trim().min(1).max(100),
  email:z.string().trim().toLowerCase().email().max(180),
  password:z.string().min(12).max(128),
  groupId,
});
export const assignGroupSchema=z.object({groupId});
export const activateSuperAdminSchema=z.object({password:z.string().min(12).max(128)});
export const normalizedProjectName=(name:string)=>name.trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('id');
