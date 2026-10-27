import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import pg from '../../apps/web/node_modules/pg/lib/index.js';
import {initializeBatchQueue,enqueueMessages,claimEmailBatch} from './queue.mjs';

const directory=resolve('.context/local-ai');
mkdirSync(directory,{recursive:true});
const db=new DatabaseSync(resolve(directory,'queue.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,pid INTEGER NOT NULL,until INTEGER NOT NULL);');
const owner=randomUUID();
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,max:2});
const active=new Set();
const bulkActive=new Set();
const arrivalScans=new Map();
let backlogScan=null;
const backlogScanAfter=new Map();
let stopping=false;
const status={pid:process.pid,startedAt:new Date().toISOString(),phase:'starting',updatedAt:new Date().toISOString()};
let ownsLease=false;
let cutoff=0;
let accounts=[];
let refreshedAt=0;
let nextAccount=0;
let lastError=null;

function heartbeat(){
  if(!ownsLease)return;
  db.prepare('UPDATE lease SET until=? WHERE id=1 AND owner=?').run(Date.now()+90000,owner);
  const jobs=db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(done),0) AS done,COALESCE(SUM(CASE WHEN done=0 THEN 1 ELSE 0 END),0) AS pending FROM jobs').get();
  Object.assign(status,{updatedAt:new Date().toISOString(),jobs,lastError,activeJobs:active.size,newMailSince:new Date(cutoff).toISOString(),backfillBatchSize:10,arrivalPollMs:5000,reservedNewMailSlots:2});
  const path=resolve(directory,'status.json');
  const temporary=path+`.${process.pid}.tmp`;
  writeFileSync(temporary,JSON.stringify(status));
  try{renameSync(temporary,path);}catch(error){if(error.code!=='EPERM'&&error.code!=='EACCES')throw error;}
}

async function call(body){
  const response=await fetch('http://127.0.0.1:3000/api/cron/local-ai',{method:'POST',headers:{'content-type':'application/json','x-api-key':process.env.INTERNAL_API_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(body.operation==='arrivals'?15000:600000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`Local AI ${body.operation} returned HTTP ${response.status}`);
  return data;
}

function takeLease(){
  db.exec('BEGIN IMMEDIATE');
  try{
    const lease=db.prepare('SELECT * FROM lease WHERE id=1').get();
    let running=false;
    if(lease && lease.until>Date.now()){try{process.kill(lease.pid,0);running=true;}catch{}}
    if(running){db.exec('COMMIT');process.exit(0);}
    db.prepare('INSERT INTO lease(id,owner,pid,until) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,pid=excluded.pid,until=excluded.until').run(owner,process.pid,Date.now()+90000);
    db.exec('COMMIT');ownsLease=true;
  }catch(error){db.exec('ROLLBACK');throw error;}
  try{
    const backup=resolve(directory,'queue-before-message-batches.sqlite');
    if(!existsSync(backup))db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");
    cutoff=initializeBatchQueue(db);
    heartbeat();
  }catch(error){
    db.prepare('DELETE FROM lease WHERE id=1 AND owner=?').run(owner);
    ownsLease=false;
    throw error;
  }
}

async function refreshAccounts(){
  if(Date.now()-refreshedAt<60000)return;
  accounts=(await pool.query('SELECT e.id FROM "EmailAccount" e JOIN "Account" a ON a.id=e."accountId" WHERE a."disconnectedAt" IS NULL ORDER BY e."createdAt"')).rows;
  for(const account of accounts)db.prepare('INSERT OR IGNORE INTO accounts(id,head_after) VALUES(?,?)').run(account.id,Math.max(0,cutoff-60000));
  refreshedAt=Date.now();
}

async function checkNewArrivals(account){
    const state=db.prepare('SELECT * FROM accounts WHERE id=?').get(account.id);
    if(Date.now()-state.head_at<5000)return;
    if(!state.configured){
      status.phase='configuring';heartbeat();
      await call({operation:'setup',emailAccountId:account.id});
      db.prepare('UPDATE accounts SET configured=1 WHERE id=?').run(account.id);
    }
    const after=state.head_after || Math.max(0,cutoff-60000);
    const started=state.head_started || Date.now();
    try{
      const page=await call({operation:'arrivals',emailAccountId:account.id,after,...(state.head_cursor?{cursor:state.head_cursor}:{})});
      enqueueMessages(db,account.id,page.messages);
      db.prepare('UPDATE accounts SET head_cursor=?,head_started=?,head_after=?,head_at=? WHERE id=?').run(page.nextCursor,page.nextCursor?started:0,page.nextCursor?after:Math.max(0,started-60000),page.nextCursor?0:Date.now(),account.id);
    }catch(error){
      db.prepare('UPDATE accounts SET head_at=? WHERE id=?').run(Date.now(),account.id);
      lastError=error.message;
    }
}

function startArrivalScan(){
  if(stopping || !ownsLease)return;
  for(const account of accounts){
    if(arrivalScans.has(account.id))continue;
    const scan=checkNewArrivals(account).catch(error=>{
      lastError=error.message;
      db.prepare('UPDATE accounts SET head_at=? WHERE id=?').run(Date.now(),account.id);
    }).finally(()=>{arrivalScans.delete(account.id);});
    arrivalScans.set(account.id,scan);
  }
}

function startBacklogScan(){
  if(backlogScan || stopping)return;
  backlogScan=(async()=>{
    for(const account of accounts){
      const state=db.prepare('SELECT * FROM accounts WHERE id=?').get(account.id);
      const count=db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE account_id=? AND done=0 AND retry_at<=? AND received_at<?').get(account.id,Date.now(),cutoff).count;
      if(state.exhausted || count>=10 || Date.now()<(backlogScanAfter.get(account.id)??0))continue;
      backlogScanAfter.set(account.id,Date.now()+10000);
      const page=await call({operation:'scan',emailAccountId:account.id,...(state.cursor?{cursor:state.cursor}:{})});
      enqueueMessages(db,account.id,page.messages);
      db.prepare('UPDATE accounts SET cursor=?,exhausted=? WHERE id=?').run(page.nextCursor,page.nextCursor?0:1,account.id);
    }
  })().catch(error=>{lastError=error.message;}).finally(()=>{backlogScan=null;});
}

function dispatch(account,jobs,priority){
  const running=(async()=>{
    try{
      const result=await call(priority?{operation:'process',emailAccountId:account.id,messageId:jobs[0].message_id}:{operation:'tag-batch',emailAccountId:account.id,messageIds:jobs.map(job=>job.message_id)});
      const processed=new Set(priority?(result.processed?[jobs[0].message_id]:[]):result.processedIds);
      for(const job of jobs){
        if(processed.has(job.message_id))db.prepare('UPDATE jobs SET done=1,attempts=attempts+1 WHERE account_id=? AND message_id=?').run(account.id,job.message_id);
        else db.prepare('UPDATE jobs SET attempts=attempts+1,retry_at=? WHERE account_id=? AND message_id=?').run(Date.now()+(priority?5000:60000),account.id,job.message_id);
      }
      if(processed.size!==jobs.length)lastError='Some saved label actions will retry';else lastError=null;
    }catch(error){
      for(const job of jobs){
        const retry=priority?Math.min(60000,5000*2**Math.min(job.attempts,4)):Math.min(900000,30000*2**Math.min(job.attempts,5));
        db.prepare('UPDATE jobs SET attempts=attempts+1,retry_at=? WHERE account_id=? AND message_id=?').run(Date.now()+retry,account.id,job.message_id);
      }
      lastError=error.message;
      console.warn(JSON.stringify({event:'retry',workload:priority?'new-mail':'backfill',count:jobs.length,error:error.message}));
    }
  })().catch(error=>{lastError=error.message;});
  active.add(running);if(!priority)bulkActive.add(running);
  running.finally(()=>{active.delete(running);bulkActive.delete(running);heartbeat();});
  status.phase=priority?'new_mail':'backfill';status.accountId=account.id;heartbeat();
}

async function tick(){
  if(!ownsLease)takeLease();
  await refreshAccounts();
  // Discovery never stops when the bulk allowance is used: those reserved
  // calls must remain usable by mail arriving later the same UTC day.
  startArrivalScan();
  const quota=await fetch('http://127.0.0.1:3010/health',{signal:AbortSignal.timeout(5000)}).then(response=>{if(!response.ok)throw new Error('Quota gateway unavailable');return response.json();});
  status.quota=quota;
  if(stopping)return;
  if(quota.dailyUsed>=quota.perDay){status.phase='daily_limit';heartbeat();await delay(1000);return;}
  if(quota.cooldownUntil>Date.now()){status.phase='minute_pause';heartbeat();await delay(Math.min(1000,quota.cooldownUntil-Date.now()+50));return;}
  if(active.size>=6){await Promise.race([...active,delay(1000)]);return;}
  for(let i=0;i<accounts.length;i++){
    const account=accounts[nextAccount++%accounts.length];
    const jobs=claimEmailBatch(db,{accountId:account.id,cutoff,priority:true,limit:1});
    if(jobs.length){dispatch(account,jobs,true);return;}
  }
  if(quota.backfillRemaining>0 && bulkActive.size<4){
    startBacklogScan();
    for(let i=0;i<accounts.length;i++){
      const account=accounts[nextAccount++%accounts.length];
      const state=db.prepare('SELECT * FROM accounts WHERE id=?').get(account.id);
      const count=db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE account_id=? AND done=0 AND retry_at<=? AND received_at<?').get(account.id,Date.now(),cutoff).count;
      if(count<10 && !state.exhausted)continue;
      const jobs=claimEmailBatch(db,{accountId:account.id,cutoff,priority:false,limit:10});
      if(jobs.length){dispatch(account,jobs,false);return;}
    }
  }
  const pending=db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE done=0').get().count;
  const unfinished=db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE exhausted=0').get().count;
  status.phase=quota.backfillRemaining<=0?'new_mail_only':(!pending&&!unfinished?'caught_up':'waiting');
  heartbeat();await Promise.race([...active,delay(1000)]);
}

const timer=setInterval(()=>{try{heartbeat();}catch(error){console.warn(JSON.stringify({event:'heartbeat-retry',error:error.message}));}},30000);
const arrivalTimer=setInterval(startArrivalScan,5000);
async function shutdown(){stopping=true;clearInterval(timer);clearInterval(arrivalTimer);await Promise.allSettled([...active,...arrivalScans.values(),...(backlogScan?[backlogScan]:[])]);if(ownsLease)db.prepare('DELETE FROM lease WHERE id=1 AND owner=?').run(owner);await pool.end();db.close();process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
while(!stopping){try{await tick();}catch(error){lastError=error.message;status.phase='retrying';heartbeat();console.warn(JSON.stringify({event:'worker-retry',error:error.message}));await delay(1000);}}
