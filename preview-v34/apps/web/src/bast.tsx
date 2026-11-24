import { formatMoneyNumber, parseRupiahInput } from '../../../packages/shared/money';
import { MoneyInput } from './money-input';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import type { ProjectRow } from '../../../packages/shared/domain';
import { DocumentExport } from './document-export';
import { ButtonConfirm, dateLabel, ErrorBox, Heading } from './ui';
import {
  bastTemplates, billingLimit, blankBastFields, blankBillingRow, currencyLabel, maxBillingAmount, newBastDraft, percentLabel,
  readPercentage, sampleBastDraft, terbilang, verificationComparison, type BastDraft, type BastFields, type BastKind, type BillingRow,
} from './bast-templates';

type Field = { key:keyof BastFields; label:string; type?:'date'|'textarea'|'percentage' };
const common:Field[]=[
  {key:'work',label:'Nama pekerjaan'},{key:'date',label:'Tanggal dokumen',type:'date'},{key:'city',label:'Kota penandatanganan'},
  {key:'location',label:'Lokasi pekerjaan',type:'textarea'},{key:'attachments',label:'Lampiran, satu per baris',type:'textarea'},
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

export function Bast({projects}:{projects:ProjectRow[]}){
  const [kind,setKind]=useState<BastKind>('pekerjaan');
  const [drafts,setDrafts]=useState(()=>({
    pekerjaan:newBastDraft('pekerjaan'),monitoring:newBastDraft('monitoring'),verifikasi:newBastDraft('verifikasi'),
  }));
  const [view,setView]=useState<'edit'|'preview'>('edit');
  const [error,setError]=useState('');
  const [confirm,setConfirm]=useState(false);
  const paper=useRef<HTMLElement>(null);
  const draft=drafts[kind];
  const fields=draft.fields;
  const isWork=kind==='pekerjaan';
  const total=draft.billing.reduce((sum,row)=>sum+Number(row.amount),0);
  const patch=(update:Partial<BastDraft>)=>setDrafts(previous=>({...previous,[kind]:{...previous[kind],...update}}));
  const changeField=(key:keyof BastFields,value:string)=>patch({fields:{...fields,[key]:value}});
  function chooseProject(id:string){
    const project=projects.find(row=>row.id===id);
    patch({projectId:id,fields:project?{
      ...fields,work:project.detail.name,providerSigner:project.detail.pm,...(isWork?{customer:project.detail.customer}:{}),
    }:fields});
  }
  function sample(){
    patch(sampleBastDraft(kind));setError('');setConfirm(false);
  }
  function changeBilling(id:string, update:Partial<BillingRow>){
    patch({billing:draft.billing.map(row=>row.id===id?{...row,...update}:row)});
  }
  const inputs=(items:Field[])=>items.map(({key,label,type})=>{
    const invalid=type==='percentage'&&!!fields[key]&&readPercentage(fields[key])===null;
    return <label key={key} className={type==='textarea'||key==='work'?'span-full':undefined}>
      {label}
      {type==='textarea'?<textarea rows={key==='location'?3:2} value={fields[key]} onChange={e=>changeField(key,e.target.value)}/>
        :<input type={type==='date'?'date':'text'} inputMode={type==='percentage'?'decimal':undefined}
          aria-invalid={invalid||undefined} aria-describedby={invalid?key+'-range':undefined} value={fields[key]} onChange={e=>changeField(key,e.target.value)}/>}
      {invalid&&<small className="bast-invalid" id={key+'-range'}>Masukkan angka 0–100 hingga dua desimal.</small>}
    </label>;
  });
  return <div className={'print-scope bast-page bast-view-'+view}>
    <div className="no-print">
      <Heading title="BAST" description="Susun berita acara pekerjaan dan dokumen capaian Produk Dalam Negeri (PDN)." actions={<>
        <button className="button" onClick={()=>hasInput(draft)?setConfirm(true):sample()}>Isi data contoh</button>
        <DocumentExport paper={paper} name={bastTemplates[kind].label.replaceAll(' ','-')+(fields.date?'-'+fields.date:'')} formats={['Word','PDF']} onError={setError}/>
      </>}/>
      <div className="bast-template-picker" role="group" aria-label="Jenis dokumen">
        {templateKeys.map(key=><button type="button" className={'button '+(kind===key?'selected':'')} key={key} aria-pressed={kind===key} onClick={()=>{setKind(key);setError('')}}>{bastTemplates[key].label}</button>)}
      </div>
    </div>
    {error&&<ErrorBox message={error}/>}
    <div className="mom-view-switch no-print" aria-label="Tampilan dokumen">
      <button type="button" aria-pressed={view==='edit'} onClick={()=>setView('edit')}>Isi dokumen</button>
      <button type="button" aria-pressed={view==='preview'} onClick={()=>setView('preview')}>Pratinjau</button>
    </div>
    <div className="document-layout bast-layout">
      <section className="panel padded no-print bast-editor" aria-label="Isi dokumen">
        <h2>Isi dokumen</h2>
        <EditGroup title="Identitas dokumen">
          {!!projects.length&&<label className="span-full">Proyek
            <select value={draft.projectId} onChange={event=>chooseProject(event.target.value)}>
              <option value="">Isi pekerjaan manual</option>
              {projects.map(project=><option key={project.id} value={project.id}>{project.id} · {project.detail.name}</option>)}
            </select>
          </label>}
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
            <label>Perlakuan PPN<select value={fields.ppn} onChange={e=>changeField('ppn',e.target.value)}>
              <option>Termasuk PPN</option><option>Belum termasuk PPN</option><option>Tanpa keterangan</option>
            </select></label>
            {draft.billing.map((row,index)=><fieldset key={row.id} className="clean-fieldset bast-billing-row span-full">
              <legend>Tagihan {index+1}</legend>
              <div className="field-grid">
                <label className="span-full">Nama dokumen<input value={row.document} onChange={e=>changeBilling(row.id,{document:e.target.value})}/></label>
                <label className="span-full">Deskripsi pekerjaan<textarea rows={2} value={row.description} onChange={e=>changeBilling(row.id,{description:e.target.value})}/></label>
                <label>Total tagihan (Rp)<MoneyInput whole value={row.amount ? formatMoneyNumber(Number(row.amount)) : ''}
                  onValue={value=>{const amount=parseRupiahInput(value);if(value==='')changeBilling(row.id,{amount:''});else if(amount!==null&&Number.isInteger(amount)&&amount<=maxBillingAmount)changeBilling(row.id,{amount:String(amount)})}}/></label>
                <div className="bast-remove-line">
                  <button className="icon-button" aria-label={'Hapus tagihan '+(index+1)} title="Hapus tagihan" onClick={()=>patch({billing:draft.billing.filter(item=>item.id!==row.id)})}><Trash2 size={16}/></button>
                </div>
              </div>
            </fieldset>)}
            <div className="split span-full bast-billing-total">
              <button className="button" disabled={draft.billing.length>=billingLimit} onClick={()=>patch({billing:[...draft.billing,blankBillingRow()]})}><Plus size={15}/> Tambah tagihan</button>
              <strong>{currencyLabel(total)}</strong>
            </div>
          </EditGroup></>:<EditGroup title="Capaian PDN">
          {inputs(kind==='monitoring'?monitoring:verification)}
          {kind==='verifikasi'&&readPercentage(fields.final)!==null&&readPercentage(fields.commitment)!==null&&<p className="span-full muted" aria-live="polite">{verificationComparison(fields)}</p>}
        </EditGroup>}
      </section>
      <section className="paper-stage bast-paper-stage" aria-label="Pratinjau dokumen">
        <div className="document-tabs no-print"><strong><FileText size={15}/> Pratinjau dokumen</strong></div>
        <article ref={paper} className="paper bast-paper">
          <BastDocument kind={kind} draft={draft} total={total}/>
        </article>
      </section>
    </div>
    {confirm&&<ButtonConfirm value="Ganti isian templat ini dengan data contoh?" onCancel={()=>setConfirm(false)} onConfirm={sample}/>}
  </div>;
}

function EditGroup({title,children}:{title:string;children:ReactNode}){
  return <fieldset className="clean-fieldset bast-edit-group">
    <legend>{title}</legend><div className="field-grid">{children}</div>
  </fieldset>;
}

function BastDocument({kind,draft,total}:{kind:BastKind;draft:BastDraft;total:number}){
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
      <img className="paper-logo" src="/brand/sdd.png" alt="Swadharma Duta Data"/>
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
          <tbody>{draft.billing.map((row,index)=><tr key={row.id}><td>{index+1}</td><td>{valueOrDash(row.document)}</td><td>{valueOrDash(row.description)}</td><td>{row.amount?currencyLabel(Number(row.amount)):'—'}</td></tr>)}</tbody>
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
