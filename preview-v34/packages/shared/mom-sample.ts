export type MomFollowup={id:string;side:string;note:string;pic:string;due:string};
export type MomData={fields:Record<string,string>;followups:MomFollowup[]};

export const momSamplePrompt='Buatkan contoh notulen rapat (MOM) proyek dalam file Word. Gunakan data fiktif dan sertakan waktu, peserta, pembahasan, keputusan, serta tindak lanjut lengkap dengan PIC dan tenggat.';

export function sampleMomReply(message:string) {
  if(!/^(?:(?:tolong|mohon)\s+)?(?:buat(?:kan)?|bikin(?:kan)?|generate|siapkan)\b/i.test(message)
    || !/\b(?:notulen|mom|minutes of meeting)\b/i.test(message)
    || !/\bcontoh\b/i.test(message))return null;

  const mom:MomData={
    fields:{
      division:'PMO', date:'2026-11-16', numberMode:'Manual', number:'NTLN/CONTOH/001/2026',
      purpose:'Meninjau kesiapan uji penerimaan pengguna (UAT) Portal Layanan Aurora.',
      start:'09:00', end:'10:00', location:'Ruang Rapat Aurora, Jakarta',
      internal:'Tim PMO dan tim implementasi', customer:'Koperasi Cahaya Fiktif',
      attendees:'Naya Fiktif · Project Manager\nRani Fiktif · Lead QA\nArdi Fiktif · Perwakilan pelanggan',
      previous:'# Status rapat sebelumnya\n- Skenario UAT disepakati pada rapat 9 November 2026.',
      result:'# Pembahasan\n> Kesiapan UAT\n- Tim menyelesaikan 18 dari 20 skenario pengujian internal.\n- Dua skenario menunggu aktivasi akun penguji pelanggan.\n\n# Keputusan\n1. UAT dijadwalkan pada 23 November 2026.\n2. UAT dimulai setelah akun penguji aktif dan semua skenario internal lulus.',
      revisionDate:'2026-11-18', revisionNote:'Sampaikan koreksi notulen kepada notulis sebelum batas pengajuan.',
      place:'Jakarta', signDate:'2026-11-16', writer:'Rani Fiktif', writerTitle:'Lead QA',
      manager:'Naya Fiktif', managerTitle:'Project Manager', approval:'Sembunyikan',
      closing:'Demikian notulen ini dibuat sebagai catatan dan tindak lanjut rapat.',
    },
    followups:[
      {id:'6f83eb94-1fa3-4af2-a2dc-5fcc22f27792',side:'Pelanggan',note:'Aktifkan akun penguji pelanggan.',pic:'Ardi Fiktif',due:'2026-11-18'},
      {id:'8a5d0fd0-89e3-43df-b363-34bc4429b537',side:'Internal',note:'Selesaikan dua skenario tersisa dan kirim hasil uji.',pic:'Rani Fiktif',due:'2026-11-20'},
      {id:'e273ad80-ffcb-4040-be9d-78f8e788ca44',side:'Internal',note:'Konfirmasi kesiapan dan bagikan undangan UAT.',pic:'Naya Fiktif',due:'2026-11-20'},
    ],
  };
  return {text:'Contoh MOM untuk rapat persiapan UAT sudah siap. Dokumen berisi data fiktif dan bisa diedit di Word.',mom};
}
