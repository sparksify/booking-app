import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, acknowledgment, authoredText, matchBrand, nextCheck, checkAvailability, inDateFilter } from '../lib/fcc.mjs';

const receipt=`FCC Lead Registration - New
Franchise Brand 1
Green Team
Franchise Brand 2
Blue Team
Consultant's Name
Test Consultant
Consultant E-mail
consultant@example.com
Consultant Number
555-0100
Lead Name
Michael Example
Territory / City Requested
Austin
Lead Net Worth
SECRET WEALTH
Lead Address
SECRET ADDRESS
Lead E-mail
michael@example.net
Lead Phone Number
555-0102
Lead Narrative
PRIVATE NARRATIVE
Attach Files Here
PRIVATE ATTACHMENT`;
const message={from:'noreply@jotform.com',authenticatedSender:true,text:receipt,receivedAt:'2026-09-18T18:00:00Z'};
const sub={candidate_name:'Michael Example',candidate_email:'michael@example.net',source_thread_id:'abc'};
const rules={verified_emails:['developer@green.example']};
const reply=text=>({text,from:'developer@green.example',authenticatedSender:true,threadId:'abc'});

test('FCC plain-text and HTML parsing uses stable labels, multiple brands, and excludes sensitive fields',()=>{
  for(const msg of [message,{...message,text:'',html:receipt.split('\n').map(l=>`<div>${l}</div>`).join('')}]){
    const r=parseReceipt(msg,'consultant@example.com');
    assert.equal(r.email,'michael@example.net');assert.equal(r.name,'Michael Example');assert.deepEqual(r.brands,['Green Team','Blue Team']);assert.equal(r.territories,'Austin');
    assert.equal(r.review_reason,null);assert.equal(r.timestamp_source,'email_received');
    assert.doesNotMatch(JSON.stringify(r),/SECRET|PRIVATE/);
  }
});
test('FCC rejects unrelated Jotform messages and flags forwarded, unauthenticated, or wrong-consultant receipts',()=>{
  assert.equal(parseReceipt({...message,text:'New order, thanks'},'consultant@example.com'),null);
  assert.match(parseReceipt({...message,from:'someone@example.com'},'consultant@example.com').review_reason,/Forwarded/);
  assert.match(parseReceipt({...message,authenticatedSender:false},'consultant@example.com').review_reason,/unauthenticated/);
  assert.match(parseReceipt(message,'other@example.com').review_reason,/consultant/);
  assert.equal(parseReceipt({...message,text:receipt.replace('michael@example.net','not an email')},'consultant@example.com'),null);
});
test('only explicit timezone-bearing receipt timestamps override received time',()=>{
  const r=parseReceipt({...message,text:receipt+'\nSubmission Date\n2026-09-18T12:00:00-05:00'},'consultant@example.com');
  assert.equal(r.timestamp_source,'receipt');assert.equal(r.submitted_at,'2026-09-18T17:00:00.000Z');
});
test('canonical brand aliases reject ambiguous and unknown names',()=>{
  const brands=[{id:'1',name:'Green Team'},{id:'2',name:'Blue Team'}];
  assert.equal(matchBrand(' green ',brands,[{brand_id:'1',aliases:['Green']}]).brand.id,'1');
  assert.match(matchBrand('team',brands,[{brand_id:'1',aliases:['team']},{brand_id:'2',aliases:['team']}]).review,/Ambiguous/);
  assert.match(matchBrand('unknown',brands).review,/Unknown/);
});
test('threaded and new-thread acknowledgments keep contact facts distinct',()=>{
  assert.equal(acknowledgment(reply("Thanks, received Michael Example's registration."),sub,rules).classification,'acknowledged');
  assert.equal(acknowledgment({...reply("We'll call Michael Example tomorrow."),threadId:'new'},sub,rules).classification,'outreach_planned');
  assert.equal(acknowledgment(reply('We spoke with Michael Example and booked an overview.'),sub,rules).classification,'contact_reported');
  assert.equal(acknowledgment(reply('Received'),sub,rules,{threadUnique:true}).classification,'acknowledged');
  assert.equal(acknowledgment(reply('Received'),sub,rules).classification,'needs_review');
  assert.equal(acknowledgment(reply("Thanks, received Michael's registration."),sub,rules).classification,'needs_review');
});
test('quoted receipts, automatic replies, own outbound, unauthenticated and wrong contacts do not acknowledge',()=>{
  for(const extra of [{sent:true},{automatic:true},{authenticatedSender:false},{from:'outsider@wrong.example'}])assert.equal(acknowledgment({...reply('Received Michael Example registration'),...extra},sub,rules),null);
  assert.equal(acknowledgment(reply('Received Michael Example registration'),sub,rules,{ownEmails:['developer@green.example']}),null);
  assert.equal(acknowledgment(reply('Out of office. Received Michael Example registration'),sub,rules),null);
  assert.equal(acknowledgment(reply('Hi\nOn Monday Steve wrote:\nReceived Michael Example registration'),sub,rules),null);
  assert.equal(acknowledgment({...reply(''),html:'<p>Hello</p><blockquote>Received Michael Example registration</blockquote>'},sub,rules),null);
  assert.equal(acknowledgment(reply('Received Sam Wrong registration sam@elsewhere.net'),sub,rules),null);
  assert.equal(acknowledgment(reply("We haven't received Michael Example registration"),sub,rules).classification,'needs_review');
  assert.equal(authoredText({html:'Hello<div class="gmail_quote">Received Michael Example</div>'}),'Hello');
});
test('next-business morning skips weekends and follows Chicago DST',()=>{
  assert.equal(nextCheck('2026-09-18T18:00:00Z'),'2026-09-21T14:00:00.000Z');
  assert.equal(nextCheck('2026-03-06T18:00:00Z'),'2026-03-09T14:00:00.000Z');
  assert.equal(nextCheck('2026-10-30T18:00:00Z'),'2026-11-02T15:00:00.000Z');
  assert.equal(nextCheck('2026-09-18T18:00:00Z','America/New_York',8),'2026-09-21T12:00:00.000Z');
});
test('sync failures and stale checks never claim no acknowledgment; filters use consultant midnight',()=>{
  const now=new Date('2026-09-21T14:10:00Z'),s={status:'pending',due_at:'2026-09-21T14:00:00Z',checked_through:'2026-09-21T14:05:00Z'},box={enabled:true};
  assert.equal(checkAvailability(s,box,now),'No brand acknowledgment found');
  assert.equal(checkAvailability(s,{...box,last_error:'failed'},now),'Acknowledgment check unavailable');
  assert.equal(checkAvailability({...s,checked_through:'2026-09-20T14:00:00Z'},box,now),'Acknowledgment check unavailable');
  assert.equal(checkAvailability({...s,status:'acknowledged'},box,now),'Acknowledgment received');
  assert.equal(inDateFilter('2026-09-22T04:59:00Z','today','America/Chicago',now),true);
  assert.equal(inDateFilter('2026-09-22T05:00:00Z','today','America/Chicago',now),false);
  assert.equal(inDateFilter('2028-01-01T00:00:00Z','all','America/Chicago',now),true);
  assert.equal(inDateFilter('2026-09-01T00:00:00Z','today','America/Chicago',now),true);
});
