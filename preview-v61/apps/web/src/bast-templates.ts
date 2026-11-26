import { parseFormNumber } from '../../../packages/shared/form-number';
import { formatRupiah } from "../../../packages/shared/money";
export const bastTemplates = {
  pekerjaan: { label:'BAST Pekerjaan', title:'Berita Acara Serah Terima Pekerjaan' },
  monitoring: { label:'Laporan Monitoring PDN', title:'Laporan Monitoring Capaian PDN' },
  verifikasi: { label:'Pernyataan Verifikasi PDN', title:'Pernyataan Verifikasi Akhir PDN' },
};

export type BastKind = keyof typeof bastTemplates;
export type BastFields = {
  work:string; location:string; date:string; city:string; attachments:string; start:string; end:string;
  customer:string; division:string; customerSigner:string; customerRole:string;
  provider:string; providerSigner:string; providerRole:string; address:string;
  spk:string; spkDate:string; pks:string; pksDate:string; ppn:string;
  commitment:string; progress:string; interim:string; final:string;
};
export type BillingRow = { id:string; document:string; description:string; amount:string };
export type BastDraft = { fields:BastFields; projectId:string; billing:BillingRow[] };

export const billingLimit = 50;
export const maxBillingAmount = 999_999_999_999;
export const blankBillingRow = ():BillingRow=>({
  id:crypto.randomUUID(),document:'Berita Acara Serah Terima Pekerjaan',description:'',amount:'',
});

export const blankBastFields:BastFields={
  work:'',location:'',date:'',city:'',attachments:'',start:'',end:'',
  customer:'',division:'',customerSigner:'',customerRole:'',
  provider:'PT Swadharma Duta Data',providerSigner:'',providerRole:'',address:'',
  spk:'',spkDate:'',pks:'',pksDate:'',ppn:'Termasuk PPN',
  commitment:'',progress:'',interim:'',final:'',
};

export function newBastDraft(kind:BastKind):BastDraft{
  return {
    fields:{...blankBastFields},
    projectId:'',
    billing:kind==='pekerjaan'?[blankBillingRow()]:[],
  };
}

export function sampleBastDraft(kind:BastKind):BastDraft{
  const draft=newBastDraft(kind);
  return {
    ...draft,
    fields:{
      ...draft.fields,work:'Portal Layanan Aurora',location:'Kantor Koperasi Cahaya Fiktif\nJakarta',
      date:'2026-11-16',city:'Jakarta',start:'2026-08-01',end:'2026-10-31',
      attachments:kind==='pekerjaan'?'Daftar hadir pelatihan\nLaporan SLA':kind==='monitoring'?'Rekap penggunaan produk dalam negeri':'',
      customer:'Koperasi Cahaya Fiktif',division:'Divisi Teknologi',customerSigner:'Rani Fiktif',customerRole:'Kepala Divisi',
      providerSigner:'Naya Fiktif',providerRole:'Project Manager',address:'Kantor Proyek Aurora, Jakarta',
      spk:'SPK/DEMO/2026-014',spkDate:'2026-07-21',pks:'PKS/DEMO/2026-021',pksDate:'2026-07-24',
      commitment:'80',progress:'75',interim:'82,5',final:'84',
    },
    billing:kind==='pekerjaan'?[{...blankBillingRow(),description:'Pengembangan, pengujian, dan serah terima Portal Layanan Aurora',amount:'145000000'}]:[],
  };
}

const digits=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
export function terbilang(num:number):string{
  if(num===0)return 'nol';
  if(num<12)return digits[num];
  if(num<20)return terbilang(num-10)+' belas';
  if(num===100)return 'seratus';
  if(num===1000)return 'seribu';
  for(const [value,unit] of [[1e12,'triliun'],[1e9,'miliar'],[1e6,'juta'],[1000,'ribu'],[100,'ratus'],[10,'puluh']] as const){
    if(num<value)continue;
    const quotient=Math.floor(num/value), rest=num%value;
    const prefix=value===100&&quotient===1?'seratus':value===1000&&quotient===1?'seribu':terbilang(quotient)+' '+unit;
    return prefix+(rest?' '+terbilang(rest):'');
  }
  return '';
}

const decimal=new Intl.NumberFormat('id-ID',{maximumFractionDigits:2});
export const currencyLabel=formatRupiah;
export function readPercentage(value:string){
  return parseFormNumber(value,{max:100,allowDotDecimal:true});
}
export function percentLabel(value:string){
  const number=readPercentage(value);
  return number===null?'—':decimal.format(number)+'%';
}
export function verificationComparison(fields:BastFields){
  const commitment=readPercentage(fields.commitment), verified=readPercentage(fields.final);
  if(commitment===null||verified===null)return 'Perbandingan terhadap komitmen PDN belum tersedia.';
  const difference=verified-commitment;
  if(difference===0)return 'Nilai hasil verifikasi sama dengan nilai PDN komitmen.';
  return 'Nilai hasil verifikasi '+decimal.format(Math.abs(difference))+' poin persentase '+(difference>0?'di atas':'di bawah')+' nilai PDN komitmen.';
}
