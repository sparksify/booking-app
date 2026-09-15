import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

const run=promisify(execFile);
const available=(()=>{try{execFileSync('initdb',['--version'],{stdio:'pipe'});return true;}catch{return false;}})();
test('FCC transactions in an isolated PostgreSQL cluster', {skip:available?false:'Local PostgreSQL tools unavailable; integration tests require initdb, pg_ctl and psql'}, async t=>{
  const root=mkdtempSync(join(tmpdir(),'kanso-fcc-test-')),dir=join(root,'data'),port=String(56000+Math.floor(Math.random()*5000));
  let running=false;
  try {
    execFileSync('initdb',['-D',dir,'-A','trust','--no-locale','-U','postgres'],{stdio:'pipe'});
    execFileSync('pg_ctl',['-D',dir,'-l',join(root,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1 -k ${root}`,'-w','start'],{stdio:'pipe'});running=true;
    const args=['-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-tAX','-v','ON_ERROR_STOP=1'];
    const sql=q=>execFileSync('psql',args,{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
    const asyncSql=q=>run('psql',[...args,'-c',q]);
    const quote=v=>`'${String(v).replaceAll("'","''")}'`;
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE leads(id uuid PRIMARY KEY); CREATE TABLE brands(id uuid PRIMARY KEY,name text,active boolean DEFAULT true); GRANT SELECT ON brands TO service_role;');
    for(const file of ['033_deal_desk.sql','034_deal_desk_hardening.sql','035_deal_desk_workflow.sql','20260915013850_fcc_deal_reminders.sql'])sql(readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
    const owner='consultant@example.com',other='other@example.com',brand=crypto.randomUUID();
    sql(`INSERT INTO brands(id,name) VALUES('${brand}','Green Team'); INSERT INTO fcc_mailboxes(owner_email,mailbox_email,tokens_encrypted) VALUES('${owner}','receipt@example.com','synthetic-only'),('${other}','other@example.com','synthetic-only');`);
    const receipt=(email,extra={})=>({email,name:'Michael Example',phone:'5550100',territories:'Austin',brand:'Green Team',message_id:crypto.randomUUID(),thread_id:'synthetic-thread',fingerprint:crypto.randomUUID(),submitted_at:new Date().toISOString(),timestamp_source:'email_received',due_at:new Date(Date.now()+86400000).toISOString(),...extra});
    const ingest=(r,who=owner,why=null)=>`SELECT fcc_ingest(${quote(who)},${quote(JSON.stringify(r))}::jsonb,'${brand}',ARRAY['green team'],${why?quote(why):'NULL'},NULL);`;
    const read=q=>JSON.parse(sql(q));
    let s;
    await t.test('new receipt creates submitted deal plus one next action without inventing CQ/introduction',()=>{
      s=read(ingest(receipt('candidate1@example.net')));
      const d=read(`SELECT row_to_json(d) FROM deals d WHERE id='${s.deal_id}';`);
      assert.equal(d.stage,'submitted');assert.equal(d.cq_received_at,null);assert.equal(d.introduction_at,null);
      assert.equal(sql(`SELECT count(*) FROM deal_followups WHERE deal_id='${d.id}' AND status='pending'`),'1');
    });
    await t.test('concurrent retries/copies do not duplicate deals, reminders, or evidence',async()=>{
      const r=receipt('concurrent@example.net');
      await Promise.all(Array.from({length:5},()=>asyncSql(ingest(r))));
      sql(ingest({...r,message_id:'forwarded-copy'}));
      assert.equal(sql("SELECT count(*) FROM deals WHERE email='concurrent@example.net'"),'1');
      assert.equal(sql("SELECT count(*) FROM fcc_submissions WHERE candidate_email='concurrent@example.net'"),'1');
    });
    await t.test('existing advanced deal keeps developer and exact manual next action',()=>{
      sql(`UPDATE deals SET stage='validation',developer_email='developer@green.example' WHERE id='${s.deal_id}'; UPDATE deal_followups SET note='Do not overwrite this manual note',due_at=now()+interval '30 days' WHERE deal_id='${s.deal_id}';`);
      const before=sql(`SELECT row_to_json(f) FROM deal_followups f WHERE deal_id='${s.deal_id}'`);
      sql(ingest(receipt('candidate1@example.net')));
      assert.equal(sql(`SELECT stage FROM deals WHERE id='${s.deal_id}'`),'validation');
      assert.equal(sql(`SELECT row_to_json(f) FROM deal_followups f WHERE deal_id='${s.deal_id}'`),before);
    });
    await t.test('acknowledgment before/after deadline resolves only the system obligation, retries preserve evidence',async()=>{
      const before=sql(`SELECT row_to_json(f) FROM deal_followups f WHERE deal_id='${s.deal_id}'`);
      const action=`SELECT fcc_record_action('${owner}','${s.id}','ack-1','acknowledged',now(),NULL,'Received','message-id',false);`;
      await Promise.all([asyncSql(action),asyncSql(action)]);
      assert.equal(sql(`SELECT status FROM fcc_submissions WHERE id='${s.id}'`),'acknowledged');
      assert.equal(sql(`SELECT count(*) FROM fcc_evidence WHERE submission_id='${s.id}' AND event_key='ack-1'`),'1');
      assert.equal(sql(`SELECT row_to_json(f) FROM deal_followups f WHERE deal_id='${s.deal_id}'`),before);
      assert.equal(sql(`SELECT contact_reported_at IS NULL AND candidate_confirmed_at IS NULL FROM fcc_submissions WHERE id='${s.id}'`),'t');
    });
    await t.test('snooze, contact attempt, manual acknowledgment and candidate confirmation remain distinct',()=>{
      const x=read(ingest(receipt('manual@example.net')));
      sql(`SELECT fcc_record_action('${owner}','${x.id}','snooze','snooze',now(),now()+interval '3 days','Later',NULL,true);`);
      sql(`SELECT fcc_record_action('${owner}','${x.id}','attempt','attempt',now(),now()+interval '4 days','Voicemail',NULL,true);`);
      assert.equal(sql(`SELECT status || ':' || (acknowledged_at IS NULL)::text FROM fcc_submissions WHERE id='${x.id}'`),'pending:true');
      sql(`SELECT fcc_record_action('${owner}','${x.id}','candidate','candidate_confirmed',now(),NULL,'Candidate confirmed by phone',NULL,true);`);
      assert.equal(sql(`SELECT status FROM fcc_submissions WHERE id='${x.id}'`),'pending');
      sql(`SELECT fcc_record_action('${owner}','${x.id}','phone','acknowledged',now(),NULL,'Developer confirmed receipt',NULL,true);`);
      assert.equal(sql(`SELECT status FROM fcc_submissions WHERE id='${x.id}'`),'acknowledged');
      assert.equal(sql(`SELECT count(*) FROM fcc_evidence WHERE submission_id='${x.id}'`),'5');
    });
    await t.test('pause/won/lost receipts go to review; resume preserves acknowledgment history',()=>{
      for(const state of ['paused','won','lost']){
        const x=read(ingest(receipt(`${state}@example.net`)));
        sql(`SELECT change_deal_lifecycle('${x.deal_id}','${state}','test',NULL,'${crypto.randomUUID()}');`);
        const review=read(ingest(receipt(`${state}@example.net`)));
        assert.equal(review.status,'review');assert.match(review.review_reason,new RegExp(state));
        assert.throws(()=>sql(`SELECT fcc_record_action('${owner}','${x.id}','snooze','snooze',now(),now()+interval '1 day','',NULL,true);`));
        if(state==='paused'){
          sql(`SELECT change_deal_lifecycle('${x.deal_id}','active','',now()+interval '1 day','${crypto.randomUUID()}');`);
          assert.equal(sql(`SELECT count(*) FROM deal_followups WHERE deal_id='${x.deal_id}' AND status='pending'`),'1');
          assert.equal(sql(`SELECT status FROM fcc_submissions WHERE id='${x.id}'`),'pending');
        }
      }
    });
    await t.test('cross-consultant matches are review-only and unauthorized mutations fail',()=>{
      const x=read(ingest(receipt('candidate1@example.net'),other));
      assert.equal(x.status,'review');assert.match(x.review_reason,/consultant/);
      assert.throws(()=>sql(`SELECT fcc_record_action('${other}','${s.id}','bad','acknowledged',now(),NULL,'',NULL,true);`));
      assert.throws(()=>sql(`SET ROLE anon; SELECT * FROM fcc_mailboxes;`));
      assert.throws(()=>sql(`SET ROLE authenticated; ${ingest(receipt('bad@example.net'))}`));
      assert.equal(sql(`SET ROLE service_role; SELECT count(*) FROM fcc_mailboxes;`),'SET\n2');
    });
    await t.test('failed transactions roll back deal creation and evidence',()=>{
      assert.throws(()=>sql(ingest(receipt('rollback@example.net',{due_at:null}))));
      assert.equal(sql("SELECT count(*) FROM deals WHERE email='rollback@example.net'"),'0');
      const before=sql(`SELECT count(*) FROM fcc_evidence WHERE submission_id='${s.id}'`);
      assert.throws(()=>sql(`SELECT fcc_record_action('${owner}','${s.id}','fail','reopen',now(),now()-interval '1 day','test',NULL,true)`));
      assert.equal(sql(`SELECT count(*) FROM fcc_evidence WHERE submission_id='${s.id}'`),before);
    });
  } finally {
    if(running)execFileSync('pg_ctl',['-D',dir,'-m','fast','-w','stop'],{stdio:'pipe'});
    // Only the isolated directory created by this test is removed.
    rmSync(root,{recursive:true,force:true});
  }
});
