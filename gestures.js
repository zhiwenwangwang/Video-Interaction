export const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
export const FINGER_NAMES = ['thumb','index','middle','ring','pinky'];
export const neutralControls = () => ({rightLeg:0,leftLeg:0,rightArm:0,leftArm:0,nod:0});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const vector=(a,b)=>({x:b.x-a.x,y:b.y-a.y,z:(b.z??0)-(a.z??0)});
const length=v=>Math.hypot(v.x,v.y,v.z);
const distance=(a,b)=>length(vector(a,b));
const bendAngle=(a,b,c)=>{
  const u=vector(a,b),v=vector(b,c);
  return Math.acos(clamp((u.x*v.x+u.y*v.y+u.z*v.z)/Math.max(1e-8,length(u)*length(v)),-1,1));
};

/** Joint bending plus tip reach, independent of hand size and image rotation. */
export function fingerCurl(points,indices){
  const [a,b,c,d]=indices.map(i=>points[i]);
  const path=distance(a,b)+distance(b,c)+distance(c,d);
  if(path<1e-5)return 0;
  const shortened=clamp((1-distance(a,d)/path)/.62,0,1);
  const angles=clamp((bendAngle(a,b,c)+bendAngle(b,c,d))/(Math.PI*.85),0,1);
  return clamp((Math.max(shortened,angles*.9)-.06)/.84,0,1);
}

export class GestureController {
  constructor(){this.reset();}
  reset(){
    this.filtered=null;this.lastSeen=-Infinity;this.lastSample=0;
    this.position=0;
    this.fist=false;this.fistCandidate=false;this.fistSince=0;
    this.curls={thumb:0,index:0,middle:0,ring:0,pinky:0};
  }
  update(points,now){
    if(!points||points.length!==21||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z??0)))return this.sample(now);
    const lost=now-this.lastSeen>450;
    const dt=Math.max(1,now-this.lastSample);
    if(lost){this.filtered=null;this.fist=false;this.fistCandidate=false;}
    const alpha=this.filtered?1-Math.exp(-dt/60):1;
    this.filtered=points.map((p,i)=>({x:this.filtered?this.filtered[i].x+(p.x-this.filtered[i].x)*alpha:p.x,y:this.filtered?this.filtered[i].y+(p.y-this.filtered[i].y)*alpha:p.y,z:this.filtered?this.filtered[i].z+((p.z??0)-this.filtered[i].z)*alpha:p.z??0}));
    this.lastSample=now;this.lastSeen=now;
    const p=this.filtered;
    [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]].forEach((indices,i)=>{this.curls[FINGER_NAMES[i]]=fingerCurl(p,indices);});
    const values=['index','middle','ring','pinky'].map(name=>this.curls[name]);
    const mean=values.reduce((sum,x)=>sum+x,0)/4;
    const closed=mean>.77&&Math.min(...values)>.65;
    const opened=mean<.54||Math.min(...values)<.38;
    const candidate=this.fist?!opened:closed;
    if(candidate!==this.fistCandidate){this.fistCandidate=candidate;this.fistSince=now;}
    if(candidate!==this.fist&&now-this.fistSince>=(candidate?120:90))this.fist=candidate;

    // Mirror palm position to match the camera preview; direction is fixed by the actor.
    const palmX=1-(p[0].x+p[5].x+p[9].x+p[17].x)/4;
    this.position=clamp((palmX-.5)*2,-1,1);
    return this.sample(now);
  }
  sample(now){
    const tracked=now-this.lastSeen<430;
    if(!tracked){this.fist=false;this.fistCandidate=false;}
    return {tracked,fist:tracked&&this.fist,x:this.position,
      controls:tracked?{rightLeg:this.curls.index,leftLeg:this.curls.middle,rightArm:this.curls.ring,leftArm:this.curls.pinky,nod:this.curls.thumb}:neutralControls(),
      curls:tracked?{...this.curls}:null,landmarks:tracked?this.filtered:null};
  }
}
