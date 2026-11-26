import './design.css';
import './operations-theme.css';

function parentTheme(){
  if(window.parent===window)return;
  try{return window.parent.document.documentElement}catch{return}
}
const host=parentTheme();
if(host){
  const syncTheme = () => {
    document.documentElement.dataset.theme = host.dataset.theme ?? 'light';
    document.documentElement.dataset.accent = host.dataset.accent ?? 'shockwave';
  };
  syncTheme();
  new MutationObserver(syncTheme).observe(host, {
    attributes: true, attributeFilter: ['data-theme', 'data-accent']
  });
}
