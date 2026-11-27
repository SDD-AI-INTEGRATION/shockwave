import { SearchableSelect } from './search-select';
import type { WorkspaceGroup, WorkspacePerson } from '../../../packages/shared/workspace-admin';

export function UserSelect({people,groups,label,value,onValue,id,name,disabled=false,required=false}:{
  people:readonly WorkspacePerson[];groups:readonly WorkspaceGroup[];
  label:string;value:string;onValue:(id:string)=>void;id?:string;name?:string;disabled?:boolean;required?:boolean;
}){
  const groupNames=new Map(groups.map(group=>[group.id,group.name]));
  const options=[...people].sort((a,b)=>a.name.localeCompare(b.name,'id')).map(person=>({
    id:person.id,label:person.name,group:groupNames.get(person.groupId),keywords:person.email,
  }));
  return <SearchableSelect id={id} name={name} label={label} value={value} onChange={onValue} options={options}
    emptyLabel="Pilih pengguna" disabled={disabled} required={required}/>;
}
