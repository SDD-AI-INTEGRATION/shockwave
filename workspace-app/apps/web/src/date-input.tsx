import { useEffect, useId, useRef, useState, type KeyboardEvent, type ComponentPropsWithoutRef } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { FloatingPopover } from './floating-popover';
import { TextInput } from './form-controls';

type Props=Omit<ComponentPropsWithoutRef<'input'>,'type'|'value'|'onChange'>&{
  label:string;value:string;onValue:(value:string)=>void;onInvalidDraft?:(invalid:boolean)=>void;
};
const monthLabel=new Intl.DateTimeFormat('id-ID',{month:'long',timeZone:'UTC'});
const months=Array.from({length:12},(_,index)=>monthLabel.format(new Date(Date.UTC(2000,index,1))));
const dayLabel=new Intl.DateTimeFormat('id-ID',{dateStyle:'full',timeZone:'UTC'});
const localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta'});
const isoDate=/^[1-9]\d{3}-\d{2}-\d{2}$/;
function normalize(value:string){
  const match=/^(\d{1,2})\/(\d{1,2})\/([1-9]\d{3})$/.exec(value.trim());
  const iso=match?match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0'):value.trim();
  if(!isoDate.test(iso))return '';
  const date=new Date(iso+'T00:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===iso?iso:'';
}
const localFormat=(value:string)=>isoDate.test(value)?value.split('-').reverse().join('/'):value;
const monthOf=(date:string)=>new Date(date.slice(0,7)+'-01T00:00:00Z');

export function DateInput({label,value,onValue,onInvalidDraft,name,readOnly,disabled,min,max,...props}:Props){
  const calendarId=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const [month,setMonth]=useState<Date>();
  const [active,setActive]=useState('');
  const grid=useRef<HTMLDivElement>(null);
  const focusDay=useRef(false);
  const [touched,setTouched]=useState(false);
  const [typed,setTyped]=useState<string>();
  useEffect(()=>setTyped(undefined),[value]);
  const input=typed??localFormat(value);
  const iso=normalize(input);
  const today=localDate.format(new Date());
  const year=month?.getUTCFullYear()??0;
  const monthNumber=month?.getUTCMonth()??0;
  const days=month?new Date(Date.UTC(year,monthNumber+1,0)).getUTCDate():0;
  const offset=month?(month.getUTCDay()+6)%7:0;
  const outside=(date:string)=>typeof min==='string'&&date<min||typeof max==='string'&&date>max;
  const firstOfMonth=(y:number,m:number)=>new Date(Date.UTC(y,m,1));
  const earliest=typeof min==='string'?min:'1000-01-01';
  const latest=typeof max==='string'?max:'9999-12-31';
  const monthAvailable=(y:number,m:number)=>{
    if(y<1000||y>9999)return false;
    const prefix=firstOfMonth(y,m).toISOString().slice(0,7);
    return prefix>=earliest.slice(0,7)&&prefix<=latest.slice(0,7);
  };
  useEffect(()=>{
    if(focusDay.current){grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();focusDay.current=false}
  },[active,month]);
  const invalid=Boolean(input&&(!iso||outside(iso)));
  const invalidMessage=iso?'Tanggal berada di luar rentang.':'Gunakan tanggal valid dengan format HH/BB/TTTT.';

  function close(){setMonth(undefined)}
  function focusTrigger(){trigger.current?.focus({preventScroll:true})}
  function showMonth(y:number,m:number){
    const next=firstOfMonth(y,m);
    if(!monthAvailable(next.getUTCFullYear(),next.getUTCMonth()))return;
    const first=next.toISOString().slice(0,10);
    setMonth(next);setActive(first<earliest?earliest:first);
  }
  function openCalendar(){
    const date=iso||today;
    const initial=date<earliest?earliest:date>latest?latest:date;
    setActive(initial);setMonth(monthOf(initial));
  }
  function moveDay(event:KeyboardEvent<HTMLButtonElement>,day:string){
    const previous=new Date(day+'T00:00:00Z');
    const row=(previous.getUTCDay()+6)%7;
    const steps:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-row,End:6-row};
    const step=steps[event.key];
    if(step===undefined)return;
    event.preventDefault();
    previous.setUTCDate(previous.getUTCDate()+step);
    const target=previous.toISOString().slice(0,10);
    if(target<earliest||target>latest)return;
    focusDay.current=true;setActive(target);
    if(target.slice(0,7)!==day.slice(0,7))setMonth(monthOf(target));
  }
  const prevMonth=firstOfMonth(year,monthNumber-1);
  const nextMonth=firstOfMonth(year,monthNumber+1);
  return <div className="date-control">
    <div className="date-control-row">
      <TextInput {...props} aria-label={label} type="text" data-date-control="" data-date-name={name} inputMode="numeric" placeholder={props.placeholder??'24/11/2026'}
        autoComplete="off" value={input} readOnly={readOnly} disabled={disabled}
        ref={input=>input?.setCustomValidity(invalid?invalidMessage:'')}
        aria-invalid={props['aria-invalid']||touched&&invalid||undefined}
        aria-describedby={[props['aria-describedby'],touched&&invalid?calendarId+'-error':null].filter(Boolean).join(' ')||undefined}
        onChange={event=>{
          const text=event.target.value;
          const date=normalize(text);
          const invalidDraft=Boolean(text&&(!date||outside(date)));
          onInvalidDraft?.(invalidDraft);
          if(invalidDraft)setTyped(text);
          else {setTyped(undefined);onValue(date)}
        }} onBlur={()=>setTouched(true)}/>
      {name&&<input type="hidden" name={name} value={value} disabled={disabled}/>}
      {!readOnly&&!disabled&&<button type="button" className="icon-button" ref={trigger} aria-label={'Kalender '+label.toLowerCase()}
        title={'Kalender '+label.toLowerCase()} aria-expanded={Boolean(month)} aria-controls={month?calendarId:undefined}
        onClick={()=>month?close():openCalendar()}><CalendarDays size={17}/></button>}
    </div>
    {touched&&invalid&&!props['aria-invalid']&&<small id={calendarId+'-error'} className="date-error">{invalidMessage}</small>}
    {month&&<FloatingPopover anchor={trigger} onDismiss={close} className="date-calendar" minimumWidth={320} id={calendarId} label={'Pilih '+label.toLowerCase()}>
      <div className="date-calendar-heading">
        <button type="button" className="icon-button" aria-label="Bulan sebelumnya" title="Bulan sebelumnya"
          disabled={!monthAvailable(prevMonth.getUTCFullYear(),prevMonth.getUTCMonth())} onClick={()=>showMonth(year,monthNumber-1)}><ChevronLeft size={15}/></button>
        <strong aria-live="polite">{months[monthNumber]} {year}</strong>
        <button type="button" className="icon-button" aria-label="Bulan berikutnya" title="Bulan berikutnya"
          disabled={!monthAvailable(nextMonth.getUTCFullYear(),nextMonth.getUTCMonth())} onClick={()=>showMonth(year,monthNumber+1)}><ChevronRight size={15}/></button>
      </div>
      <div className="date-calendar-grid" ref={grid} aria-label={months[monthNumber]+' '+year}>
        {['Sn','Sl','Rb','Km','Jm','Sb','Mg'].map(day=><small key={day} aria-hidden="true">{day}</small>)}
        {Array.from({length:offset},(_,index)=><span key={'blank-'+index} aria-hidden="true"/>)}
        {Array.from({length:days},(_,index)=>{
          const date=new Date(Date.UTC(year,monthNumber,index+1));
          const day=date.toISOString().slice(0,10);
          return <button type="button" className="icon-button" key={day} aria-label={dayLabel.format(date)}
            data-popover-focus={day===active?'':undefined} tabIndex={day===active?0:-1} onKeyDown={event=>moveDay(event,day)}
            aria-current={day===today?'date':undefined} aria-pressed={day===iso} disabled={outside(day)}
            onClick={()=>{setTyped(undefined);onInvalidDraft?.(false);onValue(day);close();focusTrigger()}}>{index+1}</button>;
        })}
      </div>
      <div className="date-calendar-footer">
        <button type="button" className="button" disabled={!monthAvailable(+today.slice(0,4),+today.slice(5,7)-1)}
          onClick={()=>{
            const target=today<earliest?earliest:today>latest?latest:today;
            focusDay.current=true;
            setActive(target);
            setMonth(monthOf(today));
          }}>Hari ini</button>
      </div>
    </FloatingPopover>}
  </div>;
}
