import { NavIcon } from './nav-icon';
import { riskLevels } from '../../../packages/shared/risk-register';
import { ArrowDown, ArrowUp, ChevronDown, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { FormField, Select, Textarea } from './form-controls';
import { Button, Empty, Pill } from './ui';

export type Risk = {id:string;description:string;impacts:string[];severity:string;probability:string;response:string};
type RiskFilter = Pick<Risk,'severity'|'probability'>;
const levels:readonly string[]=riskLevels;
const impactOptions=['Lingkup','Waktu','Biaya'];

export const emptyRisk=():Risk=>({id:'',description:'',impacts:[],severity:'Sedang',probability:'Sedang',response:''});

export function normalizeRiskImpacts(impacts:string[]) {
  let hasCost=false;
  return impacts.flatMap(value=>{
    if(value!=='Budget'&&value!=='Biaya')return [value];
    if(hasCost)return [];
    hasCost=true;
    return ['Biaya'];
  });
}

export function riskChanged(original:Risk,current:Risk){
  return original.description!==current.description||original.response!==current.response||
    original.severity!==current.severity||original.probability!==current.probability||
    JSON.stringify([...original.impacts].sort())!==JSON.stringify([...current.impacts].sort());
}

const score=(severity:string,probability:string)=>levels.indexOf(severity)+levels.indexOf(probability);
export const riskLevel=({severity,probability}:RiskFilter)=>{
  const value=score(severity,probability);
  return value===4?'Tinggi':value>=2?'Sedang':'Rendah';
};
export const riskTone=(level:string)=>level==='Tinggi'?'red':level==='Sedang'?'amber':'green';

const riskCount=(risks:Risk[],severity:string,probability:string)=>
  risks.filter(risk=>risk.severity===severity&&risk.probability===probability).length;

export function RiskMapDocument({risks}:{risks:Risk[]}){
  return <section className="risk-paper-map">
    <h3>Peta risiko</h3>
    <p>Keparahan per baris · probabilitas per kolom</p>
    <table>
      <thead><tr><th scope="col">Keparahan / Probabilitas</th>{levels.map(level=><th key={level} scope="col">{level}</th>)}</tr></thead>
      <tbody>{[...levels].reverse().map(severity=><tr key={severity}><th scope="row">{severity}</th>
        {levels.map(probability=>{
          const tone=riskTone(riskLevel({severity,probability}));
          return <td key={probability} className={'risk-map-print-'+tone}><span className={'pill-'+tone}>{riskCount(risks,severity,probability)}</span></td>;
        })}
      </tr>)}</tbody>
    </table>
  </section>;
}

type RiskMapProps={risks:Risk[];filter:RiskFilter|null;highlight:(id:string)=>void;openRisk:(risk:Risk)=>void};
export function RiskMap({risks,filter,highlight,openRisk}:RiskMapProps){
  const entries=new Map<string,{risk:Risk;number:number}[]>();
  risks.forEach((risk,index)=>{
    const key=risk.severity+'/'+risk.probability;
    const cell=entries.get(key)??[];
    cell.push({risk,number:index+1});
    entries.set(key,cell);
  });
  return <section className="panel padded" aria-labelledby="risk-map-title">
      <h2 id="risk-map-title">Peta risiko</h2>
      <p className="muted space-small">Keparahan per baris · probabilitas per kolom</p>
      <div className="risk-map"><div/>{levels.map(level=><strong key={level}>{level}</strong>)}
        {[...levels].reverse().map(severity=><div className="risk-map-row" key={severity}><strong>{severity}</strong>
          {levels.map(probability=>{
            const cell=entries.get(severity+'/'+probability)??[];
            const selected=filter?.severity===severity&&filter.probability===probability;
            return <div role="group" className={'risk-cell risk-'+score(severity,probability)} key={probability}
              data-selected={selected||undefined} aria-label={'Keparahan '+severity+', probabilitas '+probability}>
              {cell.length?cell.map(({risk,number})=>{
                const label='Risiko '+number+' · '+(risk.description.trim()||'Risiko baru');
                return <button type="button" className="risk-marker" key={risk.id} title={label} aria-label={'Buka '+label}
                  onPointerEnter={()=>highlight(risk.id)} onPointerLeave={event=>{if(document.activeElement!==event.currentTarget)highlight('')}}
                  onFocus={()=>highlight(risk.id)} onBlur={()=>highlight('')} onClick={()=>openRisk(risk)}>{number}</button>;
              }):<span aria-label="Tidak ada risiko">0</span>}
            </div>;
          })}
        </div>)}
      </div>
    </section>;
}

export function riskRowsChanged(saved:Risk[], working:Risk[]){
  return saved.length!==working.length||working.some((row,index)=>row.id!==saved[index].id||riskChanged(saved[index],row));
}

function riskIssue(row:Risk){
  if(!row.description.trim())return 'Isi identifikasi risiko.';
  if(!levels.includes(row.severity)||!levels.includes(row.probability))return 'Pilih keparahan dan probabilitas yang sah.';
  return '';
}

export function RiskRegister({risks,saved,canEdit,filter,changeFilter,update,remove,apply,cancel,busy,conflict,dirty,beforeActions,highlighted,jump}:{
  risks:Risk[];saved:Risk[];canEdit:boolean;filter:RiskFilter|null;changeFilter:(value:RiskFilter|null)=>void;
  update:(update:(rows:Risk[])=>Risk[])=>void;remove:(risk:Risk)=>void;
  apply:()=>void;cancel:()=>void;busy:boolean;conflict:boolean;dirty:boolean;beforeActions?:ReactNode;
  highlighted:string;jump:{id:string}|null;
}){
  const drag=useRef<{id:string;y:number;target:string}>();
  const [target,setTarget]=useState('');
  const [validate,setValidate]=useState(false);
  const [added,setAdded]=useState('');
  const [announcement,setAnnouncement]=useState('');
  const group=useId();
  const list=useRef<HTMLDivElement>(null);
  const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
  const canReorder=canEdit&&!filter&&!busy;
  useEffect(()=>{
    if(!added)return;
    list.current?.querySelector<HTMLTextAreaElement>('[data-risk-id="'+added+'"] textarea')?.focus();
  },[added]);
  useEffect(()=>{if(!dirty){setValidate(false);setAdded('')}},[dirty]);
  useEffect(()=>{
    if(!jump)return;
    const row=list.current?.querySelector<HTMLElement>('[data-risk-id="'+CSS.escape(jump.id)+'"]');
    if(!row)return;
    setCollapsed(previous=>{
      if(!previous.has(jump.id))return previous;
      const next=new Set(previous);
      next.delete(jump.id);
      return next;
    });
    row.querySelector<HTMLButtonElement>('.record-toggle')?.focus({preventScroll:true});
    row.scrollIntoView({block:'center',inline:'nearest'});
  },[jump]);

  function add(){
    const id=crypto.randomUUID();
    if(filter)changeFilter(null);
    update(rows=>[...rows,{...emptyRisk(),id}]);
    setAdded(id);
  }
  function change(id:string,patch:Partial<Risk>){
    update(rows=>rows.map(row=>row.id===id?{...row,...patch}:row));
  }
  function move(id:string,next:number){
    if(!canReorder||next<0||next>=risks.length)return;
    update(rows=>{
      const index=rows.findIndex(row=>row.id===id);
      if(index<0||index===next)return rows;
      const ordered=[...rows];
      const [row]=ordered.splice(index,1);
      ordered.splice(next,0,row);
      return ordered;
    });
    setAnnouncement('Risiko dipindah ke urutan '+(next+1)+' dari '+risks.length+'.');
  }
  function endDrag(event:PointerEvent<HTMLSpanElement>, commit:boolean){
    const entry=drag.current;
    drag.current=undefined;
    setTarget('');
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(commit&&entry?.target)move(entry.id,risks.findIndex(row=>row.id===entry.target));
  }

  function submit(){
    const invalid=risks.find(row=>riskIssue(row));
    if(!invalid){apply();return}
    if(filter)changeFilter(null);
    setValidate(true);
    setCollapsed(previous=>{const next=new Set(previous);next.delete(invalid.id);return next});
    requestAnimationFrame(()=>{
      const row=list.current?.querySelector('[data-risk-id="'+invalid.id+'"]');
      row?.querySelector<HTMLElement>(invalid.description.trim()?'select':'textarea')?.focus();
    });
  }

  const baseline=new Map(saved.map(row=>[row.id,row]));
  const matches=(row:Risk)=>!filter||row.severity===filter.severity&&row.probability===filter.probability;
  const visible=risks.map((risk,index)=>({risk,index})).filter(({risk})=>{
    const original=baseline.get(risk.id);
    return matches(risk)||Boolean(dirty&&(!original||matches(original)&&riskChanged(original,risk)));
  });
  return <section className="panel padded" aria-labelledby="risk-register-title">
    <div className="split risk-table-heading">
      <div><h2 id="risk-register-title" tabIndex={-1}>Risiko terdaftar</h2>
        <p className="muted">{risks.length} risiko · {dirty?'Perubahan belum diterapkan':'Draf dokumen'}</p></div>
    </div>
    <span className="visually-hidden" role="status">{announcement}</span>
    {filter&&<div className="risk-filter-status">
      <span role="status">Keparahan {filter.severity} · Probabilitas {filter.probability}. Urutan dapat diubah setelah filter direset.</span>
      <Button type="button" className="button" onClick={()=>changeFilter(null)}>Reset filter</Button>
    </div>}
    {!visible.length?<Empty>{filter?'Tidak ada risiko pada kombinasi ini.':'Belum ada risiko terdaftar.'}</Empty>:
      <div ref={list} className="risk-record-list">
        {visible.map(({risk,index})=>{
          const level=riskLevel(risk);
          const issue=validate?riskIssue(risk):'';
          const errorId=issue?group+'-error-'+index:undefined;
          const id=group+'-risk-'+index;
          const expanded=!collapsed.has(risk.id);
          const impacts=normalizeRiskImpacts(risk.impacts);
          const original=baseline.get(risk.id);
          const changed=dirty&&(!original||riskChanged(original,risk)||saved[index]?.id!==risk.id);
          return <section key={risk.id} data-risk-id={risk.id} className={'record-group'+(changed?' risk-draft-row':'')}
            data-drop-target={target===risk.id||undefined} data-map-highlight={highlighted===risk.id||undefined}>
            <div className="risk-record-heading">
              <Button type="button" className="icon-button record-toggle" aria-expanded={expanded} aria-controls={id}
                aria-label={(expanded?'Tutup':'Buka')+' risiko '+(index+1)} onClick={()=>setCollapsed(previous=>{
                  const next=new Set(previous);
                  if(next.has(risk.id))next.delete(risk.id);else next.add(risk.id);
                  return next;
                })}><ChevronDown size={17} aria-hidden="true"/></Button>
              <span className="risk-drag-handle" data-can-drag={canReorder||undefined} title={canReorder?'Seret nomor untuk mengurutkan risiko':undefined}
                onPointerDown={event=>{
                  if(!canReorder||event.button!==0||!event.isPrimary)return;
                  drag.current={id:risk.id,y:event.clientY,target:''};
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={event=>{
                  const entry=drag.current;
                  if(!entry||!canReorder||Math.abs(event.clientY-entry.y)<5)return;
                  const row=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-risk-id]');
                  const id=row&&list.current?.contains(row)&&row.dataset.riskId!==entry.id?row.dataset.riskId??'':'';
                  entry.target=id;
                  setTarget(id);
                }}
                onPointerUp={event=>endDrag(event,true)} onPointerCancel={event=>endDrag(event,false)}
                onLostPointerCapture={()=>{drag.current=undefined;setTarget('')}}>{index+1}.</span>
              <strong>{risk.description||'Risiko baru'}</strong>
              <Pill tone={riskTone(level)}>{level}</Pill>
              {canEdit&&<div className="risk-actions">
                <Button type="button" className="icon-button" disabled={!canReorder||index===0} aria-label={'Naikkan urutan risiko '+(index+1)} onClick={()=>move(risk.id,index-1)}><ArrowUp size={14}/></Button>
                <Button type="button" className="icon-button" disabled={!canReorder||index===risks.length-1} aria-label={'Turunkan urutan risiko '+(index+1)} onClick={()=>move(risk.id,index+1)}><ArrowDown size={14}/></Button>
                <Button type="button" className="icon-button danger-text" disabled={busy} aria-label={'Hapus risiko '+(index+1)} onClick={()=>remove(risk)}><NavIcon name="trash"/></Button>
              </div>}
            </div>
            <div id={id} className="record-details risk-record-fields" hidden={!expanded}>
              <FormField className="span-full" label="Identifikasi risiko" required={canEdit}><Textarea aria-label={'Identifikasi risiko '+(index+1)}
                required={canEdit} readOnly={!canEdit} disabled={busy} aria-invalid={Boolean(issue&&!risk.description.trim())}
                aria-describedby={errorId} value={risk.description} placeholder="Keterlambatan pengiriman perangkat" onChange={event=>change(risk.id,{description:event.target.value})}/></FormField>
              {issue&&<small id={errorId} className="field-error span-full" role="alert">{issue}</small>}
              <fieldset className="clean-fieldset span-full risk-record-impacts" disabled={busy||!canEdit}><legend>Dampak</legend>
                {impactOptions.map(value=><label className="check" key={value}><input type="checkbox" checked={impacts.includes(value)}
                  onChange={event=>change(risk.id,{impacts:event.target.checked?[...impacts,value]:impacts.filter(item=>item!==value)})}/>{value}</label>)}
                {impacts.filter(value=>!impactOptions.includes(value)).map(value=><span key={value} className="muted">{value}</span>)}
              </fieldset>
              <FormField label="Keparahan"><Select aria-label={'Keparahan risiko '+(index+1)} aria-describedby={errorId} disabled={busy||!canEdit}
                value={risk.severity} onChange={event=>change(risk.id,{severity:event.target.value})}>{levels.map(option=><option key={option}>{option}</option>)}</Select></FormField>
              <FormField label="Probabilitas"><Select aria-label={'Probabilitas risiko '+(index+1)} aria-describedby={errorId} disabled={busy||!canEdit}
                value={risk.probability} onChange={event=>change(risk.id,{probability:event.target.value})}>{levels.map(option=><option key={option}>{option}</option>)}</Select></FormField>
              <FormField className="span-full" label="Rencana respons"><Textarea aria-label={'Rencana respons risiko '+(index+1)}
                value={risk.response} disabled={busy} readOnly={!canEdit} onChange={event=>change(risk.id,{response:event.target.value})}/></FormField>
            </div>
          </section>;
        })}
      </div>}
    {canEdit&&<Button type="button" className="button record-add risk-add-row" disabled={busy} onClick={event=>{if(event.detail<=1)add()}}>
      <Plus size={16} aria-hidden="true"/> Tambah baris
    </Button>}
    {beforeActions}
    {canEdit&&dirty&&<div className="risk-apply-actions heading-actions">
      <Button type="button" className="button" disabled={busy} onClick={cancel}>Batalkan perubahan</Button>
      <Button type="button" className="button primary" disabled={busy||conflict} onClick={submit}>{busy?'Menyimpan…':'Terapkan perubahan'}</Button>
    </div>}
  </section>;
}
