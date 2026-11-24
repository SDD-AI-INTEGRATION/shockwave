import { z } from 'zod';
import seed from './seed.json';
import { formatRupiah } from './money';

export const pillarOptions = [
  {id:'pilar-infrastruktur-jaringan',label:'IT Infrastructure',legacyLabel:'Infrastruktur & Jaringan',operationsTemplate:'infrastructure'},
  {id:'pilar-sumber-daya-ti',label:'Managed Services',legacyLabel:'Sumber Daya TI',operationsTemplate:'service'},
  {id:'pilar-solusi-aplikasi',label:'Software Development',legacyLabel:'Solusi Aplikasi',operationsTemplate:'application'},
] as const;
export type Pillar = typeof pillarOptions[number]['label'];
export const pillars = pillarOptions.map(option=>option.label);

export function resolvePillar(value:string) {
  const key=value.trim().normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
  return pillarOptions.find(option=>[option.id,option.label,option.legacyLabel].some(text=>text.toLowerCase()===key));
}
export const projectStatuses = ['Aktif','Selesai'] as const;
export const roles = ['SUPER_ADMIN', 'ADMIN_PMO', 'MANAGER_PMO', 'PM', 'NOTULIS', 'VIEWER'] as const;
export type Role = typeof roles[number];
export const roleNames: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN_PMO: 'Admin PMO', MANAGER_PMO: 'Manager PMO',
  PM: 'Project Manager', NOTULIS: 'Notulis', VIEWER: 'Viewer / Direksi',
};
const text = z.string().max(16000);
export const detailSchema = z.object({
  name: z.string().trim().min(1).max(500), customer: text, pm: text, sales: text, period: text,
  value: z.union([text,z.number().min(0).max(Number.MAX_SAFE_INTEGER)]), billing: text, notes: text,
  resourceCount: z.union([text,z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)]),
});
export type ProjectDetail = z.infer<typeof detailSchema>;
export const projectSchema = z.object({detail: detailSchema, verification: z.boolean()});
export type Project = z.infer<typeof projectSchema> & {
  id: string; number: number; latestText: string; priorText: string; importedRevenue?: {plan?:number;actual?:number};
  references?: {pillarId:string;pillar:Pillar|typeof pillarOptions[number]['legacyLabel'];customerId:string;pmId:string;salesId:string};
  contractDates?: [string,string];
  manualStatus?: typeof projectStatuses[number];
  entrySource?: 'manual'|'excel';
  createdAt?: string;
  updatedAt?: string;
};
export type ProjectRow = Project & ReturnType<typeof projectMetrics>;
export const seedProjects: Project[] = seed.projects.map(p => ({
  id: p.id, number: p.number, detail: p.detail, verification: p.requiresVerification,
  latestText: p.latestText, priorText: p.priorText,
}));

const months: Record<string, number> = {
  jan:0, feb:1, mar:2, apr:3, mei:4, may:4, jun:5, jul:6, agu:7, agt:7, ags:7, aug:7,
  sep:8, okt:9, oct:9, nov:10, des:11, dec:11,
};

function numberFromText(text: string) {
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text) ? text.replaceAll('.', '') : text;
  return Number(normalized.replace(',', '.'));
}

function readAmount(line: string, defaultUnit?: number) {
  const match = /([\d.,]*\d)\s*(M|Jts?|Juta)?/i.exec(line);
  if (!match) return null;
  const value = numberFromText(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2] ? (/^m/i.test(match[2]) ? 1e9 : 1e6) : defaultUnit ?? (value < 100 ? 1e9 : 1e6);
  return { value: value * unit, unit };
}

export function contractAmount(value: ProjectDetail['value']): number | null {
  if (typeof value === 'number') return value;
  const amount = /^\s*(?:Rp\.?\s*)?([\d.,]+)\s*(M|Jts?|Juta|Miliar)?\s*$/i.exec(value);
  if (!amount) return null;
  const number = numberFromText(amount[1]);
  const scale = amount[2] ? (/^m/i.test(amount[2]) ? 1e9 : 1e6) : 1;
  return Number.isFinite(number) ? number * scale : null;
}

export function formatContractValue(value:ProjectDetail['value']) {
  const amount=contractAmount(value);
  return amount===null ? value || '—' : formatRupiah(amount);
}

const contractDateFormat = new Intl.DateTimeFormat('id-ID', {day:'numeric', month:'short', year:'numeric', timeZone:'UTC'});

export function formatContractDates(start: string, end: string) {
  return [start,end].filter(Boolean).map(date=>contractDateFormat.format(new Date(date+'T00:00:00Z'))).join(' s/d ');
}

export function parseContractDates(period: string): [string, string] | null {
  const match = /^\s*(\d{1,2})\s+([a-z]+)\.?\s+(\d{2,4})\s+(?:s\/?d|–|-|sampai)\s+(\d{1,2})\s+([a-z]+)\.?\s+(\d{2,4})\s*$/i.exec(period);
  if (!match) return null;
  const parse = (day: string, label: string, rawYear: string) => {
    const month = months[label.slice(0,3).toLowerCase()];
    const year = rawYear.length===2 ? 2000+Number(rawYear) : Number(rawYear);
    if (month===undefined || year<1000) return null;
    const date = new Date(Date.UTC(year,month,Number(day)));
    return date.getUTCMonth()===month ? date.toISOString().slice(0,10) : null;
  };
  const start=parse(match[1],match[2],match[3]);
  const end=parse(match[4],match[5],match[6]);
  return start&&end ? [start,end] : null;
}

function contractEnd(period: string) {
  const line = period.split('\n')[0].split(/,?\s+sebelumnya\b/i)[0];
  let end: Date | undefined;
  for (const match of line.matchAll(/(\d{1,2})[\s-]*([A-Za-z]{3,9})\.?[\s’'`-]*(\d{2,4})/g)) {
    const month = months[match[2].slice(0,3).toLowerCase()];
    const year = Number(match[3]);
    if (month !== undefined) end = new Date(year < 100 ? 2000 + year : year, month, Number(match[1]));
  }
  const years = line.match(/20\d\d/g);
  return end ?? (years ? new Date(Math.max(...years.map(Number)), 11, 31) : null);
}

export function projectMetrics(project: Project) {
  const d = project.detail;
  const name = d.name.toLowerCase();
  let pillar: Pillar;
  let sub: string;
  if (/resource|tenaga|outsource|alih daya|onsite|task force|quality assurance|open contract|non fte|mitra strategic/.test(name)) {
    pillar = 'Managed Services';
    sub = /project manager|business analyst|quality assurance|task force/.test(name) ? 'Konsultan & spesialis TI' : /administrasi/.test(name) ? 'Tenaga administrasi' : 'Programmer & developer';
  } else if (/infrastruktur|infrastuktur|perangkat|switch|bandwi|telekomunikasi|data center|server|nac|facility/.test(name)) {
    pillar = 'IT Infrastructure';
    sub = /manage service|maintenance|pemeliharaan|facility/.test(name) ? 'Managed service infrastruktur' : /switch|perangkat|nac|bandwi/.test(name) ? 'Network devices' : 'Pengadaan infrastruktur';
  } else {
    pillar = 'Software Development';
    sub = /manage service|maintenance|pemeliharaan|preventive/.test(name) ? 'Maintenance & managed service' :
      /enhancement|echancement/.test(name) ? 'Penyempurnaan aplikasi' : /integrasi|migrasi/.test(name) ? 'Integrasi & migrasi data' :
      /change management|asistensi/.test(name) ? 'Konsultasi' : 'Pengembangan aplikasi';
  }
  const savedPillar=project.references&&(resolvePillar(project.references.pillarId)??resolvePillar(project.references.pillar));
  if(savedPillar&&pillar!==savedPillar.label){
    pillar=savedPillar.label;
    sub='';
  }
  const findRevenue = (label: string, unit?: number) => {
    const pattern = new RegExp(label + ' Revenue 2026[^\\n]*?Rp\\.?\\s*([\\d.,]*\\d\\s*(?:M|Jts?|Juta)?)', 'i');
    const match = pattern.exec(project.latestText) ?? pattern.exec(project.priorText);
    return match ? readAmount(match[1], unit) : null;
  };
  const contract = typeof d.value==='number'
    ? {value:d.value,unit:d.value>=1e9?1e9:1e6}
    : readAmount(d.value);
  const planSource = project.importedRevenue?.plan!==undefined?{value:project.importedRevenue.plan,unit:1}:findRevenue('Prognosa');
  let plan = planSource?.value ?? (contract ? Math.round(contract.value * 0.6) : 5e8);
  let unit = planSource?.unit ?? (contract && contract.value >= 1e9 ? 1e9 : 1e6);
  if (planSource && contract && plan > contract.value * 3 && unit === 1e9) {
    plan /= 1000;
    unit = 1e6;
  }
  let hash = 0;
  for (const char of project.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const recordedImport=project.importedRevenue?.actual;
  const reportedActual = recordedImport!==undefined?{value:recordedImport,unit:1}:findRevenue('Realisasi', unit);
  const validActual = reportedActual && (recordedImport!==undefined||reportedActual.value <= plan * 1.5);
  const actual = validActual ? reportedActual.value : Math.round(plan * (30 + hash % 56) / 100);
  const end = project.contractDates ? new Date(project.contractDates[1]+'T00:00:00Z') : contractEnd(d.period);
  // Preserve the status shown for legacy records at the time manual statuses were introduced.
  const legacyStatus = end && end.getTime()<Date.UTC(2026,10,24) ? 'Selesai' : 'Aktif';
  return {
    pillar, sub, plan, actual, percent: plan > 0 ? Math.round(actual / plan * 100) : 0,
    simulated: !planSource || !validActual, reported: Boolean(validActual),
    planAvailable:Boolean(planSource), actualAvailable:Boolean(validActual),
    status:project.manualStatus??legacyStatus,
    end: end?.toISOString() ?? null,
  };
}

export const categoryOptions = ['Progres & Target', 'Sumber Daya', 'Pendapatan', 'BA & Penagihan', 'Milestone', 'Kendala / Risiko', 'Lainnya'] as const;
export const healthOptions = ['Belum dinilai', 'On Track', 'Needs Attention', 'Critical'] as const;
export const actionStatuses = ['Belum dimulai', 'Sedang berjalan', 'Tertunda', 'Selesai'] as const;
export const reviewSchema = z.object({
  status: z.enum(['pending', 'updated', 'none', 'source']),
  health: z.enum(healthOptions),
  summary: text,
  items: z.array(z.object({ category: z.enum(categoryOptions), text })).max(150),
  actions: z.array(z.object({ text, pic: text, due: z.string().max(20), status: z.enum(actionStatuses), carried: z.boolean().optional() })).max(150),
  sourceText: text.optional(),
});
export type Review = z.infer<typeof reviewSchema>;
export type Meeting = {
  id: string; date: string; title: string; moderator: string; notulis: string; participants: string; notes: string;
  status: 'draft' | 'final'; previousId: string | null; previousDate: string | null; version: number;
  projects: Array<{id: string; number: number; detail: ProjectDetail; verification: boolean; previousText: string; previousHealth?: Review['health']; review: Review}>;
};
export const blankReview: Review = { status: 'pending', health: 'Belum dinilai', summary: '', items: [], actions: [] };

export const meetingDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
});
const meetingMetadata = z.object({
  date:meetingDate, title:z.string().trim().min(1).max(300), moderator:text.trim(),
  notulis:text.trim().default(''), participants:text.trim().default(''), notes:text.trim().default(''),
});
export const meetingCreateSchema=meetingMetadata;
export const meetingUpdateSchema=meetingMetadata.partial({date:true}).extend({version:z.number().int(),notulis:text.trim().optional(),participants:text.trim().optional()});

export function validateMeetingDate(rows:Meeting[],meeting:Meeting,date?:string) {
  if(!date||date===meeting.date)return;
  if(rows.some(row=>row.id!==meeting.id&&row.date===date))throw new Error('Sudah ada rapat pada tanggal ini.');
  if(rows.some(row=>row.previousId===meeting.id))throw new Error('Tanggal tidak dapat diubah karena rapat ini menjadi referensi.');
  if(meeting.previousDate&&date<=meeting.previousDate)throw new Error('Tanggal rapat harus setelah rapat referensi.');
}

export function previousCondition(project:Meeting['projects'][number]):Review['health'] {
  return project.previousHealth??healthOptions.find(value=>value!=='Belum dinilai'&&project.previousText.split('\n').some(line=>line.trim()===value||line.trim()==='Kondisi: '+value))??blankReview.health;
}

export function unchangedReview(project:Meeting['projects'][number],original:Review):Review {
  return {...blankReview,status:'none',health:previousCondition(project),actions:original.actions.filter(action=>action.carried)};
}


export function reviewText(review: Review, previous: string) {
  switch (review.status) {
    case 'source': return review.sourceText || '';
    case 'none': return previous || 'Belum ada catatan dari periode sebelumnya.';
    case 'pending': return '';
    case 'updated': return [
      review.summary, review.health !== 'Belum dinilai' ? review.health : '',
      ...review.items.filter(item => item.text.trim()).map(item => `${item.category}: ${item.text}`),
      ...review.actions.filter(item => item.text.trim()).map(item => `Tindak lanjut: ${item.text}${item.pic ? ' · '+item.pic : ''}${item.due ? ' · '+item.due : ''}`),
    ].filter(Boolean).join('\n');
  }
}

export function newMeeting(projects: Project[], info: Pick<Meeting, 'id' | 'date' | 'title' | 'moderator'> & Partial<Pick<Meeting,'notulis'|'participants'|'notes'>>, previous?: Meeting, source = false): Meeting {
  return {
    notulis:'', participants:'', notes:'', ...info, status: source ? 'final' : 'draft', previousId: previous?.id ?? null, previousDate: previous?.date ?? null,
    version: 1,
    projects: projects.map(project => {
      const old = previous?.projects.find(item => item.id === project.id);
      return {
        id: project.id, number: project.number, detail: project.detail, verification: project.verification,
        previousText: source ? project.priorText : old ? reviewText(old.review, old.previousText) : '',
        previousHealth:old?.review.health,
        review: {
          ...blankReview,
          health:old?.review.health??blankReview.health,
          status: source ? 'source' : 'pending',
          sourceText: source ? project.latestText : undefined,
          actions: old?.review.actions.filter(action => action.status !== 'Selesai').map(action => ({...action, carried: true})) ?? [],
        },
      };
    }),
  };
}

export function meetingReadiness(meeting: Meeting) {
  const incomplete:Array<{id:string;label:string;problems:string[]}>=[], pending:Array<{id:string;label:string}>=[];
  let updated=0, unchanged=0, source=0, verification=0;
  for(const project of meeting.projects){
    const {id,number,detail,review}=project;
    const label=number+'. '+detail.name;
    if(project.verification)verification++;
    if(review.status==='pending'){pending.push({id,label});continue}
    if(review.status==='none'){unchanged++;continue}
    if(review.status==='source'){source++;continue}
    updated++;
    const problems:string[]=[];
    const conditionChanged=review.health!=='Belum dinilai'&&review.health!==previousCondition(project);
    if(!conditionChanged&&![review.summary,...review.items.map(item=>item.text),...review.actions.filter(action=>!action.carried).map(action=>action.text)].some(value=>value.trim())){
      problems.push('Tambahkan kondisi atau uraian pembaruan.');
    }
    if(review.actions.some(action=>!action.text.trim()&&(action.pic.trim()||action.due)))problems.push('Isi uraian tindak lanjut.');
    if(review.items.some(item=>!item.text.trim()))problems.push('Isi uraian pembaruan yang ditambahkan.');
    if(problems.length)incomplete.push({id,label,problems});
  }
  const total=meeting.projects.length;
  return {total,reviewed:total-pending.length,updated,unchanged,source,verification,pending,incomplete,ready:total>0&&!pending.length&&!incomplete.length};
}

export function meetingChecks(meeting:Meeting) {
  const readiness=meetingReadiness(meeting);
  if(!readiness.total)return ['Tambahkan proyek untuk ditinjau.'];
  return [
    ...readiness.pending.map(project=>project.label+' belum ditinjau.'),
    ...readiness.incomplete.flatMap(project=>project.problems.map(problem=>project.label+' · '+problem)),
  ];
}
