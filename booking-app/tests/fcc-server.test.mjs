import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import * as pure from '../lib/fcc.mjs';

// Execute the actual route/function bodies with explicit dependency injection.
// Next.js alias imports are removed; no database or Gmail network call is made.
function inject(path,deps,exports){
  const text=readFileSync(new URL(`../${path}`,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export default /g,'').replace(/export /g,'');
  return new Function(...Object.keys(deps),`${text}\nreturn {${exports.join(',')}};`)(...Object.values(deps));
}
function server(overrides={}){return inject('lib/fccServer.js',{crypto,...pure,google:{},getServerSession:async()=>null,authOptions:{},getSupabaseAdmin:()=>{},getPermissions:async()=>({page_meetings:true}),...overrides},['decodeMessage','seal','unseal','context','receiptRows','productionOnly','resultData','publicError']);}
const res=()=>({statusCode:200,headers:{},status(n){this.statusCode=n;return this;},json(d){this.body=d;return this;},setHeader(k,v){this.headers[k]=v;},end(){return this;}});

test('Gmail MIME decoder ignores attachment bodies and requires aligned Google authentication',()=>{
  const {decodeMessage}=server();
  const raw={id:'aabbccdd1122',threadId:'aabbccdd',internalDate:String(Date.now()),payload:{headers:[{name:'From',value:'Developer <developer@green.example>'},{name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@green.example; spf=pass smtp.mailfrom=bounce@green.example'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Received Michael Example').toString('base64url')}},{mimeType:'text/plain',filename:'private.txt',body:{data:Buffer.from('PRIVATE ATTACHMENT').toString('base64url')}}]}};
  assert.equal(decodeMessage(raw).authenticatedSender,true);assert.doesNotMatch(decodeMessage(raw).text,/PRIVATE/);
  raw.payload.headers[1].value='mx.google.com; dkim=pass header.i=@notgreen.example';assert.equal(decodeMessage(raw).authenticatedSender,false);
  raw.payload.headers[1].value='mx.google.com; dkim=fail header.i=@green.example';raw.payload.headers.push({name:'Authentication-Results',value:'mx.google.com; dkim=pass header.i=@green.example'});assert.equal(decodeMessage(raw).authenticatedSender,false);
});
test('encrypted OAuth/preview state detects tampering and hides credentials',()=>{
  const old=process.env.NEXTAUTH_SECRET;process.env.NEXTAUTH_SECRET='synthetic-test-secret';
  try{const {seal,unseal}=server(),value={refresh_token:'not-a-real-token',owner:'test@example.com'};const sealed=seal(value);assert.ok(!sealed.includes('not-a-real-token'));assert.deepEqual(unseal(sealed),value);assert.throws(()=>unseal(`${sealed.slice(0,20)}A${sealed.slice(21)}`));}finally{if(old===undefined)delete process.env.NEXTAUTH_SECRET;else process.env.NEXTAUTH_SECRET=old;}
});
test('request context rejects anonymous, inactive, unauthorized-page, and cross-origin callers',async()=>{
  const old=process.env.NEXTAUTH_URL;process.env.NEXTAUTH_URL='https://app.trykanso.co';
  try{
    const {context:anonymous}=server();await assert.rejects(()=>anonymous({method:'GET'},res()),e=>e.status===401);
    const ops=[];
    const query={select(){return this;},eq(k,v){ops.push([k,v]);return this;},async maybeSingle(){return {data:{email:'test@example.com'}};}};
    const deps={getServerSession:async()=>({user:{email:'TEST@example.com'}}),getSupabaseAdmin:()=>({from:()=>query})};
    const ctx=await server(deps).context({method:'GET'},res());assert.equal(ctx.owner,'test@example.com');assert.deepEqual(ops,[['email','test@example.com'],['active',true]]);
    await assert.rejects(()=>server({...deps,getPermissions:async()=>({page_meetings:false})}).context({method:'GET'},res()),e=>e.status===403);
    await assert.rejects(()=>server(deps).context({method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'}},res()),e=>e.status===403);
    const inactive={from:()=>({...query,maybeSingle:async()=>({data:null})})};await assert.rejects(()=>server({...deps,getSupabaseAdmin:()=>inactive}).context({method:'GET'},res()),e=>e.status===403);
  }finally{if(old===undefined)delete process.env.NEXTAUTH_URL;else process.env.NEXTAUTH_URL=old;}
});
test('scheduled endpoint fails closed with missing/wrong secret or preview environment',async()=>{
  const oldSecret=process.env.CRON_SECRET,oldEnv=process.env.VERCEL_ENV;
  const {handler}=inject('pages/api/cron/fcc-reminders.js',{crypto,getSupabaseAdmin:()=>{throw new Error('Must not access database');},resultData:()=>{},syncMailbox:()=>{}},['handler']);
  try{
    delete process.env.CRON_SECRET;let response=res();await handler({method:'GET',headers:{}},response);assert.equal(response.statusCode,401);
    process.env.CRON_SECRET='synthetic';response=res();await handler({method:'GET',headers:{authorization:'wrong'}},response);assert.equal(response.statusCode,401);
    process.env.VERCEL_ENV='preview';response=res();await handler({method:'GET',headers:{authorization:'Bearer synthetic'}},response);assert.equal(response.statusCode,403);
  }finally{for(const [name,value]of [['CRON_SECRET',oldSecret],['VERCEL_ENV',oldEnv]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
test('reminder route validates ownership-bound preview token and explicit activation prerequisites',async()=>{
  const {publicError,resultData}=server();let called=false;
  const box={owner_email:'test@example.com',mailbox_email:'receipt@example.com',tokens_encrypted:'encrypted'};
  const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:box})};
  const deps={...pure,context:async()=>({db:{from:()=>query},owner:'test@example.com',perms:{}}),resultData,publicError,productionOnly:()=>{},unseal:()=>({owner:'attacker@example.com',mailbox:box.mailbox_email,expires:Date.now()+10000,ids:['abc']}),gmailClient:()=>{called=true;},catalog:()=>{},receiptRows:()=>{},ingest:()=>{},record:()=>{},dryRun:()=>{}};
  const {handler}=inject('pages/api/dashboard/fcc/index.js',deps,['handler']);
  let response=res();await handler({method:'POST',body:{action:'import',token:'fake',ids:['abc']}},response);assert.equal(response.statusCode,400);assert.equal(called,false);
  response=res();await handler({method:'POST',body:{action:'reminder',id:'not-a-uuid'}},response);assert.equal(response.statusCode,400);
});
