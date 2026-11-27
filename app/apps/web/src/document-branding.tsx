import { createContext, useContext } from 'react';
import {
  defaultDocumentBranding, defaultDocumentLogo, effectiveDocumentLogo, type DocumentBranding, type DocumentLogoMenu,
} from '../../../packages/shared/document-branding';
import { DocumentLogo } from './document-logo';

export const DocumentBrandingContext=createContext<{
  branding:DocumentBranding;
  update:(scope:DocumentLogoMenu|'global',logo:string)=>Promise<void>;
}>({branding:defaultDocumentBranding,update:async()=>{throw new Error('Sesi logo dokumen belum tersedia.')}});

export function useDocumentLogo(menu?:DocumentLogoMenu){
  return effectiveDocumentLogo(useContext(DocumentBrandingContext).branding,menu);
}

export function SessionDocumentLogo({scope,disabled=false}:{scope:DocumentLogoMenu|'global';disabled?:boolean}){
  const {branding,update}=useContext(DocumentBrandingContext);
  return <DocumentLogo value={scope==='global'?branding.global:branding.menus[scope]??''} disabled={disabled}
    fallback={scope==='global'?defaultDocumentLogo:effectiveDocumentLogo(branding)}
    workspaceFallback={scope!=='global'}
    resetLabel={scope==='global'?'Gunakan logo default':'Gunakan logo workspace'}
    onChange={logo=>update(scope,logo)}/>;
}
