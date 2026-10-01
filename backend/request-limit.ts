export async function readBoundedBody(request:Pick<Request,'body'|'headers'>,maxBytes:number):Promise<string> {
 const length=Number(request.headers.get('content-length')??0);
 if(length>maxBytes)throw new Error('Request too large');
 const reader=request.body?.getReader();if(!reader)return '';
 const chunks:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error('Request too large');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
