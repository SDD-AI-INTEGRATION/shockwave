import { NavIcon } from './nav-icon';
import { FormatIcon } from './download-menu';
import { TextInput, Textarea } from './form-controls';
import { DateInput } from './date-input';
import { FileUp, Paperclip, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { logbookEntrySchema, logbookId, logbookLimit, sortedLogbook, type LogbookEntry, type SavedLogbook } from '../../../packages/shared/logbook';
import { downloadLogFile, exportLogbook, importLogbook, readLogFiles } from './logbook-workbook';
import { Button, api, FieldLabel, ConfirmDialog, DataTable, dateLabel, ErrorBox, type Column } from './ui';

export function useWeeklyLogbook(projectId:string,week:number|undefined){
  const id=projectId&&week!==undefined?logbookId(projectId,week):'';
  const path='/documents/logbook/'+id;
  const [state,setState]=useState<{id:string;record?:SavedLogbook;error?:string}>();
  const [attempt,setAttempt]=useState(0);
  const active=useRef(id);
  active.current=id;
  useEffect(()=>{
    if(!id)return;
    let canceled=false;
    setState({id});
    api<SavedLogbook>(path).then(record=>{
      if(!canceled)setState({id,record});
    }).catch(error=>{
      if(!canceled)setState({id,error:error.message});
    });
    return ()=>{canceled=true};
  },[id,path,attempt]);

  const record=state?.id===id?state.record:undefined;
  const error=state?.id===id?state.error:undefined;
  function reload(){
    setState(undefined);
    setAttempt(value=>value+1);
  }
  async function save(entries:LogbookEntry[]){
    if(!record)throw new Error('Muat ulang Log Book sebelum menyimpan.');
    const updated=await api<SavedLogbook>(path,'PUT',{version:record.version,data:{...record.data,entries}});
    if(active.current===id)setState({id,record:updated});
  }
  return {record,error,reload,save};
}

export function WeeklyLogbook({week,weekDate,editable,logbook,notify}:{
  week:number;weekDate?:string;editable:boolean;logbook:ReturnType<typeof useWeeklyLogbook>;notify:(message:string)=>void;
}){
  const [form,setForm]=useState<LogbookEntry|null>(null);
  const [remove,setRemove]=useState<LogbookEntry|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [fileBusy,setFileBusy]=useState(false);
  const rows=logbook.record?.data.entries??[];
  const table:Column<LogbookEntry>[]=[
    {id:'date',label:'Tanggal',sort:row=>row.date,className:'logbook-date',render:row=>dateLabel(row.date)},
    {id:'activity',label:'Aktivitas',render:row=><strong>{row.activity}</strong>},
    {id:'owner',label:'PIC',render:row=>row.owner||'—'},
    {id:'result',label:'Hasil / catatan',render:row=><span className="pre-wrap">{row.result||'—'}</span>},
    {id:'files',label:'Lampiran',render:row=>row.files?.length?<div className="logbook-files">{row.files.map(file=><button type="button" className="table-link" key={file.id} onClick={()=>downloadLogFile(file)}><Paperclip size={13}/> {file.name}</button>)}</div>:'—'},
  ];
  if(editable)table.push({id:'actions',label:'Tindakan',render:row=><div className="heading-actions logbook-actions">
    <button className="icon-button" disabled={busy||!!form} aria-label={'Ubah '+row.activity} title="Ubah catatan" onClick={()=>{setError('');setForm(row)}}><Pencil size={15}/></button>
    <button className="icon-button danger-text" disabled={busy||!!form} aria-label={'Hapus '+row.activity} title="Hapus catatan" onClick={()=>{setError('');setRemove(row)}}><NavIcon name="trash"/></button>
  </div>});
  function add(){
    setError('');
    setForm({id:crypto.randomUUID(),date:weekDate??'',activity:'',owner:'',result:''});
  }
  async function update(entries:LogbookEntry[],message:string){
    if(busy)return;
    setBusy(true);setError('');
    try{
      await logbook.save(entries);
      setForm(null);
      notify(message);
    }catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!form||busy||fileBusy)return;
    const result=logbookEntrySchema.safeParse(form);
    if(!result.success){setError('Isi tanggal dan aktivitas yang valid.');return}
    const entries=rows.some(row=>row.id===form.id)?rows.map(row=>row.id===form.id?result.data:row):[result.data,...rows];
    void update(entries,'Catatan Log Book disimpan.');
  }
  async function processWorkbook(file?:File){
    if(!logbook.record||busy)return;
    setBusy(true);setError('');
    try{
      if(file){
        const result=await importLogbook(file,logbook.record.data);
        await logbook.save(result.entries);
        notify(result.count+' catatan Log Book diimpor.');
      }else await exportLogbook(logbook.record.data);
    }catch(e){setError((e as Error).message)}
    finally{setBusy(false)}
  }
  async function attach(files:File[]){
    if(!form||!files.length||fileBusy)return;
    setFileBusy(true);setError('');
    try{
      const result=await readLogFiles(files,form.files??[]);
      setForm(current=>current?.id===form.id?{...current,files:result}:current);
    }catch(e){setError((e as Error).message)}
    finally{setFileBusy(false)}
  }
  const title=form&&rows.some(row=>row.id===form.id)?'Ubah catatan Log Book':'Tambah catatan Log Book';
  return <section className="panel weekly-logbook" aria-labelledby="weekly-logbook-heading">
    <div className="table-heading spaced"><div><h2 id="weekly-logbook-heading">Log Book</h2><p>Minggu {week}{weekDate?' · '+dateLabel(weekDate):''}</p></div>
      {logbook.record&&<div className="heading-actions">
        <Button className="button" disabled={busy||!!form} onClick={()=>void processWorkbook()}><FormatIcon format="Excel"/> Ekspor Excel</Button>
        {editable&&<><label className="button file-action"><FileUp size={15}/> Impor Excel<input type="file" accept=".xlsx" disabled={busy||!!form} aria-label="Impor Log Book Excel" title="log-book-mingguan.xlsx" onChange={event=>{
          const file=event.target.files?.[0];event.target.value='';if(file)void processWorkbook(file);
        }}/></label>
        <Button className="button primary" disabled={busy||!!form||rows.length>=logbookLimit} onClick={add}><Plus size={16}/> Tambah catatan</Button></>}
      </div>}
    </div>
    {form&&<form className="padded logbook-edit" onSubmit={submit}>
      <h3>{title}</h3>
      <div className="field-grid space-top">
        <label><FieldLabel label="Tanggal aktivitas" required/><DateInput label="Tanggal aktivitas" required value={form.date} onValue={date=>setForm({...form,date})}/></label>
        <label>PIC<TextInput placeholder="Rani Pratama" value={form.owner} maxLength={120} onChange={e=>setForm({...form,owner:e.target.value})}/></label>
        <label className="span-full"><FieldLabel label="Aktivitas" required/><TextInput required autoFocus placeholder="Uji integrasi portal" value={form.activity} maxLength={240} onChange={e=>setForm({...form,activity:e.target.value})}/></label>
        <label className="span-full">Hasil / catatan<Textarea rows={3} placeholder="12 skenario lulus, satu temuan ditindaklanjuti." value={form.result} maxLength={2000} onChange={e=>setForm({...form,result:e.target.value})}/></label>
        <div className="span-full">
          <label className="field">Lampiran <small className="muted">hasil-pengujian.pdf</small><input type="file" multiple disabled={fileBusy||busy||(form.files?.length??0)>=3} onChange={event=>{
            void attach(Array.from(event.target.files??[]));event.target.value='';
          }}/></label>
          <small className="muted">Maksimal 3 file per catatan, 2 MB per file.</small>
          <div className="logbook-files">{form.files?.map(file=><div className="split" key={file.id}>
            <button type="button" className="table-link" onClick={()=>downloadLogFile(file)}>{file.name}</button>
            <button type="button" className="icon-button" disabled={fileBusy||busy} aria-label={'Lepas '+file.name} onClick={()=>setForm({...form,files:form.files?.filter(item=>item.id!==file.id)})}><X size={14}/></button>
          </div>)}</div>
        </div>
        {error&&<div className="span-full"><ErrorBox message={error}/></div>}
      </div>
      <div className="heading-actions space-top"><Button className="button" type="button" disabled={busy||fileBusy} onClick={()=>{setForm(null);setError('')}}>Batal</Button><Button className="button primary" disabled={busy||fileBusy}>{busy?'Menyimpan…':'Simpan catatan'}</Button></div>
    </form>}
    {logbook.error?<div className="padded"><ErrorBox message={logbook.error}/><Button className="button" onClick={logbook.reload}>Muat ulang Log Book</Button></div>
    :logbook.record?<DataTable rows={sortedLogbook(rows)} columns={table} rowKey={row=>row.id} empty="Belum ada aktivitas yang dicatat untuk minggu ini."/>
    :<p className="padded muted" role="status">Memuat Log Book…</p>}
    {error&&!form&&<div className="padded"><ErrorBox message={error}/><Button className="button" onClick={()=>{setError('');logbook.reload()}}>Muat ulang Log Book</Button></div>}
    {remove&&<ConfirmDialog title="Hapus catatan" object={remove.activity} consequence={'Catatan dan lampirannya akan dihapus dari Log Book minggu '+week+'.'} confirmLabel="Hapus catatan" deleteAction onConfirm={()=>{
      setRemove(null);
      void update(rows.filter(row=>row.id!==remove.id),'Catatan Log Book dihapus.');
    }} onCancel={()=>setRemove(null)}/>}
  </section>;
}
