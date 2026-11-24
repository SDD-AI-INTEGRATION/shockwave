import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { ProjectRow } from '../../../packages/shared/domain';
import type { ProjectCatalog } from '../../../packages/shared/project-entry';
import { downloadImportReport, projectImportTemplate, readProjectImport, type ImportReview } from './project-workbook';
import { api, Dialog, ErrorBox, PendingButton, PendingStatus, Pill } from './ui';

export function ProjectImport({catalog,projects,close,reload,notify}:{
  catalog:ProjectCatalog;projects:ProjectRow[];close:()=>void;reload:()=>Promise<void>;notify:(message:string)=>void;
}){
  const [file,setFile]=useState<File>();
  const [review,setReview]=useState<ImportReview[]>([]);
  const [stage,setStage]=useState<'select'|'preview'|'confirm'|'result'>('select');
  const [operation,setOperation]=useState<'read'|'validate'|'save'|'refresh'|'template'|'report'>();
  const busy=Boolean(operation);
  const [error,setError]=useState('');
  const [commitError,setCommitError]=useState('');
  const [saved,setSaved]=useState(0);
  const stageHeading=useRef<HTMLElement|null>(null);
  const pending=useRef(false);
  useEffect(()=>{stageHeading.current?.focus()},[stage]);
  const valid=review.filter(row=>row.status==='valid'&&row.project);
  const invalid=review.filter(row=>row.status==='invalid').length;
  const duplicates=review.filter(row=>row.status==='duplicate').length;
  const empty=review.reduce((total,row,index)=>row.status==='empty'?total+(index+1<review.length?review[index+1].row-row.row:1):total,0);

  const saveStatus='Menyimpan '+valid.length+' proyek…';
  const status=operation?{
    read:'Membaca file Excel…',validate:'Memvalidasi data proyek…',save:saveStatus,
    refresh:'Memperbarui daftar proyek…',template:'Menyiapkan templat Excel…',report:'Menyiapkan laporan hasil…',
  }[operation]:undefined;

  async function run(phase:NonNullable<typeof operation>,action:()=>Promise<void>){
    if(pending.current)return;
    pending.current=true;
    setOperation(phase);setError('');
    try{await action()}catch(error){setError((error as Error).message)}finally{pending.current=false;setOperation(undefined)}
  }
  function choose(event:ChangeEvent<HTMLInputElement>){
    const selected=event.target.files?.[0];
    event.target.value='';
    if(!selected||pending.current)return;
    setFile(selected);setReview([]);setStage('select');setCommitError('');setSaved(0);
    void run('read',async()=>{
      setReview(await readProjectImport(selected,catalog,projects,async()=>{
        setOperation('validate');
        // Paint the validation label before scanning the workbook rows.
        await new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      }));
      setStage('preview');
    });
  }
  async function commit(){
    await run('save',async()=>{
      try{
        const result=await api<{count:number}>('/projects/import','POST',{projects:valid.map(row=>row.project)});
        setSaved(result.count);setStage('result');setOperation('refresh');
        notify(result.count+' proyek berhasil diimpor.');
      }catch(error){
        setCommitError((error as Error).message);setStage('result');return;
      }
      try{await reload()}catch{setError('Proyek tersimpan. Daftar belum diperbarui.')}
    });
  }
  const askClose=()=>{if(!pending.current)close()};
  const labels={valid:'Valid',invalid:'Tidak valid',duplicate:'Kemungkinan duplikat',empty:'Kosong'};
  return <Dialog restoreFocus title="Impor Excel" close={askClose} className="project-modal project-import">
    <div className="dialog-content fields">
      {stage!=='result'&&stage!=='confirm'&&<>
        <p className="muted">Gunakan templat .xlsx (maks. 5 MB). Periksa hasil validasi sebelum menyimpan.</p>
        <div className="heading-actions">
          <PendingButton className="button" disabled={busy&&operation!=='template'} pending={operation==='template'?status:undefined} onClick={()=>void run('template',()=>projectImportTemplate(catalog))}>Unduh templat Excel</PendingButton>
          <label className="button file-action">Pilih file .xlsx<input type="file" accept=".xlsx" aria-label="Pilih file .xlsx" disabled={busy} onChange={choose}/></label>
        </div>
      </>}
      {file&&<p className="muted">{file.name} · {(file.size/1024).toLocaleString('id-ID',{maximumFractionDigits:1})} KB</p>}
      <PendingStatus hidden message={status}/>
      {operation==='read'||operation==='validate'||operation==='refresh'?<p className="muted">{status}</p>:null}
      {error&&<ErrorBox message={error}/>}
      {commitError&&<ErrorBox message={commitError}/>}
      {stage==='confirm'&&<div><h3 ref={node=>{stageHeading.current=node}} tabIndex={-1}>Konfirmasi impor</h3>
        <p>{valid.length} proyek baru akan ditambahkan. {invalid+duplicates+empty} baris tidak akan disimpan. Proyek existing tetap utuh.</p></div>}
      {stage==='result'&&<p ref={node=>{stageHeading.current=node}} tabIndex={-1} role="status"><strong>{saved} berhasil</strong> · {invalid+(commitError?valid.length:0)} gagal · {duplicates+empty} dilewati</p>}
      {(stage==='preview'||stage==='result')&&<>
        {stage==='preview'&&<p ref={node=>{stageHeading.current=node}} tabIndex={-1} role="status"><strong>{valid.length+invalid+duplicates+empty} baris dibaca</strong> · {valid.length} valid · {invalid} tidak valid · {duplicates} kemungkinan duplikat · {empty} kosong</p>}
        <table className="project-import-table">
          <thead><tr><th>Baris</th><th>Proyek</th><th>Hasil</th><th>Keterangan</th></tr></thead>
          <tbody>{review.map(row=><tr key={row.row}><td>{row.row}</td><td>{row.name||'—'}</td>
            <td><Pill tone={row.status==='valid'&&!commitError?'green':row.status==='empty'?'neutral':'amber'}>
              {stage==='result'&&row.status==='valid'?(saved?'Berhasil':'Gagal'):labels[row.status]}</Pill></td>
            <td>{stage==='result'&&row.status==='valid'?(commitError||'Proyek ditambahkan.'):row.message}</td></tr>)}</tbody>
        </table>
      </>}
    </div>
    <div className="dialog-actions">
      {stage==='confirm'?<>
        <button className="button" disabled={busy} onClick={()=>setStage('preview')}>Kembali</button>
        <PendingButton className="button primary" pending={operation==='save'?status:undefined} onClick={()=>void commit()}>Simpan {valid.length} proyek</PendingButton>
      </>:<>
        <button className="button" disabled={busy} onClick={askClose}>{stage==='result'?'Tutup':'Batal'}</button>
        {stage==='preview'&&<button className="button primary" disabled={busy||!valid.length} onClick={()=>setStage('confirm')}>Lanjutkan ke konfirmasi</button>}
         {stage==='result'&&commitError&&<button className="button" disabled={busy} onClick={()=>{setCommitError('');setStage('preview')}}>Kembali ke pratinjau</button>}
        {stage==='result'&&<PendingButton className="button primary" disabled={busy&&operation!=='report'} pending={operation==='report'?status:undefined}
          onClick={()=>void run('report',()=>downloadImportReport(review,Boolean(saved),commitError))}>Unduh laporan hasil</PendingButton>}
      </>}
    </div>
  </Dialog>;
}
