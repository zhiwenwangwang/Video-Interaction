import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultSettings,normalizeSettings} from '../customize.js';

test('saved settings preserve valid custom copy and size',()=>{
  const settings=normalizeSettings({scale:118,text:{headline:'一幕新戏\n由你开场',warriorName:'花旦',scholarName:'书生'}});
  assert.equal(settings.scale,118);assert.equal(settings.text.headline,'一幕新戏\n由你开场');
  assert.equal(settings.text.warriorName,'花旦');assert.equal(settings.text.scholarName,'书生');
  assert.equal(settings.text.description,defaultSettings().text.description);
});
test('invalid saved data falls back safely and size stays within supported bounds',()=>{
  assert.deepEqual(normalizeSettings(null),defaultSettings());
  assert.equal(normalizeSettings({scale:'bad'}).scale,100);
  assert.equal(normalizeSettings({scale:999}).scale,130);
  assert.equal(normalizeSettings({scale:-500}).scale,70);
  const settings=normalizeSettings({text:{warriorName:'   ',headline:'一\n二\n三',brand:'x'.repeat(100),description:42}});
  assert.equal(settings.text.warriorName,'孙悟空');assert.equal(settings.text.headline,'一\n二');
  assert.equal(settings.text.brand.length,16);assert.equal(settings.text.description,defaultSettings().text.description);
});
