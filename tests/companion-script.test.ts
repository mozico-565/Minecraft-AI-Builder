import test from 'node:test';import assert from 'node:assert/strict';import { transform } from 'esbuild';
import { COMPANION_HTML } from '../backend/companion.js';
test('actual companion script parses and contains reload recovery and bounded request timeout',async()=>{
 const script=COMPANION_HTML.split('<script type="module">')[1]?.split('</script>')[0];assert.ok(script);await transform(script,{loader:'js',target:'es2020'});
 assert.match(script,/sessionStorage\.getItem/);assert.match(script,/controller\.abort\(\),60000/);assert.match(script,/data=await response\.json\(\);\}finally\{clearTimeout/);
});
