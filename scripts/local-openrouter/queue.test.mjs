import assert from 'node:assert/strict';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {claimNextJob,initializeBatchQueue,enqueueMessages,claimEmailBatch} from './queue.mjs';

test('claims different messages across connections and resumes an interrupted claim after its lease',()=>{
 const directory=mkdtempSync(join(tmpdir(),'inbox-jobs-'));
 const path=join(directory,'queue.sqlite');
 let first=new DatabaseSync(path);
 first.exec(`CREATE TABLE jobs(account_id TEXT,message_id TEXT,thread_id TEXT,received_at INTEGER,done INTEGER DEFAULT 0,retry_at INTEGER DEFAULT 0);
 INSERT INTO jobs(account_id,message_id,received_at) VALUES('a','latest',20),('a','older',10),('b','other',30);`);
 const second=new DatabaseSync(path);
 assert.equal(claimNextJob(first,'a',1000).message_id,'latest');
 assert.equal(claimNextJob(second,'a',1000).message_id,'older');
 assert.equal(claimNextJob(first,'a',1001),undefined);
 first.close(); first=new DatabaseSync(path);
 assert.equal(claimNextJob(first,'a',600_999),undefined);
 assert.equal(claimNextJob(first,'a',601_000).message_id,'latest');
 assert.equal(claimNextJob(first,'b',1000).message_id,'other');
 first.close(); second.close(); rmSync(directory,{recursive:true});
});

test('migrates conversation progress, retains done emails, and queues other emails in the same thread',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,cursor TEXT,exhausted INTEGER DEFAULT 0,configured INTEGER DEFAULT 0,head_at INTEGER DEFAULT 0);
 CREATE TABLE jobs(account_id TEXT,message_id TEXT,thread_id TEXT,received_at INTEGER,done INTEGER DEFAULT 0,attempts INTEGER DEFAULT 0,retry_at INTEGER DEFAULT 0,PRIMARY KEY(account_id,thread_id));
 INSERT INTO accounts VALUES('a','old-cursor',1,1,999);
 INSERT INTO jobs VALUES('a','completed','thread',10,1,1,0);`);
 assert.equal(initializeBatchQueue(db,100),100);
 assert.equal(initializeBatchQueue(db,200),100);
 enqueueMessages(db,'a',[{id:'completed',threadId:'thread',receivedAt:10},{id:'second',threadId:'thread',receivedAt:20}]);
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM jobs').get().count,2);
 assert.equal(db.prepare("SELECT done FROM jobs WHERE message_id='completed'").get().done,1);
 assert.equal(db.prepare("SELECT cursor FROM accounts WHERE id='a'").get().cursor,null);
 assert.equal(db.prepare("SELECT configured FROM accounts WHERE id='a'").get().configured,1);
 db.close();
});

test('claims ten individual old messages, prioritizes arrivals, and leases without overlap',()=>{
 const db=new DatabaseSync(':memory:');initializeBatchQueue(db,100);
 enqueueMessages(db,'a',Array.from({length:25},(_,i)=>({id:`mail-${i}`,threadId:'same-thread',receivedAt:i<23?i:101+i})));
 const old=claimEmailBatch(db,{accountId:'a',cutoff:100,priority:false,now:1000});
 assert.equal(old.length,10);
 assert(old.every(job=>job.received_at<100));
 const second=claimEmailBatch(db,{accountId:'a',cutoff:100,priority:false,now:1000});
 assert.equal(second.length,10);
 assert(second.every(job=>!old.some(first=>first.message_id===job.message_id)));
 assert.equal(claimEmailBatch(db,{accountId:'a',cutoff:100,priority:true,limit:1,now:1000})[0].message_id,'mail-24');
 assert.equal(claimEmailBatch(db,{accountId:'a',cutoff:100,priority:true,limit:1,now:1000})[0].message_id,'mail-23');
 assert.equal(claimEmailBatch(db,{accountId:'a',cutoff:100,priority:true,limit:1,now:1001}).length,0);
 assert.equal(claimEmailBatch(db,{accountId:'a',cutoff:100,priority:false,now:601000}).length,10);
 db.close();
});
