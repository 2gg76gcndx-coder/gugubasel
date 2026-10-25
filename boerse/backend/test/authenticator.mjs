// Software authenticator for real WebAuthn verifier tests; never used by production.
import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import {origin} from './memory.mjs';
const b64=b=>Buffer.from(b).toString('base64url');
const digest=b=>createHash('sha256').update(b).digest();
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
export function authenticator(){
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const jwk=publicKey.export({format:'jwk'}),id=randomBytes(32),rp=new URL(origin).hostname;
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
 let registrationId;
 return {
  id:b64(id),
  registration(options,{clientOrigin=origin,uv=true,rpID=rp}={}){
   registrationId=Buffer.from(options.user.id,'base64url').toString();
   const len=Buffer.alloc(2);len.writeUInt16BE(id.length);
   const authData=Buffer.concat([digest(rpID),Buffer.from([uv?0x45:0x41]),u32(0),Buffer.alloc(16),len,id,cose]);
   const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin:clientOrigin,crossOrigin:false}));
   return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),attestationObject:b64(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))),transports:['internal']}};
  },
  assertion(options,{clientOrigin=origin,uv=true,rpID=rp,count=1,handle=registrationId}={}){
   const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin:clientOrigin,crossOrigin:false}));
   const authData=Buffer.concat([digest(rpID),Buffer.from([uv?0x05:0x01]),u32(count)]);
   const signature=sign('sha256',Buffer.concat([authData,digest(client)]),privateKey);
   return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),authenticatorData:b64(authData),signature:b64(signature),userHandle:b64(Buffer.from(handle))}};
  },
 };
}
