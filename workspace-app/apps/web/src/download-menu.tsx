import { Download, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import { ActionMenu } from './action-menu';
import { Button } from './ui';

export type DownloadFormat='Word'|'Excel'|'PDF';
const formats={
  Word:{icon:FileType,extension:'.docx'},
  Excel:{icon:FileSpreadsheet,extension:'.xlsx'},
  PDF:{icon:FileText,extension:'.pdf'},
} as const;
export function FormatIcon({format}:{format:DownloadFormat}){
  const Icon=formats[format].icon;
  return <Icon className={'format-icon format-'+format.toLowerCase()} size={16} aria-hidden="true"/>;
}
export function DownloadMenu({available,busy,download,label='Unduh'}:{label?:string;available:readonly DownloadFormat[];busy:boolean;download:(value:DownloadFormat)=>void}){
  if(!available.length)return null;
  if(available.length===1){
    const format=available[0];
    return <Button type="button" className="button no-print" pending={busy?'Menyiapkan…':undefined} onClick={()=>download(format)}>
      <FormatIcon format={format}/> {label} {format}
    </Button>;
  }
  return <ActionMenu label={label} triggerLabel={busy?'Menyiapkan…':label} align="start" busy={busy}
    icon={<Download size={15} aria-hidden="true"/>} items={available.map(format=>({
      id:format,label:format+' ('+formats[format].extension+')',icon:<FormatIcon format={format}/>,run:()=>download(format),
    }))}/>;
}
