let detector;
const decodeBytes=encoded=>Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));
const blobURL=(data,type)=>URL.createObjectURL(new Blob([data],{type}));
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      // Classic worker keeps the Emscripten loader's ModuleFactory global.
      // The MediaPipe API itself is still imported as an ES module.
      let api,wasm,baseOptions;
      if(data.pack){
        const pack=data.pack;
        api=await import(blobURL(pack.vision,'text/javascript'));
        const simd=await api.FilesetResolver.isSimdSupported();
        const variant=simd?pack.simd:pack.noSimd;
        wasm={wasmLoaderPath:blobURL(variant.loader,'text/javascript'),wasmBinaryPath:blobURL(decodeBytes(variant.wasm),'application/wasm')};
        baseOptions={modelAssetBuffer:decodeBytes(pack.model),delegate:'CPU'};
      }else{
        api=await import('./vendor/vision_bundle.mjs');
        wasm=await api.FilesetResolver.forVisionTasks(new URL('./vendor/wasm/',self.location.href).href);
        baseOptions={modelAssetPath:new URL('./vendor/hand_landmarker.task',self.location.href).href,delegate:'CPU'};
      }
      const {HandLandmarker}=api;
      detector = await HandLandmarker.createFromOptions(wasm, {
        baseOptions,
        runningMode:'VIDEO', numHands:2,
        minHandDetectionConfidence:.55, minHandPresenceConfidence:.55, minTrackingConfidence:.55,
      });
      self.postMessage({type:'ready'});
    } catch (error) { self.postMessage({type:'error',message:String(error.message || error)}); }
  } else if (data.type === 'frame') {
    try {
      if (!detector) throw new Error('手部识别模型未就绪');
      const result = detector.detectForVideo(data.bitmap,data.timestamp);
      self.postMessage({type:'result',hands:result.landmarks.map((landmarks,index)=>({landmarks,handedness:result.handedness[index]?.[0]?.categoryName||'',score:result.handedness[index]?.[0]?.score||0})),timestamp:data.timestamp});
    } catch (error) { self.postMessage({type:'error',message:String(error.message || error)}); }
    finally { data.bitmap?.close(); }
  }
};
