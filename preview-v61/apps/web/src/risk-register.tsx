import { NavIcon } from './nav-icon';
import { riskLevels } from '../../../packages/shared/risk-register';
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Select, Textarea } from './form-controls';
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
export const riskLevel=({severity,probability}:Risk)=>{
  const value=score(severity,probability);
  return value===4?'Tinggi':value>=2?'Sedang':'Rendah';
};
export const riskTone=(level:string)=>level==='Tinggi'?'red':level==='Sedang'?'amber':'green';

type RiskMapProps={risks:Risk[];filter:RiskFilter|null;changeFilter:(value:RiskFilter|null)=>void};
export function RiskMap({risks,filter,changeFilter}:RiskMapProps){
  return <section className="panel padded" aria-labelledby="risk-map-title">
      <h2 id="risk-map-title">Peta risiko</h2>
      <p className="muted space-small">Keparahan per baris · probabilitas per kolom</p>
      <div className="risk-map"><div/>{levels.map(level=><strong key={level}>{level}</strong>)}
        {[...levels].reverse().map(severity=><div className="risk-map-row" key={severity}><strong>{severity}</strong>
          {levels.map(probability=>{
            const count=risks.filter(risk=>risk.severity===severity&&risk.probability===probability).length;
            const selected=filter?.severity===severity&&filter.probability===probability;
            return <button type="button" className={'risk-cell risk-'+score(severity,probability)} key={probability}
              aria-pressed={selected} aria-label={severity+' keparahan, '+probability+' probabilitas, '+count+' risiko'}
              onClick={()=>changeFilter(selected?null:{severity,probability})}>{count}</button>;
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

export function RiskRegister({risks,saved,canEdit,filter,changeFilter,update,remove,apply,cancel,busy,conflict,dirty}:{
  risks:Risk[];saved:Risk[];canEdit:boolean;filter:RiskFilter|null;changeFilter:(value:RiskFilter|null)=>void;
  update:(update:(rows:Risk[])=>Risk[])=>void;remove:(risk:Risk)=>void;
  apply:()=>void;cancel:()=>void;busy:boolean;conflict:boolean;dirty:boolean;
}){
  const drag=useRef<{id:string;y:number;target:string}>();
  const [target,setTarget]=useState('');
  const [validate,setValidate]=useState(false);
  const [added,setAdded]=useState('');
  const [announcement,setAnnouncement]=useState('');
  const group=useId();
  const table=useRef<HTMLTableElement>(null);
  const canReorder=canEdit&&!filter&&!busy;
  useEffect(()=>{
    if(!added)return;
    table.current?.querySelector<HTMLTextAreaElement>('[data-risk-id="'+added+'"] textarea')?.focus();
  },[added]);
  useEffect(()=>{if(!dirty){setValidate(false);setAdded('')}},[dirty]);

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
    requestAnimationFrame(()=>{
      const row=Array.from(table.current?.rows??[]).find(item=>item.dataset.riskId===invalid.id);
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
      <div className="table-scroll risk-inline-scroll" role="region" aria-label="Tabel risiko" tabIndex={0}>
        <table ref={table} className="data-table risk-editor-table risk-editable-table">
          <thead><tr>{['Urutan','Identifikasi risiko','Dampak','Keparahan','Probabilitas','Level','Rencana respons','Tindakan'].map(label=>
            <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{visible.map(({risk,index})=>{
            const level=riskLevel(risk);
            const issue=validate?riskIssue(risk):'';
            const errorId=issue?group+'-error-'+index:undefined;
            const impacts=normalizeRiskImpacts(risk.impacts);
            const original=baseline.get(risk.id);
            const changed=dirty&&(!original||riskChanged(original,risk)||saved[index]?.id!==risk.id);
            return <tr key={risk.id} data-risk-id={risk.id} className={changed?'risk-draft-row':undefined} data-drop-target={target===risk.id||undefined}>
              <td>{index+1}{canEdit&&<div className="risk-actions">
                <span className="risk-drag-handle" data-can-drag={canReorder||undefined} aria-hidden="true"
                  onPointerDown={event=>{
                    if(!canReorder||event.button!==0||!event.isPrimary)return;
                    drag.current={id:risk.id,y:event.clientY,target:''};
                    event.currentTarget.setPointerCapture(event.pointerId);
                    event.preventDefault();
                  }}
                  onPointerMove={event=>{
                    const entry=drag.current;
                    if(!entry||!canReorder||Math.abs(event.clientY-entry.y)<5)return;
                    const row=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLTableRowElement>('[data-risk-id]');
                    const id=row&&table.current?.contains(row)&&row.dataset.riskId!==entry.id?row.dataset.riskId??'':'';
                    entry.target=id;
                    setTarget(id);
                  }}
                  onPointerUp={event=>endDrag(event,true)}
                  onPointerCancel={event=>endDrag(event,false)}
                  onLostPointerCapture={()=>{drag.current=undefined;setTarget('')}}><GripVertical size={15}/></span>
                <button type="button" className="icon-button" disabled={!canReorder||index===0} aria-label={'Naikkan urutan risiko '+(index+1)} onClick={()=>move(risk.id,index-1)}><ArrowUp size={14}/></button>
                <button type="button" className="icon-button" disabled={!canReorder||index===risks.length-1} aria-label={'Turunkan urutan risiko '+(index+1)} onClick={()=>move(risk.id,index+1)}><ArrowDown size={14}/></button>
              </div>}</td>
              <td>{canEdit?<><Textarea aria-label={'Identifikasi risiko '+(index+1)} required disabled={busy} aria-invalid={Boolean(issue&&!risk.description.trim())}
                aria-describedby={errorId} value={risk.description} placeholder="Keterlambatan pengiriman perangkat" onChange={event=>change(risk.id,{description:event.target.value})}/>
                {issue&&<small id={errorId} className="field-error" role="alert">{issue}</small>}</>:<strong>{risk.description}</strong>}</td>
              <td>{canEdit?<fieldset disabled={busy} className="clean-fieldset risk-impacts"><legend className="visually-hidden">Area terdampak risiko {index+1}</legend>
                {impactOptions.map(value=><label className="check" key={value}><input type="checkbox" checked={impacts.includes(value)}
                  onChange={event=>change(risk.id,{impacts:event.target.checked?[...impacts,value]:impacts.filter(item=>item!==value)})}/>{value}</label>)}
              </fieldset>:impacts.join(', ')||'—'}</td>
              <td>{canEdit?<Select aria-label={'Keparahan risiko '+(index+1)} aria-describedby={errorId} disabled={busy} value={risk.severity}
                onChange={event=>change(risk.id,{severity:event.target.value})}>{levels.map(option=><option key={option}>{option}</option>)}</Select>:risk.severity}</td>
              <td>{canEdit?<Select aria-label={'Probabilitas risiko '+(index+1)} aria-describedby={errorId} disabled={busy} value={risk.probability}
                onChange={event=>change(risk.id,{probability:event.target.value})}>{levels.map(option=><option key={option}>{option}</option>)}</Select>:risk.probability}</td>
              <td><Pill tone={riskTone(level)}>{level}</Pill></td>
              <td>{canEdit?<Textarea aria-label={'Rencana respons risiko '+(index+1)} value={risk.response} disabled={busy}
                onChange={event=>change(risk.id,{response:event.target.value})}/>:risk.response||'—'}</td>
              <td>{canEdit&&<button type="button" className="icon-button danger-text" disabled={busy} aria-label={'Hapus risiko '+(index+1)} onClick={()=>remove(risk)}><NavIcon name="trash"/></button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    {canEdit&&<Button type="button" className="button risk-add-row" disabled={busy} onClick={event=>{if(event.detail<=1)add()}}>
      <Plus size={16} aria-hidden="true"/> Tambah baris
    </Button>}
    {canEdit&&dirty&&<div className="risk-apply-actions heading-actions">
      <Button type="button" className="button" disabled={busy} onClick={cancel}>Batalkan perubahan</Button>
      <Button type="button" className="button primary" disabled={busy||conflict} onClick={submit}>{busy?'Menyimpan…':'Terapkan perubahan'}</Button>
    </div>}
  </section>;
}
