import { useDocumentLogo } from './document-branding';
import { useRef, useState, type RefObject } from 'react';
import { sortedLogbook, type LogbookEntry } from '../../../packages/shared/logbook';
import { Button, dateLabel, Dialog, ErrorBox } from './ui';
import { DocumentPreview } from './document-workspace';
import { DocumentExport } from './document-export';

export type Metrics = {
  dates:string[];plan:number[];actual:number[];week:number;weekDate?:string;notes?:string;
  issues?:{id:string;description:string;status:string;owner:string}[];
  activities?:{name:string;weight:number;plan:number;actual:number}[];
};
const percent=(value:number|undefined)=>value===undefined?'—':value.toFixed(1)+'%';
function scheduleIndex(plan:number|undefined,actual:number|undefined){
  if(plan===undefined||plan<=0||actual===undefined)return undefined;
  const ratio=actual/plan;
  return Number.isFinite(ratio)?ratio:undefined;
}
const index=(plan:number|undefined,actual:number|undefined)=>scheduleIndex(plan,actual)?.toFixed(3)??'—';
const scheduleIndexLabel='Schedule Index';
function lines(metrics:Metrics){
  return metrics.dates.slice(0,metrics.week+1).map((date,week)=>[
    'W'+week, date, percent(metrics.plan[week]),percent(metrics.actual[week]),index(metrics.plan[week],metrics.actual[week]),
  ]);
}

function WeeklyPreviewCurve({metrics}: {metrics:Metrics}){
  const width=542, height=105, top=34;
  const spi=Array.from({length:metrics.dates.length},(_,week)=>{
    const ratio=scheduleIndex(metrics.plan[week],metrics.actual[week]);
    return ratio===undefined?undefined:ratio*100;
  });
  const max=Math.max(100,...metrics.plan,...metrics.actual,...spi.map(value=>value??0));
  const y=(value:number)=>top+height-height*value/max;
  const series=[{name:'Rencana',values:metrics.plan,color:'#2656df'},{name:'Aktual',values:metrics.actual,color:'#138e82'}];
  const perChart=14;
  const count=Math.max(metrics.plan.length,metrics.actual.length);
  const segments=Array.from({length:Math.max(1,Math.ceil((count-1)/(perChart-1)))},(_,i)=>i*(perChart-1));
  return <figure className="weekly-preview-chart">
    {segments.map(from=>{
      const to=Math.min(count,from+perChart);
      const x=(offset:number)=>24+width*offset/Math.max(1,to-from-1);
      return <svg key={from} viewBox="0 0 590 169" role="img" aria-label={`Kurva S minggu ${from} sampai ${to-1}`}>
        <path d={`M24 ${top}V${top+height}H566`} stroke="#dce3ef" fill="none"/>
        {Array.from({length:to-from},(_,i)=><text key={i} x={x(i)} y={top+height+24} textAnchor="middle" fontSize="8" fill="#596987">W{from+i}</text>)}
        {series.map(({name,values,color})=>{
          const data=values.slice(from,to);
          return <g key={name}>
            <polyline fill="none" stroke={color} strokeWidth="2" points={data.map((value,i)=>x(i)+','+y(value)).join(' ')}/>
            {data.map((value,i)=><g key={i}><circle cx={x(i)} cy={y(value)} r="2.6" fill={color}/><text x={x(i)} y={y(value)+(name==='Aktual'?11:-6)} textAnchor="middle" fontSize="8" fill={color}>{value.toFixed(1)}%</text></g>)}
          </g>;
        })}
        <g fill="#a36516">
          <path fill="none" stroke="#a36516" strokeWidth="2" strokeDasharray="5 3" d={spi.slice(from,to).map((value,i)=>
            value===undefined?'':(i>0&&spi[from+i-1]!==undefined?'L':'M')+x(i)+' '+y(value)).join(' ')}/>
          {spi.slice(from,to).map((value,i)=>{
            if(value===undefined)return null;
            const week=from+i;
            const pointY=y(value);
            const abovePoint=pointY-8;
            const otherLabels=[y(metrics.plan[week])-6,y(metrics.actual[week])+11];
            const labelY=Math.min(abovePoint,...otherLabels.filter(label=>Math.abs(label-abovePoint)<11).map(label=>label-11));
            return <g key={week} className="weekly-schedule-index-point">
              <circle cx={x(i)} cy={pointY} r="2.6">
                <title>{scheduleIndexLabel+' W'+week+' · '+index(metrics.plan[week],metrics.actual[week])}</title>
              </circle>
              <text x={x(i)} y={labelY} textAnchor="middle" fontSize="10" fontWeight="700">{Number(value.toFixed(1))}%</text>
            </g>;
          })}
        </g>
      </svg>;
    })}
    <figcaption><span>Rencana</span>{' · '}<span>Aktual</span>{' · '}<span>{scheduleIndexLabel}</span></figcaption>
  </figure>;
}

export function WeeklyReportDocument({project,metrics,paper,entries=[],source,logo}: {project:string;metrics:Metrics;paper:RefObject<HTMLElement>;entries?:LogbookEntry[];source?:string;logo?:string}){
  const operationsLogo=useDocumentLogo('operations');
  const {week,dates,plan,actual}=metrics;
  return <article ref={paper} className="paper weekly-paper">
    <header className="document-letterhead">
      <img src={logo??operationsLogo} className="paper-logo" alt="Logo dokumen"/>
      <h2>Laporan mingguan</h2>
      <p><strong>{project}</strong></p>
      <p>Minggu {week} · {dates[week]||'—'}</p>
      {source&&<p>{source}</p>}
    </header>
    <dl className="weekly-report-kpi">
      <div><dt>Rencana</dt><dd>{percent(plan[week])}</dd></div>
      <div><dt>Aktual</dt><dd>{percent(actual[week])}</dd></div>
      <div><dt>{scheduleIndexLabel}</dt><dd>{index(plan[week],actual[week])}</dd></div>
    </dl>
    <section className="paper-section"><h3>Kurva S</h3><WeeklyPreviewCurve metrics={metrics}/></section>
    <section className="paper-section"><h3>Riwayat kemajuan</h3><table><thead><tr>{['Minggu','Periode','Rencana','Aktual',scheduleIndexLabel].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{lines(metrics).map(row=><tr key={row[0]}>{row.map((value,i)=><td key={i}>{value}</td>)}</tr>)}</tbody></table></section>
    {metrics.activities?.length?<section className="paper-section"><h3>Aktivitas minggu ini</h3><table><thead><tr>{['Aktivitas','Bobot','Rencana','Aktual'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{metrics.activities.map((activity,i)=><tr key={i}><td>{activity.name}</td><td>{percent(activity.weight)}</td><td>{percent(activity.plan)}</td><td>{percent(activity.actual)}</td></tr>)}</tbody></table></section>:null}
    {entries.length>0&&<section className="paper-section">
      <h3>Log Book</h3>
      <table><thead><tr><th>Tanggal</th><th>Aktivitas</th><th>PIC</th><th>Hasil / catatan</th><th>Lampiran</th></tr></thead>
        <tbody>{sortedLogbook(entries).map(entry=><tr key={entry.id}><td>{dateLabel(entry.date)}</td><td>{entry.activity}</td><td>{entry.owner||'—'}</td><td>{entry.result||'—'}</td><td>{entry.files?.map(file=>file.name).join('\n')||'—'}</td></tr>)}</tbody>
      </table>
    </section>}
    {metrics.issues?.length?<section className="paper-section"><h3>Kendala</h3><table><thead><tr><th>ID</th><th>Kendala</th><th>Status</th><th>PIC</th></tr></thead><tbody>{metrics.issues.map(issue=><tr key={issue.id}><td>{issue.id}</td><td>{issue.description}</td><td>{issue.status}</td><td>{issue.owner||'—'}</td></tr>)}</tbody></table></section>:null}
    {metrics.notes&&<section className="paper-section"><h3>Catatan mingguan</h3><p className="pre-wrap">{metrics.notes}</p></section>}
  </article>;
}

export function WeeklyReportPreview({project,metrics,name,entries,close}: {project:string;metrics:Metrics;name:string;entries:LogbookEntry[];close:()=>void}){
  const [error,setError]=useState('');
  const paper=useRef<HTMLElement>(null);
  return <Dialog title="Pratinjau laporan mingguan" close={close}>
    <div className="dialog-content">
      {error&&<ErrorBox message={error}/>}
      <DocumentPreview paper={paper} actions={<DocumentExport paper={paper} name={name} onError={setError}/>}><WeeklyReportDocument project={project} metrics={metrics} paper={paper} entries={entries}/></DocumentPreview>
    </div>
    <div className="dialog-actions"><Button className="button" onClick={close}>Tutup</Button></div>
  </Dialog>;
}
