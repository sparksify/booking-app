import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as dates from '../lib/dealDesk.mjs';
import * as fcc from '../lib/fcc.mjs';

const require=createRequire(import.meta.url);
const {transformSync}=require('next/dist/build/swc');
const source=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const cache=new Map();
function component(name) {
  if(cache.has(name))return cache.get(name);
  const code=transformSync(source('components/'+name+'.js'),{
    filename:name+'.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'},
  }).code;
  const module={exports:{}};
  const injected=id=>id==='@/lib/dealDesk'?dates:id==='@/lib/fcc.mjs'?fcc:id.startsWith('./')?component(id.slice(2)):require(id);
  new Function('require','module','exports',code)(injected,module,module.exports);
  cache.set(name,module.exports);return module.exports;
}
const deal={id:'synthetic',first_name:'Alex',last_name:'Example',email:'candidate@example.test',phone:'5550100',brand:'Example Brand',developer_name:'Taylor',developer_email:'developer@example.test',developer_phone:'5550101'};
const followup={id:'task',due_at:'2026-01-01T15:00:00Z',contact_target:'candidate',note:'Private next-action details stay in the drawer',deal};
test('both overdue row types render one neutral, accessible open control and no action clutter',()=>{
  const {DealFollowupRow}=component('DealDesk'),{FccReminderRow}=component('FccReminders');
  for(const el of [
    React.createElement(DealFollowupRow,{followup}),
    React.createElement(FccReminderRow,{row:{...followup,deal_id:deal.id,candidate_name:'Alex Example',check_label:'Private acknowledgment detail'}}),
  ]){
    const html=renderToStaticMarkup(React.createElement('table',null,React.createElement('tbody',null,el)));
    assert.equal((html.match(/<button/g)||[]).length,1);
    assert.match(html,/aria-label="Open Alex Example/);
    assert.match(html,/overdue/);
    assert.match(html,/Example Brand/);
    assert.doesNotMatch(html,/#FEF2F2|#DC2626|Private|Snooze|Done|Draft email|href=/i);
  }
});
test('drawer contact actions address the intended candidate or developer',()=>{
  const {DealFollowupActions}=component('DealDesk');
  for(const [target,phone,email] of [['candidate','5550100','candidate@example.test'],['developer','5550101','developer@example.test']]){
    const html=renderToStaticMarkup(React.createElement(DealFollowupActions,{followup:{...followup,contact_target:target}}));
    assert.ok(html.includes('tel:'+phone));assert.ok(html.includes('sms:'+phone));assert.ok(html.includes('mailto:'+email));
    assert.match(html,/Done/);assert.match(html,/Snooze/);assert.match(html,/Private next-action details/);
  }
});
test('Meetings defaults to appointments; tabs and drawer retain explicit opt-in access',()=>{
  const page=source('pages/dashboard/bookings.js'),drawer=source('components/DealDesk.js'),fccUi=source('components/FccReminders.js');
  assert.match(page,/\[feedFilter, setFeedFilter\] = useState\('meetings'\)/);
  assert.match(page,/feedFilter !== 'meetings' && <FccSettings/);
  assert.match(page,/openDeal\(id, 'developer'\)/);
  assert.match(page,/setFeedFilter\('overdue'\)/);
  assert.match(drawer,/tab==='details' &&/);assert.match(drawer,/tab==='history' &&/);
  assert.match(drawer,/mode && <ActionPanel/);assert.match(fccUi,/return <InlineFccAction/);
  assert.match(drawer,/boxSizing:'border-box'/);
});
