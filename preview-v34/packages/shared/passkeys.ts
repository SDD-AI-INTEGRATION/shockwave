import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type WebAuthnCredential, type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

export type StoredPasskey = {
  id:string; key:string; counter:number; transports?:WebAuthnCredential['transports'];
  createdAt:string; label:string;
};

type Account = {id:string;name:string;email:string};
const algorithms=[-7,-257];
const handle=(id:string)=>new TextEncoder().encode('shockwave:'+id);

export function passkeyRegistrationOptions(origin:string,user:Account, existing:StoredPasskey[]) {
  return generateRegistrationOptions({
    rpName:'Shockwave PMO',rpID:new URL(origin).hostname,userName:user.email,userDisplayName:user.name,userID:handle(user.id),
    timeout:60_000,attestationType:'none',supportedAlgorithmIDs:algorithms,
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
    excludeCredentials:existing.map(({id,transports})=>({id,transports})),
  });
}

export function passkeyAuthenticationOptions(origin:string) {
  return generateAuthenticationOptions({rpID:new URL(origin).hostname,userVerification:'required',timeout:60_000});
}

export async function validatePasskeyRegistration(origin:string,challenge:string,response:RegistrationResponseJSON,existingCount:number):Promise<StoredPasskey> {
  const result=await verifyRegistrationResponse({
    response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:new URL(origin).hostname,
    requireUserVerification:true,supportedAlgorithmIDs:algorithms,
  });
  if(!result.verified)throw new Error('Registrasi passkey gagal.');
  const credential=result.registrationInfo.credential;
  return {
    id:credential.id,key:isoBase64URL.fromBuffer(credential.publicKey),counter:credential.counter,transports:credential.transports,
    createdAt:new Date().toISOString(),label:'Passkey '+(existingCount+1),
  };
}

export async function validatePasskeyAuthentication(origin:string,challenge:string,response:AuthenticationResponseJSON,credential:StoredPasskey,userId:string) {
  if(response.response.userHandle!==isoBase64URL.fromBuffer(handle(userId)))throw new Error('Identitas passkey tidak cocok.');
  const result=await verifyAuthenticationResponse({
    response,expectedChallenge:challenge,expectedOrigin:origin,expectedRPID:new URL(origin).hostname,
    credential:{id:credential.id,publicKey:isoBase64URL.toBuffer(credential.key),counter:credential.counter,transports:credential.transports},
    requireUserVerification:true,
  });
  if(!result.verified)throw new Error('Verifikasi passkey gagal.');
  return result.authenticationInfo.newCounter;
}
