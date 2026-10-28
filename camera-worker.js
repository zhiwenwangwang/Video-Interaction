let packLoading;
function loadRuntime(){
  if(!packLoading)packLoading=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='./camera-data.js';
    script.onload=()=>window.__SHADOW_CAMERA_PACK?resolve(window.__SHADOW_CAMERA_PACK):reject(new Error('手部识别资源不完整'));
    script.onerror=()=>{packLoading=null;script.remove();reject(new Error('无法加载 camera-data.js，请完整解压分享包'));};
    document.head.append(script);
  });
  return packLoading;
}

export async function createCameraWorker(){
  const pack=await loadRuntime();
  const url=URL.createObjectURL(new Blob([pack.worker],{type:'text/javascript'}));
  try{
    const worker=new Worker(url);worker.runtimePack=pack;return worker;
  }finally{URL.revokeObjectURL(url);}
}
