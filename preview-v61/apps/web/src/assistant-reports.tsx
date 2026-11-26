import { useDocumentLogo } from './document-branding';
import { FileChartColumn, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { revenueCurrency, type RevenueExport, type WeeklyExport } from '../../../packages/shared/assistant-reports';
import { logbookId, type LogbookEntry, type SavedLogbook } from '../../../packages/shared/logbook';
import { DocumentExport } from './document-export';
import { Button, api, ErrorBox } from './ui';
import { WeeklyReportDocument, type Metrics } from './weekly-report';

type OperationRecord={data:Record<string,unknown>};

function readMetrics(request:WeeklyExport,data:OperationRecord|null,signal:AbortSignal):Promise<Metrics>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(signal.reason);return}
    const frame=document.createElement('iframe');
    frame.hidden=true;
    frame.title='Penyusun laporan mingguan';
    frame.src='/fase-1/operations.html?mode=assistant-export&project='+encodeURIComponent(request.projectId)+'&v=assistant-reports-1';
    function complete(error?:unknown,metrics?:Metrics){
      clearTimeout(timeout);
      removeEventListener('message',onMessage);
      signal.removeEventListener('abort',onAbort);
      frame.remove();
      if(metrics)resolve(metrics);
      else reject(error);
    }
    function onAbort(){complete(signal.reason)}
    function onMessage(event:MessageEvent){
      if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
      const reply=event.data;
      if(reply?.type!=='shockwave-operations-export-result'||reply.project!==request.projectId)return;
      if(reply.error){complete(new Error(reply.error));return}
      if(reply.metrics?.week!==request.week){complete(new Error('Minggu laporan tidak sesuai dengan permintaan.'));return}
      complete(undefined,reply.metrics);
    }
    const timeout=setTimeout(()=>complete(new Error('Laporan belum dapat dimuat. Coba lagi.')),10000);
    signal.addEventListener('abort',onAbort,{once:true});
    addEventListener('message',onMessage);
    frame.onload=()=>frame.contentWindow?.postMessage({
      type:'shockwave-operations-export-week',data:data?.data,name:request.projectName,week:request.week,
    },location.origin);
    frame.onerror=()=>complete(new Error('Editor laporan gagal dimuat.'));
    document.body.append(frame);
  });
}

export function AssistantWeeklyExport({request}:{request:WeeklyExport}){
  const logo=useDocumentLogo();
  const [report,setReport]=useState<{metrics:Metrics;entries:LogbookEntry[];source:string}>();
  const [loadError,setLoadError]=useState('');
  const [downloadError,setDownloadError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const paper=useRef<HTMLElement>(null);
  useEffect(()=>{
    const controller=new AbortController();
    setLoadError('');
    async function load(){
      try{
        const [saved,book]=await Promise.all([
          api<OperationRecord|null>('/documents/operations/'+request.projectId),
          api<SavedLogbook>('/documents/logbook/'+logbookId(request.projectId,request.week)),
        ]);
        const entries=book.data.entries;
        if(!saved&&request.projectId!=='P001'&&!entries.length){
          throw new Error('Belum ada data Operasional atau Log Book tersimpan untuk proyek dan minggu ini.');
        }
        const metrics=await readMetrics(request,saved,controller.signal);
        if(!controller.signal.aborted)setReport({metrics,entries,source:saved?'Data Operasional tersimpan':request.projectId==='P001'?'Data contoh Operasional':'Log Book tersimpan'});
      }catch(error){if(!controller.signal.aborted)setLoadError((error as Error).message)}
    }
    void load();
    return ()=>controller.abort();
  },[request,attempt]);

  return <div className="assistant-mom-file">
    <div className="assistant-mom-file-title"><FileChartColumn size={16}/><strong>Laporan mingguan · {request.projectId} · W{request.week}</strong></div>
    {loadError?<><ErrorBox message={loadError}/><Button type="button" className="button space-small" onClick={()=>setAttempt(value=>value+1)}><RotateCw size={14}/> Coba lagi</Button></>:
    report?<>
      <p className="muted">{report.metrics.dates[request.week]} · {report.source}</p>
      <div className="heading-actions space-small"><DocumentExport paper={paper} name={'Laporan-Mingguan-'+request.projectId+'-W'+request.week} formats={request.format?[request.format]:undefined} onError={setDownloadError}/></div>
      {downloadError&&<ErrorBox message={downloadError}/>}
      <div hidden><WeeklyReportDocument paper={paper} project={request.projectName} metrics={report.metrics} entries={report.entries} source={report.source} logo={logo}/></div>
    </>:<p className="muted" role="status">Menyiapkan laporan…</p>}
  </div>;
}

export function AssistantRevenueExport({report}:{report:RevenueExport}){
  const logo=useDocumentLogo();
  const paper=useRef<HTMLElement>(null);
  const [error,setError]=useState('');
  return <div className="assistant-mom-file">
    <div className="assistant-mom-file-title"><FileChartColumn size={16}/><strong>Ringkasan pendapatan {report.year}</strong></div>
    <DocumentExport paper={paper} name={'Ringkasan-Pendapatan-'+report.year} formats={[report.format||'PDF']} onError={setError}/>
    {error&&<ErrorBox message={error}/>}
    <div hidden>
      <article ref={paper} className="paper">
        <header className="document-letterhead">
          <img src={logo} className="paper-logo" alt="Logo dokumen"/>
          <h2>Ringkasan pendapatan {report.year}</h2>
          <p><strong>{report.title}</strong></p>
          <p>{report.rows.length} proyek · Sumber Daftar Proyek Shockwave PMO</p>
        </header>
        <section className="paper-section">
          <h3>Ringkasan portofolio</h3>
          <dl className="weekly-report-kpi">
            <div><dt>Total prognosa</dt><dd>{revenueCurrency(report.plan)}</dd></div>
            <div><dt>Realisasi tercatat</dt><dd>{revenueCurrency(report.recorded)}</dd></div>
            <div><dt>Estimasi realisasi</dt><dd>{revenueCurrency(report.estimated)}</dd></div>
          </dl>
          <p>{report.rows.length-report.estimatedCount} proyek memiliki angka realisasi tercatat. {report.estimatedCount} proyek memakai estimasi realisasi.</p>
        </section>
        <section className="paper-section"><h3>Rincian per proyek</h3><table>
          <thead><tr><th>Proyek</th><th>Prognosa</th><th>Realisasi</th><th>Sumber angka</th></tr></thead>
          <tbody>{report.rows.map(row=><tr key={row.id}>
            <td><strong>{row.id}</strong><br/>{row.name}<br/>{row.pillar}</td>
            <td>{revenueCurrency(row.plan)}</td><td>{revenueCurrency(row.actual)}</td>
            <td>{row.reported?'Realisasi tercatat':'Realisasi estimasi'}{row.reported&&row.simulated?<><br/>Prognosa estimasi</>:null}</td>
          </tr>)}</tbody>
        </table></section>
        <footer className="paper-footer">Angka mengikuti data yang tercantum di Daftar Proyek. Estimasi realisasi ditotal secara terpisah.</footer>
      </article>
    </div>
  </div>;
}
