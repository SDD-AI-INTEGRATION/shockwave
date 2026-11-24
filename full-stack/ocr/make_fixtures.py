"""Synthetic input only: no company/customer data or real signatures."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
folder=Path('/fixtures');folder.mkdir(exist_ok=True)
image=Image.new('RGB',(1500,1800),'white');draw=ImageDraw.Draw(image);font=ImageFont.load_default(size=36)
lines=['BERITA ACARA SERAH TERIMA','Nomor BAST: BAST/001/2026','Nama Proyek: Proyek Sintetis PMO','Tanggal: 17 November 2026','Pelanggan: Pelanggan Uji','Nilai Kontrak: Rp 100.000.000','Dokumen ini hanya untuk pengujian otomatis.']
for i,line in enumerate(lines):draw.text((90,130+i*100),line,fill='black',font=font)
image.save(folder/'bast-scan.png');image.save(folder/'bast-scan.pdf','PDF',resolution=150)
text='\n'.join(f'({line}) Tj 0 -40 Td' for line in lines)
stream=('BT /F1 18 Tf 50 730 Td '+text+' ET').encode('ascii')
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 900] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
pdf=b'%PDF-1.4\n';offsets=[0]
for i,value in enumerate(objects,1):offsets.append(len(pdf));pdf+=f'{i} 0 obj\n'.encode()+value+b'\nendobj\n'
xref=len(pdf);pdf+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()
for offset in offsets[1:]:pdf+=f'{offset:010d} 00000 n \n'.encode()
pdf+=f'trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode();(folder/'bast-text.pdf').write_bytes(pdf)
print('Created synthetic PNG, scanned PDF, and text-layer PDF fixtures.')
