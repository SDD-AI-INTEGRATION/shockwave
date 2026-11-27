import {test} from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {askOpenAI,createOpenAIClient,openAIEnabled,openAIModel,openAIFailure,DEFAULT_OPENAI_MODEL} from '../src/openai-assistant.js';

const completion=(text:string,status='completed')=>({id:'resp_test',object:'response',status,output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}]});
const client=(body:unknown,onRequest?:(request:Request)=>Promise<void>)=>new OpenAI({apiKey:'sk-test-not-a-real-secret',baseURL:'https://api.openai.com/v1',maxRetries:0,fetch:async(input,init)=>{await onRequest?.(new Request(input,init));return Response.json(body);}});

test('OpenAI Responses sends only supplied context, instructions and store:false',async()=>{
 const context=[{code:'SYNTHETIC-1',progress:42}];
 const answer=await askOpenAI('Ringkas progres',context,'Gunakan hanya data proyek.',client(completion('SYNTHETIC-1: 42%'),async request=>{
  assert.equal(request.url,'https://api.openai.com/v1/responses');
  const body=await request.json();assert.equal(body.model,DEFAULT_OPENAI_MODEL);assert.equal(body.store,false);assert.equal(body.max_output_tokens,2000);assert.equal(body.instructions,'Gunakan hanya data proyek.');assert.match(body.input[0].content,/SYNTHETIC-1/);assert.equal(body.reasoning.effort,'low');assert.equal(body.tools,undefined);
 }));
 assert.equal(answer,'SYNTHETIC-1: 42%');
});
test('refusal, incomplete responses and empty provider output are handled explicitly',async()=>{
 const refused={id:'resp_refused',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'Provider refusal'}]}]};
 assert.match(await askOpenAI('Question',[],'Instruction',client(refused)),/tidak dapat menjawab/);
 assert.match(await askOpenAI('Question',[],'Instruction',client(completion('Sebagian jawaban','incomplete'))),/Jawaban terpotong/);
 await assert.rejects(()=>askOpenAI('Question',[],'Instruction',client(completion(''))),/no answer/);
 await assert.rejects(()=>askOpenAI('Question',[],'Instruction',client({...completion(''),status:'failed'})),/response failed/);
});
test('provider failure messages redact secrets and distinguish insufficient quota',()=>{
 const secret='sk-dummy-sensitive-value',headers=new Headers();
 const invalid=new OpenAI.AuthenticationError(401,{message:secret,code:'invalid_api_key'},secret,headers);
 const quota=new OpenAI.RateLimitError(429,{message:secret,code:'insufficient_quota'},secret,headers);
 const rate=new OpenAI.RateLimitError(429,{message:secret,code:'rate_limit_exceeded'},secret,headers);
 const exhausted=new OpenAI.RateLimitError(429,{message:secret,code:'credit_balance_exhausted'},secret,headers);
 assert.match(openAIFailure(exhausted),/saldo atau kuota/);
 assert.match(openAIFailure(invalid),/kunci OpenAI tidak valid/);assert.match(openAIFailure(quota),/saldo atau kuota/);assert.match(openAIFailure(rate),/batas pemakaian/);
 for(const error of [invalid,quota,rate,new Error(secret)])assert.ok(!openAIFailure(error).includes(secret));
});
test('only OpenAI credentials enable AI and the client cannot inherit a different API host',()=>{
 const names=['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_BASE_URL','ASSISTANT_AI','ANTHROPIC_API_KEY'] as const;
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 try{
  for(const name of names)delete process.env[name];
  process.env.ANTHROPIC_API_KEY='unused-legacy-provider';assert.equal(openAIEnabled(),false);
  process.env.OPENAI_API_KEY='sk-test-not-a-real-secret';assert.equal(openAIEnabled(),true);assert.equal(openAIModel(),DEFAULT_OPENAI_MODEL);
  process.env.OPENAI_BASE_URL='https://untrusted.example/v1';assert.equal(createOpenAIClient().baseURL,'https://api.openai.com/v1');
  process.env.OPENAI_MODEL='gpt-6.1-sol';assert.equal(openAIModel(),'gpt-6.1-sol');
  process.env.ASSISTANT_AI='off';assert.equal(openAIEnabled(),false);
 }finally{for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
