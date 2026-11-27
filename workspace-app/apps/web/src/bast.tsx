import { NavIcon } from './nav-icon';
import { TabWorkspace } from './choice-bar';
import { SessionDocumentLogo, useDocumentLogo } from './document-branding';
import { NumberInput } from './number-input';
import { TextInput, Textarea, Select } from './form-controls';
import { formatMoneyNumber, parseRupiahInput } from '../../../packages/shared/money';
import { CurrencyInput } from './money-input';
import { Plus } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { ProjectRow } from '../../../packages/shared/domain';
import { DocumentPreview, DocumentWorkspace } from './document-workspace';
import { SearchableSelect } from './search-select';
import { DateInput } from './date-input';
import { DocumentExport } from './document-export';
import { Button, ConfirmDialog, dateLabel, ErrorBox, Heading } from './ui';
import {
  bastTemplates, billingLimit, blankBastFields, blankBillingRow, currencyLabel, maxBillingAmount, newBastDraft, percentLabel,
  readPercentage, sampleBastDraft, terbilang, verificationComparison, type BastDraft, type BastFields, type BastKind, type BillingRow,
} from './bast-templates';

type Field = { key:Exclude<keyof BastFields,'ppn'>; label:string; type?:'date'|'textarea'|'percentage' };
const common:Field[]=[
  {key:'work',label:'Nama pekerjaan'},{key:'date',label:'Tanggal dokumen',type:'date'},{key:'city',label:'Kota penandatanganan'},
  {key:'location',label:'Lokasi pekerjaan',type:'textarea'},{key:'attachments',label:'Lampiran',type:'textarea'},
];
const customer:Field[]=[
  {key:'customer',label:'Perusahaan Pihak Pertama'},{key:'division',label:'Divisi Pihak Pertama'},
  {key:'customerSigner',label:'Penanda tangan Pihak Pertama'},{key:'customerRole',label:'Jabatan Pihak Pertama'},
];
const provider:Field[]=[
  {key:'provider',label:'Perusahaan penyedia'},{key:'providerSigner',label:'Nama penanda tangan'},
  {key:'providerRole',label:'Jabatan penanda tangan'},
];
const reference:Field[]=[
  {key:'spk',label:'Nomor SPK'},{key:'spkDate',label:'Tanggal SPK',type:'date'},
  {key:'pks',label:'Nomor PKS'},{key:'pksDate',label:'Tanggal PKS',type:'date'},
];
const monitoring:Field[]=[
  {key:'commitment',label:'PDN komitmen (%)',type:'percentage'},{key:'progress',label:'Progres pekerjaan (%)',type:'percentage'},
  {key:'interim',label:'PDN capaian sementara (%)',type:'percentage'},
];
const verification:Field[]=[
  {key:'commitment',label:'PDN komitmen (%)',type:'percentage'},{key:'final',label:'PDN hasil verifikasi (%)',type:'percentage'},
];
const examples:Record<Field['key'],string>={
  work:'Pengembangan Portal Layanan',date:'24/11/2026',city:'Jakarta',location:'Kantor pusat, Jakarta Selatan',
  attachments:'Berita acara pengujian\nLaporan penyelesaian pekerjaan',customer:'PT Nusantara Digital',division:'Divisi Teknologi Informasi',
  customerSigner:'Rani Pratama',customerRole:'Manajer Teknologi Informasi',provider:'PT Mitra Solusi Teknologi',
  providerSigner:'Dimas Saputra',providerRole:'Manajer Proyek',address:'Jl. Melati No. 12, Jakarta',
  start:'01/09/2026',end:'30/11/2026',spk:'SPK-014/2026',spkDate:'27/08/2026',pks:'PKS-008/2026',pksDate:'24/08/2026',
  commitment:'55,50',progress:'75',interim:'48,25',final:'57,80',
};
const templateKeys=Object.keys(bastTemplates) as BastKind[];
const dayName=new Intl.DateTimeFormat('id-ID',{weekday:'long',timeZone:'UTC'});
const monthName=new Intl.DateTimeFormat('id-ID',{month:'long',timeZone:'UTC'});
const valueOrDash=(value:string)=>value.trim()||'—';

function introduction(date:string){
  if(!date)return 'Pada hari dan tanggal tersebut, kami yang bertanda tangan di bawah ini';
  const day=new Date(date+'T00:00:00Z');
  const dayNumber=day.getUTCDate();
  const inWords=terbilang(dayNumber);
  return `Pada hari ini, ${dayName.format(day)} tanggal ${dayNumber} (${inWords.charAt(0).toUpperCase()+inWords.slice(1)}) bulan ${monthName.format(day)} tahun ${day.getUTCFullYear()}, kami yang bertanda tangan di bawah ini`;
}

function hasInput(draft:BastDraft){
  return (Object.keys(blankBastFields) as Array<keyof BastFields>).some(key=>draft.fields[key]!==blankBastFields[key])
    || draft.billing.some(row=>row.description||row.amount||row.document!=='Berita Acara Serah Terima Pekerjaan');
}

export function Bast({projects,userId,allowLogoChange}:{projects:ProjectRow[];userId:string;allowLogoChange:boolean}){
  const [kind,setKind]=useState<BastKind>('pekerjaan');
  const [drafts,setDrafts]=useState(()=>({
    pekerjaan:newBastDraft('pekerjaan'),monitoring:newBastDraft('monitoring'),verifikasi:newBastDraft('verifikasi'),
  }));
  const [error,setError]=useState('');
  const [confirm,setConfirm]=useState(false);
  const paper=useRef<HTMLElement>(null);
  const draft=drafts[kind];
  const fields=draft.fields;
  const isWork=kind==='pekerjaan';
  const invalidPeriod=isWork&&Boolean(fields.start&&fields.end&&fields.end<fields.start);
  const billingAmount=(raw:string)=>{
    const parsed=parseRupiahInput(raw);
    return parsed!==null&&Number.isInteger(parsed)&&parsed<=maxBillingAmount?parsed:null;
  };
  const invalidPercent=(kind==='monitoring'?monitoring:kind==='verifikasi'?verification:[]).some(({key})=>Boolean(fields[key])&&readPercentage(fields[key])===null);
  const invalidBilling=draft.billing.some(row=>Boolean(row.amount)&&billingAmount(row.amount)===null);
  const total=draft.billing.reduce((sum,row)=>sum+(billingAmount(row.amount)??0),0);
  const patch=(update:Partial<BastDraft>)=>setDrafts(previous=>({...previous,[kind]:{...previous[kind],...update}}));
  const changeField=(key:keyof BastFields,value:string)=>patch({fields:{...fields,[key]:value}});
  function chooseProject(id:string){
    const project=projects.find(row=>row.id===id);
    patch({projectId:id,fields:project?{
      ...fields,work:project.detail.name,providerSigner:project.detail.pm,...(isWork?{customer:project.detail.customer}:{}),
    }:fields});
  }
  function sample(){
    const sample=sampleBastDraft(kind);
    patch({...sample,billing:sample.billing.map(row=>({...row,amount:row.amount?formatMoneyNumber(Number(row.amount)):''}))});
    setError('');setConfirm(false);
  }
  function changeBilling(id:string, update:Partial<BillingRow>){
    patch({billing:draft.billing.map(row=>row.id===id?{...row,...update}:row)});
  }
  const inputs=(items:Field[])=>items.map(({key,label,type})=>{
    const placeholder=examples[key];
    const invalid=type==='percentage'&&!!fields[key]&&readPercentage(fields[key])===null;
    return <label key={key} className={type==='textarea'||key==='work'?'span-full':undefined}>
      {label}
      {type==='textarea'?<Textarea placeholder={placeholder} grow="note" value={fields[key]} onChange={e=>changeField(key,e.target.value)}/>
        :type==='date'?<DateInput label={label} placeholder={placeholder} aria-invalid={key==='end'&&invalidPeriod||undefined}
          aria-describedby={key==='end'&&invalidPeriod?'bast-period':undefined} value={fields[key]} onValue={value=>changeField(key,value)}/>
        :type==='percentage'?<NumberInput placeholder={placeholder} max={100}
          aria-invalid={invalid||undefined} aria-describedby={invalid?key+'-range':undefined}
          value={fields[key]} onValue={value=>changeField(key,value)}/>
        :<TextInput type="text" placeholder={placeholder}
          value={fields[key]} onChange={e=>changeField(key,e.target.value)}/>}
      {key==='attachments'&&<small className="muted">Tulis satu nama lampiran per baris.</small>}
      {invalid&&<small className="bast-invalid" id={key+'-range'}>Masukkan angka 0–100 hingga dua desimal.</small>}
      {key==='end'&&invalidPeriod&&<small className="bast-invalid" id="bast-period">Akhir periode tidak boleh mendahului awal periode.</small>}
    </label>;
  });
  const hasDraft=hasInput(draft);
  return <div className="print-scope bast-page">
    <div className="no-print">
      <Heading title="BAST" description="Susun berita acara pekerjaan dan dokumen capaian Produk Dalam Negeri (PDN)."/>
    </div>
    <TabWorkspace label="Jenis dokumen" tabs={templateKeys.map(id=>({id,label:bastTemplates[id].label}))} value={kind}
      onChange={id=>{setKind(id);setError('')}}>
    <div className="document-type-toolbar no-print"><Button className="button" type="button" onClick={()=>hasDraft?setConfirm(true):sample()}><NavIcon name="sample"/> Muat contoh</Button></div>
    {error&&<ErrorBox message={error}/>}
    <DocumentWorkspace userId={userId} preview={<DocumentPreview key={kind} paper={paper}
      toolbar={<span className="muted">{(invalidPeriod||invalidBilling||invalidPercent)?'Periksa isian':'Draf'}</span>}
      actions={<>{(invalidPeriod||invalidBilling||invalidPercent)?<Button className="button" type="button" disabled title="Periksa tanggal atau angka yang tidak valid">Unduh</Button>:
          <DocumentExport paper={paper} name={bastTemplates[kind].label.replaceAll(' ','-')+(fields.date?'-'+fields.date:'')} formats={['Word','PDF']} onError={setError}/>}</>}>
      <article ref={paper} className="paper bast-paper"><BastDocument kind={kind} draft={draft} total={total}/></article>
    </DocumentPreview>}>
      <section className="panel padded no-print bast-editor" aria-label="Isi dokumen">
        <h2>Isi dokumen</h2>
        <EditGroup title="Identitas dokumen">
          {!!projects.length&&<div className="span-full field"><label htmlFor="bast-project">Proyek</label>
            <SearchableSelect id="bast-project" label="Proyek" value={draft.projectId} emptyLabel="Pilih proyek atau isi pekerjaan manual" example="Pengembangan Portal Layanan"
              options={projects.map(project=>({id:project.id,label:project.id+' · '+project.detail.name}))} onChange={chooseProject}/>
          </div>}
          {inputs(common.slice(0,3))}
          {isWork&&inputs([{key:'start',label:'Awal periode pekerjaan',type:'date'},{key:'end',label:'Akhir periode pekerjaan',type:'date'}])}
          {inputs(common.slice(3))}
        </EditGroup>
        {isWork&&<EditGroup title="Pihak Pertama">{inputs(customer)}</EditGroup>}
        <EditGroup title={isWork?'Pihak Kedua':'Penyedia barang dan/atau jasa'}>
          {inputs(isWork?provider:[...provider,{key:'address',label:'Alamat penyedia',type:'textarea'}])}
        </EditGroup>
        {isWork?<><EditGroup title="Dasar serah terima">{inputs(reference)}</EditGroup>
          <EditGroup title="Rincian tagihan">
            <label>Perlakuan PPN<Select value={fields.ppn} onChange={e=>changeField('ppn',e.target.value)}>
              <option>Termasuk PPN</option><option>Belum termasuk PPN</option><option>Tanpa keterangan</option>
            </Select></label>
            {draft.billing.map((row,index)=><fieldset key={row.id} className="clean-fieldset bast-billing-row span-full">
              <legend>Tagihan {index+1}</legend>
              <div className="field-grid">
                <label className="span-full">Nama dokumen<TextInput placeholder="BAST Tahap 1" value={row.document} onChange={e=>changeBilling(row.id,{document:e.target.value})}/></label>
                <label className="span-full">Deskripsi pekerjaan<Textarea grow="paragraph" placeholder="Implementasi dan pengujian portal" value={row.description} onChange={e=>changeBilling(row.id,{description:e.target.value})}/></label>
                <label>Total tagihan (Rp)<CurrencyInput whole maxAmount={maxBillingAmount} placeholder="25.000.000" value={row.amount}
                  onValue={value=>changeBilling(row.id,{amount:value})}/></label>
                <div className="bast-remove-line">
                  <button className="icon-button danger-text" type="button" aria-label={'Hapus tagihan '+(index+1)} title="Hapus tagihan" onClick={()=>patch({billing:draft.billing.filter(item=>item.id!==row.id)})}><NavIcon name="trash"/></button>
                </div>
              </div>
            </fieldset>)}
            <div className="split span-full bast-billing-total">
              <Button className="button" disabled={draft.billing.length>=billingLimit} onClick={()=>patch({billing:[...draft.billing,blankBillingRow()]})}><Plus size={15}/> Tambah tagihan</Button>
              <strong>{invalidBilling?'Periksa nilai tagihan':currencyLabel(total)}</strong>
            </div>
          </EditGroup></>:<EditGroup title="Capaian PDN">
          {inputs(kind==='monitoring'?monitoring:verification)}
          {kind==='verifikasi'&&readPercentage(fields.final)!==null&&readPercentage(fields.commitment)!==null&&<p className="span-full muted" aria-live="polite">{verificationComparison(fields)}</p>}
        </EditGroup>}
        {allowLogoChange&&<SessionDocumentLogo scope="bast"/>}
      </section>
    </DocumentWorkspace>
    </TabWorkspace>
    {confirm&&<ConfirmDialog title="Muat data contoh" object={bastTemplates[kind].label} consequence="Isian dokumen saat ini akan diganti dengan data contoh." confirmLabel="Muat contoh" onCancel={()=>setConfirm(false)} onConfirm={sample}/>}
  </div>;
}

function EditGroup({title,children}:{title:string;children:ReactNode}){
  return <section className="bast-edit-group">
    <h3>{title}</h3><div className="field-grid">{children}</div>
  </section>;
}

function BastDocument({kind,draft,total}:{kind:BastKind;draft:BastDraft;total:number}){
  const logo=useDocumentLogo('bast');
  const f=draft.fields;
  const isWork=kind==='pekerjaan';
  const attachments=f.attachments.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const refs=[
    {label:'SPK',number:f.spk,date:f.spkDate},{label:'PKS',number:f.pks,date:f.pksDate},
  ].filter(item=>item.number||item.date);
  const period=[f.start,f.end].filter(Boolean).map(value=>dateLabel(value)).join(' – ');
  const ppn=f.ppn==='Tanpa keterangan'?'':' ('+f.ppn+')';
  return <>
    <header className="document-letterhead">
      <img className="paper-logo" src={logo} alt="Logo dokumen"/>
      <h2>{bastTemplates[kind].title}</h2>
      <p className="bast-work-title"><strong>{valueOrDash(f.work)}</strong></p>
      {isWork&&period&&<p>Periode pekerjaan {period}</p>}
    </header>
    <dl className="paper-fields bast-fields">
      <div><dt>Lokasi</dt><dd className="pre-wrap">{valueOrDash(f.location)}</dd></div>
      <div><dt>Tanggal</dt><dd>{dateLabel(f.date)}</dd></div>
      <div><dt>Lampiran</dt><dd className="pre-wrap">{attachments.length?attachments.map((name,i)=>(i+1)+'. '+name).join('\n'):'—'}</dd></div>
    </dl>
    <div className="bast-body">
      <p>{introduction(f.date)}.</p>
      {isWork?<><ol>
        <li><strong>{valueOrDash(f.customer)}</strong>, selanjutnya disebut Pihak Pertama.</li>
        <li><strong>{valueOrDash(f.provider)}</strong>, selanjutnya disebut Pihak Kedua.</li>
      </ol>
      {refs.length>0&&<section className="paper-section">
        <h3>Dasar serah terima</h3><dl className="paper-fields bast-fields">
          {refs.map(({label,number,date})=><div key={label}><dt>{label}</dt><dd>{[number,date&&'tanggal '+dateLabel(date)].filter(Boolean).join(' · ')}</dd></div>)}
        </dl>
      </section>}
      <p>Pihak Pertama telah menerima hasil pekerjaan <strong>{valueOrDash(f.work)}</strong> yang diserahkan oleh Pihak Kedua{f.spk?' sesuai dengan Surat Perintah Kerja '+f.spk:''}{f.spk&&f.spkDate?' tanggal '+dateLabel(f.spkDate):''}.</p>
      <section className="paper-section">
        <h3>Rincian tagihan</h3>
        <p>Atas pekerjaan yang telah dilaksanakan, Pihak Kedua berhak menagihkan pembayaran kepada Pihak Pertama sebesar <strong>{draft.billing.some(row=>row.amount)?currencyLabel(total)+ppn:'—'}</strong>.</p>
        <table className="bast-invoice-table">
          <thead><tr><th>No</th><th>Nama dokumen</th><th>Deskripsi pekerjaan</th><th>Total tagihan</th></tr></thead>
          <tbody>{draft.billing.map((row,index)=><tr key={row.id}><td>{index+1}</td><td>{valueOrDash(row.document)}</td><td>{valueOrDash(row.description)}</td><td>{row.amount?currencyLabel(parseRupiahInput(row.amount)??0):'—'}</td></tr>)}</tbody>
        </table>
        {draft.billing.some(row=>row.amount)&&<p className="bast-terbilang"><strong>Terbilang</strong> · {terbilang(total)} rupiah.</p>}
      </section></>:<>
        <dl className="paper-fields bast-fields">
          <div><dt>Nama</dt><dd>{valueOrDash(f.providerSigner)}</dd></div><div><dt>Jabatan</dt><dd>{valueOrDash(f.providerRole)}</dd></div>
          <div><dt>Perusahaan</dt><dd>{valueOrDash(f.provider)}</dd></div><div><dt>Alamat</dt><dd className="pre-wrap">{valueOrDash(f.address)}</dd></div>
        </dl>
        <section className="paper-section">
          <h3>{kind==='monitoring'?'Hasil monitoring':'Hasil verifikasi akhir'}</h3>
          <p>{kind==='monitoring'?'Monitoring Capaian PDN':'Verifikasi Akhir Capaian PDN'} untuk pekerjaan <strong>{valueOrDash(f.work)}</strong> oleh <strong>{valueOrDash(f.provider)}</strong> memperoleh hasil berikut.</p>
          <ol>
            <li>Nilai PDN komitmen sebesar <strong>{percentLabel(f.commitment)}</strong>.</li>
            {kind==='monitoring'?<li>Pada progres pekerjaan <strong>{percentLabel(f.progress)}</strong>, nilai PDN capaian sementara sebesar <strong>{percentLabel(f.interim)}</strong>.</li>:<>
              <li>Nilai PDN hasil verifikasi sebesar <strong>{percentLabel(f.final)}</strong>.</li>
              <li>{verificationComparison(f)}</li>
            </>}
          </ol>
          {kind==='verifikasi'&&<p>{valueOrDash(f.provider)} menyatakan bahwa Verifikasi Akhir Capaian PDN telah dilaksanakan sesuai dengan prosedur dan ketentuan yang berlaku.</p>}
        </section>
      </>}
      <p>Demikian {isWork?'Berita Acara ini':kind==='monitoring'?'laporan ini':'pernyataan ini'} dibuat dan ditandatangani di {valueOrDash(f.city)} pada tanggal tersebut di atas dalam rangkap secukupnya untuk dipergunakan sebagaimana mestinya.</p>
    </div>
    <div className="bast-signatures">
      <table aria-label="Penanda tangan">
        <thead><tr>{isWork&&<th scope="col">Pihak Pertama</th>}<th scope="col">{isWork?'Pihak Kedua':'Penyedia Barang dan/atau Jasa'}</th></tr></thead>
        <tbody>
          <tr>{isWork&&<td>{valueOrDash(f.customer)}{f.division&&<><br/>{f.division}</>}</td>}<td>{valueOrDash(f.provider)}</td></tr>
          <tr data-export-row-height="44">{isWork&&<td/>}<td/></tr>
          <tr>{isWork&&<td><strong>{valueOrDash(f.customerSigner)}</strong><br/>{valueOrDash(f.customerRole)}</td>}<td><strong>{valueOrDash(f.providerSigner)}</strong><br/>{valueOrDash(f.providerRole)}</td></tr>
        </tbody>
      </table>
    </div>
  </>;
}
