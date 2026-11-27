import unittest
from extraction import candidates

class ExtractionTests(unittest.TestCase):
 def test_bast_text_and_fields(self):
  result=candidates({'pages':[{'source':'pdf_text','page':1,'text':'BERITA ACARA SERAH TERIMA\nNomor BAST: 001/BAST/2026\nNama Proyek: Implementasi Sistem\nTanggal: 17 November 2026\nPelanggan: Pelanggan Uji\nNilai Kontrak: Rp 100.000.000'}]})
  self.assertEqual(result['category'],'bast')
  self.assertEqual(result['fields']['document_number']['value'],'001/BAST/2026')
  self.assertEqual(result['fields']['project_name']['value'],'Implementasi Sistem')
  self.assertEqual(result['fields']['document_date']['page'],1)
  self.assertIsNone(result['fields']['document_number']['confidence'])
 def test_ocr_preserves_confidence_and_coordinates(self):
  box=[[0,0],[10,0],[10,10],[0,10]]
  result=candidates({'pages':[{'source':'ocr','page':2,'result':[{'res':{'rec_texts':['NOTULEN RAPAT','Nomor: MOM-001'],'rec_scores':[.99,.95],'rec_polys':[box,box]}}]}]})
  self.assertEqual(result['category'],'mom')
  self.assertEqual(result['fields']['document_number']['box'],box)
  self.assertEqual(result['fields']['document_number']['confidence'],.95)
 def test_pks_contract_and_payment_terms(self):
  text='PERJANJIAN KERJA SAMA\nNomor PKS: 012/PKS/SDD/2026\nNama Pekerjaan: Migrasi Data Center\nNilai Kontrak: Rp 1.250.000.000\nTermin 1: 30% setelah BAST desain\nTermin 2: 70% (Rp 875.000.000) setelah BAST akhir\nSurat Perintah Kerja menyusul.'
  result=candidates({'pages':[{'source':'pdf_text','page':1,'text':text}]})
  self.assertEqual(result['category'],'pks')
  self.assertEqual(result['fields']['contract_number']['value'],'012/PKS/SDD/2026')
  self.assertEqual(result['fields']['contract_value']['value'],'Rp 1.250.000.000')
  self.assertEqual(result['fields']['termin_1']['value'],'30% setelah BAST desain')
  self.assertIn('Rp 875.000.000',result['fields']['termin_2']['value'])
 def test_invoice_fields(self):
  result=candidates({'pages':[{'source':'pdf_text','page':1,'text':'INVOICE\nNo. Invoice: INV/2026/11/007\nTanggal Invoice: 2026-11-10\nJatuh Tempo: 2026-12-10\nTotal Tagihan: Rp 375.000.000'}]})
  self.assertEqual(result['category'],'invoice')
  self.assertEqual(result['fields']['invoice_number']['value'],'INV/2026/11/007')
  self.assertEqual(result['fields']['invoice_date']['value'],'2026-11-10')
  self.assertEqual(result['fields']['due_date']['value'],'2026-12-10')
  self.assertEqual(result['fields']['contract_value']['value'],'Rp 375.000.000')
 def test_unknown_documents_do_not_invent_fields(self):
  result=candidates({'pages':[{'source':'pdf_text','page':1,'text':'Dokumen tanpa field yang dikenali.'}]})
  self.assertEqual(result['category'],'other');self.assertEqual(result['fields'],{})

if __name__=='__main__':unittest.main()
