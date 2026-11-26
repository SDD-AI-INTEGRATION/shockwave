import type { CSSProperties } from 'react';

// Solar Linear icons by 480 Design, CC BY 4.0. See docs/visual-system.md.
export function NavIcon({name}:{name:string}){
  return <span className={'nav-icon'+(name==='trash'?' trash-icon':'')} aria-hidden="true" style={{'--nav-icon':name==='upload'?'url(/icons/project-upload.svg)':'url(/icons/nav-'+name+'.svg)'} as CSSProperties}/>;
}
