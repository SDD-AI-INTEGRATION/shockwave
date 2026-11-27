"""Procedural test fixtures: synthetic scan and explicit non-signature placeholders."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder=Path('/fixtures')
settings=json.loads((folder/'settings.json').read_text())
font=ImageFont.load_default(size=32)
lines=['DATA DUMMY - BUKAN DOKUMEN RESMI','BERITA ACARA SERAH TERIMA PEKERJAAN','Nomor BAST: BAST/DEMO/SCAN/2026','Nama Proyek: DEMO Penguatan Keamanan TI','Pelanggan: PT Aman Sentosa FIKTIF','Tanggal: '+settings['today'],'Nilai Kontrak: Rp 400.000.000','Scan sintetis untuk pengujian OCR dan verifikasi.']
scan=Image.new('RGB',(1600,1400),'white')
draw=ImageDraw.Draw(scan)
for i,line in enumerate(lines):draw.text((60,90+i*110),line,font=font,fill='#000A50')
scan.save(folder/'demo-bast-scan.png');scan.save(folder/'demo-bast-scan.jpg',quality=90);scan.save(folder/'demo-bast-scan.pdf','PDF',resolution=150)
photo=Image.new('RGB',(900,450),'#F3F6FC');draw=ImageDraw.Draw(photo)
draw.rounded_rectangle((25,25,875,425),radius=18,fill='#000A50')
for i,line in enumerate(['DOKUMENTASI SIMULASI','Workshop dan review proyek','DATA DUMMY - BUKAN FOTO RAPAT NYATA']):draw.text((55,80+i*90),line,font=ImageFont.load_default(size=28),fill='white')
photo.save(folder/'demo-meeting.png')
signature=Image.new('RGB',(600,160),'white');draw=ImageDraw.Draw(signature)
draw.rectangle((1,1,598,158),outline='#266FF1',width=3)
draw.text((25,28),'CONTOH GAMBAR TANDA TANGAN',font=ImageFont.load_default(size=25),fill='#000A50')
draw.text((25,90),'DATA DUMMY - TIDAK SAH',font=ImageFont.load_default(size=25),fill='#000A50')
signature.save(folder/'demo-signature.png')
print('Synthetic scan, photo placeholder and signature placeholder created.')
