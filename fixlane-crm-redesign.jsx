import { useState, useEffect, useRef } from "react";

// ─── Data ───────────────────────────────────────────────────────────────
const STAGES = ["Lead","Contacted","In Review","Signed","Active","Churned"];
const STAGE_COLORS = {
  Lead:"#94a3b8", Contacted:"#60a5fa", "In Review":"#a78bfa",
  Signed:"#34d399", Active:"#22c55e", Churned:"#f87171"
};

const CHAINS = ["AAMCO","Midas","Stress Free Auto Care"];
const PROGRAMS = ["MD","OEM","VinFast"];

const OWNERS_DATA = [
  {id:1,name:"Abbas Dastgir",email:"Folsom@midasgroup.us",locations:2,phone:null,statuses:{Signed:1,Active:1}},
  {id:2,name:"Adam Durovey",email:"info@duroev.com",locations:0,phone:null,statuses:{}},
  {id:3,name:"Adam Sbeta",email:"service@priusandtesla.com",locations:1,phone:null,statuses:{Active:1}},
  {id:4,name:"Adam Zuelke",email:"adam@3vlove.com",locations:2,phone:"(713) 364-4550",statuses:{Signed:1,Lead:1}},
  {id:5,name:"Alex Gavrilof",email:"ALEX@GABCOLLISION.COM",locations:2,phone:"(818) 839-8874",statuses:{Active:2}},
  {id:6,name:"Alex Rawitz",email:"alex@dimo.co",locations:2,phone:null,statuses:{Signed:2}},
  {id:7,name:"Alex Solis",email:"hybridautorepairsf@gmail.com",locations:1,phone:null,statuses:{Active:1}},
  {id:8,name:"Alex Tahmasian",email:"info@ha-ac.com",locations:2,phone:"(818) 770-0939",statuses:{Signed:1,Active:1}},
  {id:9,name:"Ali Habib",email:"info@midasmarina.com",locations:3,phone:null,statuses:{Active:2,Churned:1}},
  {id:10,name:"Ali S Habib",email:"mdiwani2010@gmail.com",locations:2,phone:"(703) 650-8842",statuses:{Signed:2}},
  {id:11,name:"Allen Swift",email:"allenswiftmotorsports@gmail.com",locations:2,phone:"(408) 612-8700",statuses:{Active:2}},
  {id:12,name:"Andy Kaghaz",email:"Completecareencinitas@gmail.com",locations:1,phone:null,statuses:{Lead:1}},
];

const now = Date.now();
const day = 86400000;
const SHOPS_DATA = [
  {id:1,name:"Midas Seaford",chain:"Midas",owner:"Abbas Dastgir",ownerEmail:"Folsom@midasgroup.us",location:"Seaford, NY",status:"Lead",programs:[],lastActivity:now-1*day,assignee:"Leo",source:"Referral",daysInactive:1,contractSent:false},
  {id:2,name:"Khalids shop",chain:null,owner:"Khalid Alali",ownerEmail:"khalidra7@gmail.com",location:"San Diego, CA",status:"Lead",programs:[],lastActivity:now-1*day,assignee:"Leo",source:"Cold Call",daysInactive:1,contractSent:false},
  {id:3,name:"Midas Monrovia",chain:"Midas",owner:"Ali Habib",ownerEmail:"info@midasmarina.com",location:"Monrovia, CA",status:"Lead",programs:["OEM"],lastActivity:now-1*day,assignee:"Khalid",source:"Inbound",daysInactive:1,contractSent:false},
  {id:4,name:"Midas Long Beach",chain:"Midas",owner:"Ali Habib",ownerEmail:"info@midasmarina.com",location:"Long Beach, CA",status:"Lead",programs:["OEM"],lastActivity:now-3*day,assignee:"Khalid",source:"Inbound",daysInactive:3,contractSent:false},
  {id:5,name:"Midas Roseville North",chain:"Midas",owner:"Abbas Dastgir",ownerEmail:"Folsom@midasgroup.us",location:"Roseville, CA",status:"Lead",programs:[],lastActivity:now-5*day,assignee:"Leo",source:"Cold Call",daysInactive:5,contractSent:false},
  {id:6,name:"Midas Huntington Beach",chain:"Midas",owner:"Alex Tahmasian",ownerEmail:"info@ha-ac.com",location:"Huntington Beach, CA",status:"Lead",programs:["OEM"],lastActivity:now-8*day,assignee:"Leo",source:"Referral",daysInactive:8,contractSent:false},
  {id:7,name:"Khalids second test",chain:null,owner:"Khalid Alali",ownerEmail:"khalidra7@gmail.com",location:"San Diego, CA",status:"Contacted",programs:[],lastActivity:now-0.5*day,assignee:"Leo",source:"Cold Call",daysInactive:0,contractSent:true,contractStatus:"sent",rates:"$180/hr · Warranty: $220/hr"},
  {id:8,name:"Superior Replacement Anaheim",chain:null,owner:"superioranaheim@gmail.com",ownerEmail:"superioranaheim@gmail.com",location:"Anaheim, CA",status:"Lead",programs:["OEM"],lastActivity:now-1*day,assignee:"Khalid",source:"Inbound",daysInactive:1,contractSent:false},
  {id:9,name:"GAB Collision",chain:null,owner:"Alex Gavrilof",ownerEmail:"ALEX@GABCOLLISION.COM",location:"Glendale, CA",status:"Signed",programs:["MD","OEM"],lastActivity:now-2*day,assignee:"Khalid",source:"Referral",daysInactive:2,contractSent:true,contractStatus:"signed"},
  {id:10,name:"HA Automotive",chain:null,owner:"Alex Tahmasian",ownerEmail:"info@ha-ac.com",location:"North Hollywood, CA",status:"Active",programs:["MD"],lastActivity:now-0*day,assignee:"Leo",source:"Inbound",daysInactive:0,contractSent:true,contractStatus:"signed"},
  {id:11,name:"Swift Motorsports",chain:null,owner:"Allen Swift",ownerEmail:"allenswiftmotorsports@gmail.com",location:"San Jose, CA",status:"Active",programs:["OEM","VinFast"],lastActivity:now-12*day,assignee:"Leo",source:"Cold Call",daysInactive:12,contractSent:true,contractStatus:"signed"},
  {id:12,name:"Prius & Tesla Specialist",chain:null,owner:"Adam Sbeta",ownerEmail:"service@priusandtesla.com",location:"Santa Monica, CA",status:"Signed",programs:["OEM"],lastActivity:now-6*day,assignee:"Khalid",source:"Inbound",daysInactive:6,contractSent:true,contractStatus:"signed"},
  {id:13,name:"Midas Manteca",chain:"Midas",owner:"Ali Habib",ownerEmail:"info@midasmarina.com",location:"Manteca, CA",status:"Churned",programs:[],lastActivity:now-30*day,assignee:"Leo",source:"Cold Call",daysInactive:30,contractSent:true,contractStatus:"signed"},
];

const ACTIVITY_LOG = [
  {type:"Contract",by:"khalid@repairwise.pro",detail:"Contract sent via Zoho Sign\nSent to khalidra7@gmail.com",date:"Apr 15, 2026, 11:38 PM",source:"Send contract"},
  {type:"Email",by:"khalid@repairwise.pro",detail:"RepairWise Partnership — Khalids second test\nHi Khalid Alali,\n\nthis is a welcome email\n\nBest,\nKhalid Alali",date:"Apr 15, 2026, 5:41 PM",source:"Send intro email"},
  {type:"Note",by:"khalid@repairwise.pro",detail:"really exciting notes",date:"Apr 15, 2026, 4:13 PM",source:null},
];

// ─── Helpers ────────────────────────────────────────────────────────────
const staleness = (d) => {
  if(d<=1) return {label:"Today",color:"#22c55e",bg:"#f0fdf4"};
  if(d<=3) return {label:`${d}d ago`,color:"#22c55e",bg:"#f0fdf4"};
  if(d<=7) return {label:`${d}d ago`,color:"#eab308",bg:"#fefce8"};
  return {label:`${d}d ago`,color:"#ef4444",bg:"#fef2f2"};
};

const statusDots = (statuses) => {
  return Object.entries(statuses).map(([s,c])=>(
    <span key={s} style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:8,fontSize:12,color:"#64748b"}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:STAGE_COLORS[s],display:"inline-block"}}/>
      {c} {s}
    </span>
  ));
};

// ─── Styles ─────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg: #fafaf9;
  --surface: #ffffff;
  --surface-hover: #f5f5f4;
  --border: #e7e5e4;
  --border-light: #f0efee;
  --text-primary: #1c1917;
  --text-secondary: #78716c;
  --text-muted: #a8a29e;
  --accent: #4338ca;
  --accent-light: #eef2ff;
  --accent-hover: #3730a3;
  --danger: #dc2626;
  --danger-light: #fef2f2;
  --success: #16a34a;
  --success-light: #f0fdf4;
  --warning: #ca8a04;
  --warning-light: #fefce8;
  --sidebar-bg: #1c1917;
  --sidebar-text: #d6d3d1;
  --sidebar-active: #ffffff;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.08);
  --radius: 8px;
  --radius-lg: 12px;
  --font: 'DM Sans', -apple-system, sans-serif;
  --mono: 'JetBrains Mono', monospace;
}

* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: var(--font); background: var(--bg); color: var(--text-primary); -webkit-font-smoothing: antialiased; }

.app { display:flex; height:100vh; overflow:hidden; }

/* Sidebar */
.sidebar { width:220px; background:var(--sidebar-bg); padding:20px 0; display:flex; flex-direction:column; flex-shrink:0; }
.sidebar-logo { padding:0 20px 24px; font-size:15px; font-weight:700; color:#fff; letter-spacing:-0.3px; display:flex; align-items:center; gap:10px; }
.sidebar-logo span { width:28px; height:28px; border-radius:7px; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:#fff; }
.sidebar-nav { display:flex; flex-direction:column; gap:2px; padding:0 10px; }
.sidebar-item { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:7px; color:var(--sidebar-text); font-size:13.5px; font-weight:400; cursor:pointer; transition:all 0.15s; position:relative; }
.sidebar-item:hover { background:rgba(255,255,255,0.07); color:#fff; }
.sidebar-item.active { background:rgba(255,255,255,0.12); color:#fff; font-weight:500; }
.sidebar-item.active::before { content:''; position:absolute; left:0; top:50%; transform:translateY(-50%); width:3px; height:20px; background:var(--accent); border-radius:0 3px 3px 0; }
.sidebar-item svg { width:18px; height:18px; opacity:0.7; flex-shrink:0; }
.sidebar-item.active svg { opacity:1; }
.sidebar-user-avatar { width:28px; height:28px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; flex-shrink:0; }
.sidebar-badge { margin-left:auto; font-size:11px; background:rgba(255,255,255,0.12); padding:1px 7px; border-radius:10px; font-weight:500; }

.sidebar-bottom { margin-top:auto; padding:12px 20px; border-top:1px solid rgba(255,255,255,0.08); }
.sidebar-user { font-size:12px; color:var(--sidebar-text); display:flex; align-items:center; gap:8px; }
.sidebar-user-avatar { width:28px; height:28px; border-radius:50%; background:var(--accent); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; }

/* Main */
.main { flex:1; overflow-y:auto; padding:0; }
.page-header { padding:24px 32px 0; }
.page-title { font-size:22px; font-weight:700; letter-spacing:-0.5px; color:var(--text-primary); }
.page-subtitle { font-size:13px; color:var(--text-secondary); margin-top:2px; }
.page-content { padding:16px 32px 32px; }

/* Cards */
.card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); }
.card-header { padding:14px 18px; border-bottom:1px solid var(--border-light); display:flex; align-items:center; justify-content:space-between; }
.card-title { font-size:13px; font-weight:600; color:var(--text-primary); letter-spacing:-0.2px; }
.card-subtitle { font-size:12px; color:var(--text-muted); }
.card-body { padding:14px 18px; }

/* Table */
.table-container { overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; font-size:11.5px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; padding:10px 14px; border-bottom:1px solid var(--border); background:var(--bg); position:sticky; top:0; z-index:1; }
td { padding:11px 14px; border-bottom:1px solid var(--border-light); font-size:13.5px; vertical-align:middle; }
tr:hover td { background:var(--surface-hover); }
tr { cursor:pointer; transition: background 0.1s; }

.shop-name { font-weight:600; color:var(--text-primary); }
.shop-name:hover { color:var(--accent); }
.chain-badge { display:inline-block; font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:4px; margin-left:6px; background:#fef3c7; color:#92400e; vertical-align:middle; }
.status-pill { display:inline-block; font-size:11.5px; font-weight:600; padding:3px 10px; border-radius:20px; }
.program-tag { display:inline-block; font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:4px; margin-right:4px; }
.staleness-badge { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:500; padding:3px 8px; border-radius:6px; font-family:var(--mono); }
.staleness-dot { width:6px; height:6px; border-radius:50%; }

/* Filter bar */
.filter-bar { display:flex; align-items:center; gap:8px; padding:16px 32px; flex-wrap:wrap; }
.stage-tabs { display:flex; gap:1px; background:var(--border); border-radius:var(--radius); overflow:hidden; }
.stage-tab { padding:7px 14px; font-size:12.5px; font-weight:500; background:var(--surface); cursor:pointer; transition:all 0.15s; border:none; color:var(--text-secondary); white-space:nowrap; }
.stage-tab:hover { background:var(--surface-hover); color:var(--text-primary); }
.stage-tab.active { background:var(--text-primary); color:#fff; }
.stage-tab .count { font-size:11px; opacity:0.6; margin-left:3px; }

.filter-select { padding:7px 12px; font-size:12.5px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); color:var(--text-primary); cursor:pointer; font-family:var(--font); }

.search-input { padding:8px 14px; font-size:13px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); color:var(--text-primary); width:280px; font-family:var(--font); outline:none; transition:border-color 0.15s; }
.search-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-light); }
.search-input::placeholder { color:var(--text-muted); }

.chain-filter { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:20px; font-size:12px; font-weight:500; cursor:pointer; transition:all 0.15s; border:1px solid var(--border); background:var(--surface); color:var(--text-secondary); }
.chain-filter.active { background:var(--accent); color:#fff; border-color:var(--accent); }

.btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; font-size:13px; font-weight:600; border-radius:var(--radius); cursor:pointer; transition:all 0.15s; border:none; font-family:var(--font); }
.btn svg { width:16px; height:16px; flex-shrink:0; }
svg { width:16px; height:16px; }
.btn-primary { background:var(--accent); color:#fff; }
.btn-primary:hover { background:var(--accent-hover); }
.btn-outline { background:transparent; border:1px solid var(--border); color:var(--text-primary); }
.btn-outline:hover { background:var(--surface-hover); }
.btn-danger { background:var(--danger); color:#fff; }
.btn-success { background:var(--success); color:#fff; }
.btn-sm { padding:5px 10px; font-size:12px; }

/* Dashboard cards */
.dash-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
.stat-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); padding:18px; }
.stat-value { font-size:28px; font-weight:700; letter-spacing:-1px; color:var(--text-primary); line-height:1; }
.stat-label { font-size:12px; color:var(--text-muted); margin-top:4px; font-weight:500; }
.stat-change { font-size:11px; font-weight:600; margin-top:6px; }

.dash-sections { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.follow-up-item { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border-light); }
.follow-up-item:last-child { border-bottom:none; }
.follow-up-name { font-size:13.5px; font-weight:600; color:var(--text-primary); }
.follow-up-meta { font-size:12px; color:var(--text-muted); }

/* Shop detail */
.detail-header { display:flex; align-items:flex-start; justify-content:space-between; padding:24px 32px; border-bottom:1px solid var(--border); background:var(--surface); }
.detail-title-row { display:flex; align-items:center; gap:10px; }
.detail-title { font-size:20px; font-weight:700; letter-spacing:-0.5px; }
.detail-breadcrumb { font-size:12px; color:var(--text-muted); margin-bottom:4px; }
.detail-breadcrumb a { color:var(--accent); cursor:pointer; text-decoration:none; }

.detail-body { display:grid; grid-template-columns:340px 1fr; gap:0; min-height:calc(100vh - 100px); }
.detail-sidebar { border-right:1px solid var(--border); padding:20px 24px; background:var(--surface); overflow-y:auto; }
.detail-main { padding:20px 24px; overflow-y:auto; }

.field-group { margin-bottom:18px; }
.field-label { font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
.field-value { font-size:14px; color:var(--text-primary); }
.field-value a { color:var(--accent); text-decoration:none; }

.snapshot-row { display:flex; gap:12px; margin-bottom:16px; }
.snapshot-card { flex:1; padding:12px; border-radius:var(--radius); border:1px solid var(--border-light); }
.snapshot-card-label { font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; }
.snapshot-card-value { font-size:15px; font-weight:700; margin-top:2px; }

.activity-item { border:1px solid var(--border-light); border-radius:var(--radius); padding:14px 16px; margin-bottom:10px; position:relative; }
.activity-item::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:3px 0 0 3px; }
.activity-item.type-Contract::before { background:var(--accent); }
.activity-item.type-Email::before { background:#60a5fa; }
.activity-item.type-Note::before { background:#fbbf24; }
.activity-type { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
.activity-date { font-size:11px; color:var(--text-muted); }
.activity-detail { font-size:13px; color:var(--text-secondary); margin-top:6px; white-space:pre-wrap; line-height:1.5; }
.activity-source { font-size:11px; color:var(--text-muted); margin-top:6px; font-style:italic; }

.note-input { display:flex; gap:8px; margin-bottom:16px; }
.note-input textarea { flex:1; padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius); font-family:var(--font); font-size:13px; resize:vertical; min-height:42px; outline:none; }
.note-input textarea:focus { border-color:var(--accent); }

/* Tabs for detail main area */
.detail-tabs { display:flex; gap:1px; background:var(--border); border-radius:var(--radius); overflow:hidden; margin-bottom:20px; }
.detail-tab { padding:8px 16px; font-size:12.5px; font-weight:500; background:var(--surface); cursor:pointer; border:none; color:var(--text-secondary); transition:all 0.15s; font-family:var(--font); }
.detail-tab.active { background:var(--text-primary); color:#fff; }
.detail-tab:hover:not(.active) { background:var(--surface-hover); }

/* Owners */
.owner-row-expand { background:var(--bg); border-bottom:1px solid var(--border); }
.owner-locations { display:flex; flex-wrap:wrap; gap:6px; padding:12px 14px; }
.owner-loc-chip { font-size:12px; padding:4px 10px; border-radius:6px; border:1px solid var(--border); background:var(--surface); display:inline-flex; align-items:center; gap:5px; cursor:pointer; }
.owner-loc-chip:hover { border-color:var(--accent); color:var(--accent); }

/* Map placeholder */
.map-placeholder { width:100%; height:calc(100vh - 120px); background:#e8e6e3; border-radius:var(--radius-lg); display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; }
.map-overlay { position:absolute; top:16px; left:16px; background:var(--surface); border-radius:var(--radius-lg); padding:16px 20px; box-shadow:var(--shadow-lg); z-index:10; min-width:200px; }
.map-legend-item { display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--text-secondary); margin-bottom:6px; }
.map-legend-dot { width:10px; height:10px; border-radius:50%; }

.map-pin-panel { position:absolute; top:16px; right:16px; width:320px; background:var(--surface); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); z-index:10; overflow:hidden; }
.pin-panel-header { padding:14px 18px; border-bottom:1px solid var(--border); }
.pin-panel-body { padding:14px 18px; }

/* Checkbox */
.checkbox-wrap { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; }
.checkbox-wrap input { width:15px; height:15px; accent-color:var(--accent); cursor:pointer; }

/* Bulk bar */
.bulk-bar { position:sticky; bottom:0; left:0; right:0; background:var(--text-primary); color:#fff; padding:10px 32px; display:flex; align-items:center; gap:16px; font-size:13px; z-index:20; animation:slideUp 0.2s ease; }
@keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
.bulk-bar .btn { font-size:12px; }

/* Contract inline */
.contract-inline { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; }

/* Responsive adjustments */
@media(max-width:1100px){
  .dash-grid { grid-template-columns:repeat(2,1fr); }
  .dash-sections { grid-template-columns:1fr; }
  .detail-body { grid-template-columns:1fr; }
  .detail-sidebar { border-right:none; border-bottom:1px solid var(--border); }
}
`;

// ─── Icons ──────────────────────────────────────────────────────────────
const Icon = {
  Home:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Shop:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1-4h16l1 4"/><path d="M3 9v11a1 1 0 001 1h16a1 1 0 001-1V9"/><path d="M9 21V12h6v9"/><path d="M3 9h18"/></svg>,
  Users:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Map:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>,
  Search:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Plus:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  ChevronRight:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Mail:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  FileText:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  Clock:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  AlertCircle:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  X:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Phone:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  MapPin:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  Check:()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
};

// ─── Components ─────────────────────────────────────────────────────────

function StatusPill({status}) {
  const c = STAGE_COLORS[status] || "#94a3b8";
  return <span className="status-pill" style={{background:c+"20",color:c,border:`1px solid ${c}40`}}>{status}</span>;
}

function ProgramTag({name}) {
  const colors = {MD:"#7c3aed",OEM:"#0891b2",VinFast:"#dc2626"};
  const c = colors[name]||"#6b7280";
  return <span className="program-tag" style={{background:c+"15",color:c}}>{name}</span>;
}

function StalenessBadge({days}) {
  const s = staleness(days);
  return <span className="staleness-badge" style={{background:s.bg,color:s.color}}>
    <span className="staleness-dot" style={{background:s.color}}/>{s.label}
  </span>;
}

// ─── Dashboard Page ─────────────────────────────────────────────────────
function DashboardPage({onNavigate}) {
  const needsFollowUp = SHOPS_DATA.filter(s=>s.daysInactive>=5 && s.status!=="Churned" && s.status!=="Active").sort((a,b)=>b.daysInactive-a.daysInactive);
  const contractsPending = SHOPS_DATA.filter(s=>s.contractSent && s.contractStatus==="sent");
  const recentlySigned = SHOPS_DATA.filter(s=>s.status==="Signed").slice(0,5);
  const leadCount = SHOPS_DATA.filter(s=>s.status==="Lead").length;
  const contactedCount = SHOPS_DATA.filter(s=>s.status==="Contacted").length;
  const signedCount = SHOPS_DATA.filter(s=>s.status==="Signed").length;
  const activeCount = SHOPS_DATA.filter(s=>s.status==="Active").length;

  return <div>
    <div className="page-header">
      <div className="page-title">Good morning, Khalid</div>
      <div className="page-subtitle">Here's what needs your attention today</div>
    </div>
    <div className="page-content">
      <div className="dash-grid">
        <div className="stat-card">
          <div className="stat-value" style={{color:STAGE_COLORS.Lead}}>{leadCount}</div>
          <div className="stat-label">Leads</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:STAGE_COLORS.Contacted}}>{contactedCount}</div>
          <div className="stat-label">Contacted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:STAGE_COLORS.Signed}}>{signedCount}</div>
          <div className="stat-label">Signed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{color:STAGE_COLORS.Active}}>{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
      </div>

      <div className="dash-sections">
        {/* Follow-up queue */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"var(--danger)"}}>●</span> Needs Follow-up
              </div>
              <div className="card-subtitle">Shops with no activity in 5+ days</div>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:"var(--danger)",background:"var(--danger-light)",padding:"3px 10px",borderRadius:20}}>{needsFollowUp.length}</span>
          </div>
          <div className="card-body" style={{padding:0}}>
            {needsFollowUp.length===0 && <div style={{padding:20,textAlign:"center",color:"var(--text-muted)",fontSize:13}}>All caught up!</div>}
            {needsFollowUp.map(shop=>(
              <div key={shop.id} className="follow-up-item" style={{padding:"10px 18px",cursor:"pointer"}} onClick={()=>onNavigate("detail",shop)}>
                <div>
                  <div className="follow-up-name">{shop.name}{shop.chain && <span className="chain-badge">{shop.chain}</span>}</div>
                  <div className="follow-up-meta">{shop.owner} · {shop.location}</div>
                </div>
                <StalenessBadge days={shop.daysInactive}/>
              </div>
            ))}
          </div>
        </div>

        {/* Contracts pending */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:"var(--warning)"}}>●</span> Contracts Awaiting Signature
              </div>
              <div className="card-subtitle">Sent but not yet signed</div>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:"var(--warning)",background:"var(--warning-light)",padding:"3px 10px",borderRadius:20}}>{contractsPending.length}</span>
          </div>
          <div className="card-body" style={{padding:0}}>
            {contractsPending.length===0 && <div style={{padding:20,textAlign:"center",color:"var(--text-muted)",fontSize:13}}>No pending contracts</div>}
            {contractsPending.map(shop=>(
              <div key={shop.id} className="follow-up-item" style={{padding:"10px 18px",cursor:"pointer"}} onClick={()=>onNavigate("detail",shop)}>
                <div>
                  <div className="follow-up-name">{shop.name}</div>
                  <div className="follow-up-meta">{shop.owner} · {shop.rates||"—"}</div>
                </div>
                <span className="contract-inline" style={{background:"var(--warning-light)",color:"var(--warning)"}}>
                  <Icon.Clock/> Sent
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recently signed — need onboarding */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{color:STAGE_COLORS.Signed}}>●</span> Recently Signed
              </div>
              <div className="card-subtitle">Needs onboarding follow-up</div>
            </div>
          </div>
          <div className="card-body" style={{padding:0}}>
            {recentlySigned.map(shop=>(
              <div key={shop.id} className="follow-up-item" style={{padding:"10px 18px",cursor:"pointer"}} onClick={()=>onNavigate("detail",shop)}>
                <div>
                  <div className="follow-up-name">{shop.name}</div>
                  <div className="follow-up-meta">{shop.owner} · {shop.location}</div>
                </div>
                <StatusPill status="Signed"/>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Quick Actions</div>
          </div>
          <div className="card-body" style={{display:"flex",flexDirection:"column",gap:8}}>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={()=>onNavigate("pipeline")}>
              <Icon.Shop/> View Pipeline
            </button>
            <button className="btn btn-outline" style={{width:"100%",justifyContent:"center"}} onClick={()=>onNavigate("owners")}>
              <Icon.Users/> View Owners
            </button>
            <button className="btn btn-outline" style={{width:"100%",justifyContent:"center"}} onClick={()=>onNavigate("map")}>
              <Icon.Map/> Open Map
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>;
}

// ─── Pipeline Page ──────────────────────────────────────────────────────
function PipelinePage({onNavigate}) {
  const [activeStage,setActiveStage] = useState("All");
  const [search,setSearch] = useState("");
  const [activeChain,setActiveChain] = useState(null);
  const [selected,setSelected] = useState(new Set());
  const [assigneeFilter,setAssigneeFilter] = useState("All");

  const filtered = SHOPS_DATA.filter(s=>{
    if(activeStage!=="All" && s.status!==activeStage) return false;
    if(activeChain && s.chain!==activeChain) return false;
    if(assigneeFilter!=="All" && s.assignee!==assigneeFilter) return false;
    if(search) {
      const q=search.toLowerCase();
      return s.name.toLowerCase().includes(q)||s.owner.toLowerCase().includes(q)||s.location.toLowerCase().includes(q)||(s.chain||"").toLowerCase().includes(q);
    }
    return true;
  });

  const toggleSelect=(id)=>{
    setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});
  };
  const toggleAll=()=>{
    if(selected.size===filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(s=>s.id)));
  };

  const stageCounts = {};
  SHOPS_DATA.forEach(s=>{stageCounts[s.status]=(stageCounts[s.status]||0)+1;});

  return <div>
    <div className="page-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div>
        <div className="page-title">Pipeline</div>
        <div className="page-subtitle">{SHOPS_DATA.length} shops total</div>
      </div>
      <button className="btn btn-primary"><Icon.Plus/> Add Shop</button>
    </div>

    <div className="filter-bar">
      <div className="stage-tabs">
        <button className={`stage-tab ${activeStage==="All"?"active":""}`} onClick={()=>setActiveStage("All")}>All<span className="count">{SHOPS_DATA.length}</span></button>
        {STAGES.map(st=>(
          <button key={st} className={`stage-tab ${activeStage===st?"active":""}`} onClick={()=>setActiveStage(st)}>
            {st}<span className="count">{stageCounts[st]||0}</span>
          </button>
        ))}
      </div>
    </div>
    <div className="filter-bar" style={{paddingTop:0}}>
      <div style={{position:"relative"}}>
        <Icon.Search/>
        <input className="search-input" placeholder="Search name, city, owner, chain..." value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:14}}/>
      </div>
      <select className="filter-select" value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)}>
        <option value="All">All assignees</option>
        <option value="Leo">Leo</option>
        <option value="Khalid">Khalid</option>
      </select>
      <div style={{display:"flex",gap:4,marginLeft:8}}>
        {CHAINS.map(c=>(
          <span key={c} className={`chain-filter ${activeChain===c?"active":""}`} onClick={()=>setActiveChain(activeChain===c?null:c)}>{c}</span>
        ))}
      </div>
      {(activeChain||search||assigneeFilter!=="All")&&<button style={{fontSize:12,color:"var(--accent)",background:"none",border:"none",cursor:"pointer",fontFamily:"var(--font)",fontWeight:500}} onClick={()=>{setActiveChain(null);setSearch("");setAssigneeFilter("All");}}>Clear filters</button>}
    </div>

    <div className="page-content" style={{paddingTop:0}}>
      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th style={{width:36}}><div className="checkbox-wrap"><input type="checkbox" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleAll}/></div></th>
              <th>Shop</th>
              <th>Owner</th>
              <th>Location</th>
              <th>Status</th>
              <th>Programs</th>
              <th>Last Activity</th>
              <th>Assignee</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(shop=>(
              <tr key={shop.id}>
                <td onClick={e=>e.stopPropagation()}><div className="checkbox-wrap"><input type="checkbox" checked={selected.has(shop.id)} onChange={()=>toggleSelect(shop.id)}/></div></td>
                <td onClick={()=>onNavigate("detail",shop)}>
                  <span className="shop-name">{shop.name}</span>
                  {shop.chain && <span className="chain-badge">{shop.chain}</span>}
                </td>
                <td style={{color:"var(--text-secondary)",fontSize:13}}>{shop.owner}</td>
                <td style={{color:"var(--text-secondary)",fontSize:13}}>{shop.location||"—"}</td>
                <td><StatusPill status={shop.status}/></td>
                <td>{shop.programs.length>0?shop.programs.map(p=><ProgramTag key={p} name={p}/>):<span style={{color:"var(--text-muted)"}}>—</span>}</td>
                <td><StalenessBadge days={shop.daysInactive}/></td>
                <td><span style={{fontSize:12,fontWeight:500,color:"var(--text-secondary)",background:"var(--bg)",padding:"3px 8px",borderRadius:4}}>{shop.assignee}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {selected.size>0 && (
      <div className="bulk-bar">
        <span style={{fontWeight:600}}>{selected.size} selected</span>
        <button className="btn btn-sm" style={{background:"var(--accent)",color:"#fff"}}>Assign to...</button>
        <button className="btn btn-sm" style={{background:"rgba(255,255,255,0.15)",color:"#fff"}}>Change status</button>
        <button className="btn btn-sm" style={{background:"rgba(255,255,255,0.15)",color:"#fff"}}>Bulk email</button>
        <button className="btn btn-sm" style={{marginLeft:"auto",background:"transparent",color:"rgba(255,255,255,0.6)"}} onClick={()=>setSelected(new Set())}>Cancel</button>
      </div>
    )}
  </div>;
}

// ─── Shop Detail Page ───────────────────────────────────────────────────
function ShopDetailPage({shop,onNavigate}) {
  const [mainTab,setMainTab] = useState("activity");
  const s = shop || SHOPS_DATA[6]; // default to "Khalids second test"

  const contractLabel = s.contractSent ? (s.contractStatus==="signed"?"✓ Signed":"↗ Resend contract") : "Send contract";
  const contractBtnStyle = s.contractSent && s.contractStatus==="signed" ? {background:"var(--success-light)",color:"var(--success)",border:"1px solid #bbf7d0"} : s.contractSent ? {background:"var(--warning-light)",color:"var(--warning)",border:"1px solid #fde68a"} : {};

  return <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
    <div className="detail-header">
      <div>
        <div className="detail-breadcrumb"><a onClick={()=>onNavigate("pipeline")}>Shops</a> / {s.name}</div>
        <div className="detail-title-row">
          <div className="detail-title">{s.name}</div>
          <StatusPill status={s.status}/>
          {s.chain && <span className="chain-badge">{s.chain}</span>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <select className="filter-select" defaultValue={s.assignee} style={{fontWeight:600}}>
          <option>Leo</option><option>Khalid</option>
        </select>
        <button className="btn btn-primary" style={{background:"#6366f1"}}><Icon.Mail/> Send intro email</button>
        <button className="btn btn-outline" style={contractBtnStyle}><Icon.FileText/> {contractLabel}</button>
        <button className="btn btn-outline" style={{color:"var(--text-muted)"}}>Edit</button>
        <button className="btn btn-outline" style={{color:"var(--danger)",borderColor:"var(--danger)"}}>Delete</button>
      </div>
    </div>

    <div className="detail-body" style={{flex:1,overflow:"hidden"}}>
      {/* Left sidebar — snapshot */}
      <div className="detail-sidebar">
        <div style={{marginBottom:20}}>
          <div className="snapshot-row">
            <div className="snapshot-card">
              <div className="snapshot-card-label">Status</div>
              <div className="snapshot-card-value" style={{color:STAGE_COLORS[s.status]}}>{s.status}</div>
            </div>
            <div className="snapshot-card">
              <div className="snapshot-card-label">Contract</div>
              <div className="snapshot-card-value">{s.contractSent?(s.contractStatus==="signed"?"Signed":"Sent"):"None"}</div>
            </div>
          </div>
          <div className="snapshot-row">
            <div className="snapshot-card">
              <div className="snapshot-card-label">Programs</div>
              <div style={{marginTop:4}}>{s.programs.length>0?s.programs.map(p=><ProgramTag key={p} name={p}/>):<span style={{fontSize:13,color:"var(--text-muted)"}}>None</span>}</div>
            </div>
            <div className="snapshot-card">
              <div className="snapshot-card-label">Last Activity</div>
              <div style={{marginTop:4}}><StalenessBadge days={s.daysInactive}/></div>
            </div>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">Owner</div>
          <div className="field-value"><a onClick={()=>onNavigate("owners")}>{s.owner}</a></div>
          <div style={{fontSize:12,color:"var(--text-muted)"}}>{s.ownerEmail}</div>
        </div>

        <div className="field-group">
          <div className="field-label">Location</div>
          <div className="field-value" style={{display:"flex",alignItems:"flex-start",gap:4}}>
            <span style={{width:14,height:14,marginTop:2,flexShrink:0,color:"var(--danger)",display:"inline-flex"}}><Icon.MapPin/></span>
            <span>{s.location||"—"}</span>
          </div>
        </div>

        <div className="field-group">
          <div className="field-label">Source</div>
          <div className="field-value">{s.source}</div>
        </div>

        <div className="field-group">
          <div className="field-label">Assignee</div>
          <div className="field-value">{s.assignee}</div>
        </div>

        {s.rates && <div className="field-group">
          <div className="field-label">Rates</div>
          <div className="field-value" style={{fontFamily:"var(--mono)",fontSize:13}}>{s.rates}</div>
        </div>}

        <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--border-light)"}}>
          <div className="field-label" style={{marginBottom:8}}>Locations by this owner</div>
          {SHOPS_DATA.filter(x=>x.owner===s.owner).map(loc=>(
            <div key={loc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid var(--border-light)",cursor:"pointer"}} onClick={()=>onNavigate("detail",loc)}>
              <span style={{fontSize:13,fontWeight:loc.id===s.id?600:400,color:loc.id===s.id?"var(--accent)":"var(--text-primary)"}}>{loc.name}</span>
              <StatusPill status={loc.status}/>
            </div>
          ))}
        </div>
      </div>

      {/* Right main area */}
      <div className="detail-main">
        <div className="detail-tabs">
          {["activity","contracts","programs"].map(t=>(
            <button key={t} className={`detail-tab ${mainTab===t?"active":""}`} onClick={()=>setMainTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>

        {mainTab==="activity" && <>
          <div className="note-input">
            <textarea placeholder="Add a note..."/>
            <button className="btn btn-primary">Add</button>
          </div>
          {ACTIVITY_LOG.map((a,i)=>(
            <div key={i} className={`activity-item type-${a.type}`}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span className="activity-type" style={{color: a.type==="Contract"?"var(--accent)":a.type==="Email"?"#3b82f6":"#d97706"}}>{a.type}</span>
                  <span style={{fontSize:11,color:"var(--text-muted)"}}>by {a.by}</span>
                </div>
                <span className="activity-date">{a.date}</span>
              </div>
              <div className="activity-detail">{a.detail}</div>
              {a.source && <div className="activity-source">— {a.source}</div>}
            </div>
          ))}
        </>}

        {mainTab==="contracts" && <div>
          {s.contractSent ? (
            <div className="card" style={{borderLeft:`3px solid ${s.contractStatus==="signed"?"var(--success)":"var(--warning)"}`}}>
              <div className="card-body" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{s.owner}</div>
                  <div style={{fontSize:13,color:"var(--text-secondary)"}}>{s.rates||"Standard rates"}</div>
                </div>
                <span className="contract-inline" style={{
                  background:s.contractStatus==="signed"?"var(--success-light)":"var(--warning-light)",
                  color:s.contractStatus==="signed"?"var(--success)":"var(--warning)"
                }}>
                  {s.contractStatus==="signed"?<><Icon.Check/> Signed</>:<><Icon.Clock/> Sent</>}
                </span>
              </div>
            </div>
          ) : (
            <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>
              <div style={{marginBottom:8}}>No contract yet</div>
              <button className="btn btn-primary"><Icon.FileText/> Send contract</button>
            </div>
          )}
        </div>}

        {mainTab==="programs" && <div>
          {s.programs.length>0 ? s.programs.map(p=>(
            <div key={p} className="card" style={{marginBottom:8}}>
              <div className="card-body" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <ProgramTag name={p}/>
                  <span style={{fontWeight:600,fontSize:14}}>{p} Program</span>
                </div>
                <span style={{fontSize:12,color:"var(--text-muted)"}}>Enrolled</span>
              </div>
            </div>
          )) : (
            <div style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>No programs enrolled</div>
          )}
        </div>}
      </div>
    </div>
  </div>;
}

// ─── Owners Page ────────────────────────────────────────────────────────
function OwnersPage({onNavigate}) {
  const [expandedId,setExpandedId] = useState(null);
  const [search,setSearch] = useState("");

  const filtered = OWNERS_DATA.filter(o=>{
    if(!search) return true;
    const q=search.toLowerCase();
    return o.name.toLowerCase().includes(q)||o.email.toLowerCase().includes(q);
  });

  return <div>
    <div className="page-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div>
        <div className="page-title">Owners</div>
        <div className="page-subtitle">{OWNERS_DATA.length} owner contacts</div>
      </div>
    </div>
    <div className="filter-bar">
      <input className="search-input" placeholder="Search owners..." value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>
    <div className="page-content" style={{paddingTop:0}}>
      <div className="card table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Locations</th>
              <th>Status Breakdown</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(o=><>
              <tr key={o.id} onClick={()=>setExpandedId(expandedId===o.id?null:o.id)}>
                <td><span style={{fontWeight:600,color:"var(--accent)"}}>{o.name}</span></td>
                <td style={{fontSize:13,color:"var(--text-secondary)"}}>{o.email}</td>
                <td>
                  <span style={{fontWeight:700,fontSize:14,cursor:"pointer",color:o.locations>0?"var(--text-primary)":"var(--text-muted)"}}>{o.locations}</span>
                </td>
                <td>{Object.keys(o.statuses).length>0?statusDots(o.statuses):<span style={{color:"var(--text-muted)",fontSize:12}}>—</span>}</td>
                <td style={{fontSize:13,color:o.phone?"var(--text-primary)":"var(--text-muted)"}}>{o.phone||"—"}</td>
              </tr>
              {expandedId===o.id && o.locations>0 && (
                <tr key={`${o.id}-exp`} className="owner-row-expand">
                  <td colSpan={5}>
                    <div className="owner-locations">
                      {SHOPS_DATA.filter(s=>s.owner===o.name).map(loc=>(
                        <span key={loc.id} className="owner-loc-chip" onClick={()=>onNavigate("detail",loc)}>
                          <span style={{width:6,height:6,borderRadius:"50%",background:STAGE_COLORS[loc.status]}}/>
                          {loc.name} — {loc.location}
                        </span>
                      ))}
                      {SHOPS_DATA.filter(s=>s.owner===o.name).length===0 && <span style={{fontSize:12,color:"var(--text-muted)"}}>No matching shops in current data</span>}
                    </div>
                  </td>
                </tr>
              )}
            </>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}

// ─── Map Page ───────────────────────────────────────────────────────────
function MapPage({onNavigate}) {
  const [statusFilter,setStatusFilter] = useState("All");
  const [selectedPin,setSelectedPin] = useState(null);

  const pins = [
    {shop:SHOPS_DATA[9],x:42,y:38},{shop:SHOPS_DATA[10],x:25,y:20},{shop:SHOPS_DATA[3],x:52,y:60},
    {shop:SHOPS_DATA[5],x:55,y:68},{shop:SHOPS_DATA[2],x:48,y:33},{shop:SHOPS_DATA[8],x:44,y:34},
    {shop:SHOPS_DATA[11],x:38,y:42},{shop:SHOPS_DATA[0],x:80,y:25},{shop:SHOPS_DATA[4],x:30,y:15},
    {shop:SHOPS_DATA[12],x:28,y:50},{shop:SHOPS_DATA[7],x:58,y:58},{shop:SHOPS_DATA[1],x:50,y:78},
    {shop:SHOPS_DATA[6],x:52,y:76},
  ];

  const filteredPins = statusFilter==="All"?pins:pins.filter(p=>p.shop.status===statusFilter);

  return <div>
    <div className="page-header">
      <div className="page-title">Map</div>
      <div className="page-subtitle">{filteredPins.length} of {SHOPS_DATA.length} shops shown</div>
    </div>
    <div className="page-content">
      <div className="map-placeholder" style={{background:"linear-gradient(135deg, #e8e6e3 0%, #d6d3d1 100%)"}}>
        {/* Fake map grid */}
        <svg width="100%" height="100%" style={{position:"absolute",opacity:0.15}}>
          {Array.from({length:20}).map((_,i)=><line key={`h${i}`} x1="0" y1={`${i*5}%`} x2="100%" y2={`${i*5}%`} stroke="#888" strokeWidth="0.5"/>)}
          {Array.from({length:20}).map((_,i)=><line key={`v${i}`} x1={`${i*5}%`} y1="0" x2={`${i*5}%`} y2="100%" stroke="#888" strokeWidth="0.5"/>)}
        </svg>
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:14,color:"#a8a29e",fontWeight:500}}>Mapbox GL JS renders here</div>

        {/* Simulated pins */}
        {filteredPins.map((p,i)=>(
          <div key={i} onClick={()=>setSelectedPin(p.shop)} style={{
            position:"absolute",left:`${p.x}%`,top:`${p.y}%`,width:14,height:14,borderRadius:"50%",
            background:STAGE_COLORS[p.shop.status],border:"2px solid #fff",boxShadow:"0 1px 4px rgba(0,0,0,0.3)",
            cursor:"pointer",transform:"translate(-50%,-50%)",transition:"transform 0.15s",zIndex:selectedPin?.id===p.shop.id?5:1
          }}/>
        ))}

        {/* Legend overlay */}
        <div className="map-overlay">
          <div style={{marginBottom:10}}>
            <select className="filter-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{width:"100%"}}>
              <option value="All">All statuses ({SHOPS_DATA.length})</option>
              {STAGES.map(st=><option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          {STAGES.map(st=>(
            <div key={st} className="map-legend-item">
              <span className="map-legend-dot" style={{background:STAGE_COLORS[st]}}/>
              {st}
            </div>
          ))}
        </div>

        {/* Pin detail panel */}
        {selectedPin && (
          <div className="map-pin-panel">
            <div className="pin-panel-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:15}}>{selectedPin.name}</div>
              <button style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setSelectedPin(null)}><Icon.X/></button>
            </div>
            <div className="pin-panel-body">
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <StatusPill status={selectedPin.status}/>
                {selectedPin.programs.map(p=><ProgramTag key={p} name={p}/>)}
              </div>
              <div className="field-group">
                <div className="field-label">Owner</div>
                <div className="field-value">{selectedPin.owner}</div>
              </div>
              <div className="field-group">
                <div className="field-label">Location</div>
                <div className="field-value">{selectedPin.location}</div>
              </div>
              <div className="field-group">
                <div className="field-label">Last Activity</div>
                <StalenessBadge days={selectedPin.daysInactive}/>
              </div>
              <button className="btn btn-primary btn-sm" style={{width:"100%",justifyContent:"center",marginTop:8}} onClick={()=>onNavigate("detail",selectedPin)}>
                Open Shop Detail →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>;
}

// ─── App Shell ──────────────────────────────────────────────────────────
export default function App() {
  const [page,setPage] = useState("home");
  const [detailShop,setDetailShop] = useState(null);

  const navigate = (target, data) => {
    if(target==="detail") {
      setDetailShop(data);
      setPage("detail");
    } else {
      setPage(target);
    }
  };

  const navItems = [
    {id:"home",label:"Home",icon:<Icon.Home/>},
    {id:"pipeline",label:"Shops",icon:<Icon.Shop/>,badge:SHOPS_DATA.length},
    {id:"owners",label:"Owners",icon:<Icon.Users/>},
    {id:"map",label:"Map",icon:<Icon.Map/>},
  ];

  return <>
    <style>{CSS}</style>
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-logo"><span>F</span> Fixlane CRM</div>
        <div className="sidebar-nav">
          {navItems.map(n=>(
            <div key={n.id} className={`sidebar-item ${(page===n.id||(page==="detail"&&n.id==="pipeline"))?"active":""}`} onClick={()=>navigate(n.id)}>
              {n.icon}
              {n.label}
              {n.badge && <span className="sidebar-badge">{n.badge}</span>}
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">KA</div>
            <div>
              <div style={{fontWeight:500,color:"#fff",fontSize:12.5}}>Khalid Alali</div>
              <div style={{fontSize:11,opacity:0.5}}>khalid@repairwise.pro</div>
            </div>
          </div>
        </div>
      </div>

      <div className="main">
        {page==="home" && <DashboardPage onNavigate={navigate}/>}
        {page==="pipeline" && <PipelinePage onNavigate={navigate}/>}
        {page==="detail" && <ShopDetailPage shop={detailShop} onNavigate={navigate}/>}
        {page==="owners" && <OwnersPage onNavigate={navigate}/>}
        {page==="map" && <MapPage onNavigate={navigate}/>}
      </div>
    </div>
  </>;
}
