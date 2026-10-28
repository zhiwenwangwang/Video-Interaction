import {GestureController} from './gestures.js';
export const HAND_CHARACTER={Left:'warrior',Right:'scholar'};

/** Model handedness is anatomical; never assign characters by screen order. */
export class DualHandController {
  constructor(){this.controllers={warrior:new GestureController(),scholar:new GestureController()};}
  reset(){for(const controller of Object.values(this.controllers))controller.reset();}
  update(hands,now){
    const chosen={};
    for(const hand of hands||[]){
      const character=HAND_CHARACTER[hand.handedness];
      if(!character||hand.score<.6||hand.landmarks?.length!==21)continue;
      if(!chosen[character]||hand.score>chosen[character].score)chosen[character]=hand;
    }
    for(const [character,hand] of Object.entries(chosen))this.controllers[character].update(hand.landmarks,now);
    return this.sample(now);
  }
  sample(now){return Object.fromEntries(Object.entries(this.controllers).map(([character,controller])=>[character,controller.sample(now)]));}
}
