import {neutralControls} from './gestures.js';
export const CHARACTER_FACING=Object.freeze({warrior:1,scholar:-1});
export const createPose=(character='scholar')=>({character,x:0,facing:CHARACTER_FACING[character]??-1,bow:0,nod:0,rightLeg:0,leftLeg:0,rightArm:0,leftArm:0,cadence:0,phase:0});
const damp=(value,target,dt,ms)=>value+(target-value)*(1-Math.exp(-dt/ms));

/** Finger controls are independent. A fist rests the limbs and lowers the head. */
export function stepPose(pose,target,dt){
  const controls=target.controls||neutralControls();
  pose.x=damp(pose.x,target.x??0,dt,170);
  // Direction belongs to the character, never to movement or gesture input.
  pose.facing=CHARACTER_FACING[pose.character]??-1;
  pose.bow=damp(pose.bow,target.fist?1:0,dt,target.fist?160:280);
  pose.nod=damp(pose.nod,target.fist?1:controls.nod,dt,95);
  for(const key of ['rightLeg','leftLeg','rightArm','leftArm'])pose[key]=damp(pose[key],target.fist?0:controls[key],dt,95);
  pose.cadence=damp(pose.cadence,target.cadence??0,dt,170);
  return pose;
}
