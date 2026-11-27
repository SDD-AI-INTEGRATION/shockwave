import { pillars, resolvePillar, type ProjectRow } from './domain';

const sortValues = {
  name: (project:ProjectRow) => project.detail.name,
  pillar: (project:ProjectRow) => pillars.indexOf(project.pillar),
  customer: (project:ProjectRow) => projectCustomer(project),
  pm: (project:ProjectRow) => project.detail.pm,
  end: (project:ProjectRow) => project.end,
  revenue: (project:ProjectRow) => project.actualAvailable ? project.actual : null,
  status: (project:ProjectRow) => project.status,
};

export function projectCustomer(project:ProjectRow) {
  return project.id==='P004'&&project.verification&&!project.references?.customerId ? '' : project.detail.customer;
}

export function selectProjectRows(rows:ProjectRow[],params:URLSearchParams, defaultSort=false) {
  const query=params.get('q')?.trim().toLowerCase()??'';
  const status=params.get('status');
  const requestedPillars=params.getAll('pillar');
  const selectedPillars=new Set(requestedPillars.map(value=>resolvePillar(value)?.label));
  const key=params.get('sort')??'';
  const value=Object.hasOwn(sortValues,key)?sortValues[key as keyof typeof sortValues]:defaultSort?sortValues.pillar:undefined;
  const direction=params.get('direction')==='desc'?-1:1;

  const results=rows.filter(project=>
    (!status||project.status===status)&&
    (!requestedPillars.length||selectedPillars.has(project.pillar))&&
    (params.get('hasRevenue')!=='true'||project.reported)&&
    [project.id,project.detail.name,project.detail.customer,project.detail.pm,project.pillar,project.sub].join(' ').toLowerCase().includes(query),
  );
  if(!value)return results;
  return results.sort((a,b)=>{
    const left=value(a),right=value(b);
    if(left===null||right===null)return Number(left===null)-Number(right===null);
    if(typeof left==='number'&&typeof right==='number')return direction*(left-right);
    return direction*String(left).localeCompare(String(right),'id',{numeric:true});
  });
}
