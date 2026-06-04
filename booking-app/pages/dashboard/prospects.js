import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import Head from 'next/head';
import Link from 'next/link';
import { authOptions } from '../api/auth/[...nextauth]';

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session) return { redirect: { destination: '/dashboard/login', permanent: false } };
  return { props: { session } };
}

// ─── Demo leads (20 leads across all 8 buckets) ───────────────────────────────

const DEMO_LEADS = [
  // ── APPOINTMENT SAVES ─────────────────────────────────────────────────────
  {
    id: 'demo-s1', first_name: 'Sarah', last_name: 'Mitchell',
    email: 'smitchell@gmail.com', phone: '(312) 555-0413',
    ghl_contact_id: null, created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
    investment_level: '$150k–$250k', liquid_cap_raw: '$200,000', location: 'Chicago, IL',
    score: 81, bucket: 'saves', commissionEstimate: 6600,
    reasons: ['No-showed within the last 7 days', 'Liquid capital: $200,000', 'Previously booked but did not show', '1 prior contact attempt'],
    nextAction: 'Call now — 22% rebook when contacted same day',
    ageDays: 18, isHighDollar: false, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: true, noShowRecent: true,
  },
  {
    id: 'demo-s2', first_name: 'James', last_name: 'Patterson',
    email: 'jpatterson@email.com', phone: '(615) 555-0887',
    ghl_contact_id: null, created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$150,000', location: 'Nashville, TN',
    score: 68, bucket: 'saves', commissionEstimate: 6600,
    reasons: ['No-showed within the last 7 days', 'Liquid capital: $150,000', 'Previously booked but did not show', 'No advisor contact recorded'],
    nextAction: 'Call now — 22% rebook when contacted same day',
    ageDays: 25, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: true, noShowRecent: true,
  },

  // ── SPEED TO LEAD ─────────────────────────────────────────────────────────
  {
    id: 'demo-sp1', first_name: 'Jordan', last_name: 'Beck',
    email: 'jordan.beck@gmail.com', phone: '(512) 555-0221',
    ghl_contact_id: null, created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$130,000', location: 'Austin, TX',
    score: 91, bucket: 'speed_to_lead', commissionEstimate: 10500,
    reasons: ['Submitted within 6 hours — no contact yet', 'Liquid capital: $130,000', 'No advisor contact on record'],
    nextAction: 'Call within 5 min — 21× booking rate',
    ageDays: 0, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-sp2', first_name: 'Aisha', last_name: 'Williams',
    email: 'aisha.w@outlook.com', phone: '(404) 555-0774',
    ghl_contact_id: null, created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$95,000', location: 'Atlanta, GA',
    score: 85, bucket: 'speed_to_lead', commissionEstimate: 10500,
    reasons: ['Submitted within 6 hours — no contact yet', 'No advisor contact on record'],
    nextAction: 'Call within 5 min — 21× booking rate',
    ageDays: 0, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },

  // ── VIP LEADS ─────────────────────────────────────────────────────────────
  {
    id: 'demo-v1', first_name: 'Robert', last_name: 'Sterling',
    email: 'rsterling@wealthmgmt.com', phone: '(212) 555-0940',
    ghl_contact_id: null, created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    investment_level: '$500k+', liquid_cap_raw: '$650,000', location: 'New York, NY',
    score: 84, bucket: 'vip', commissionEstimate: 6000,
    reasons: ['Lead submitted 6 days ago', 'Liquid capital: $650,000', 'Viewed booking page 3×', 'Browsed available appointment slots', 'No advisor contact on record'],
    nextAction: 'Senior advisor call — highest commission potential',
    ageDays: 6, isHighDollar: true, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-v2', first_name: 'Catherine', last_name: 'Moore',
    email: 'cmoore@familyoffice.com', phone: '(480) 555-0374',
    ghl_contact_id: null, created_at: new Date(Date.now() - 11 * 86400000).toISOString(),
    investment_level: '$250k–$500k', liquid_cap_raw: '$380,000', location: 'Scottsdale, AZ',
    score: 76, bucket: 'vip', commissionEstimate: 6000,
    reasons: ['Lead submitted 11 days ago', 'Liquid capital: $380,000', 'Viewed booking page 2×', '1 prior contact attempt'],
    nextAction: 'Senior advisor call — highest commission potential',
    ageDays: 11, isHighDollar: true, isResurrection: false, callAttempts: 1, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },

  // ── RE-ENGAGED ────────────────────────────────────────────────────────────
  {
    id: 'demo-r1', first_name: 'David', last_name: 'Park',
    email: 'dpark@email.com', phone: '(281) 555-0729',
    ghl_contact_id: null, created_at: new Date(Date.now() - 28 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$125,000', location: 'Houston, TX',
    score: 71, bucket: 're_engaged', commissionEstimate: 7500,
    reasons: ['Lead submitted 28 days ago', 'Liquid capital: $125,000', 'Active in the last 24 hours', 'Viewed booking page 2×', '2 prior contact attempts'],
    nextAction: 'Call now — active within the last 24 hours',
    ageDays: 28, isHighDollar: false, isResurrection: false, callAttempts: 2, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-r2', first_name: 'Sandra', last_name: 'Torres',
    email: 'storres@gmail.com', phone: '(602) 555-0516',
    ghl_contact_id: null, created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$88,000', location: 'Phoenix, AZ',
    score: 63, bucket: 're_engaged', commissionEstimate: 7500,
    reasons: ['Lead submitted 45 days ago', 'Active in the last 24 hours', 'Browsed available appointment slots', '3 prior contact attempts'],
    nextAction: 'Call now — active within the last 24 hours',
    ageDays: 45, isHighDollar: false, isResurrection: false, callAttempts: 3, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },

  // ── NEAR MISSES ───────────────────────────────────────────────────────────
  {
    id: 'demo-nm1', first_name: 'Michael', last_name: 'Grant',
    email: 'mgrant@outlook.com', phone: '(773) 555-0382',
    ghl_contact_id: null, created_at: new Date(Date.now() - 35 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$145,000', location: 'Chicago, IL',
    score: 58, bucket: 'near_miss', commissionEstimate: 4500,
    reasons: ['Lead submitted 35 days ago', 'Liquid capital: $145,000', 'Previously booked but did not show', '2 prior contact attempts'],
    nextAction: 'SMS first, then follow-up call',
    ageDays: 35, isHighDollar: false, isResurrection: false, callAttempts: 2, recentEngaged: false, hasBooking: true, noShowRecent: false,
  },
  {
    id: 'demo-nm2', first_name: 'Jennifer', last_name: 'Walsh',
    email: 'jwalsh@company.com', phone: '(305) 555-0561',
    ghl_contact_id: null, created_at: new Date(Date.now() - 22 * 86400000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$110,000', location: 'Miami, FL',
    score: 53, bucket: 'near_miss', commissionEstimate: 4500,
    reasons: ['Lead submitted 22 days ago', 'Previously booked but did not show', '1 prior contact attempt'],
    nextAction: 'SMS first, then follow-up call',
    ageDays: 22, isHighDollar: false, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: true, noShowRecent: false,
  },

  // ── RESURRECTIONS ─────────────────────────────────────────────────────────
  {
    id: 'demo-res1', first_name: 'Linda', last_name: 'Chen',
    email: 'linda.chen@gmail.com', phone: '(619) 555-0291',
    ghl_contact_id: null, created_at: new Date(Date.now() - 145 * 86400000).toISOString(),
    investment_level: '$250k–$500k', liquid_cap_raw: '$310,000', location: 'San Diego, CA',
    score: 74, bucket: 'resurrection', commissionEstimate: 3600,
    reasons: ['Lead submitted 145 days ago', 'Liquid capital: $310,000', 'Re-engaged after going dormant 90+ days', '3 prior contact attempts'],
    nextAction: 'Reach out now — re-engaged after going dark',
    ageDays: 145, isHighDollar: true, isResurrection: true, callAttempts: 3, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-res2', first_name: 'Thomas', last_name: 'Baker',
    email: 'tbaker@outlook.com', phone: '(720) 555-0658',
    ghl_contact_id: null, created_at: new Date(Date.now() - 112 * 86400000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$90,000', location: 'Denver, CO',
    score: 61, bucket: 'resurrection', commissionEstimate: 3600,
    reasons: ['Lead submitted 112 days ago', 'Re-engaged after going dormant 90+ days', 'Viewed booking page today', '2 prior contact attempts'],
    nextAction: 'Reach out now — re-engaged after going dark',
    ageDays: 112, isHighDollar: false, isResurrection: true, callAttempts: 2, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },

  // ── HIGH DOLLAR ───────────────────────────────────────────────────────────
  {
    id: 'demo-hd1', first_name: 'Victoria', last_name: 'Shah',
    email: 'vshah@venture.com', phone: '(650) 555-0920',
    ghl_contact_id: null, created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    investment_level: '$500k+', liquid_cap_raw: '$820,000', location: 'San Francisco, CA',
    score: 77, bucket: 'high_dollar', commissionEstimate: 3000,
    reasons: ['Lead submitted 9 days ago', 'Liquid capital: $820,000', 'High investment level indicated', 'No advisor contact on record'],
    nextAction: 'Priority call — outsized commission opportunity',
    ageDays: 9, isHighDollar: true, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-hd2', first_name: 'William', last_name: 'Brooks',
    email: 'wbrooks@gmail.com', phone: '(312) 555-0159',
    ghl_contact_id: null, created_at: new Date(Date.now() - 16 * 86400000).toISOString(),
    investment_level: '$250k–$500k', liquid_cap_raw: '$290,000', location: 'Chicago, IL',
    score: 68, bucket: 'high_dollar', commissionEstimate: 3000,
    reasons: ['Lead submitted 16 days ago', 'Liquid capital: $290,000', 'High investment level indicated', '1 prior contact attempt'],
    nextAction: 'Priority call — outsized commission opportunity',
    ageDays: 16, isHighDollar: true, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-hd3', first_name: 'Christopher', last_name: 'Walsh',
    email: 'cwalsh@gmail.com', phone: '(404) 555-0812',
    ghl_contact_id: null, created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    investment_level: '$250k–$500k', liquid_cap_raw: '$280,000', location: 'Atlanta, GA',
    score: 72, bucket: 'high_dollar', commissionEstimate: 3000,
    reasons: ['Lead submitted 4 days ago', 'Liquid capital: $280,000', 'Viewed booking page 2×', 'No advisor contact on record'],
    nextAction: 'Priority call — outsized commission opportunity',
    ageDays: 4, isHighDollar: true, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },

  // ── HOT LEADS ─────────────────────────────────────────────────────────────
  {
    id: 'demo-h1', first_name: 'Marcus', last_name: 'Thompson',
    email: 'marcus.thompson@gmail.com', phone: '(512) 555-0192',
    ghl_contact_id: null, created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$150,000', location: 'Dallas, TX',
    score: 94, bucket: 'hot', commissionEstimate: 2400,
    reasons: ['Lead submitted 1 day ago', 'Liquid capital: $150,000', 'Viewed booking page 3×', 'No advisor contact on record'],
    nextAction: 'Call now — leads reached in 5 min are 21× more likely to book',
    ageDays: 1, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-h2', first_name: 'Jennifer', last_name: 'Caldwell',
    email: 'jcaldwell@outlook.com', phone: '(623) 555-0847',
    ghl_contact_id: null, created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    investment_level: '$100k–$150k', liquid_cap_raw: '$115,000', location: 'Phoenix, AZ',
    score: 79, bucket: 'hot', commissionEstimate: 2400,
    reasons: ['Lead submitted 2 days ago', 'Liquid capital: $115,000', 'Browsed available appointment slots', 'No advisor contact on record'],
    nextAction: 'Call now — leads reached in 5 min are 21× more likely to book',
    ageDays: 2, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: true, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-h3', first_name: 'David', last_name: 'Nguyen',
    email: 'dnguyen@email.com', phone: '(281) 555-0191',
    ghl_contact_id: null, created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$125,000', location: 'Houston, TX',
    score: 72, bucket: 'hot', commissionEstimate: 2400,
    reasons: ['Lead submitted 3 days ago — still in hot window', 'Liquid capital: $125,000', 'Viewed booking page 2×', 'No advisor contact on record'],
    nextAction: 'Call today — conversion drops ~8% per day of delay',
    ageDays: 3, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-h4', first_name: 'Angela', last_name: 'Rivera',
    email: 'a.rivera@company.com', phone: '(305) 555-0481',
    ghl_contact_id: null, created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    investment_level: '$100k–$200k', liquid_cap_raw: '$175,000', location: 'Miami, FL',
    score: 65, bucket: 'hot', commissionEstimate: 2400,
    reasons: ['Lead submitted 5 days ago — still in hot window', 'Liquid capital: $175,000', '1 prior contact attempt'],
    nextAction: 'Call today — conversion drops ~8% per day of delay',
    ageDays: 5, isHighDollar: false, isResurrection: false, callAttempts: 1, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
  {
    id: 'demo-h5', first_name: 'Robert', last_name: 'Kim',
    email: 'rob.kim@gmail.com', phone: '(737) 555-0334',
    ghl_contact_id: null, created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    investment_level: '$75k–$150k', liquid_cap_raw: '$95,000', location: 'Austin, TX',
    score: 58, bucket: 'hot', commissionEstimate: 2400,
    reasons: ['Lead submitted 6 days ago — still in hot window', 'Browsed available appointment slots', 'No advisor contact on record'],
    nextAction: 'Call today — conversion drops ~8% per day of delay',
    ageDays: 6, isHighDollar: false, isResurrection: false, callAttempts: 0, recentEngaged: false, hasBooking: false, noShowRecent: false,
  },
];

const DEMO_HERO = {
  totalOpportunity:         49200,
  recoverableAppointments:  3.3,
  totalLeads:               20,
  topLead:                  { name: 'Jordan Beck', score: 91 },
};

// ─── Demo advisor + feed data ─────────────────────────────────────────────────

const DEMO_ADVISOR_DATA = {
  advisors: [
    {
      rep: 'sarah.rep@franchisebook.com',
      calls: 52, connected: 19, booked: 9,
      voicemail: 14, no_answer: 19, not_interested: 7, follow_up: 3,
      convRate: 17, showRate: 78,
    },
    {
      rep: 'steve@sparksify.com',
      calls: 38, connected: 14, booked: 7,
      voicemail: 11, no_answer: 13, not_interested: 5, follow_up: 2,
      convRate: 18, showRate: 71,
    },
    {
      rep: 'john.advisor@franchisebook.com',
      calls: 29, connected: 8, booked: 2,
      voicemail: 10, no_answer: 11, not_interested: 5, follow_up: 1,
      convRate: 7, showRate: 50,
    },
  ],
};

const now_ = Date.now();
const DEMO_FEED_DATA = {
  events: [
    { id: 'fe1',  lead_name: 'Jordan Beck',       event_type: 'booking_page_viewed',      label: 'Viewed the booking page',         created_at: new Date(now_ - 3  * 60000).toISOString(),   rep_email: null },
    { id: 'fe2',  lead_name: 'Aisha Williams',     event_type: 'form_submitted',            label: 'Submitted inquiry form',           created_at: new Date(now_ - 4  * 3600000).toISOString(), rep_email: null },
    { id: 'fe3',  lead_name: 'Marcus Thompson',    event_type: 'prospect_call_booked',      label: 'Call — Booked!',                  created_at: new Date(now_ - 6  * 3600000).toISOString(), rep_email: 'sarah.rep@franchisebook.com' },
    { id: 'fe4',  lead_name: 'David Park',         event_type: 'booking_page_viewed',      label: 'Viewed the booking page',         created_at: new Date(now_ - 8  * 3600000).toISOString(), rep_email: null },
    { id: 'fe5',  lead_name: 'Robert Sterling',    event_type: 'slot_selected',             label: 'Selected an appointment slot',    created_at: new Date(now_ - 12 * 3600000).toISOString(), rep_email: null },
    { id: 'fe6',  lead_name: 'Jennifer Caldwell',  event_type: 'prospect_call_left_vm',    label: 'Call — Left voicemail',           created_at: new Date(now_ - 18 * 3600000).toISOString(), rep_email: 'steve@sparksify.com' },
    { id: 'fe7',  lead_name: 'Sarah Mitchell',     event_type: 'prospect_call_no_answer',  label: 'Call — No answer',                created_at: new Date(now_ - 22 * 3600000).toISOString(), rep_email: 'john.advisor@franchisebook.com' },
    { id: 'fe8',  lead_name: 'Linda Chen',         event_type: 'recommended_slot_shown',   label: 'Browsed available slots',         created_at: new Date(now_ - 26 * 3600000).toISOString(), rep_email: null },
    { id: 'fe9',  lead_name: 'Victoria Shah',      event_type: 'form_submitted',            label: 'Submitted inquiry form',           created_at: new Date(now_ - 30 * 3600000).toISOString(), rep_email: null },
    { id: 'fe10', lead_name: 'David Nguyen',       event_type: 'prospect_call_follow_up',  label: 'Call — Scheduled follow-up',      created_at: new Date(now_ - 36 * 3600000).toISOString(), rep_email: 'sarah.rep@franchisebook.com' },
    { id: 'fe11', lead_name: 'Michael Grant',      event_type: 'prospect_call_not_interested', label: 'Call — Not interested',       created_at: new Date(now_ - 48 * 3600000).toISOString(), rep_email: 'steve@sparksify.com' },
    { id: 'fe12', lead_name: 'Catherine Moore',    event_type: 'cq_email_sent',             label: 'CQ email sent',                   created_at: new Date(now_ - 60 * 3600000).toISOString(), rep_email: 'sarah.rep@franchisebook.com' },
    { id: 'fe13', lead_name: 'Sandra Torres',      event_type: 'booking_page_viewed',      label: 'Viewed the booking page',         created_at: new Date(now_ - 72 * 3600000).toISOString(), rep_email: null },
    { id: 'fe14', lead_name: 'William Brooks',     event_type: 'prospect_call_booked',      label: 'Call — Booked!',                  created_at: new Date(now_ - 84 * 3600000).toISOString(), rep_email: 'john.advisor@franchisebook.com' },
    { id: 'fe15', lead_name: 'Thomas Baker',       event_type: 'cq_received',               label: 'CQ returned',                     created_at: new Date(now_ - 96 * 3600000).toISOString(), rep_email: null },
  ],
};

const now__ = Date.now();
const DEMO_REVENUE_DATA = {
  totalRevenue:  156000,
  totalClosings: 5,
  totalMissed:   84000,
  missedCount:   12,
  closings: [
    { id: 'c1', lead_name: 'William Brooks',    advisor_email: 'sarah.rep@franchisebook.com',    bucket: 'high_dollar',   franchise_brand: 'Pilates Addiction',     commission: 42000, closed_at: new Date(now__ - 2  * 86400000).toISOString() },
    { id: 'c2', lead_name: 'Marcus Thompson',   advisor_email: 'steve@sparksify.com',            bucket: 'hot',           franchise_brand: 'Freecoat Nails',        commission: 28000, closed_at: new Date(now__ - 5  * 86400000).toISOString() },
    { id: 'c3', lead_name: 'Linda Chen',        advisor_email: 'sarah.rep@franchisebook.com',    bucket: 'resurrection',  franchise_brand: 'Club Pilates',          commission: 35000, closed_at: new Date(now__ - 9  * 86400000).toISOString() },
    { id: 'c4', lead_name: 'Jennifer Caldwell', advisor_email: 'john.advisor@franchisebook.com', bucket: 'near_miss',     franchise_brand: 'Sola Salons',           commission: 22000, closed_at: new Date(now__ - 14 * 86400000).toISOString() },
    { id: 'c5', lead_name: 'Thomas Baker',      advisor_email: 'steve@sparksify.com',            bucket: 'speed_to_lead', franchise_brand: 'The Joint Chiropractic',commission: 29000, closed_at: new Date(now__ - 21 * 86400000).toISOString() },
  ],
  missed: [
    { id: 'm1', lead_name: 'Erin Nakamura',   bucket: 'vip',           investment_level: '$500k+',      ageDays: 3.2,  missedEst: 3000 },
    { id: 'm2', lead_name: 'Gregory Hoffman', bucket: 'vip',           investment_level: '$250k–$500k', ageDays: 8.5,  missedEst: 3000 },
    { id: 'm3', lead_name: 'Priya Mehta',     bucket: 'speed_to_lead', investment_level: '$100k–$200k', ageDays: 0.2,  missedEst: 5250 },
    { id: 'm4', lead_name: 'Derek Cross',     bucket: 'vip',           investment_level: '$500k+',      ageDays: 12.1, missedEst: 3000 },
    { id: 'm5', lead_name: 'Rachel Kim',      bucket: 're_engaged',    investment_level: '$150k–$250k', ageDays: 22,   missedEst: 3750 },
  ],
};

function buildDemoData() {
  const buckets = { saves: [], speed_to_lead: [], vip: [], re_engaged: [], near_miss: [], resurrection: [], high_dollar: [], hot: [] };
  for (const l of DEMO_LEADS) {
    if (buckets[l.bucket]) buckets[l.bucket].push(l);
  }
  return {
    leads:   [...DEMO_LEADS].sort((a, b) => b.score - a.score),
    buckets,
    hero:    DEMO_HERO,
  };
}

// ─── Bucket config ────────────────────────────────────────────────────────────

const BUCKETS = {
  saves: {
    label: 'Appointment Saves', tagline: 'Rebook Rate',
    color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', iconBg: '#FEE2E2', icon: 'calendar',
    tooltip: 'No-shows from the last 7 days who booked but didn\'t show. Rebook rate is 22% when contacted the same day. These are the highest-priority calls — they already said yes once.',
  },
  speed_to_lead: {
    label: 'Speed to Lead', tagline: 'Call Immediately',
    color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD', iconBg: '#EDE9FE', icon: 'phone',
    tooltip: 'Leads submitted within the last 6 hours with no advisor contact yet. Research shows leads reached within 5 minutes are 21× more likely to book. Every minute matters here.',
  },
  vip: {
    label: 'VIP Leads', tagline: '$250k+ With Engagement',
    color: '#D97706', bg: '#FFF7ED', border: '#FDE68A', iconBg: '#FEF3C7', icon: 'star',
    tooltip: 'Leads with $250k+ liquid capital who are actively engaging — viewing the booking page, selecting slots, or returning to the site. These carry the highest commission potential and deserve your best advisor.',
  },
  re_engaged: {
    label: 'Re-Engaged', tagline: 'Active in Last 24h',
    color: '#0057FF', bg: '#EFF6FF', border: '#BFDBFE', iconBg: '#DBEAFE', icon: 'zap',
    tooltip: 'Leads that went quiet but just showed activity in the last 24 hours — visited the site, viewed the booking page, or selected a slot. This is a buying signal. Strike while they\'re warm again.',
  },
  near_miss: {
    label: 'Near Misses', tagline: 'Never Rescheduled',
    color: '#EA580C', bg: '#FFF7ED', border: '#FDBA74', iconBg: '#FFEDD5', icon: 'clock',
    tooltip: 'Leads who previously booked but never showed or rescheduled. They committed once, which means interest is real. A personal outreach with a new time slot converts these at a solid rate.',
  },
  resurrection: {
    label: 'Resurrections', tagline: '90+ Day Re-Engagement',
    color: '#6D28D9', bg: '#F3E8FF', border: '#C4B5FD', iconBg: '#EDE9FE', icon: 'refresh-cw',
    tooltip: 'Leads dormant for 90+ days who just re-engaged — viewed the booking page or returned to the site. Something changed in their life or circumstances. Reach out before they go dark again.',
  },
  high_dollar: {
    label: 'High Dollar', tagline: 'Premium Investment',
    color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', iconBg: '#DCFCE7', icon: 'gem',
    tooltip: 'Leads with $250k+ investment capacity — even without active engagement signals. These represent your largest commission opportunities. Worth a personal, unhurried call from your most experienced advisor.',
  },
  hot: {
    label: 'Hot Leads', tagline: 'Fresh & High-Scored',
    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', iconBg: '#FEE2E2', icon: 'flame',
    tooltip: 'Leads submitted in the last 7 days with a high opportunity score. They\'re fresh, engaged, and in their research phase. Conversion rates drop ~8% per day of delay — call today.',
  },
};

// ─── Bucket icons (flat SVG) ──────────────────────────────────────────────────

function BucketIcon({ name, color, bg, size = 34 }) {
  const ic = Math.round(size * 0.52);
  const p = { width: ic, height: ic, fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  let icon = null;
  if (name === 'calendar')   icon = <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'phone')      icon = <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
  if (name === 'star')       icon = <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
  if (name === 'zap')        icon = <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  if (name === 'clock')      icon = <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  if (name === 'refresh-cw') icon = <svg {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
  if (name === 'gem')        icon = <svg {...p}><polyline points="6 3 18 3 22 9 12 22 2 9"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="12" y1="3" x2="12" y2="9"/></svg>;
  if (name === 'flame')      icon = <svg {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
  );
}

// ─── Hero icons ───────────────────────────────────────────────────────────────

function HeroIcon({ name, size = 46 }) {
  const ic = Math.round(size * 0.44);
  const p = { width: ic, height: ic, fill: 'none', stroke: '#2563EB', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  const wrap = (child) => (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {child}
    </div>
  );
  const pp = { ...p, stroke: '#0057FF' };
  if (name === 'dollar')   return wrap(<svg {...pp}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>);
  if (name === 'calendar') return wrap(<svg {...pp}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
  if (name === 'users')    return wrap(<svg {...pp}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(s) {
  if (s >= 80) return { color: '#15803D', bg: '#DCFCE7' };
  if (s >= 60) return { color: '#B45309', bg: '#FEF3C7' };
  if (s >= 40) return { color: '#C2410C', bg: '#FFEDD5' };
  return           { color: '#B91C1C', bg: '#FEE2E2' };
}

function ageBadge(ageDays) {
  if (ageDays < 1)   return 'Today';
  if (ageDays <= 2)  return `${Math.round(ageDays * 24)}h`;
  if (ageDays < 30)  return `${ageDays}d`;
  if (ageDays < 365) return `${Math.round(ageDays / 30)}mo`;
  return `${Math.round(ageDays / 365)}yr`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 2)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days <= 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDollars(n) {
  if (!n) return '$0';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString()}`;
}

function copyToClipboard(text, setCopied) {
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  });
}

// ─── Sidebar line icons ───────────────────────────────────────────────────────
function SideIcon({ name }) {
  const p = { width: 17, height: 17, fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', style: { display: 'block' } };
  if (name === 'dashboard') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'leads')     return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name === 'clients')   return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === 'meetings')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  if (name === 'nurture')   return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
  if (name === 'calendar')  return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="12" y1="14" x2="12.01" y2="14"/><line x1="16" y1="14" x2="16.01" y2="14"/></svg>;
  if (name === 'settings')  return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (name === 'help')      return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const { data: session } = useSession();

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [demoMode,     setDemoMode]     = useState(false);
  const [view,         setView]         = useState('opportunities');
  const [activeBucket, setActiveBucket] = useState('all');
  const [queueMode,    setQueueMode]    = useState(false);
  const [queueIndex,   setQueueIndex]   = useState(0);
  const [dispositioned, setDispositioned] = useState(new Set());

  const [advisorData,    setAdvisorData]    = useState(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [feedData,       setFeedData]       = useState(null);
  const [feedLoading,    setFeedLoading]    = useState(false);
  const [revenueData,    setRevenueData]    = useState(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [period,         setPeriod]         = useState(30); // days: 7 | 30 | 90

  const loadData = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard/prospects')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function fetchAdvisorData(days) {
    setAdvisorLoading(true);
    fetch(`/api/dashboard/advisor-stats?days=${days}`)
      .then(r => r.json())
      .then(d => { setAdvisorData(d); setAdvisorLoading(false); })
      .catch(() => setAdvisorLoading(false));
  }
  function fetchFeedData(days) {
    setFeedLoading(true);
    fetch(`/api/dashboard/activity-feed?days=${days}`)
      .then(r => r.json())
      .then(d => { setFeedData(d); setFeedLoading(false); })
      .catch(() => setFeedLoading(false));
  }
  function fetchRevenueData(days) {
    setRevenueLoading(true);
    fetch(`/api/dashboard/revenue-attribution?days=${days}`)
      .then(r => r.json())
      .then(d => { setRevenueData(d); setRevenueLoading(false); })
      .catch(() => setRevenueLoading(false));
  }

  function switchView(newView) {
    setView(newView);
    setQueueMode(false);
    if (newView === 'advisor') {
      if (demoMode) setAdvisorData(DEMO_ADVISOR_DATA);
      else if (!advisorData && !advisorLoading) fetchAdvisorData(period);
    }
    if (newView === 'feed') {
      if (demoMode) setFeedData(DEMO_FEED_DATA);
      else if (!feedData && !feedLoading) fetchFeedData(period);
    }
    if (newView === 'revenue') {
      if (demoMode) setRevenueData(DEMO_REVENUE_DATA);
      else if (!revenueData && !revenueLoading) fetchRevenueData(period);
    }
  }

  function changePeriod(days) {
    setPeriod(days);
    if (demoMode) return;
    if (view === 'advisor') { setAdvisorData(null); fetchAdvisorData(days); }
    if (view === 'feed')    { setFeedData(null);    fetchFeedData(days); }
    if (view === 'revenue') { setRevenueData(null); fetchRevenueData(days); }
  }

  function toggleDemo(on) {
    setDemoMode(on);
    setQueueMode(false);
    setQueueIndex(0);
    setDispositioned(new Set());
    setActiveBucket('all');
    if (on) {
      setData(buildDemoData());
      setAdvisorData(DEMO_ADVISOR_DATA);
      setFeedData(DEMO_FEED_DATA);
      setRevenueData(DEMO_REVENUE_DATA);
    } else {
      loadData();
      setAdvisorData(null);
      setFeedData(null);
      setRevenueData(null);
    }
  }

  const displayData     = demoMode ? buildDemoData()      : data;
  const displayAdvisor  = demoMode ? DEMO_ADVISOR_DATA    : advisorData;
  const displayFeed     = demoMode ? DEMO_FEED_DATA       : feedData;
  const displayRevenue  = demoMode ? DEMO_REVENUE_DATA    : revenueData;
  const advisorSpinning = !demoMode && advisorLoading;
  const feedSpinning    = !demoMode && feedLoading;
  const revenueSpinning = !demoMode && revenueLoading;
  const hero            = displayData?.hero || null;

  const visibleLeads = !displayData ? [] : (
    activeBucket === 'all'
      ? displayData.leads
      : (displayData.buckets[activeBucket] || [])
  ).filter(l => !dispositioned.has(l.id));

  const totalCount = displayData
    ? Object.values(displayData.buckets).reduce((s, b) => s + b.length, 0)
    : 0;

  function startQueue(bucket) {
    if (bucket && bucket !== 'all') setActiveBucket(bucket);
    setQueueIndex(0);
    setQueueMode(true);
  }

  function onDisposition(leadId, disp, note) {
    fetch('/api/dashboard/prospect-disposition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, disposition: disp, notes: note || '' }),
    });
    setDispositioned(prev => new Set([...prev, leadId]));
    setQueueIndex(i => i + 1);
  }

  function onSkip(leadId) {
    fetch('/api/dashboard/prospect-disposition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, disposition: 'skipped' }),
    });
    setQueueIndex(i => i + 1);
  }

  const queueLeads  = visibleLeads;
  const currentLead = queueMode ? queueLeads[queueIndex] : null;
  const queueDone   = queueMode && queueIndex >= queueLeads.length;
  const today       = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <Head><title>Prospecting — FranchiseBook</title></Head>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        * { box-sizing: border-box }
        button:hover { opacity: .85 }
      `}</style>

      {/* ── Full-page queue overlay — covers header + everything ── */}
      {queueMode && !queueDone && currentLead && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#F3F4F6', overflow: 'auto' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 20px 60px' }}>
          <QueueCard
            lead={currentLead}
            index={queueIndex}
            total={queueLeads.length}
            bucketConfig={BUCKETS[currentLead.bucket]}
            onDisposition={(disp, note) => onDisposition(currentLead.id, disp, note)}
            onSkip={() => onSkip(currentLead.id)}
            onBack={() => { setQueueMode(false); setQueueIndex(0); }}
          />
          </div>
        </div>
      )}
      {queueMode && queueDone && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={s.queueDoneCard}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#15803D', marginBottom: 4 }}>Queue complete</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>You worked through {queueLeads.length} lead{queueLeads.length !== 1 ? 's' : ''} this session.</div>
            <button style={s.startProspectingBtn} onClick={() => { setQueueMode(false); setQueueIndex(0); }}>← Back to list</button>
          </div>
        </div>
      )}

      <div style={s.page}>
        {/* ── White Sidebar ── */}
        <aside style={s.sidebar}>
          <div style={s.sideLogoWrap}>
            <div style={s.sideLogoRow}>
              <div style={s.sideLogoIcon}>F</div>
              <span style={s.sideLogoText}>FranchiseBook</span>
            </div>
          </div>
          <nav style={s.sideNav}>
            {[
              { href: '/dashboard/analytics', label: 'Dashboard',    icon: 'dashboard' },
              { href: '/dashboard/leads',     label: 'Leads',        icon: 'leads' },
              { href: '/dashboard/prospects', label: 'Prospecting',  icon: 'clients', active: true },
              { href: '/dashboard/bookings',  label: 'Meetings',     icon: 'meetings' },
              { href: '/dashboard/nurture',   label: 'Nurture',      icon: 'nurture' },
              { href: '/dashboard/settings',  label: 'Settings',     icon: 'settings' },
            ].map(({ href, label, icon, active }) => (
              <Link key={label} href={href} style={{ ...s.sideNavItem, ...(active ? s.sideNavItemActive : {}) }}>
                <span style={{ color: active ? '#0057FF' : '#9CA3AF', display: 'flex', alignItems: 'center' }}>
                  <SideIcon name={icon} />
                </span>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div style={s.sideBottom}>
            <div style={s.sideHelpRow}>
              <span style={{ color: '#9CA3AF', display: 'flex' }}><SideIcon name="help" /></span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Help</span>
            </div>
            <div style={s.sideUserRow}>
              <div style={s.sideUserAvatar}>{(session?.user?.email?.[0] || 'U').toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {session?.user?.name || session?.user?.email?.split('@')[0] || 'User'}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Rep</div>
              </div>
              <span style={{ color: '#9CA3AF', fontSize: 14 }}>›</span>
            </div>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={s.main}>
          {/* Top bar */}
          <div style={s.topBar}>
            <div>
              <div style={s.topTitle}>Prospecting Opportunities</div>
              <div style={s.topDate}>{today}</div>
            </div>
            <div style={s.topActions}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: demoMode ? '#FEF3C7' : '#F3F4F6', border: `1px solid ${demoMode ? '#FCD34D' : '#E5E7EB'}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}
                onClick={() => toggleDemo(!demoMode)}
              >
                <div style={{ position: 'relative', width: 32, height: 18, borderRadius: 9, background: demoMode ? '#D97706' : '#D1D5DB', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 2, left: demoMode ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .18s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: demoMode ? '#92400E' : '#6B7280', whiteSpace: 'nowrap' }}>
                  {demoMode ? 'Demo ON' : 'Demo data'}
                </span>
              </div>
              {!demoMode && <button style={s.topBtn} onClick={loadData}>↻ Refresh</button>}
            </div>
          </div>

          {/* Body */}
          <div style={s.body}>
          {(loading && !demoMode) ? (
            <div style={s.loadingWrap}><div style={s.spinner} /><div style={s.loadingText}>Scoring leads…</div></div>
          ) : (
            <>
              {/* Hero section */}
              {hero && (
                <div style={s.heroCard}>
                  <div style={s.heroMetrics}>
                    <div style={s.heroMetric}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <HeroIcon name="dollar" size={48} />
                        <div>
                          <div style={s.heroValue}>{fmtDollars(hero.totalOpportunity)}</div>
                          <div style={s.heroLabel}>Commission Opportunity</div>
                          <div style={s.heroSub}>Based on historical conv. rates</div>
                        </div>
                      </div>
                    </div>
                    <div style={s.heroDivider} />
                    <div style={s.heroMetric}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <HeroIcon name="calendar" size={48} />
                        <div>
                          <div style={s.heroValue}>{hero.recoverableAppointments}</div>
                          <div style={s.heroLabel}>Appointments Recoverable</div>
                          <div style={s.heroSub}>Estimated today</div>
                        </div>
                      </div>
                    </div>
                    <div style={s.heroDivider} />
                    <div style={s.heroMetric}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <HeroIcon name="users" size={48} />
                        <div>
                          <div style={s.heroValue}>{hero.totalLeads}</div>
                          <div style={s.heroLabel}>Leads Requiring Contact</div>
                          <div style={s.heroSub}>{dispositioned.size > 0 ? `${dispositioned.size} worked this session` : 'Sorted by opportunity score'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* View tabs + period selector */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #E8EAED', marginBottom: 16 }}>
                <div style={{ display: 'flex' }}>
                  {[['opportunities', 'Revenue Opportunities'], ['advisor', 'Advisor Performance'], ['feed', 'Activity Feed'], ['revenue', 'Revenue Attribution']].map(([key, label]) => (
                    <button key={key} onClick={() => switchView(key)} style={{ ...s.viewTab, ...(view === key ? s.viewTabActive : {}) }}>
                      {label}
                    </button>
                  ))}
                </div>
                {view !== 'opportunities' && (
                  <div style={{ display: 'flex', gap: 2, background: '#F3F4F6', borderRadius: 6, padding: 3, marginBottom: 2, flexShrink: 0 }}>
                    {[7, 30, 90].map(d => (
                      <button
                        key={d}
                        onClick={() => changePeriod(d)}
                        style={{ padding: '4px 13px', fontSize: 12, fontWeight: period === d ? 700 : 500, color: period === d ? '#111827' : '#6B7280', background: period === d ? '#fff' : 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', boxShadow: period === d ? '0 1px 2px rgba(0,0,0,.07)' : 'none', transition: 'all .15s' }}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Opportunities view ──────────────────────────────────────── */}
              {view === 'opportunities' && (
                <>
                  {/* 8 bucket cards — hidden when in queue focus mode */}
                  {!queueMode && <div style={s.bucketGrid}>
                    {Object.entries(BUCKETS).map(([key, bc]) => {
                      const leads      = (displayData?.buckets || {})[key] || [];
                      const opportunity = leads.reduce((s, l) => s + (l.commissionEstimate || 0), 0);
                      const isActive   = activeBucket === key;
                      return (
                        <div
                          key={key}
                          onClick={() => { setActiveBucket(key); setQueueMode(false); }}
                          style={{ ...s.bucketCard, borderLeftColor: bc.color, background: isActive ? bc.bg : '#fff', outline: isActive ? `1.5px solid ${bc.border}` : 'none', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                            <BucketIcon name={bc.icon} color={bc.color} bg={bc.iconBg} size={34} />
                            <div style={{ fontSize: 10, fontWeight: 700, color: bc.color, textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.3 }}>{bc.tagline}</div>
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 800, color: leads.length ? '#111827' : '#D1D5DB', lineHeight: 1, marginBottom: 2 }}>{leads.length}</div>
                          <div
                            style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8, cursor: 'help' }}
                            title={bc.tooltip}
                          >
                            {bc.label} <span style={{ fontSize: 9, color: bc.color, opacity: 0.7 }}>ⓘ</span>
                          </div>
                          {leads.length > 0 ? (
                            <div style={{ fontSize: 11, fontWeight: 700, color: bc.color }}>{fmtDollars(opportunity)} est. opportunity</div>
                          ) : (
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>None right now</div>
                          )}
                          {leads.length > 0 && (
                            <button onClick={e => { e.stopPropagation(); startQueue(key); }} style={{ ...s.bucketStartBtn, borderColor: bc.border, color: bc.color }}>
                              Start Prospecting →
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>}

                  {/* Filter tabs */}
                  {!queueMode && (
                    <div style={s.tabRow}>
                      <div style={s.tabs}>
                        {[['all', 'All', totalCount], ...Object.entries(BUCKETS).map(([k, b]) => [k, b.label, ((displayData?.buckets || {})[k] || []).length])].map(([key, label, count]) => (
                          <button key={key} onClick={() => setActiveBucket(key)} style={{ ...s.tab, ...(activeBucket === key ? s.tabActive : {}) }}>
                            {label} <span style={{ fontSize: 11, opacity: .7 }}>({count})</span>
                          </button>
                        ))}
                      </div>
                      {visibleLeads.length > 0 && (
                        <button style={s.startProspectingBtn} onClick={() => startQueue(activeBucket)}>Start Prospecting</button>
                      )}
                    </div>
                  )}

                  {/* Lead table */}
                  {!queueMode && (
                    <div style={s.tableWrap}>
                      {visibleLeads.length === 0 ? (
                        <div style={s.empty}>
                          {activeBucket === 'all' ? 'No active leads to show.' : `No leads in ${BUCKETS[activeBucket]?.label || activeBucket} right now.`}
                        </div>
                      ) : (
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.th}>Score</th>
                              <th style={s.th}>Lead</th>
                              <th style={s.th}>Why This Lead</th>
                              <th style={s.th}>Next Action</th>
                              <th style={s.th}>Bucket</th>
                              <th style={s.th}>Age</th>
                              <th style={{ ...s.th, textAlign: 'right' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleLeads.map((lead, i) => {
                              const sc = scoreColor(lead.score);
                              const bc = BUCKETS[lead.bucket];
                              return (
                                <tr key={lead.id} style={{ background: i % 2 ? '#fff' : '#F9FAFB', cursor: 'pointer' }} onClick={() => { setQueueIndex(i); setQueueMode(true); }}>
                                  <td style={s.td}>
                                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 12, fontWeight: 800, color: sc.color, background: sc.bg, minWidth: 36, textAlign: 'center' }}>{lead.score}</span>
                                  </td>
                                  <td style={s.td}>
                                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>{lead.first_name} {lead.last_name}</div>
                                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{lead.location || lead.email}</div>
                                  </td>
                                  <td style={{ ...s.td, maxWidth: 220 }}>
                                    {(lead.reasons || []).slice(0, 2).map((r, ri) => (
                                      <div key={ri} style={{ display: 'flex', gap: 5, fontSize: 11, color: '#374151', lineHeight: 1.5 }}>
                                        <span style={{ color: '#D1D5DB', flexShrink: 0 }}>·</span>
                                        <span>{r}</span>
                                      </div>
                                    ))}
                                  </td>
                                  <td style={{ ...s.td, maxWidth: 200 }}>
                                    <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.4 }}>{lead.nextAction || '—'}</div>
                                  </td>
                                  <td style={s.td}>
                                    {bc && <span style={{ fontSize: 10, fontWeight: 600, color: bc.color, background: bc.bg, border: `1px solid ${bc.border}`, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{bc.label}</span>}
                                  </td>
                                  <td style={s.td}>
                                    <span style={{ fontSize: 12, color: lead.ageDays <= 2 ? '#D97706' : '#6B7280', fontWeight: lead.ageDays <= 2 ? 700 : 400 }}>{ageBadge(lead.ageDays)}</span>
                                  </td>
                                  <td style={{ ...s.td, textAlign: 'right' }}>
                                    <button style={s.openBtn} onClick={e => { e.stopPropagation(); setQueueIndex(i); setQueueMode(true); }}>Open →</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Advisor Performance view ─────────────────────────────────── */}
              {view === 'advisor' && (
                <div style={{ animation: 'fadeIn .2s ease' }}>
                  {advisorSpinning ? (
                    <div style={s.loadingWrap}><div style={s.spinner} /></div>
                  ) : !displayAdvisor?.advisors?.length ? (
                    <div style={s.emptyCard}>
                      <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No advisor data yet</div>
                      <div style={{ fontSize: 13, color: '#9CA3AF' }}>Start prospecting to build call history. Metrics appear here after the first call disposition is logged.</div>
                    </div>
                  ) : (
                    <>
                      <AdvisorKPIs advisors={displayAdvisor.advisors} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <VolumeChart advisors={displayAdvisor.advisors} />
                        <ConvRateChart advisors={displayAdvisor.advisors} />
                      </div>
                      <OutcomeChart advisors={displayAdvisor.advisors} />
                      <div style={s.tableWrap}>
                        <table style={s.table}>
                          <thead>
                            <tr>
                              <th style={s.th}>Advisor</th>
                              <th style={s.th}>Calls</th>
                              <th style={s.th}>Connected</th>
                              <th style={s.th}>Booked</th>
                              <th style={s.th}>Conv %</th>
                              <th style={s.th}>Voicemails</th>
                              <th style={s.th}>No Answer</th>
                              <th style={s.th}>Show Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayAdvisor.advisors.map((a, i) => (
                              <tr key={a.rep} style={{ background: i % 2 ? '#fff' : '#F9FAFB' }}>
                                <td style={s.td}><div style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>{repLabel(a.rep)}</div></td>
                                <td style={s.td}>{a.calls}</td>
                                <td style={s.td}>{a.connected}</td>
                                <td style={{ ...s.td, fontWeight: 700, color: a.booked > 0 ? '#15803D' : '#111827' }}>{a.booked}</td>
                                <td style={s.td}>
                                  <span style={{ fontWeight: 700, color: a.convRate >= 10 ? '#15803D' : a.convRate >= 5 ? '#B45309' : '#DC2626' }}>{a.convRate}%</span>
                                </td>
                                <td style={{ ...s.td, color: '#6B7280' }}>{a.voicemail}</td>
                                <td style={{ ...s.td, color: '#6B7280' }}>{a.no_answer}</td>
                                <td style={s.td}>{a.showRate != null ? `${a.showRate}%` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* AI Coach */}
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 }}>AI Coach</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
                          {generateCoachInsights(displayAdvisor.advisors).map(insight => {
                            const sColor  = insight.status === 'strong' ? '#15803D' : insight.status === 'needs_attention' ? '#DC2626' : '#B45309';
                            const sBg     = insight.status === 'strong' ? '#F0FDF4' : insight.status === 'needs_attention' ? '#FEF2F2' : '#FFFBEB';
                            const sBorder = insight.status === 'strong' ? '#BBF7D0' : insight.status === 'needs_attention' ? '#FECACA' : '#FCD34D';
                            const sLabel  = insight.status === 'strong' ? '⭐ Top performer' : insight.status === 'needs_attention' ? '⚠ Needs attention' : '📈 Developing';
                            return (
                              <div key={insight.rep} style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '16px 18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                  <div style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{repLabel(insight.rep)}</div>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: sColor, background: sBg, border: `1px solid ${sBorder}`, borderRadius: 4, padding: '2px 8px' }}>{sLabel}</span>
                                </div>
                                {insight.strengths.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Strengths</div>
                                    {insight.strengths.map((str, i) => (
                                      <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, display: 'flex', gap: 6 }}>
                                        <span style={{ color: '#22C55E', flexShrink: 0 }}>+</span>{str}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {insight.issues.length > 0 && (
                                  <div style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Issues</div>
                                    {insight.issues.map((iss, i) => (
                                      <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, display: 'flex', gap: 6 }}>
                                        <span style={{ color: '#EF4444', flexShrink: 0 }}>−</span>{iss}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {insight.tips.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tip</div>
                                    {insight.tips.map((tip, i) => (
                                      <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, display: 'flex', gap: 6 }}>
                                        <span style={{ color: '#60A5FA', flexShrink: 0 }}>→</span>{tip}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Activity Feed view ───────────────────────────────────────── */}
              {view === 'feed' && (
                <div style={{ animation: 'fadeIn .2s ease' }}>
                  <div style={{ marginBottom: 14, fontSize: 13, color: '#6B7280' }}>Lead activity — last 7 days</div>
                  {feedSpinning ? (
                    <div style={s.loadingWrap}><div style={s.spinner} /></div>
                  ) : !displayFeed?.events?.length ? (
                    <div style={s.emptyCard}>
                      <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No recent activity</div>
                      <div style={{ fontSize: 13, color: '#9CA3AF' }}>Lead events from the last 7 days appear here as they happen.</div>
                    </div>
                  ) : (
                    <div style={s.feedWrap}>
                      {displayFeed.events.map((e, i) => {
                        const isBooked = e.event_type === 'prospect_call_booked';
                        const isCall   = e.event_type.startsWith('prospect_call_');
                        const dotColor = isBooked ? '#15803D' : isCall ? '#374151' : '#0369A1';
                        return (
                          <div key={e.id || i} style={s.feedItem}>
                            <div style={{ ...s.feedDot, background: dotColor }} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>{e.lead_name}</span>
                              <span style={{ color: '#6B7280', fontSize: 13 }}> — {e.label}</span>
                              {e.rep_email && <span style={{ color: '#9CA3AF', fontSize: 11, marginLeft: 8 }}>by {e.rep_email}</span>}
                              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{fmtDate(e.created_at)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Revenue Attribution view ─────────────────────────────────── */}
              {view === 'revenue' && (
                <div style={{ animation: 'fadeIn .2s ease' }}>
                  {revenueSpinning ? (
                    <div style={s.loadingWrap}><div style={s.spinner} /></div>
                  ) : (
                    <>
                      {/* KPI row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                        <div style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '18px 20px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Revenue Attributed (30d)</div>
                          <div style={{ fontSize: 34, fontWeight: 900, color: '#15803D', lineHeight: 1.1 }}>{fmtDollars(displayRevenue?.totalRevenue || 0)}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{displayRevenue?.totalClosings || 0} closed deals</div>
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '18px 20px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Avg Per Close</div>
                          <div style={{ fontSize: 34, fontWeight: 900, color: '#111827', lineHeight: 1.1 }}>
                            {displayRevenue?.totalClosings ? fmtDollars(Math.round((displayRevenue.totalRevenue || 0) / displayRevenue.totalClosings)) : '—'}
                          </div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Across all advisors</div>
                        </div>
                        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '18px 20px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>Missed Revenue (30d)</div>
                          <div style={{ fontSize: 34, fontWeight: 900, color: '#DC2626', lineHeight: 1.1 }}>{fmtDollars(displayRevenue?.totalMissed || 0)}</div>
                          <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{displayRevenue?.missedCount || displayRevenue?.missed?.length || 0} high-value leads, no contact</div>
                        </div>
                      </div>

                      {/* Attribution feed */}
                      {displayRevenue?.closings?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 8 }}>Revenue Attributed — Last 30 Days</div>
                          <div style={s.tableWrap}>
                            {displayRevenue.closings.map(c => {
                              const bc = BUCKETS[c.bucket];
                              return (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                      <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{c.lead_name}</span>
                                      {bc && <span style={{ fontSize: 10, fontWeight: 600, color: bc.color, background: bc.bg, border: `1px solid ${bc.border}`, borderRadius: 4, padding: '2px 7px' }}>{bc.label}</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B7280', flexWrap: 'wrap' }}>
                                      <span style={{ background: '#F3F4F6', borderRadius: 3, padding: '2px 7px', color: '#374151' }}>{bc?.label || c.bucket}</span>
                                      <span style={{ color: '#D1D5DB' }}>→</span>
                                      <span>Called by <strong style={{ color: '#374151' }}>{repLabel(c.advisor_email)}</strong></span>
                                      <span style={{ color: '#D1D5DB' }}>→</span>
                                      <span>Booked</span>
                                      <span style={{ color: '#D1D5DB' }}>→</span>
                                      <span style={{ fontWeight: 700, color: '#15803D' }}>Closed</span>
                                    </div>
                                    {c.franchise_brand && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Franchise: {c.franchise_brand}</div>}
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 24, fontWeight: 900, color: '#15803D' }}>{fmtDollars(c.commission)}</div>
                                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{fmtDate(c.closed_at)}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Missed revenue */}
                      {(displayRevenue?.missed?.length > 0 || displayRevenue?.totalMissed > 0) && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>Missed Revenue This Month</div>
                            <div style={{ fontSize: 12, color: '#9CA3AF' }}>High-value leads that received no advisor contact</div>
                          </div>
                          <div style={{ background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 6, overflow: 'hidden' }}>
                            {(displayRevenue.missed || []).map(m => {
                              const bc = BUCKETS[m.bucket];
                              return (
                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', borderBottom: '1px solid #FEE2E2' }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.lead_name}</span>
                                      {bc && <span style={{ fontSize: 10, fontWeight: 600, color: bc.color, background: bc.bg, border: `1px solid ${bc.border}`, borderRadius: 4, padding: '2px 6px' }}>{bc.label}</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                                      {m.investment_level && `${m.investment_level} · `}
                                      {m.ageDays < 1 ? `${Math.round(m.ageDays * 24)}h old` : `${m.ageDays}d old`} · No contact recorded
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 17, fontWeight: 800, color: '#DC2626' }}>−{fmtDollars(m.missedEst)}</div>
                                    <div style={{ fontSize: 10, color: '#EF4444' }}>est. missed</div>
                                  </div>
                                </div>
                              );
                            })}
                            {(displayRevenue.missedCount || 0) > (displayRevenue.missed?.length || 0) && (
                              <div style={{ padding: '10px 20px', fontSize: 12, color: '#B91C1C', background: '#FEE2E2', textAlign: 'center', fontWeight: 600 }}>
                                +{(displayRevenue.missedCount || 0) - (displayRevenue.missed?.length || 0)} more missed leads — total estimated {fmtDollars(displayRevenue.totalMissed)} missed this month
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {!displayRevenue?.closings?.length && !displayRevenue?.missed?.length && (
                        <div style={s.emptyCard}>
                          <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>No revenue data yet</div>
                          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Mark deals as closed from the prospecting queue to start tracking attributed revenue.</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Advisor chart components ─────────────────────────────────────────────────

function repLabel(email) {
  return email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function generateCoachInsights(advisors) {
  if (!advisors?.length) return [];
  const teamAvgConv = advisors.reduce((s, a) => s + a.convRate, 0) / advisors.length;
  const showAdv     = advisors.filter(a => a.showRate != null);
  const teamAvgShow = showAdv.length ? showAdv.reduce((s, a) => s + a.showRate, 0) / showAdv.length : null;
  const topConv     = Math.max(...advisors.map(a => a.convRate));
  const topShow     = showAdv.length ? Math.max(...showAdv.map(a => a.showRate)) : null;

  return advisors.map(a => {
    const strengths = [], issues = [], tips = [];

    if (a.convRate >= teamAvgConv * 1.2)
      strengths.push(`${a.convRate}% conv rate — ${Math.round(a.convRate - teamAvgConv)}pts above team avg`);
    else if (a.convRate < teamAvgConv * 0.7)
      issues.push(`${a.convRate}% conv rate — ${Math.round(teamAvgConv - a.convRate)}pts below team avg (${Math.round(teamAvgConv)}%)`);

    if (teamAvgShow != null && a.showRate != null) {
      if (a.showRate >= teamAvgShow * 1.1)
        strengths.push(`Highest show rate on team (${a.showRate}%)`);
      else if (a.showRate < teamAvgShow * 0.8)
        issues.push(`Show rate ${a.showRate}% — below team avg (${Math.round(teamAvgShow)}%)`);
    }

    const naRate = a.calls > 0 ? Math.round(a.no_answer / a.calls * 100) : 0;
    if (naRate > 40) issues.push(`${naRate}% no-answer rate — try calling 10–11am and 6–7pm for higher pickup`);

    const vmRate = a.calls > 0 ? Math.round(a.voicemail / a.calls * 100) : 0;
    if (vmRate > 30 && a.convRate < teamAvgConv) tips.push('Pair voicemails with same-day SMS — 2× callback rate');

    if (a.booked === Math.max(...advisors.map(x => x.booked)))
      strengths.push(`Team leader in appointments booked (${a.booked})`);

    if (a.calls > 30 && a.connected / a.calls < 0.25)
      tips.push('Low contact rate — prioritize speed-to-lead leads within 5 min of form submit');

    if (a.convRate === topConv) tips.push('Assign first pick of VIP and Re-Engaged leads');
    if (topShow != null && a.showRate === topShow) tips.push('High show rate — ideal for near-miss and resurrection outreach');
    if (strengths.length === 0 && issues.length === 0) tips.push('Consistent performer — increase volume to compound results');

    const status = issues.length >= 2 ? 'needs_attention'
      : strengths.length >= 1        ? 'strong'
      : 'developing';

    return { rep: a.rep, status, strengths, issues, tips };
  });
}

function AdvisorKPIs({ advisors }) {
  const totalCalls  = advisors.reduce((s, a) => s + a.calls, 0);
  const totalBooked = advisors.reduce((s, a) => s + a.booked, 0);
  const teamConv    = totalCalls > 0 ? Math.round(totalBooked / totalCalls * 100) : 0;
  const showAdv     = advisors.filter(a => a.showRate != null);
  const avgShow     = showAdv.length ? Math.round(showAdv.reduce((s, a) => s + a.showRate, 0) / showAdv.length) : null;
  const kpis = [
    { label: 'Total Calls (30d)',      value: totalCalls,                   color: '#111827' },
    { label: 'Appointments Booked',    value: totalBooked,                  color: '#15803D' },
    { label: 'Team Conv Rate',         value: `${teamConv}%`,               color: teamConv >= 10 ? '#15803D' : teamConv >= 5 ? '#B45309' : '#DC2626' },
    { label: 'Avg Show Rate',          value: avgShow != null ? `${avgShow}%` : '—', color: '#374151' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
      {kpis.map(k => (
        <div key={k.label} style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '16px 18px' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1.1, marginBottom: 5 }}>{k.value}</div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

function VolumeChart({ advisors }) {
  const W = 480, H = 220;
  const ml = 16, mr = 16, mt = 24, mb = 60;
  const cw = W - ml - mr, ch = H - mt - mb;
  const maxVal = Math.max(...advisors.map(a => a.calls), 1);
  const barsConfig = [
    { key: 'calls',     label: 'Calls',     color: '#CBD5E1' },
    { key: 'connected', label: 'Connected', color: '#60A5FA' },
    { key: 'booked',    label: 'Booked',    color: '#22C55E' },
  ];
  const groupW = cw / advisors.length;
  const barW = Math.min(24, groupW / 4.5);
  const barSpacing = barW + 5;
  const groupBarsW = barsConfig.length * barSpacing - 5;

  return (
    <div style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '16px 20px 8px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Call Volume Funnel</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Calls → Connected → Booked, last 30 days</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const y = mt + (1 - frac) * ch;
          const val = Math.round(frac * maxVal);
          return (
            <g key={frac}>
              <line x1={ml} y1={y} x2={ml + cw} y2={y} stroke={frac === 0 ? '#E5E7EB' : '#F3F4F6'} strokeWidth={1} />
              <text x={ml - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#9CA3AF">{val}</text>
            </g>
          );
        })}
        {advisors.map((a, gi) => {
          const gx = ml + gi * groupW + (groupW - groupBarsW) / 2;
          return (
            <g key={a.rep}>
              {barsConfig.map((bc, bi) => {
                const val = a[bc.key] || 0;
                const bh = (val / maxVal) * ch;
                const x = gx + bi * barSpacing;
                const y = mt + ch - bh;
                return (
                  <g key={bc.key}>
                    <rect x={x} y={y} width={barW} height={Math.max(bh, 2)} fill={bc.color} rx={2} />
                    {val > 0 && <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight="700" fill={bc.color}>{val}</text>}
                  </g>
                );
              })}
              <text x={gx + groupBarsW / 2} y={mt + ch + 16} textAnchor="middle" fontSize={11} fontWeight="600" fill="#374151">
                {repLabel(a.rep).split(' ')[0]}
              </text>
              <text x={gx + groupBarsW / 2} y={mt + ch + 30} textAnchor="middle" fontSize={9} fill="#9CA3AF">
                {repLabel(a.rep).split(' ').slice(1).join(' ')}
              </text>
            </g>
          );
        })}
        {barsConfig.map((bc, i) => (
          <g key={bc.key} transform={`translate(${ml + i * 90}, ${H - 10})`}>
            <rect y={-8} width={10} height={10} fill={bc.color} rx={1} />
            <text x={13} y={1} fontSize={9} fill="#6B7280">{bc.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ConvRateChart({ advisors }) {
  const W = 460, H = 210;
  const ml = 82, mr = 70, mt = 20, mb = 34;
  const cw = W - ml - mr, ch = H - mt - mb;
  const rows = advisors.length;
  const rowH = ch / rows;
  const MAX_CONV = 25;

  return (
    <div style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '16px 20px 8px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Conversion & Show Rates</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Conv rate (solid) · Show rate (blue) · 0–25% scale</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {[0, 5, 10, 15, 20, 25].map(pct => {
          const x = ml + (pct / MAX_CONV) * cw;
          return (
            <g key={pct}>
              <line x1={x} y1={mt} x2={x} y2={mt + ch} stroke={pct === 0 ? '#D1D5DB' : '#F3F4F6'} strokeWidth={1} />
              <text x={x} y={mt + ch + 14} textAnchor="middle" fontSize={9} fill="#9CA3AF">{pct}%</text>
            </g>
          );
        })}
        {advisors.map((a, i) => {
          const topY    = mt + i * rowH + rowH * 0.08;
          const convH   = rowH * 0.36;
          const showH   = rowH * 0.22;
          const showY   = topY + convH + rowH * 0.08;
          const convW   = Math.min(1, a.convRate / MAX_CONV) * cw;
          const showW   = a.showRate != null ? Math.min(1, a.showRate / 100) * cw : 0;
          const convColor = a.convRate >= 10 ? '#15803D' : a.convRate >= 5 ? '#D97706' : '#DC2626';
          return (
            <g key={a.rep}>
              <text x={ml - 8} y={topY + convH / 2 + 4} textAnchor="end" fontSize={10} fontWeight="600" fill="#374151">
                {repLabel(a.rep).split(' ')[0]}
              </text>
              <rect x={ml} y={topY} width={cw} height={convH} fill="#F3F4F6" rx={3} />
              <rect x={ml} y={topY} width={convW} height={convH} fill={convColor} rx={3} />
              <text x={ml + convW + 6} y={topY + convH / 2 + 5} fontSize={13} fontWeight="800" fill={convColor}>{a.convRate}%</text>
              {a.showRate != null && (
                <>
                  <rect x={ml} y={showY} width={cw} height={showH} fill="#F3F4F6" rx={2} />
                  <rect x={ml} y={showY} width={showW} height={showH} fill="#60A5FA" rx={2} />
                  <text x={ml + showW + 6} y={showY + showH / 2 + 3} fontSize={10} fill="#3B82F6">{a.showRate}% show</text>
                </>
              )}
            </g>
          );
        })}
        <g transform={`translate(${ml}, ${H - 6})`}>
          <rect y={-8} width={10} height={10} fill="#15803D" rx={1} />
          <text x={13} y={1} fontSize={9} fill="#6B7280">Conv rate</text>
          <rect x={80} y={-8} width={10} height={10} fill="#60A5FA" rx={1} />
          <text x={93} y={1} fontSize={9} fill="#6B7280">Show rate</text>
        </g>
      </svg>
    </div>
  );
}

function OutcomeChart({ advisors }) {
  const W = 900, H = 155;
  const ml = 80, mr = 110, mt = 16, mb = 34;
  const cw = W - ml - mr;
  const rows = advisors.length;
  const rowH = (H - mt - mb) / rows;
  const KEYS   = ['no_answer', 'voicemail', 'not_interested', 'follow_up', 'booked'];
  const COLORS  = { no_answer: '#E5E7EB', voicemail: '#CBD5E1', not_interested: '#FCA5A5', follow_up: '#FCD34D', booked: '#86EFAC' };
  const LABELS  = { no_answer: 'No Answer', voicemail: 'Voicemail', not_interested: 'Not Interested', follow_up: 'Follow-Up', booked: 'Booked!' };
  const TCOLORS = { no_answer: '#6B7280', voicemail: '#475569', not_interested: '#B91C1C', follow_up: '#92400E', booked: '#15803D' };

  return (
    <div style={{ background: '#fff', border: '1px solid #E8EAED', borderRadius: 6, padding: '16px 20px 8px', marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>Call Outcome Breakdown</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Proportional breakdown of every call disposition per advisor</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {advisors.map((a, i) => {
          const barY = mt + i * rowH + rowH * 0.15;
          const barH = rowH * 0.58;
          let x = ml;
          const segs = KEYS.map(key => {
            const val = a[key] || 0;
            const w = a.calls > 0 ? (val / a.calls) * cw : 0;
            const out = { key, val, w, x };
            x += w;
            return out;
          });
          return (
            <g key={a.rep}>
              <text x={ml - 8} y={barY + barH / 2 + 4} textAnchor="end" fontSize={10} fontWeight="600" fill="#374151">
                {repLabel(a.rep).split(' ')[0]}
              </text>
              <rect x={ml} y={barY} width={cw} height={barH} fill="#F9FAFB" rx={3} />
              {segs.map(({ key, val, w, x: sx }) => (
                <g key={key}>
                  {w > 0 && <rect x={sx} y={barY} width={w} height={barH} fill={COLORS[key]} />}
                  {w > 26 && val > 0 && (
                    <text x={sx + w / 2} y={barY + barH / 2 + 4} textAnchor="middle" fontSize={9} fontWeight="700" fill={TCOLORS[key]}>{val}</text>
                  )}
                </g>
              ))}
              <rect x={ml} y={barY} width={cw} height={barH} fill="none" stroke="#E5E7EB" strokeWidth={1} rx={3} />
              <text x={ml + cw + 8} y={barY + barH / 2 + 4} fontSize={11} fontWeight="700" fill="#374151">{a.calls} calls</text>
            </g>
          );
        })}
        {KEYS.map((key, i) => (
          <g key={key} transform={`translate(${ml + i * 148}, ${H - 8})`}>
            <rect y={-8} width={12} height={12} fill={COLORS[key]} rx={1} stroke="#E5E7EB" strokeWidth={0.5} />
            <text x={16} y={2} fontSize={9} fill="#6B7280">{LABELS[key]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── Queue Card ───────────────────────────────────────────────────────────────

function QueueCard({ lead, index, total, bucketConfig, onDisposition, onSkip, onBack }) {
  const [copiedPhone,   setCopiedPhone]   = useState(false);
  const [copiedEmail,   setCopiedEmail]   = useState(false);
  const [ghlSignals,    setGhlSignals]    = useState(null);
  const [ghlLoading,    setGhlLoading]    = useState(false);
  const [noteText,      setNoteText]      = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeBrand,    setCloseBrand]    = useState('');
  const [closeComm,     setCloseComm]     = useState('');
  const [closedDone,    setClosedDone]    = useState(false);
  const loadedRef = useRef(null);

  useEffect(() => {
    if (loadedRef.current === lead.id) return;
    loadedRef.current = lead.id;
    setCopiedPhone(false);
    setCopiedEmail(false);
    setGhlSignals(null);
    setNoteText('');
    setShowCloseForm(false);
    setCloseBrand('');
    setCloseComm(String(lead.commissionEstimate || 15000));
    setClosedDone(false);

    if (!lead.ghl_contact_id && !lead.email) return;
    setGhlLoading(true);
    const params = lead.ghl_contact_id
      ? `contactId=${lead.ghl_contact_id}`
      : `email=${encodeURIComponent(lead.email)}`;
    fetch(`/api/dashboard/prospect-ghl?${params}`)
      .then(r => r.json())
      .then(d => { setGhlSignals(d); setGhlLoading(false); })
      .catch(() => setGhlLoading(false));
  }, [lead.id, lead.ghl_contact_id, lead.email]);

  const sc = scoreColor(lead.score);
  const bc = bucketConfig;
  const progressPct = total > 0 ? Math.round((index / total) * 100) : 0;

  return (
    <div style={{ animation: 'fadeIn .2s ease' }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button style={s.backBtn} onClick={onBack}>← Back to list</button>
        <div style={{ flex: 1, height: 3, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: bc?.color || '#374151', borderRadius: 2, transition: 'width .3s ease' }} />
        </div>
        <span style={{ fontSize: 12, color: '#6B7280', flexShrink: 0 }}>Lead {index + 1} of {total}</span>
      </div>

      <div style={s.queueCard}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            {bc && <div style={{ fontSize: 10, fontWeight: 700, color: bc.color, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6 }}>{bc.label}</div>}
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0, lineHeight: 1.1 }}>{lead.first_name} {lead.last_name}</h2>
            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 5, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {lead.location && <span>{lead.location}</span>}
              {(lead.liquid_cap_raw || lead.investment_level) && (
                <span style={{ fontWeight: 700, color: '#15803D' }}>{lead.liquid_cap_raw || lead.investment_level}</span>
              )}
              <span style={{ color: lead.ageDays <= 2 ? '#D97706' : '#9CA3AF', fontWeight: lead.ageDays <= 2 ? 700 : 400 }}>{ageBadge(lead.ageDays)} old</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Score</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: sc.color, lineHeight: 1 }}>{lead.score}</div>
            {lead.commissionEstimate > 0 && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{fmtDollars(lead.commissionEstimate)} est.</div>
            )}
          </div>
        </div>

        {/* Contact info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          <div style={s.contactBlock}>
            <div style={s.contactLabel}>Phone</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', flex: 1 }}>
                {lead.phone || <span style={{ color: '#D1D5DB', fontSize: 14 }}>No phone on file</span>}
              </div>
              {lead.phone && (
                <button onClick={() => copyToClipboard(lead.phone, setCopiedPhone)} style={{ ...s.copyBtn, background: copiedPhone ? '#DCFCE7' : '#F3F4F6', color: copiedPhone ? '#15803D' : '#374151', border: `1px solid ${copiedPhone ? '#86EFAC' : '#D1D5DB'}` }}>
                  {copiedPhone ? '✓' : 'Copy'}
                </button>
              )}
            </div>
          </div>
          <div style={s.contactBlock}>
            <div style={s.contactLabel}>Email</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lead.email || <span style={{ color: '#D1D5DB' }}>No email on file</span>}
              </div>
              {lead.email && (
                <button onClick={() => copyToClipboard(lead.email, setCopiedEmail)} style={{ ...s.copyBtn, background: copiedEmail ? '#DCFCE7' : '#F3F4F6', color: copiedEmail ? '#15803D' : '#374151', border: `1px solid ${copiedEmail ? '#86EFAC' : '#D1D5DB'}` }}>
                  {copiedEmail ? '✓' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Why this lead + GHL signals */}
        <div style={{ display: 'grid', gridTemplateColumns: (ghlLoading || ghlSignals?.signals?.length) ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={s.sectionLabel}>Why this lead</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(lead.reasons || []).map((r, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                  <span style={{ color: '#D1D5DB', flexShrink: 0 }}>·</span>{r}
                </li>
              ))}
            </ul>
          </div>
          {(ghlLoading || ghlSignals?.signals?.length > 0) && (
            <div>
              <div style={s.sectionLabel}>Live CRM signals</div>
              {ghlLoading ? (
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading from CRM…</div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(ghlSignals?.signals || []).map((sig, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
                      <span style={{ color: '#7C3AED', flexShrink: 0 }}>·</span>
                      <span>{sig.label}{sig.date && <span style={{ color: '#9CA3AF', marginLeft: 6 }}>{fmtDate(sig.date)}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Recommended action */}
        <div style={s.recommendBox}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Recommended action</div>
          <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.5 }}>{lead.nextAction || lead.recommendedAction || '—'}</div>
        </div>

        {/* Notes — always visible */}
        <div style={{ marginBottom: 20 }}>
          <div style={s.sectionLabel}>Call notes</div>
          <textarea
            style={{
              width: '100%', border: '1px solid #E5E7EB', borderRadius: 5,
              padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
              resize: 'vertical', minHeight: 76, outline: 'none',
              color: '#111827', background: '#FEFCE8',
              lineHeight: 1.5,
            }}
            placeholder="What happened on the call? Follow-up details, objections, context for next advisor…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
          />
        </div>

        <div style={{ borderTop: '1px solid #F3F4F6', marginBottom: 16 }} />

        {/* Disposition */}
        <div style={s.sectionLabel}>Disposition</div>
        <div style={s.dispRow}>
          <button style={{ ...s.dispBtn, ...s.dispNeutral }} onClick={() => onDisposition('no_answer', noteText)}>No Answer</button>
          <button style={{ ...s.dispBtn, ...s.dispNeutral }} onClick={() => onDisposition('left_vm', noteText)}>Left Voicemail</button>
          <button style={{ ...s.dispBtn, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', fontWeight: 700 }} onClick={() => onDisposition('booked', noteText)}>Booked!</button>
          <button style={{ ...s.dispBtn, ...s.dispNeutral }} onClick={() => onDisposition('follow_up', noteText)}>Follow Up</button>
          <button style={{ ...s.dispBtn, background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA' }} onClick={() => onDisposition('not_interested', noteText)}>Not Interested</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button style={{ ...s.dispBtn, background: 'transparent', color: '#9CA3AF', border: '1px solid #E5E7EB', fontSize: 12 }} onClick={onSkip}>
            Skip → Next lead
          </button>
        </div>

        {/* Mark as Closed */}
        <div style={{ marginTop: 20, borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
          {closedDone ? (
            <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 13, fontWeight: 700, color: '#15803D' }}>
              Deal recorded — revenue attributed!
            </div>
          ) : showCloseForm ? (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Record a Closing</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                <input
                  style={{ padding: '8px 12px', border: '1px solid #D1FAE5', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#111827', background: '#fff' }}
                  placeholder="Franchise brand (e.g. Club Pilates)"
                  value={closeBrand}
                  onChange={e => setCloseBrand(e.target.value)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', border: '1px solid #D1FAE5', borderRadius: 4, padding: '0 10px' }}>
                  <span style={{ fontSize: 13, color: '#6B7280' }}>$</span>
                  <input
                    style={{ padding: '8px 4px', border: 'none', fontSize: 13, fontFamily: 'inherit', width: 90, outline: 'none', color: '#111827' }}
                    value={closeComm}
                    onChange={e => setCloseComm(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ padding: '8px 20px', background: '#15803D', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => {
                    const commission = parseFloat(String(closeComm).replace(/[^0-9.]/g, '')) || 0;
                    if (!commission) return;
                    fetch('/api/dashboard/record-closing', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ lead_id: lead.id, bucket: lead.bucket, franchise_brand: closeBrand || null, commission }),
                    });
                    setClosedDone(true);
                  }}
                >
                  Record Closing →
                </button>
                <button
                  style={{ padding: '8px 14px', background: 'transparent', border: '1px solid #D1FAE5', borderRadius: 4, fontSize: 13, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => setShowCloseForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              style={{ fontSize: 12, color: '#15803D', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 600 }}
              onClick={() => { setShowCloseForm(true); if (!closeComm) setCloseComm(String(lead.commissionEstimate || 15000)); }}
            >
              Mark this deal as closed →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page:        { display: 'flex', minHeight: '100vh', background: '#FAFBFD', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" },

  sidebar:          { width: 210, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' },
  sideLogoWrap:     { padding: '20px 16px 16px', borderBottom: '1px solid #E2E8F0' },
  sideLogoRow:      { display: 'flex', alignItems: 'center', gap: 9 },
  sideLogoIcon:     { width: 30, height: 30, borderRadius: 8, background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 },
  sideLogoText:     { fontWeight: 700, fontSize: 14, color: '#0F172A', letterSpacing: '-0.2px' },
  sideNav:          { flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' },
  sideNavItem:      { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#475569', textDecoration: 'none', transition: 'all .15s' },
  sideNavItemActive:{ background: '#EFF6FF', color: '#0057FF', fontWeight: 600 },
  sideBottom:       { borderTop: '1px solid #E2E8F0', padding: '8px 8px 16px' },
  sideHelpRow:      { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer' },
  sideUserRow:      { display: 'flex', alignItems: 'center', gap: 9, padding: '10px 10px', borderRadius: 7, cursor: 'pointer', marginTop: 2 },
  sideUserAvatar:   { width: 30, height: 30, borderRadius: '50%', background: '#0057FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },

  main:      { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topBar:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0', flexShrink: 0, gap: 16 },
  topTitle:  { fontSize: 20, fontWeight: 700, color: '#0F172A' },
  topDate:   { fontSize: 13, color: '#64748B', fontWeight: 400, marginTop: 2 },
  topActions:{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  topBtn:    { padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },

  body:        { flex: 1, padding: '20px 24px', overflowY: 'auto' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 14 },
  spinner:     { width: 24, height: 24, borderRadius: '50%', border: '2px solid #E2E8F0', borderTopColor: '#0057FF', animation: 'spin 0.8s linear infinite' },
  loadingText: { color: '#64748B', fontSize: 13 },
  empty:       { textAlign: 'center', padding: 40, color: '#64748B', fontSize: 13 },
  emptyCard:   { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '28px 24px', textAlign: 'center' },

  heroCard:    { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(15,23,42,.05)' },
  heroMetrics: { display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center' },
  heroMetric:  { padding: '0 24px' },
  heroDivider: { width: 1, height: 52, background: '#E2E8F0', flexShrink: 0 },
  heroValue:   { fontSize: 28, fontWeight: 800, color: '#0F172A', lineHeight: 1.1, marginBottom: 3 },
  heroLabel:   { fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 },
  heroSub:     { fontSize: 11, color: '#64748B' },

  viewTabs:      { display: 'flex', borderBottom: '2px solid #E2E8F0', marginBottom: 16 },
  viewTab:       { padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#64748B', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: -2, cursor: 'pointer', fontFamily: 'inherit' },
  viewTabActive: { color: '#0F172A', fontWeight: 700, borderBottomColor: '#0057FF' },

  bucketGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 },
  bucketCard:  { background: '#FFFFFF', border: '1px solid #E2E8F0', borderLeft: '4px solid #E2E8F0', borderRadius: 10, padding: '16px 16px 12px', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  bucketStartBtn: { marginTop: 12, width: '100%', padding: '7px 0', background: 'transparent', border: '1px solid', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.03em' },

  tabRow:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' },
  tabs:        { display: 'flex', gap: 2, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, padding: 3, flexWrap: 'wrap' },
  tab:         { padding: '4px 10px', fontSize: 12, fontWeight: 500, color: '#64748B', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' },
  tabActive:   { background: '#0F172A', color: '#fff', fontWeight: 700 },
  startProspectingBtn: { padding: '8px 18px', background: '#0057FF', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },

  tableWrap:   { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '9px 14px', background: '#FAFBFD', borderBottom: '1px solid #E2E8F0', textAlign: 'left' },
  td:          { fontSize: 13, color: '#0F172A', padding: '11px 14px', borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle' },
  openBtn:     { padding: '4px 10px', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, color: '#475569', cursor: 'pointer', fontFamily: 'inherit' },

  backBtn:     { padding: '6px 14px', background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 12, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },
  queueCard:   { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '28px 30px', boxShadow: '0 1px 4px rgba(15,23,42,.06)' },
  queueDoneCard: { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 36, textAlign: 'center' },

  contactBlock: { background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px' },
  contactLabel: { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 },
  copyBtn:     { padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 },

  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  recommendBox: { background: '#FAFBFD', border: '1px solid #E2E8F0', borderRadius: 6, padding: '12px 16px', marginBottom: 20 },

  dispRow:     { display: 'flex', gap: 8, flexWrap: 'wrap' },
  dispBtn:     { padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none' },
  dispNeutral: { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' },

  feedWrap:    { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,.04)' },
  feedItem:    { display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: '1px solid #F1F5F9' },
  feedDot:     { width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0 },
};
