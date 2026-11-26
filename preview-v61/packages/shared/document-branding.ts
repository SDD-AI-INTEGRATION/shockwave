export const defaultDocumentLogo='/brand/sdd.png';
export const documentLogoMenus=['assignment','risk','mom','meetings','operations','bast'] as const;
export type DocumentLogoMenu=typeof documentLogoMenus[number];
export type DocumentBranding={global:string;menus:Partial<Record<DocumentLogoMenu,string>>};
export const defaultDocumentBranding:DocumentBranding={global:'',menus:{}};

export function effectiveDocumentLogo(branding:DocumentBranding,menu?:DocumentLogoMenu){
  return (menu&&branding.menus[menu])||branding.global||defaultDocumentLogo;
}

export function isDocumentLogoMenu(value:unknown):value is DocumentLogoMenu {
  return documentLogoMenus.some(menu=>menu===value);
}

export const maxDocumentLogoLength=1_500_000;
const webpPrefix='data:image/webp;base64,';

export function isSessionLogo(value:unknown):value is string {
  if(value==='')return true;
  if(typeof value!=='string'||value.length>maxDocumentLogoLength||!value.startsWith(webpPrefix))return false;
  const encoded=value.slice(webpPrefix.length);
  if(encoded.length<28||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))return false;
  const header=atob(encoded.slice(0,28));
  const bytes=encoded.length/4*3-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  const size=(header.charCodeAt(4)|header.charCodeAt(5)<<8|header.charCodeAt(6)<<16|header.charCodeAt(7)<<24)>>>0;
  return header.startsWith('RIFF')&&header.slice(8,12)==='WEBP'&&
    ['VP8 ','VP8L','VP8X'].includes(header.slice(12,16))&&size+8===bytes;
}
