import {createVisionProvider,visionConfigured} from './openrouter-vision.js';
import {visionFailure} from './vision-failure.js';
import { generateImagePlan, type VisionEnv, type VisionRequest, validateVisionRequest } from './vision.js';
import type { BuildPlan } from '../src/image/build-plan.js';
interface Storage { get<T>(key:string):Promise<T|undefined>; put(key:string,value:unknown):Promise<void>; deleteAll():Promise<void>; setAlarm(time:number):Promise<void> }
interface State { storage:Storage }
interface Session { expires:number; dimension:string; plan?:BuildPlan; requests:number; last:number }
export interface SessionBinding { idFromName(name:string):unknown; get(id:unknown):{fetch(request:Request):Promise<Response>} }
export const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export class ImageSession {
  private busy=false;
  constructor(private state:State,private env:VisionEnv) {}
  async alarm(){await this.state.storage.deleteAll();}
  async fetch(request:Request):Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path.endsWith('/init')) {
      const {dimension}=await request.json() as {dimension:string};
      await this.state.storage.put('session',{expires:Date.now()+3600000,dimension,requests:0,last:0});
      await this.state.storage.setAlarm(Date.now()+3600000);return reply({ready:true});
    }
    const session=await this.state.storage.get<Session>('session');
    if(!session || session.expires<Date.now()) return reply({error:'Session expired'},410);
    if(request.method==='GET') return reply({plan:session.plan??null});
    if(this.busy || session.requests>=5 || Date.now()-session.last<10000) return reply({error:'Session busy or rate limit reached'},429);
    let v:VisionRequest;
    try {const body=await request.json();if(!body || typeof body!=="object" || Array.isArray(body))throw new Error("Image request must be an object");v={...body as VisionRequest,dimension:session.dimension,previous:session.plan};validateVisionRequest(v);}catch(error){return reply({error:error instanceof Error?error.message:"Invalid image request"},400);}
    if(!visionConfigured(this.env))return reply({error:"Vision credentials/model are not configured",code:"VISION_NOT_CONFIGURED"},503);
    this.busy=true;
    try {
      session.requests++;session.last=Date.now();await this.state.storage.put('session',session);

      const plan=await generateImagePlan({...v,dimension:session.dimension,previous:session.plan},createVisionProvider(this.env));
      if(session.expires<=Date.now()){await this.state.storage.deleteAll();return reply({error:"Session expired during generation"},410);}
      if(new TextEncoder().encode(JSON.stringify(plan)).byteLength>96000)throw new Error("BuildPlan exceeds the 96 KB session storage budget");
      session.plan=plan;await this.state.storage.put('session',session);return reply({plan});
    } catch(error){return reply(visionFailure(error),502);}
    finally {this.busy=false;}
  }
}
