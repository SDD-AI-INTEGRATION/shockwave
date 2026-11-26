const moneyNumber = new Intl.NumberFormat('id-ID', {maximumFractionDigits:2, useGrouping:true});

export function formatMoneyNumber(amount:number) {
  return moneyNumber.format(amount);
}

export function formatRupiah(amount:number) {
  const formatted = moneyNumber.format(Math.abs(amount));
  return (amount<0?'-':'')+'Rp '+formatted;
}

export function parseRupiahInput(value:string):number|null {
  const normalized = value.trim().replace(/^Rp\.?\s*/i,'');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized.replaceAll('.','').replace(',','.'));
  return Number.isFinite(amount) && amount<=Number.MAX_SAFE_INTEGER ? amount : null;
}
