import test from 'node:test';
import assert from 'node:assert/strict';
import {GestureController,FINGER_NAMES,neutralControls} from '../gestures.js';
import {createPose,stepPose} from '../pose.js';
import {DualHandController} from '../dual-hands.js';

function hand({curls={},scale=1,rotation=0,offset=0}={}){
  const p=Array.from({length:21},()=>({x:.5,y:.65,z:0}));
  p[0]={x:.5,y:.8,z:0};
  const chains=[[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]];
  chains.forEach((indices,i)=>{
    const angle=(curls[FINGER_NAMES[i]]??0)*1.75;
    let point={x:.32+i*.08,y:i===0?.71:.6,z:0};p[indices[0]]={...point};
    [.07,.045,.035].forEach((segment,j)=>{
      const heading=(i===0?-.7:0)+(j===0?0:j===1?angle:angle*1.6);
      point={x:point.x+Math.sin(heading)*segment,y:point.y-Math.cos(heading)*segment,z:0};p[indices[j+1]]={...point};
    });
  });
  return p.map(point=>({x:.5+((point.x-.5)*Math.cos(rotation)-(point.y-.5)*Math.sin(rotation))*scale+offset,y:.5+((point.x-.5)*Math.sin(rotation)+(point.y-.5)*Math.cos(rotation))*scale,z:0}));
}
function settle(controller,points,start){let state;for(let t=start;t<=start+320;t+=40)state=controller.update(points,t);return state;}

const mappings={index:'rightLeg',middle:'leftLeg',ring:'rightArm',pinky:'leftArm',thumb:'nod'};
for(const [finger,control] of Object.entries(mappings))test(`${finger} drives only ${control}, through animated pose`,()=>{
  const g=new GestureController();const state=settle(g,hand({curls:{[finger]:1}}),0);
  assert.equal(state.fist,false);assert.ok(state.controls[control]>.9);
  const pose=createPose();for(let t=0;t<600;t+=16)stepPose(pose,{controls:state.controls,fist:state.fist},16);
  for(const other of Object.values(mappings))assert.ok(other===control?pose[other]>.9:pose[other]<.01,`${other} is independent`);
});
test('curl is invariant under distance, image rotation and hand translation',()=>{
  for(const scale of [.5,1,1.8])for(const rotation of [0,.8,2.1]){
    const g=new GestureController();const state=settle(g,hand({curls:{middle:1},scale,rotation,offset:.15}),0);
    assert.ok(state.controls.leftLeg>.9);assert.ok(state.controls.rightLeg<.01);
  }
});
test('fist requires four folded fingers and a stable hold, then releases',()=>{
  const g=new GestureController();const closed=hand({curls:{index:1,middle:1,ring:1,pinky:1}});
  assert.equal(g.update(closed,0).fist,false);assert.equal(g.update(closed,80).fist,false);assert.equal(g.update(closed,160).fist,true);
  const pose=createPose();for(let t=0;t<600;t+=16)stepPose(pose,{fist:true,controls:g.sample(160).controls},16);
  assert.ok(pose.bow>.9&&pose.nod>.9);assert.equal(pose.rightLeg,0);
  assert.equal(settle(g,hand(),240).fist,false);
});
test('palm motion provides position without a turning control',()=>{
  const g=new GestureController();
  for(const offset of [0,-.2,.2]){
    const state=settle(g,hand({offset}),offset===0?0:offset<0?360:720);
    assert.equal('facing' in state,false);assert.equal('turn' in state,false);
  }
});
test('hand loss rests the five channels and releases a fist',()=>{
  const g=new GestureController();settle(g,hand({curls:{thumb:1,index:1,middle:1,ring:1,pinky:1}}),0);
  assert.equal(g.sample(500).fist,true);const state=g.sample(900);
  assert.equal(state.tracked,false);assert.equal(state.fist,false);assert.deepEqual(state.controls,neutralControls());
});
test('both actors retain fixed facing through motion and conflicting input',()=>{
  for(const [character,direction] of [['warrior',1],['scholar',-1]]){
    const pose=createPose(character);
    for(const x of [-1,1,0])for(let i=0;i<60;i++)stepPose(pose,{x,facing:-direction,controls:{...neutralControls(),rightLeg:1}},16);
    assert.equal(pose.facing,direction);assert.equal('turn' in pose,false);
    assert.ok(pose.rightLeg>.99);assert.equal(pose.leftLeg,0);
  }
});

test('mirrored palm position controls translation and holds after hand loss',()=>{
  const g=new GestureController();const start=settle(g,hand(),0).x;
  const right=settle(g,hand({offset:-.2}),360).x;assert.ok(right>start+.35);
  const left=settle(g,hand({offset:.2}),720).x;assert.ok(left<start-.35);
  assert.equal(g.sample(1700).x,left,'last known position is held after loss');
});
const trackedHand=(handedness,options={})=>({handedness,score:.99,landmarks:hand(options)});
function settleDual(controller,hands,start){let state;for(let t=start;t<=start+320;t+=40)state=controller.update(hands,t);return state;}
test('two hands drive independent female and male poses and positions',()=>{
  const dual=new DualHandController();
  const states=settleDual(dual,[trackedHand('Right',{offset:.2,curls:{pinky:1}}),trackedHand('Left',{offset:-.2,curls:{index:1}})],0);
  const female=createPose('warrior'),male=createPose('scholar');
  for(let i=0;i<60;i++){stepPose(female,{...states.warrior},16);stepPose(male,{...states.scholar},16);}
  assert.ok(female.rightLeg>.99);assert.equal(female.leftArm,0);
  assert.ok(male.leftArm>.99);assert.equal(male.rightLeg,0);
  assert.ok(female.x>male.x);
});
test('hand result order and crossed screen positions do not swap roles',()=>{
  const dual=new DualHandController();
  const initial=settleDual(dual,[trackedHand('Left',{offset:.2,curls:{ring:1}}),trackedHand('Right',{offset:-.2,curls:{middle:1}})],0);
  const crossed=settleDual(dual,[trackedHand('Right',{offset:.2,curls:{middle:1}}),trackedHand('Left',{offset:-.2,curls:{ring:1}})],360);
  assert.ok(initial.warrior.x<initial.scholar.x);assert.ok(crossed.warrior.x>crossed.scholar.x);
  assert.ok(crossed.warrior.controls.rightArm>.9);assert.equal(crossed.warrior.controls.leftLeg,0);
  assert.ok(crossed.scholar.controls.leftLeg>.9);assert.equal(crossed.scholar.controls.rightArm,0);
});
test('one missing hand rests only that actor; the other continues',()=>{
  const dual=new DualHandController();settleDual(dual,[trackedHand('Left',{curls:{ring:1}}),trackedHand('Right',{curls:{thumb:1}})],0);
  const states=settleDual(dual,[trackedHand('Right',{curls:{thumb:1}})],800);
  assert.equal(states.warrior.tracked,false);assert.deepEqual(states.warrior.controls,neutralControls());
  assert.equal(states.scholar.tracked,true);assert.ok(states.scholar.controls.nod>.9);
});
test('fist on one hand does not lower the other actor',()=>{
  const dual=new DualHandController();const states=settleDual(dual,[trackedHand('Left',{curls:{index:1,middle:1,ring:1,pinky:1}}),trackedHand('Right',{curls:{thumb:1}})],0);
  assert.equal(states.warrior.fist,true);assert.equal(states.scholar.fist,false);
  assert.ok(states.scholar.controls.nod>.9);
});
test('uncertain or duplicate classifications do not fill the other actor',()=>{
  const dual=new DualHandController();const states=settleDual(dual,[trackedHand('Left',{curls:{ring:1}}),{...trackedHand('Left',{curls:{pinky:1}}),score:.7},{...trackedHand('Right'),score:.4}],0);
  assert.ok(states.warrior.controls.rightArm>.9);assert.equal(states.warrior.controls.leftArm,0);
  assert.equal(states.scholar.tracked,false);
});
