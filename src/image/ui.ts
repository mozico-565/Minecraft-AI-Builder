import type { Player } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { validateBuildPlan, type BuildPlan } from './build-plan.js';
import type { BuildingEngine } from '../builder/engine.js';
export interface ImageBridge { create(dimension:string):Promise<{session:string;url:string}>; fetch(session:string):Promise<BuildPlan|undefined> }
export async function imageMenu(player:Player,engine:BuildingEngine,bridge:ImageBridge|undefined,confirm:(p:Player,plan:BuildPlan,e:BuildingEngine)=>Promise<void>):Promise<void>{
 try {
  const menu=new ActionFormData().title('Image-to-Build / البناء من صورة').body(bridge?'افتح رابط الجلسة في متصفح الهاتف، اختر الصور، ثم عد لجلب الخطة.':'العالم المحلي لا يدعم HTTP. ولّد الخطة عبر صفحة المرافق ثم الصق BuildPlan JSON هنا.').button('New image session / جلسة صور جديدة').button('Fetch image plan / جلب الخطة').button('Import BuildPlan JSON / استيراد');
  const answer=await menu.show(player);if(answer.canceled)return;
  if(answer.selection===0){if(!bridge)throw new Error('Requires Dedicated Server configured with backend');const session=await bridge.create(player.dimension.id);player.setDynamicProperty('aibuilder:image_session',session.session);player.sendMessage('§b'+session.url);await new ModalFormData().title('Copy private URL / انسخ الرابط').textField('Open in phone browser', '',{defaultValue:session.url}).show(player);}
  if(answer.selection===1){if(!bridge)throw new Error('No HTTP in local Android worlds');const id=player.getDynamicProperty('aibuilder:image_session');if(typeof id!=='string')throw new Error('Create a session first');const plan=await bridge.fetch(id);if(!plan)throw new Error('No plan yet; generate in companion browser first');await confirm(player,validateBuildPlan(plan),engine);}
  if(answer.selection===2){const answer=await new ModalFormData().title('BuildPlan JSON').textField('Paste the complete downloaded JSON','').show(player);if(!answer.canceled)await confirm(player,validateBuildPlan(JSON.parse(String(answer.formValues?.[0]??''))),engine);}
 }catch(error){player.sendMessage('§cImage Builder: '+(error instanceof Error?error.message:String(error)));}
}
