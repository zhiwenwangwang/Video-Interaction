const TAU = Math.PI*2;
const radians = v => v*Math.PI/180;
const endPoint = (start,length,angle) => ({x:start.x-Math.sin(angle)*length,y:start.y+Math.cos(angle)*length});
const turn = (p,a) => ({x:p.x*Math.cos(a)-p.y*Math.sin(a),y:p.x*Math.sin(a)+p.y*Math.cos(a)});

export class PuppetRenderer {
  constructor(canvas,consoleElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.console = consoleElement;
    this.characters = {};
    this.character = 'warrior';
    this.rodX = null;
    this.sleeveLag = 0;
    this.rightSleeveLag=0;this.leftSleeveLag=0;
    this.actorMemory={};this.debugActors={};this.actorOrigins={};
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.observer = new ResizeObserver(()=>this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio||1,2);
    this.canvas.width = Math.round(this.width*this.dpr);
    this.canvas.height = Math.round(this.height*this.dpr);
  }
  async load() {
    const manifest = RIG;
    await Promise.all(Object.entries(manifest).map(async ([name,character]) => {
      const parts = {};
      await Promise.all(Object.entries(character.parts).map(async ([key,definition]) => {
        const image = new Image();
        image.src = `./assets/${name}/${key}.png`;
        await image.decode();
        parts[key] = {...definition,image};
      }));
      this.characters[name] = {...character,parts};
    }));
  }
  setCharacter(name) { if(this.characters[name]) this.character=name; }
  drawScene(poses,time,dt){
    const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
    for(const character of ['warrior','scholar']){
      this.character=character;
      const state=this.actorMemory[character]||{rodX:null,sleeveLag:0,rightSleeveLag:0,leftSleeveLag:0};
      Object.assign(this,state);this.draw(poses[character],time,dt,true);
      this.actorMemory[character]={rodX:this.rodX,sleeveLag:this.sleeveLag,rightSleeveLag:this.rightSleeveLag,leftSleeveLag:this.leftSleeveLag};
      this.debugActors[character]=structuredClone(this.debugJoints);
    }
  }
  bone(name,start,end) {
    const part = this.characters[this.character]?.parts[name];
    if(!part) return;
    const [a,b] = part.joints;
    const sourceAngle = Math.atan2(b[1]-a[1],b[0]-a[0]);
    const angle = Math.atan2(end.y-start.y,end.x-start.x)-sourceAngle;
    const scale = Math.hypot(end.x-start.x,end.y-start.y)/Math.hypot(b[0]-a[0],b[1]-a[1]);
    const ctx=this.ctx;
    ctx.save();ctx.translate(start.x,start.y);ctx.rotate(angle);ctx.scale(scale,scale);
    ctx.drawImage(part.image,-a[0],-a[1]);ctx.restore();
  }
  pinned(name,position,angle,targetHeight,flipX=false) {
    const part = this.characters[this.character]?.parts[name];
    if(!part) return;
    const pivot = part.joints[0];
    const scale = targetHeight/part.image.height;
    const ctx=this.ctx;
    ctx.save();ctx.translate(position.x,position.y);ctx.rotate(angle);ctx.scale(flipX?-scale:scale,scale);
    ctx.drawImage(part.image,-pivot[0],-pivot[1]);ctx.restore();
  }
  followingHand(name,forearmName,elbow,wrist) {
    const parts=this.characters[this.character].parts;
    const hand=parts[name],forearm=parts[forearmName];
    const [base]=hand.joints,tip=hand.direction;
    const [a,b]=forearm.joints;
    const forearmScale=Math.hypot(wrist.x-elbow.x,wrist.y-elbow.y)/Math.hypot(b[0]-a[0],b[1]-a[1]);
    const angle=Math.atan2(wrist.y-elbow.y,wrist.x-elbow.x)-Math.atan2(tip[1]-base[1],(tip[0]-base[0])*(hand.flipX?-1:1));
    this.pinned(name,wrist,angle,hand.image.height*forearmScale*.82,hand.flipX);
  }
  grippingHand(name,weaponName,elbow,wrist) {
    const parts=this.characters[this.character].parts;
    const hand=parts[name],weapon=parts[weaponName];
    const [base]=hand.joints,grip=hand.grip;
    const scale=hand.targetHeight/hand.image.height;
    const angle=Math.atan2(wrist.y-elbow.y,wrist.x-elbow.x)-Math.atan2(grip[1]-base[1],grip[0]-base[0]);
    const offset=turn({x:(grip[0]-base[0])*scale,y:(grip[1]-base[1])*scale},angle);
    const position={x:wrist.x+offset.x,y:wrist.y+offset.y};
    const weaponAngle=angle+Math.atan2(hand.gripAxis[1],hand.gripAxis[0])-Math.atan2(weapon.axis[1],weapon.axis[0]);
    this.pinned(weaponName,position,weaponAngle,390);
    this.pinned(name,wrist,angle,hand.targetHeight);
  }
  boneAnchor(name,sourcePoint,start,end) {
    const part=this.characters[this.character].parts[name];
    const [a,b]=part.joints;
    const angle=Math.atan2(end.y-start.y,end.x-start.x)-Math.atan2(b[1]-a[1],b[0]-a[0]);
    const scale=Math.hypot(end.x-start.x,end.y-start.y)/Math.hypot(b[0]-a[0],b[1]-a[1]);
    const offset=turn({x:(sourcePoint[0]-a[0])*scale,y:(sourcePoint[1]-a[1])*scale},angle);
    return {x:start.x+offset.x,y:start.y+offset.y};
  }
  draw(pose,time,dt,duet=false) {
    const ctx=this.ctx,w=this.width,h=this.height;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);if(!duet)ctx.clearRect(0,0,w,h);
    if(!this.characters[this.character]) return;
    const mobile=w<=800;
    const floor=this.console.getBoundingClientRect().top-this.canvas.getBoundingClientRect().top-55;
    const cast=this.canvas.closest('.theatre')?.querySelector('.cast');
    const castBottom=cast?cast.getBoundingClientRect().bottom-this.canvas.getBoundingClientRect().top:0;
    const top=mobile?Math.max(w<=480?215:182,castBottom+16):112;
    // A viewport change may briefly leave the header and footer in an older layout.
    const availableHeight=Math.max(80,floor-top);
    const scale=Math.max(.08,Math.min(availableHeight/785,w/(duet?(mobile?900:1450):(mobile?510:1000)),duet?.85:1.12));
    const center=duet?(mobile?(this.character==='warrior'?.30:.70):(this.character==='warrior'?.47:.73)):(mobile?.5:.57);
    const originX=Math.max(110*scale,Math.min(w-110*scale,w*center+pose.x*w*(duet?.18:(mobile?.24:.23))));
    this.actorOrigins[this.character]={x:originX,travel:w*(duet?.18:(mobile?.24:.23)),scale};
    const bowAngle=-radians(pose.bow*18);
    const facing=this.character==='warrior'?1:-1;
    const mirror=-facing;
    const walk=Math.min(1,pose.cadence/.7);
    const phase=pose.phase;
    const idle=this.reducedMotion?0:Math.sin(time*.0012)*1.8;
    const bob=walk*Math.abs(Math.sin(phase))*14;
    const originY=floor-375*scale-bob*scale+pose.bow*14*scale;
    const neck={x:-6,y:-183};
    const neckShortening=this.character==='scholar'?34:0;
    const headNeck={x:neck.x,y:neck.y+neckShortening};
    const warrior=this.character==='warrior';
    const torso=this.characters[this.character].parts.torso;
    const shoulderNear=torso.shoulders?this.boneAnchor('torso',torso.shoulders[0],neck,{x:0,y:0}):{x:-14,y:-135};
    const rigShoulderFar=torso.shoulders?this.boneAnchor('torso',torso.shoulders[1],neck,{x:0,y:0}):{x:23,y:-137};
    const shoulderFar=rigShoulderFar;
    const armSwing=(pose.rightArm-pose.leftArm)*22;
    const nearAngle=radians(16+pose.rightArm*145+idle);
    const farAngle=radians(-30-pose.leftArm*115+idle);
    this.sleeveLag+=(armSwing-this.sleeveLag)*(1-Math.exp(-dt/160));
    this.rightSleeveLag+=(pose.rightArm-this.rightSleeveLag)*(1-Math.exp(-dt/160));
    this.leftSleeveLag+=(pose.leftArm-this.leftSleeveLag)*(1-Math.exp(-dt/160));
    const elbowNear=endPoint(shoulderNear,109,nearAngle);
    const elbowFar=endPoint(shoulderFar,109,farAngle);
    const wristNear=endPoint(elbowNear,110,radians(44+pose.rightArm*105+this.rightSleeveLag*8));
    const wristFar=endPoint(elbowFar,110,radians(-55-pose.leftArm*95-this.leftSleeveLag*8));
    const rightSwing=pose.rightLeg*90,leftSwing=-pose.leftLeg*90;
    const hipNear={x:-15,y:43},hipFar={x:22,y:43};
    const kneeNear=endPoint(hipNear,139,radians(rightSwing));
    const kneeFar=endPoint(hipFar,139,radians(leftSwing));
    const ankleNear=endPoint(kneeNear,131,radians(rightSwing-pose.rightLeg*75));
    const ankleFar=endPoint(kneeFar,131,radians(leftSwing+pose.leftLeg*75));
    this.debugJoints={rightKnee:kneeNear,leftKnee:kneeFar,rightAnkle:ankleNear,leftAnkle:ankleFar,rightWrist:wristNear,leftWrist:wristFar,headAngle:-pose.nod*48-pose.bow*18,facing,originX,headNeck,neckShortening,robePanels:!!this.characters[this.character].parts['robe-front']};

    // A quiet pool of light anchors the puppet to the screen.
    ctx.save();ctx.translate(originX,floor+4);ctx.scale(1,.11);
    const pool=ctx.createRadialGradient(0,0,0,0,0,140*scale);
    pool.addColorStop(0,'rgba(82,43,21,.16)');pool.addColorStop(1,'rgba(82,43,21,0)');
    ctx.fillStyle=pool;ctx.beginPath();ctx.arc(0,0,140*scale,0,TAU);ctx.fill();ctx.restore();

    const toStage = (p,body=false) => {
      const point=body?turn(p,bowAngle):p;
      return {x:originX+point.x*scale*mirror,y:originY+point.y*scale};
    };
    this.debugJoints.armTips={right:toStage(wristNear,true),left:toStage(wristFar,true)};
    const rodPoints=[toStage(headNeck,true),toStage(wristNear,true),toStage(wristFar,true)];
    if(this.rodX===null)this.rodX=originX;
    this.rodX+=(originX-this.rodX)*(1-Math.exp(-dt/210));
    const anchors=[this.rodX-73*scale*mirror,this.rodX+98*scale*mirror,this.rodX+215*scale*mirror];
    ctx.save();ctx.lineWidth=.85;ctx.strokeStyle='rgba(74,45,25,.55)';
    rodPoints.forEach((point,i)=>{
      const anchorY=mobile?93:76;
      ctx.beginPath();ctx.moveTo(anchors[i],anchorY+(i===1?14:0));ctx.lineTo(point.x,point.y);ctx.stroke();
      ctx.fillStyle='rgba(92,48,25,.7)';ctx.beginPath();ctx.arc(anchors[i],anchorY+(i===1?14:0),1.8,0,TAU);ctx.fill();
    });ctx.restore();

    // Foot strings are drawn outside the robe and meet the actual shoe pivots.
    const footLines=[['right',ankleNear,-235],['left',ankleFar,270]].map(([side,ankle,offset])=>({side,start:{x:this.rodX+offset*scale*mirror,y:mobile?93:76},end:toStage(ankle)}));
    this.debugJoints.footLines=footLines;

    ctx.save();ctx.translate(originX,originY);ctx.scale(scale*mirror,scale);
    ctx.globalAlpha=.96;ctx.globalCompositeOperation='source-over';
    ctx.shadowColor='rgba(96,51,19,.25)';ctx.shadowBlur=4;ctx.shadowOffsetX=3;ctx.shadowOffsetY=2;
    this.bone('far-thigh',hipFar,kneeFar);this.bone('far-shin',kneeFar,ankleFar);this.pinned('far-foot',ankleFar,radians(leftSwing*.15),76);
    if(warrior)this.pinned('tail',{x:34,y:7},radians(-8+idle*.35),150);
    this.pinned('robe-back',{x:16,y:5},radians(-pose.leftLeg*24+idle*.3),warrior?210:320);
    this.bone('near-thigh',hipNear,kneeNear);this.bone('near-shin',kneeNear,ankleNear);this.pinned('near-foot',ankleNear,radians(rightSwing*.15),76);
    this.pinned('robe-front',{x:-7,y:5},radians(pose.rightLeg*28+idle*.25),warrior?210:320);
    ctx.save();ctx.rotate(bowAngle);
    this.bone('far-upper-arm',shoulderFar,elbowFar);this.bone('far-forearm',elbowFar,wristFar);
    if(warrior)this.followingHand('far-hand','far-forearm',elbowFar,wristFar);
    else this.pinned('far-hand',wristFar,radians(-this.leftSleeveLag*5),42);
    if(!warrior)this.pinned('weapon-secondary',wristFar,radians(-65-pose.leftArm*70),240);
    if(warrior)this.bone('torso',neck,{x:0,y:0});
    const headAngle=radians(-pose.nod*48-pose.bow*18+idle*.5);
    this.pinned('head',headNeck,headAngle,237);
    if(!warrior){
      const head=this.characters[this.character].parts.head;
      const headScale=237/head.image.height;
      const braidOffset=turn({x:(head.plumeAnchor[0]-head.joints[0][0])*headScale,y:(head.plumeAnchor[1]-head.joints[0][1])*headScale},headAngle);
      const braidPoint={x:headNeck.x+braidOffset.x,y:headNeck.y+braidOffset.y};
      this.pinned('tassel',braidPoint,headAngle+radians(56+idle*2-this.sleeveLag*.18),150);
      // The collar covers the unused neck tab after lowering the head.
      this.bone('torso',neck,{x:0,y:0});
    }
    this.bone('near-upper-arm',shoulderNear,elbowNear);this.bone('near-forearm',elbowNear,wristNear);
    if(warrior)this.grippingHand('near-hand','weapon',elbowNear,wristNear);
    else {
      this.pinned('weapon',wristNear,radians(-48+pose.rightArm*100),240);
      this.pinned('near-hand',wristNear,radians(this.rightSleeveLag*5),42);
    }
    ctx.restore();
    this.bone('pelvis',{x:0,y:-7},{x:0,y:99});
    // Brass rivets coincide with the same joint coordinates used by the rig.
    const rivets=[toLocal(shoulderNear),toLocal(elbowNear),toLocal(wristNear)];
    function toLocal(p){return turn(p,bowAngle);}
    ctx.shadowBlur=0;
    for(const point of rivets){ctx.fillStyle='#684320';ctx.beginPath();ctx.arc(point.x,point.y,3.4,0,TAU);ctx.fill();ctx.fillStyle='#d8ae60';ctx.beginPath();ctx.arc(point.x-.6,point.y-.6,1.5,0,TAU);ctx.fill();}
    ctx.restore();
    // Draw after the costume so both foot connections remain visible through a long robe.
    ctx.save();ctx.lineWidth=.85;ctx.strokeStyle='rgba(74,45,25,.55)';
    for(const {start,end} of footLines){
      ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
      ctx.fillStyle='rgba(92,48,25,.7)';ctx.beginPath();ctx.arc(start.x,start.y,1.8,0,TAU);ctx.fill();
      ctx.fillStyle='#d8ae60';ctx.beginPath();ctx.arc(end.x,end.y,2,0,TAU);ctx.fill();
    }
    ctx.restore();
  }
}
import { RIG } from './rig-data.js';
