export const STORAGE_KEY='shadow-theatre.customization.v2';
export const TEXT_FIELDS=Object.freeze([
  {key:'brand',label:'网页名称',value:'悟空打白骨精',max:16},
  {key:'headerNote',label:'页眉短句',value:'金箍棒起 · 妖骨现形',max:24},
  {key:'eyebrow',label:'标题上方小字',value:'西游新编 · 指尖演义',max:24},
  {key:'headline',label:'主标题（最多两行）',value:'三打白骨精，\n一棒定乾坤。',max:28,multiline:true},
  {key:'description',label:'舞台介绍',value:'一念善恶难辨，三棒照见真身。\n左手请大圣，右手驭妖云。',max:100,multiline:true},
  {key:'invitation',label:'邀请短句',value:'双手起落，\n同演西游一场。',max:50,multiline:true},
  {key:'castLabel',label:'角色栏标题',value:'悟空对阵白骨精 · 选择操控',max:24},
  {key:'warriorName',label:'左侧角色名称（左手）',value:'孙悟空',max:10},
  {key:'scholarName',label:'右侧角色名称（右手）',value:'白骨精',max:10},
  {key:'inscriptionOne',label:'右侧题字一',value:'三打白骨',max:8},
  {key:'inscriptionTwo',label:'右侧题字二',value:'大圣除妖',max:8},
  {key:'stageHint',label:'舞台下方提示',value:'左手牵悟空 · 右手牵白骨 · 移手移影',max:48},
  {key:'idleCaption',label:'待机动作说明',value:'妖云将起',max:20},
]);
export const defaultSettings=()=>({scale:100,text:Object.fromEntries(TEXT_FIELDS.map(f=>[f.key,f.value]))});

export function normalizeSettings(input){
  const result=defaultSettings();
  if(!input||typeof input!=='object')return result;
  const scale=Number(input.scale);
  if(Number.isFinite(scale))result.scale=Math.max(70,Math.min(130,Math.round(scale)));
  for(const field of TEXT_FIELDS){
    const value=input.text?.[field.key];
    if(typeof value!=='string')continue;
    let cleaned=value.replace(/\r/g,'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,field.max);
    cleaned=field.multiline?cleaned.split('\n').slice(0,2).join('\n'):cleaned.replace(/\n/g,' ');
    result.text[field.key]=/Name$/.test(field.key)&&!cleaned.trim()?field.value:cleaned;
  }
  return result;
}

export function initCustomization({onChange=()=>{},onOpen=()=>{}}={}){
  const $=id=>document.getElementById(id);
  let saved;
  try{saved=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}
  let settings=normalizeSettings(saved);
  const dialog=$('customize-dialog'),fields=$('custom-text-fields'),inputs={};
  for(const field of TEXT_FIELDS){
    const label=document.createElement('label');label.className='custom-field';
    const caption=document.createElement('span');caption.textContent=field.label;label.append(caption);
    const input=document.createElement(field.multiline?'textarea':'input');
    if(!field.multiline)input.type='text';else input.rows=2;
    input.id=`custom-${field.key}`;input.name=field.key;input.maxLength=field.max;input.autocomplete='off';
    label.append(input);fields.append(label);inputs[field.key]=input;
    input.addEventListener('input',()=>{settings=normalizeSettings({...settings,text:{...settings.text,[field.key]:input.value}});apply(true);});
    input.addEventListener('change',()=>input.value=settings.text[field.key]);
  }
  function apply(persist=false){
    document.documentElement.style.setProperty('--ui-scale',String(settings.scale/100));
    document.querySelectorAll('[data-custom-text]').forEach(element=>element.textContent=settings.text[element.dataset.customText]??'');
    const longest=Math.max(5,...settings.text.headline.split('\n').map(line=>Array.from(line).length));
    document.documentElement.style.setProperty('--title-fit',String(Math.min(1,5/longest)));
    document.title=`${settings.text.brand||'皮影戏台'} — 指尖交互剧场`;
    $('ui-size-value').value=`${settings.scale}%`;$('ui-size').value=String(settings.scale);
    $('ui-size').setAttribute('aria-valuetext',`${settings.scale}%`);
    if(persist){
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));$('custom-save-status').textContent='已保存到当前浏览器';}
      catch{$('custom-save-status').textContent='已应用；当前浏览器无法保存设置';}
    }
    onChange(settings);
  }
  function syncInputs(){for(const field of TEXT_FIELDS)inputs[field.key].value=settings.text[field.key];}
  $('customize-button').addEventListener('click',()=>{onOpen();syncInputs();dialog.showModal();dialog.scrollTop=0;});
  for(const id of ['customize-close','customize-done'])$(id).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
  });
  $('ui-size').addEventListener('input',()=>{settings=normalizeSettings({...settings,scale:$('ui-size').value});apply(true);});
  $('reset-customization').addEventListener('click',()=>{settings=defaultSettings();syncInputs();apply(true);});
  apply();syncInputs();
  return {text:key=>settings.text[key],actorName:character=>settings.text[character==='warrior'?'warriorName':'scholarName']};
}
