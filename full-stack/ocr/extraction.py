"""Deterministic candidates with source evidence; never a signature/legal validation."""
import re

RULES = {
 'document_number': r'(?:nomor|no\.?)(?:\s+(?:BAST|MOM|surat|dokumen))?\s*[:\-]\s*([^\n]+)',
 'contract_number': r'(?:nomor|no\.?)\s*(?:kontrak|PKS|SPK|perjanjian)\s*[:\-]\s*([^\n]+)',
 'invoice_number': r'(?:nomor|no\.?)\s*(?:invoice|faktur|tagihan)\s*[:\-]\s*([^\n]+)',
 'project_name': r'(?:nama\s+(?:proyek|project|pekerjaan)|proyek|project|pekerjaan)\s*[:\-]\s*([^\n]+)',
 'document_date': r'(?:tanggal|date)\s*[:\-]\s*([^\n]+)',
 'invoice_date': r'tanggal\s+(?:invoice|faktur|tagihan)\s*[:\-]\s*([^\n]+)',
 'due_date': r'(?:jatuh\s+tempo|due\s+date|batas\s+pembayaran)\s*[:\-]\s*([^\n]+)',
 'customer': r'(?:pelanggan|customer|nama\s+klien|pihak\s+pertama)\s*[:\-]\s*([^\n]+)',
 'contract_value': r'(?:nilai\s*(?:kontrak|pekerjaan|perjanjian)?|total(?:\s+tagihan)?)\s*[:\-]\s*(Rp\.?\s*[\d.,]+)',
}
# Earliest match wins: titles appear before references to other documents.
CATEGORIES = [
 ('bast', r'berita\s+acara\s+serah\s+terima|\bBAST\b'),
 ('spk', r'surat\s+perintah\s+kerja|\bSPK\b'),
 ('pks', r'perjanjian\s+kerja\s*sama|\bPKS\b'),
 ('invoice', r'\binvoice\b|\bfaktur\b'),
 ('mom', r'notulen|minutes\s+of\s+meeting|\bMOM\b'),
 ('assignment', r'penunjukan.*(?:project\s+manager|PM)|surat\s+tugas'),
 ('report', r'laporan\s+(?:proyek|mingguan)|weekly\s+report'),
]
TERM = r'\btermin\s*(?:ke[-\s]*)?(\d{1,2})\b\s*[:\-.)]?\s*(.+)'

def candidates(result):
 lines=[]
 for page in result.get('pages',[]):
  if page['source']=='pdf_text':
   for value in page.get('lines',[]) or [{'text':t,'box':None} for t in page.get('text','').splitlines()]:
    if value['text'].strip(): lines.append({'text':value['text'],'page':page['page'],'box':value['box'],'confidence':None,'source':'pdf_text'})
  else:
   for value in page.get('result',[]):
    data=value.get('res',value)
    for i,text in enumerate(data.get('rec_texts',[])):
     polygons=data.get('rec_polys',data.get('dt_polys',[]));scores=data.get('rec_scores',[])
     box=polygons[i] if i<len(polygons) else None
     lines.append({'text':text,'page':page['page'],'box':box,'confidence':scores[i] if i<len(scores) else None,'source':'ocr'})
 text='\n'.join(line['text'] for line in lines)
 category,first='other',None
 for name,pattern in CATEGORIES:
  match=re.search(pattern,text,re.I)
  if match and (first is None or match.start()<first):category,first=name,match.start()
 evidence=lambda line,value:{'value':value.strip()[:2000],'page':line['page'],'box':line['box'],'confidence':line['confidence'],'source':line['source']}
 fields={}
 for key,pattern in RULES.items():
  for line in lines:
   match=re.search(pattern,line['text'],re.I)
   if match:
    fields[key]=evidence(line,match.group(1));break
 # Payment terms (termin) become termin_N candidates; amounts stay text for human review.
 for line in lines:
  match=re.search(TERM,line['text'],re.I)
  if match and f'termin_{int(match.group(1))}' not in fields and re.search(r'%|Rp',match.group(2),re.I):
   fields[f'termin_{int(match.group(1))}']=evidence(line,match.group(2))
 return {'raw_text':text,'category':category,'fields':fields,'lines':lines,'schema_version':2}
