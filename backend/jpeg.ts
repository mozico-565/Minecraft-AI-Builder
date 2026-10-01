/** Validate normalized JPEG envelope and SOF dimensions without decoding pixels. */
export function jpegDimensions(bytes:Uint8Array):{width:number;height:number} {
 if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new Error('Corrupt normalized JPEG');
 let at=2;
 while(at<bytes.length-2){
  if(bytes[at++]!==255)throw new Error('Invalid JPEG marker');
  while(bytes[at]===255)at++;
  const marker=bytes[at++];if(marker===undefined||marker===218||marker===217)break;
  if(marker===1||(marker>=208&&marker<=215))continue;
  const size=(bytes[at]??0)*256+(bytes[at+1]??0);
  if(size<2||at+size>bytes.length)throw new Error('Truncated JPEG segment');
  if([192,193,194].includes(marker)){
   if(size<8)throw new Error('Invalid JPEG frame');
   const height=bytes[at+3]!*256+bytes[at+4]!;const width=bytes[at+5]!*256+bytes[at+6]!;
   if(!width||!height)throw new Error('Invalid JPEG dimensions');return {width,height};
  }
  at+=size;
 }
 throw new Error('JPEG has no supported frame');
}
export function normalizedJPEGDimensions(data:string):{width:number;height:number}{
 if(!data.startsWith('data:image/jpeg;base64,'))throw new Error('Expected normalized JPEG');
 const body=data.slice(23);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(body)||body.length%4!==0)throw new Error('Invalid JPEG base64');
 let binary:string;try{binary=atob(body);}catch{throw new Error('Invalid JPEG base64');}
 return jpegDimensions(Uint8Array.from(binary,c=>c.charCodeAt(0)));
}
