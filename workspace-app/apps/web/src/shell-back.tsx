import { createContext, useContext, type MouseEventHandler } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';

export const ShellBackTarget = createContext<HTMLElement|null>(null);

export function ShellBack({label,onClick}:{label:string;onClick:MouseEventHandler<HTMLButtonElement>}){
  const target=useContext(ShellBackTarget);
  const description=label.startsWith('Kembali')?label:'Kembali · '+label;
  const action=<button type="button" className="subtle-button shell-back" aria-label={description} title={description} onClick={onClick}>
    <ArrowLeft size={17} aria-hidden="true"/><span>Kembali</span>
  </button>;
  return target?createPortal(action,target):action;
}
