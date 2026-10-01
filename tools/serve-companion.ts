/** Local integration host for the ACTUAL Worker/session/Vision handlers.
 * File storage adapts the Durable Object contract locally; this is not workerd.
 * No mock provider, fake blueprint, browser secret or public session API.
 * Use HTTPS Cloudflare deployment for actual phones/server; localhost is QA.
 */
import { createServer, type Server } from 'node:http';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import worker from '../backend/worker.js';
import {visionEnvFrom,visionConfigured} from '../backend/openrouter-vision.js';
import { ImageSession, type SessionBinding } from '../backend/image-session.js';

class FileSessionStorage {
  constructor(private directory:string) {}
  async get<T>(key:string):Promise<T|undefined>{try{return JSON.parse(await readFile(join(this.directory,key+'.json'),'utf8')) as T;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}}
  async put(key:string,value:unknown){await mkdir(this.directory,{recursive:true});const {rename}=await import('node:fs/promises');const file=join(this.directory,key+'.json');await writeFile(file+'.tmp',JSON.stringify(value),{mode:0o600});await rename(file+'.tmp',file);}
  async deleteAll(){await rm(this.directory,{recursive:true,force:true});}
  async setAlarm(time:number){await this.put('alarm',time);}
}
export async function startCompanionHost(options:{port?:number;directory?:string;env?:Record<string,string>}={}):Promise<{server:Server;url:string;sessionUrl:string;close():Promise<void>}> {
 const envSource=options.env??process.env;const sharedSecret=envSource.BUILDER_SHARED_SECRET||randomBytes(32).toString('hex');
 const env={VISION_PROVIDER:envSource.VISION_PROVIDER,OPENROUTER_API_KEY:envSource.OPENROUTER_API_KEY,OPENROUTER_MODEL:envSource.OPENROUTER_MODEL,OPENROUTER_OUTPUT_FORMAT:envSource.OPENROUTER_OUTPUT_FORMAT,OPENROUTER_PROVIDER:envSource.OPENROUTER_PROVIDER,AI_API_KEY:envSource.AI_API_KEY??'',BUILDER_SHARED_SECRET:sharedSecret,AI_VISION_MODEL:envSource.AI_VISION_MODEL,AI_BASE_URL:envSource.AI_BASE_URL,AI_MODEL:envSource.AI_MODEL,AI_VISION_REASONING_EFFORT:envSource.AI_VISION_REASONING_EFFORT,AI_VISION_REASONING_FORMAT:envSource.AI_VISION_REASONING_FORMAT};
 const directory=options.directory??resolve('.local/image-sessions');const objects=new Map<string,ImageSession>();
 const binding:SessionBinding={idFromName:name=>name,get:id=>({async fetch(request){const name=String(id);if(!/^[a-f0-9]{32}$/.test(name))throw new Error('Invalid local session');let object=objects.get(name);if(!object){object=new ImageSession({storage:new FileSessionStorage(join(directory,name))},env);objects.set(name,object);}return object.fetch(request);}})};
 let url='';
 const server=createServer(async(req,res)=>{
  try{const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>4600000){res.writeHead(413);res.end('{"error":"Request too large"}');return;}chunks.push(c);}
   const method=req.method??'GET';const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
   const request=new Request(url+(req.url??'/'),{method,headers,body:['GET','HEAD'].includes(method)?undefined:Buffer.concat(chunks)});
   const response=await worker.fetch(request,{...env,IMAGE_SESSIONS:binding});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error instanceof Error?error.message:'Local host failed'}));}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port??8767,'127.0.0.1',resolve);});const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener address');url='http://127.0.0.1:'+address.port;
 const result=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+sharedSecret},body:JSON.stringify({mode:'image_session',dimension:'minecraft:overworld'})});if(!result.ok){server.close();throw new Error('Session initialization failed '+result.status);}
 const data=await result.json() as {url:string};
 return {server,url,sessionUrl:data.url,close:()=>new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const host=await startCompanionHost();console.log('Companion QA URL:',host.sessionUrl);console.log('Real Vision configured:',visionConfigured(visionEnvFrom(process.env)));console.log('Local file adapter; Cloudflare deployment and real Bedrock are separate acceptance gates.');}
