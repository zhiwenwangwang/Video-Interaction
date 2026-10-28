import { PuppetRenderer } from './renderer.js';
import { HAND_CONNECTIONS, neutralControls } from './gestures.js';
import { DualHandController } from './dual-hands.js';
import { createPose, stepPose } from './pose.js';
import { initCustomization } from './customize.js';
import { createCameraWorker } from './camera-worker.js';

const $=id=>document.getElementById(id);
const stage=$('stage'),video=$('camera-video'),overlay=$('hand-overlay');
const renderer=new PuppetRenderer(stage,document.querySelector('.console'));
const gestures=new DualHandController();
const poses={warrior:createPose('warrior'),scholar:createPose('scholar')};
let selectedCharacter='warrior';
const manualActors={warrior:{x:0,tapBowUntil:0},scholar:{x:0,tapBowUntil:0}};
const keys=new Set();
let assetsReady=false,manualWalk=false,manualBow=false;
let demo=false,demoStarted=0,drag=null;
let worker=null,stream=null,cameraReady=false,cameraStarting=false,workerBusy=false;
let lastVideoTime=-1,lastInference=0,lastPaint=performance.now(),lastStatus=0,cameraSession=0;
let toastTimer;
const diagnostics={model:'未加载',frames:0,errors:0,lastDuration:0};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const customization=initCustomization({onOpen:releaseManual});
const actorName=character=>customization.actorName(character);

function toast(message,duration=4500){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),duration);}
function setDemo(value){demo=value;demoStarted=performance.now();$('demo-button').setAttribute('aria-pressed',String(value));$('demo-button').querySelector('span').textContent=value?'停止演示':'演示模式';if(value){manualWalk=false;manualBow=false;keys.clear();toast('幕布已亮，戏角登场。随时可以停止演示，亲手试一场。',3000);}}
function updateDiagnostics(){
  const states=gestures.sample(performance.now());
  $('diagnostic-text').textContent=`识别模型：${diagnostics.model}。已处理 ${diagnostics.frames} 帧；最近一帧 ${diagnostics.lastDuration.toFixed(0)} ms。画面尺寸 ${video.videoWidth||0} × ${video.videoHeight||0}。左手 / ${actorName('warrior')}：${states.warrior.tracked?'已识别':'等待'}；右手 / ${actorName('scholar')}：${states.scholar.tracked?'已识别':'等待'}。当前输入：${demo?'双角演示':cameraReady?'双手手势':'鼠标 / 触摸 / 键盘'}。`;
}
function drawHand(states={}){
  const width=640,height=Math.round(width*overlay.clientHeight/overlay.clientWidth)||360;
  if(overlay.width!==width||overlay.height!==height){overlay.width=width;overlay.height=height;}
  const ctx=overlay.getContext('2d');ctx.clearRect(0,0,width,height);
  if(!video.videoWidth)return;
  // Reproduce object-fit:cover exactly, then mirror x to match the preview.
  const scale=Math.max(width/video.videoWidth,height/video.videoHeight);
  const fitW=video.videoWidth*scale,fitH=video.videoHeight*scale;
  const point=p=>({x:width-((width-fitW)/2+p.x*fitW),y:(height-fitH)/2+p.y*fitH});
  for(const character of ['warrior','scholar']){
    const points=states[character]?.landmarks;if(!points)continue;
    ctx.lineWidth=2.3;ctx.strokeStyle=character==='warrior'?'#efab8e':'#a9d9ea';ctx.fillStyle=character==='warrior'?'#fff1d7':'#d6f2ff';
    for(const [a,b] of HAND_CONNECTIONS){const p=point(points[a]),q=point(points[b]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
    for(const landmark of points){const p=point(landmark);ctx.beginPath();ctx.arc(p.x,p.y,3.8,0,Math.PI*2);ctx.fill();}
    const wrist=point(points[0]);ctx.font='21px sans-serif';ctx.fillText(`${character==='warrior'?'左手':'右手'} · ${actorName(character)}`,Math.min(Math.max(wrist.x-38,10),width-150),Math.min(wrist.y+28,height-10));
  }
}
function stopCamera(showToast=false){
  cameraSession++;cameraReady=false;cameraStarting=false;workerBusy=false;
  stream?.getTracks().forEach(track=>track.stop());stream=null;
  worker?.terminate();worker=null;
  video.pause();video.srcObject=null;video.style.display='none';
  $('camera-placeholder').style.display='flex';$('camera-badge').textContent='摄像头未开启';
  $('camera-button').disabled=false;$('camera-button').querySelector('span').textContent='开启摄像头';
  drawHand();gestures.reset();diagnostics.model='未加载';updateDiagnostics();
  if(showToast)toast('摄像头已关闭，可以继续用按钮和键盘操影。',3000);
}
function cameraErrorMessage(error){
  if(error.name==='NotAllowedError')return '摄像头权限未开启。请在浏览器的站点设置中允许摄像头，或先使用演示模式。';
  if(error.name==='NotFoundError')return '未找到摄像头。可以使用下方按钮、键盘或演示模式体验。';
  if(error.name==='NotReadableError')return '摄像头暂时被其他应用占用。关闭占用后再试。';
  if(error.name==='AbortError')return '摄像头启动已取消。';
  return '摄像头或手部识别启动失败。请在运行信息中查看原因，也可以继续手动操影。';
}
async function startCamera(){
  if(cameraReady||cameraStarting){stopCamera(true);return;}
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){toast('当前浏览器不允许此页面访问摄像头。可使用 Chrome / Edge 打开 index.html，或使用 start.bat。',7000);return;}
  const session=++cameraSession;cameraStarting=true;
  $('camera-button').disabled=true;$('camera-button').querySelector('span').textContent='正在开启…';
  $('camera-badge').textContent='请求摄像头权限';
  try{
    const opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}},audio:false});
    if(session!==cameraSession){opened.getTracks().forEach(t=>t.stop());return;}
    stream=opened;video.srcObject=stream;await video.play();
    if(session!==cameraSession)return;
    video.style.display='block';$('camera-placeholder').style.display='none';
    $('camera-badge').textContent='载入手部识别';diagnostics.model='正在加载';updateDiagnostics();
    const createdWorker=await createCameraWorker();
    if(session!==cameraSession){createdWorker.terminate();return;}
    worker=createdWorker;
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('手部识别模型加载超时')),30000);
      createdWorker.onerror=event=>{clearTimeout(timeout);reject(new Error(event.message));};
      createdWorker.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timeout);resolve();}else if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}};
      createdWorker.postMessage({type:'init',pack:createdWorker.runtimePack});
      createdWorker.runtimePack=null;
    });
    if(session!==cameraSession){createdWorker.terminate();return;}
    createdWorker.onmessage=({data})=>{
      if(session!==cameraSession)return;
      workerBusy=false;
      if(data.type==='result'){
        const receivedAt=performance.now();diagnostics.frames++;diagnostics.lastDuration=receivedAt-data.timestamp;
        const states=gestures.update(data.hands,receivedAt);drawHand(states);
      }else if(data.type==='error'){
        diagnostics.errors++;const message=data.message;stopCamera();diagnostics.model=`运行失败：${message}`;updateDiagnostics();toast('手部识别出现问题，已停止摄像头。可以继续手动操影。',6000);
      }
    };
    createdWorker.onerror=event=>{if(session!==cameraSession)return;stopCamera();diagnostics.model=`识别线程失败：${event.message}`;updateDiagnostics();toast('手部识别线程已停止，请重新开启摄像头。');};
    const track=stream.getVideoTracks()[0];
    track.addEventListener('ended',()=>{if(session===cameraSession){stopCamera();toast('摄像头连接已断开。');}});
    cameraReady=true;cameraStarting=false;lastVideoTime=-1;
    diagnostics.model='MediaPipe Hands · 本机后台识别';
    $('camera-button').disabled=false;$('camera-button').querySelector('span').textContent='关闭摄像头';
    $('camera-badge').textContent='等待手部进入';updateDiagnostics();setDemo(false);
    toast(`左手操控${actorName('warrior')}，右手操控${actorName('scholar')}。左右移手带动人物移动，两角始终相对。`,6000);
  }catch(error){
    if(session!==cameraSession)return;
    const message=cameraErrorMessage(error);stopCamera();diagnostics.model=`启动失败：${error.message}`;updateDiagnostics();toast(message,7000);
  }
}
async function infer(now){
  if(!cameraReady||workerBusy||!worker||video.readyState<2||video.currentTime===lastVideoTime||now-lastInference<50||document.hidden)return;
  const session=cameraSession;
  workerBusy=true;lastVideoTime=video.currentTime;lastInference=now;
  try{
    const bitmap=await createImageBitmap(video);
    if(session!==cameraSession||!worker){bitmap.close();return;}
    worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);
  }catch(error){
    if(session!==cameraSession)return;
    workerBusy=false;stopCamera();diagnostics.model=`取帧失败：${error.message}`;updateDiagnostics();toast('摄像头取帧失败，可以继续用按钮操影。');
  }
}
function updateStatus(now,states){
  if(now-lastStatus<130)return;lastStatus=now;
  const state=states[selectedCharacter],pose=poses[selectedCharacter];
  const bow=pose.bow>.24,walk=pose.cadence>.15;
  const strongest=Object.entries({rightLeg:pose.rightLeg,leftLeg:pose.leftLeg,rightArm:pose.rightArm,leftArm:pose.leftArm,nod:pose.nod}).sort((a,b)=>b[1]-a[1])[0];
  const labels={rightLeg:['右腿','食指牵右腿'],leftLeg:['左腿','中指牵左腿'],rightArm:['右臂','无名指牵右臂'],leftArm:['左臂','小拇指牵左臂'],nod:['点头','拇指牵头颈']};
  const action=bow?['低头','握拳，低眉致意']:walk?['行步','衣袂随步生风']:strongest[1]>.16?labels[strongest[0]]:['静候',customization.text('idleCaption')];
  $('action-label').textContent=action[0];$('action-description').textContent=action[1];
  $('facing-reading').textContent=pose.facing===1?'右':'左';
  $('fist-reading').textContent=state.tracked?(state.fist?'握拳':'张手'):'—';
  for(const [name,key] of [['thumb','nod'],['index','rightLeg'],['middle','leftLeg'],['ring','rightArm'],['pinky','leftArm']]){
    const item=document.querySelector(`[data-finger="${name}"]`);
    item.style.setProperty('--curl',`${Math.round(pose[key]*100)}%`);item.querySelector('b').textContent=`${Math.round(pose[key]*100)}%`;
  }
  $('input-reading').textContent=demo?'自动演出':cameraReady?'手势操影':'自由体验';
  $('status-dot').classList.toggle('live',states.warrior.tracked||states.scholar.tracked||demo||manualWalk||manualBow);
  const seen=[states.warrior.tracked?'左手':null,states.scholar.tracked?'右手':null].filter(Boolean);
  $('tracking-state').textContent=cameraStarting?'双手识别正在准备':demo?'双角同台 · 正在演示':cameraReady?(seen.length?`${seen.join(' + ')}已识别 · 各操一影`:'双角候手 · 将双手放入画面'):(manualWalk||manualBow||keys.size?'亲手操影 · 正在演出':'双角同台 · 左手大圣 / 右手白骨');
  for(const [character,label] of [['warrior','左手'],['scholar','右手']]){
    $(`${character}-hand-status`).textContent=states[character].tracked?`${label}已识别`:`等待${label}`;
    document.querySelector(`[data-character="${character}"]`).classList.toggle('hand-tracked',states[character].tracked);
  }
  $('selected-actor').textContent=`${actorName(selectedCharacter)} · ${selectedCharacter==='warrior'?'左手':'右手'}`;
  if(cameraReady)$('camera-badge').textContent=seen.length?`${seen.join(' / ')}已识别`:'等待双手进入';
  $('stage-hint').style.opacity=(drag||cameraReady||demo)?'.25':'.65';
  $('walk-button').classList.toggle('pressed',manualWalk||keys.has('Space'));
  $('bow-button').classList.toggle('pressed',manualBow||keys.has('KeyB'));
  if(cameraReady)drawHand(states);
  if($('help-dialog').open)updateDiagnostics();
  const panel=document.querySelector('.console').getBoundingClientRect();
  const bottom=stage.getBoundingClientRect().bottom-panel.top+20;
  $('stage-hint').style.bottom=`${bottom}px`;$('toast').style.bottom=`${bottom+22}px`;
}
function animate(now){
  const dt=Math.min(now-lastPaint,60);lastPaint=now;
  const states=gestures.sample(now);
  const individualKeys=['KeyQ','KeyW','KeyE','KeyR','KeyT'];
  for(const character of ['warrior','scholar']){
    const state=states[character],pose=poses[character],actor=manualActors[character];
    const manual=selectedCharacter===character&&(manualWalk||manualBow||keys.has('Space')||keys.has('KeyB')||individualKeys.some(key=>keys.has(key))||drag?.character===character||keys.has('ArrowLeft')||keys.has('ArrowRight')||actor.tapBowUntil>now);
    if(manual){
      if(keys.has('ArrowLeft')){actor.x=clamp(actor.x-dt*.001,-1,1);}
      if(keys.has('ArrowRight')){actor.x=clamp(actor.x+dt*.001,-1,1);}
    }
    let target={x:actor.x,fist:false,cadence:0,controls:neutralControls()};
    if(manual){target.fist=manualBow||keys.has('KeyB')||actor.tapBowUntil>now;target.cadence=manualWalk||keys.has('Space')?1.35:0;target.controls={rightLeg:keys.has('KeyQ')?1:0,leftLeg:keys.has('KeyW')?1:0,rightArm:keys.has('KeyE')?1:0,leftArm:keys.has('KeyR')?1:0,nod:keys.has('KeyT')?1:0};}
    const manualControls={...target.controls};
    if(demo){
      const t=(now-demoStarted)/1000+(character==='scholar'?3:0),cycle=t%16;
      target={x:Math.sin(t*.45)*.5,fist:cycle>12&&cycle<14,cadence:cycle>14?1.1:0,controls:neutralControls()};
      const finger=Math.floor(cycle/2);if(finger<5)target.controls[['rightLeg','leftLeg','rightArm','leftArm','nod'][finger]]=(1-Math.cos((cycle%2)*Math.PI))/2;
    }else if(cameraReady&&!manual){
      target={x:state.x,fist:state.fist,cadence:0,controls:state.controls};
      if(state.tracked){actor.x=state.x;}
    }
    pose.phase+=dt*.001*target.cadence*Math.PI*2;
    if(target.cadence>0){
      const phase=pose.phase;target.controls={rightLeg:Math.max(0,Math.sin(phase))*.9,leftLeg:Math.max(0,-Math.sin(phase))*.9,rightArm:(1-Math.sin(phase))*.2,leftArm:(1+Math.sin(phase))*.2,nod:0};
      if(!demo)for(const key in manualControls)if(manualControls[key])target.controls[key]=manualControls[key];
    }
    stepPose(pose,target,dt);
  }
  if(assetsReady)renderer.drawScene(poses,now,dt);
  updateStatus(now,states);infer(now);requestAnimationFrame(animate);
}

$('camera-button').addEventListener('click',startCamera);
$('demo-button').addEventListener('click',()=>setDemo(!demo));
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{
  selectedCharacter=button.dataset.character;releaseManual();
  document.querySelectorAll('[data-character]').forEach(b=>{const selected=b===button;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  toast(`手动操控：${actorName(selectedCharacter)} · ${selectedCharacter==='warrior'?'左手':'右手'}。双手识别仍分别操控两个角色。`,2000);
}));
function bindHold(button,set){
  button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);setDemo(false);set(true);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>set(false));
  button.addEventListener('keydown',event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();setDemo(false);set(true);}});
  button.addEventListener('keyup',event=>{if(event.code==='Space'||event.code==='Enter'){event.preventDefault();set(false);}});
  button.addEventListener('blur',()=>set(false));
}
bindHold($('walk-button'),value=>manualWalk=value);bindHold($('bow-button'),value=>manualBow=value);
stage.addEventListener('pointerdown',event=>{
  if(!assetsReady)return;
  stage.setPointerCapture(event.pointerId);setDemo(false);
  const character=['warrior','scholar'].sort((a,b)=>Math.abs(renderer.actorOrigins[a].x-event.offsetX)-Math.abs(renderer.actorOrigins[b].x-event.offsetX))[0];
  document.querySelector(`[data-character="${character}"]`).click();
  drag={id:event.pointerId,start:event.clientX,startX:manualActors[character].x,character,moved:false};
});
stage.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const difference=event.clientX-drag.start;
  if(Math.abs(difference)>5)drag.moved=true;
  manualActors[drag.character].x=clamp(drag.startX+difference/(stage.clientWidth*.18),-1,1);
});
stage.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.id){if(!drag.moved)manualActors[drag.character].tapBowUntil=performance.now()+850;drag=null;}});
stage.addEventListener('pointercancel',()=>drag=null);stage.addEventListener('lostpointercapture',()=>drag=null);
window.addEventListener('keydown',event=>{
  if($('help-dialog').open||$('customize-dialog').open||/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)||(event.target.tagName==='BUTTON'&&event.code==='Space')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(['Space','KeyB','KeyQ','KeyW','KeyE','KeyR','KeyT','ArrowLeft','ArrowRight'].includes(event.code)){
    event.preventDefault();setDemo(false);keys.add(event.code);
  }
  if(event.code==='KeyD'&&!event.repeat)setDemo(!demo);
  if(event.code==='Digit1'||event.code==='Digit2')document.querySelector(`[data-character="${event.code==='Digit1'?'warrior':'scholar'}"]`).click();
});
window.addEventListener('keyup',event=>keys.delete(event.code));
function releaseManual(){keys.clear();manualWalk=false;manualBow=false;drag=null;}
window.addEventListener('blur',releaseManual);
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseManual();gestures.reset();drawHand();}lastPaint=performance.now();});
window.addEventListener('pagehide',()=>stopCamera());

function showHelp(){releaseManual();updateDiagnostics();$('help-dialog').showModal();}
for(const id of ['help-button','help-top'])$(id).addEventListener('click',showHelp);
for(const id of ['help-close','help-start'])$(id).addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',event=>{if(event.target===$('help-dialog')){const rect=$('help-dialog').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('help-dialog').close();}});
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else if($('theatre').requestFullscreen)await $('theatre').requestFullscreen();else toast('当前浏览器暂不支持全屏，可以横屏体验。');}catch{toast('当前浏览器暂不支持全屏。');}
});
renderer.load().then(()=>{assetsReady=true;$('asset-loading').hidden=true;$('asset-loading').style.display='none';}).catch(error=>{$('asset-loading').textContent='戏角素材加载失败。请完整解压文件夹，保留 assets 目录，再打开 index.html。';console.error(error);});
requestAnimationFrame(animate);
