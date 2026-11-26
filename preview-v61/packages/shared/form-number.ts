export function parseFormNumber(raw:string,{integer=false,max=Number.MAX_SAFE_INTEGER,min=0,allowDotDecimal=false}={}){
  const value=raw.trim();
  const grouped=/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value);
  const decimal=allowDotDecimal&&/^\d+\.\d{1,2}$/.test(value);
  if((!grouped&&!decimal)||(integer&&value.includes(',')))return null;
  const number=Number(decimal?value:value.replaceAll('.','').replace(',','.'));
  return Number.isFinite(number)&&number>=min&&number<=max&&(!integer||Number.isSafeInteger(number))?number:null;
}
