export async function prepareReview() {
  if(!('serviceWorker' in navigator))throw new Error('Browser ini tidak mendukung preview. Buka dengan Chrome atau Safari terbaru.');
  const script=new URL('/review-api.js?v=v61-review-hardening',location.href).href;
  const worker=navigator.serviceWorker;
  if(worker.controller?.scriptURL===script)return;
  await worker.register(script);
  if(worker.controller?.scriptURL===script)return;
  await new Promise<void>((resolve,reject)=>{
    function check(){
      if(worker.controller?.scriptURL!==script)return;
      clearTimeout(timeout);
      worker.removeEventListener('controllerchange',check);
      resolve();
    }
    const timeout=setTimeout(()=>{
      worker.removeEventListener('controllerchange',check);
      reject(new Error('Preview belum siap. Muat ulang halaman dan coba lagi.'));
    },15000);
    worker.addEventListener('controllerchange',check);
    check();
  });
}
