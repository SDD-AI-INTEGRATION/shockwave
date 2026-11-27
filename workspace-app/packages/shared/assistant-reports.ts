import { formatRupiah } from './money';
import { pillars, type ProjectRow } from './domain';

const formats=['PDF','Excel','Word'] as const;
export type ReportFormat=typeof formats[number];
type Pillar=typeof pillars[number];

export type WeeklyExport={projectId:string;projectName:string;week:number;format?:ReportFormat};
export type RevenueRow=Pick<ProjectRow,'id'|'pillar'|'plan'|'actual'|'reported'|'simulated'> & {name:string};
export type RevenueExport={
  title:string;rows:RevenueRow[];year:2026;format?:ReportFormat;
  plan:number;recorded:number;estimated:number;estimatedCount:number;
};
export type ReportChoice={label:string;prompt:string};
export type AssistantReportReply={text:string;weeklyExport?:WeeklyExport;revenueExport?:RevenueExport;reportChoices?:ReportChoice[];references?:string[]};

const normalize=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const asPhrase=(value:string)=>' '+normalize(value)+' ';
export const revenueCurrency=formatRupiah;

const baseNumbers=['nol','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan'];
const spokenWeeks=new Map<string,number>([
  ...baseNumbers.map((value,i)=>[value,i] as const),['pertama',1],['kesatu',1],['kedua',2],['ketiga',3],
  ['keempat',4],['kelima',5],['keenam',6],['ketujuh',7],['kedelapan',8],['kesembilan',9],
  ['sepuluh',10],['kesepuluh',10],['sebelas',11],['kesebelas',11],
]);
for(let i=12;i<=19;i++)spokenWeeks.set(baseNumbers[i-10]+' belas',i);
for(let ten=2;ten<=9;ten++){
  const tens=baseNumbers[ten]+' puluh';
  spokenWeeks.set(tens,ten*10);
  for(let one=1;one<=9;one++)spokenWeeks.set(tens+' '+baseNumbers[one],ten*10+one);
}
const smallEnglish=['zero','first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'];
const englishNumbers=['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
smallEnglish.forEach((value,i)=>spokenWeeks.set(value,i));
englishNumbers.forEach((value,i)=>spokenWeeks.set(value,i));
const weekWords=[...spokenWeeks.keys()].sort((a,b)=>b.length-a.length).join('|');
const namedWeek=new RegExp('\\b(?:minggu|pekan|week|mgg|mg)\\s*(?:yang\\s+)?(?:ke\\s*|nomor\\s+|no\\s+)?(\\d{1,4}(?:st|nd|rd|th)?|'+weekWords+')\\b');
const explicitExport=/\b(?:ekspor(?:kan)?|export|eksport|unduh(?:kan)?|download|cetak|print|ambil|tarik|generate|file|pdf|word|docx|excel|xlsx|spreadsheet|laporan|report|rekap(?:itulasi)?)\b/;
const revenueLanguage=/\b(?:revenue|revenu|pendapatan|pemasukan|omzet|omset|income|turnover|penjualan)\b/;
const reportAction=/\b(?:buat(?:kan)?|bikin(?:kan)?|siapkan|ringkas(?:kan|an|in)?|summary|summari[sz]e|rangkuman|rekap(?:itulasi|in)?|analisis|analisa|tampilkan|lihat|minta|berapa|hitung(?:kan)?|jumlah|total|detail|rincian)\b/;

const pillarAliases:Record<Pillar,RegExp>={
  'IT Infrastructure':/\b(?:infra|infrastuktur|infrastruktur|infrastructure|jaringan|network|networking)\b/,
  'Software Development':/\b(?:aplikasi|app|apps|software|application|applications|perangkat lunak)\b/,
  'Managed Services':/\b(?:sumber daya (?:ti|it)|sdm(?: ti| it)?|manpower|tenaga (?:ti|it|ahli)|staffing|resource|outsourcing|alih daya|managed services?)\b/,
};
const skip=new Set(normalize('tolong mohon boleh sekalian coba project proyek projects laporan report mingguan weekly progres progress kemajuan data ekspor export eksport eksporkan unduh unduhkan download file cetak print ambil generate saya butuh berikan kasih kirim buat buatkan bikin bikinkan susun susunkan siapkan tarik keluarkan simpan save ringkas ringkasin ringkasan rangkuman summary summarize summarise rekap rekapitulasi rekapin analisis analisa tampilkan lihat minta terkait tentang dari dalam untuk dan atau yang ke minggu pekan week mg mgg di pada dong operasi operasional kerjaannya tersebut alias jadikan berupa as an a for the in of please give me to and about with from over by as weekly worksheet spreadsheet pdf excel xlsx word docx format bentuk nomor id semua seluruh keseluruhan portofolio portfolio all aggregate overall pendapatan revenue revenu omzet omset income turnover pemasukan penjualan tahun aktif active ongoing berjalan selesai closed completed saja only khusus').split(' '));

function formatOf(message:string):ReportFormat|undefined{
  if(/\b(?:pdf)\b/.test(message))return formats[0];
  if(/\b(?:excel|xlsx|spreadsheet)\b/.test(message))return formats[1];
  if(/\b(?:word|docx)\b/.test(message))return formats[2];
}

function searchTerms(query:string){
  return [...new Set(query.split(' ').filter(term=>term.length>1&&!skip.has(term)&&!/^\d+$/.test(term)))];
}

function findProjects(raw:string, normalized:string, rows:ProjectRow[]):ProjectRow[]{
  const ids=[...new Set([...normalized.matchAll(/\bp\s*0*(\d{1,8})\b/g)].map(match=>Number(match[1])))];
  if(ids.length)return rows.filter(row=>ids.includes(Number(row.id.slice(1))));
  const terms=asPhrase(normalized);
  const exact=rows.filter(row=>terms.includes(asPhrase(row.detail.name)));
  if(exact.length){
    return exact.filter(row=>!exact.some(other=>other!==row&&
      normalize(other.detail.name).length>normalize(row.detail.name).length&&asPhrase(other.detail.name).includes(asPhrase(row.detail.name))));
  }
  const quoted=raw.match(/["“]([^"”]+)["”]/)?.[1];
  const query=normalize(quoted||normalized).replace(namedWeek,' ').replace(/\bw\s*\d{1,4}\b/,' ');
  const useful=searchTerms(query);
  if(!useful.length)return [];
  return rows.filter(row=>{
    const name=new Set(normalize(row.detail.name).split(' '));
    return useful.every(term=>name.has(term));
  });
}

export function assistantReportReply(raw:string,rows:ProjectRow[]):AssistantReportReply|null {
  const message=normalize(raw);
  const format=formatOf(message);
  const weekToken=namedWeek.exec(message)?.[1]??/\bw\s*(\d{1,4})\b/.exec(message)?.[1];
  const requestsRevenue=revenueLanguage.test(message)&&(reportAction.test(message)||explicitExport.test(message));
  if(requestsRevenue){
    if(weekToken||[...message.matchAll(/\b20\d{2}\b/g)].some(match=>match[0]!=='2026')||/\b(?:bulan|bulanan|triwulan|kuartal|quarter|q[1-4]|yoy)\b/.test(message)){
      return {text:'Ringkasan pendapatan tersedia untuk agregat tahun 2026. Sebutkan pilar proyek untuk mempersempit cakupan.'};
    }
    if(/\b(?:kecuali|selain|exclude|excluding|except)\b/.test(message)){
      return {text:'Sebutkan pilar atau proyek yang ingin disertakan dalam ringkasan pendapatan.'};
    }
    const selected=pillars.filter(pillar=>pillarAliases[pillar].test(message));
    if(!selected.length&&/\b(?:pilar|kategori|sektor)\b/.test(message))return {text:'Pilar yang tersedia adalah '+pillars.slice(0,-1).join(', ')+', dan '+pillars.at(-1)+'. Pilar mana yang ingin dirangkum?'};
    const active=/\b(?:aktif|active|ongoing|berjalan)\b/.test(message);
    const closed=/\b(?:selesai|closed|completed)\b/.test(message);
    const idRequested=/\bp\s*\d{1,8}\b/.test(message);
    const explicitName=raw.match(/["“]([^"”]+)["”]/)?.[1];
    const fullName=rows.some(row=>asPhrase(message).includes(asPhrase(row.detail.name)));
    const tail=/\b(?:proyek|projects?) (.+)$/.exec(message)?.[1]??'';
    const namedScope=!selected.length&&searchTerms(tail).length>0;
    const matches=idRequested||explicitName||fullName||namedScope?findProjects(raw,namedScope&&!idRequested&&!fullName?tail:message,rows):null;
    if(matches&&!matches.length)return {text:'Proyek yang disebutkan belum ditemukan. Coba gunakan kode atau nama lengkap proyek.'};
    const filtered=rows.filter(row=>(!matches||matches.includes(row))&&(!selected.length||selected.includes(row.pillar))&&
      (active===closed||row.status===(active?'Aktif':'Selesai')));
    if(!filtered.length)return {text:'Belum ada proyek yang cocok dengan cakupan ringkasan pendapatan tersebut.'};
    const status=active===closed?'':active?' · Aktif':' · Selesai';
    const report:RevenueExport={
      title:(selected.length?selected.join(' dan '):matches?matches.map(row=>row.detail.name).join(', '):'Seluruh portofolio')+status,
      year:2026,format,
      rows:filtered.slice().sort((a,b)=>pillars.indexOf(a.pillar)-pillars.indexOf(b.pillar)||b.plan-a.plan||a.id.localeCompare(b.id)).map(({id,detail,pillar,plan,actual,reported,simulated})=>({id,name:detail.name,pillar,plan,actual,reported,simulated})),
      plan:filtered.reduce((sum,row)=>sum+row.plan,0),
      recorded:filtered.reduce((sum,row)=>sum+(row.reported?row.actual:0),0),
      estimated:filtered.reduce((sum,row)=>sum+(!row.reported?row.actual:0),0),
      estimatedCount:filtered.filter(row=>!row.reported).length,
    };
    return {
      text:['Ringkasan pendapatan 2026 untuk '+report.title+' mencakup '+filtered.length+' proyek.',
        'Total prognosa '+revenueCurrency(report.plan)+'. Realisasi tercatat '+revenueCurrency(report.recorded)+'.',
        ...(report.estimatedCount?['Estimasi realisasi '+report.estimatedCount+' proyek sebesar '+revenueCurrency(report.estimated)+'.']:[]),
      ].join('\n'),
      revenueExport:report,references:['Daftar Proyek'],
    };
  }

  const weekLanguage=!!weekToken||/\b(?:minggu|pekan|week|mingguan|weekly)\b/.test(message);
  if(!weekLanguage||!explicitExport.test(message))return null;
  if(!weekToken)return {text:'Minggu mana yang ingin diekspor? Contoh “Unduh laporan proyek P001 untuk minggu ke 3”.'};
  const week=/^\d/.test(weekToken)?Number.parseInt(weekToken,10):spokenWeeks.get(weekToken);
  if(week===undefined||week>600)return {text:'Sebutkan nomor minggu yang tercantum di Operasional, misalnya W3.'};
  const matches=findProjects(raw,message,rows);
  const choices=(projects:ProjectRow[])=>projects.slice(0,6).map(row=>({
    label:row.id+' · '+row.detail.name,
    prompt:'Ekspor laporan operasi '+row.id+' W'+week+(format?' '+format:''),
  }));
  if(matches.length>1)return {text:'Saya menemukan beberapa proyek yang cocok. Pilih proyek untuk laporan W'+week+'.',reportChoices:choices(matches)};
  if(!matches.length)return {
    text:'Saya belum menemukan proyek yang dimaksud. Pilih salah satu proyek atau kirim ulang dengan kode atau nama lengkap proyek.',
    reportChoices:choices(rows),
  };
  const project=matches[0];
  return {text:'Saya siapkan laporan mingguan '+project.detail.name+' ('+project.id+') untuk W'+week+'.',
    weeklyExport:{projectId:project.id,projectName:project.detail.name,week,format}};
}
