import os
import math
from datetime import timedelta
from core import db, uid, stamp, now, DEMO, indexes
from auth import hash_password

async def seed():
    await indexes()
    if await db.meta.find_one({'key':'seeded'}): return
    if not DEMO: return
    labs=[{'id':'lab-1','name':'Computing Lab A','building':'Technology Building','floor':'1st floor','code':'CL-A'}, {'id':'lab-2','name':'Computing Lab B','building':'Technology Building','floor':'2nd floor','code':'CL-B'}, {'id':'lab-3','name':'Innovation Lab','building':'Engineering Building','floor':'1st floor','code':'IL'}]
    for row in labs: await db.labs.update_one({'id':row['id']},{'$setOnInsert':row},upsert=True)
    people=[('owner',os.environ['ADMIN_EMAIL'],'Campus Owner','admin'),('admin','admin@atlas.demo','Alex Morgan','admin'),('engineer','engineer@atlas.demo','Daniel Reyes','engineer'),('eng-2','sofia@atlas.demo','Sofia Cruz','engineer'),('assistant','assistant@atlas.demo','Jamie Santos','assistant'),('asst-2','mika@atlas.demo','Mika Flores','assistant'),('asst-3','leo@atlas.demo','Leo Garcia','assistant'),('asst-4','nina@atlas.demo','Nina Ramos','assistant'),('asst-5','kai@atlas.demo','Kai Mendoza','assistant')]
    password_hash=hash_password(os.environ['DEMO_PASSWORD'])
    for id,email,name,role in people:
        await db.users.update_one({'id':id},{'$setOnInsert':{'id':id,'email':email,'name':name,'role':role,'active':True,'password_hash':hash_password(os.environ['ADMIN_PASSWORD']) if id=='owner' else password_hash,'created_at':stamp()}},upsert=True)
    for i in range(12):
        lab=labs[i//4]; n=i+1; state='congestion' if n==7 else 'outage' if n==11 else 'normal'
        row={'id':f'ap-{n:02}','tag':f'AP-{lab["code"]}-{i%4+1:02}','name':f'{lab["name"]} · AP {i%4+1:02}','kind':'AP','lab_id':lab['id'],'lab_name':lab['name'],'ip':f'10.20.{i//4+1}.{n+10}','model':'Aruba AP-515','archived':False,'scenario':state,'scenario_at':stamp(),'last_seen':stamp(),'created_at':stamp()}
        await db.assets.update_one({'id':row['id']},{'$setOnInsert':row},upsert=True)
    for i in range(30):
        lab=labs[i//10]
        row={'id':f'pc-{i+1:02}','tag':f'PC-{lab["code"]}-{i%10+1:02}','name':f'Workstation {i%10+1:02}','kind':'PC','lab_id':lab['id'],'lab_name':lab['name'],'ip':f'10.30.{i//10+1}.{i%10+10}','model':'Dell OptiPlex 7010','archived':False,'created_at':stamp()}
        await db.assets.update_one({'id':row['id']},{'$setOnInsert':row},upsert=True)
    for i,(asset,cat,title) in enumerate([('pc-03','network','Intermittent network connection'),('pc-14','display','Display flickers during use'),('pc-22','peripherals','Keyboard not responding')]):
        a=await db.assets.find_one({'id':asset},{'_id':0})
        ticket={'id':f'ticket-seed-{i}','number':f'INC-{1001+i}','asset_id':asset,'asset_tag':a['tag'],'lab_name':a['lab_name'],'category':cat,'title':title,'description':'Reported during the morning equipment inspection. Fictional demonstration record.','status':'in_progress' if i==0 else 'open','priority':'high' if i==0 else 'medium','active_key':f'{asset}:{cat}','reporter_ids':['assistant'],'created_by':'assistant','created_at':(now()-timedelta(hours=2+i)).isoformat(),'updated_at':stamp(),'resolution_notes':'','events':[{'actor':'Jamie Santos','action':'Ticket opened','timestamp':stamp()}]}
        await db.tickets.update_one({'id':ticket['id']},{'$setOnInsert':ticket},upsert=True)
    await db.counters.update_one({'key':'ticket'},{'$setOnInsert':{'value':1003}},upsert=True)
    for i,assistant in enumerate(['assistant','asst-2','asst-3']):
        start=now().replace(minute=0,second=0,microsecond=0)+timedelta(hours=i-1)
        row={'id':f'shift-seed-{i}','assistant_id':assistant,'assistant_name':people[4+i][2],'lab_id':labs[i]['id'],'lab_name':labs[i]['name'],'start':start.isoformat(),'end':(start+timedelta(hours=4)).isoformat(),'acknowledged_at':None,'created_at':stamp(),'created_by':'admin','cancelled':False}
        await db.shifts.update_one({'id':row['id']},{'$setOnInsert':row},upsert=True)
    from monitoring import generate_sample, sync_alerts
    for step in range(96,-1,-1): await generate_sample(now()-timedelta(minutes=15*step), seed_history=True)
    await sync_alerts()
    for i,(action,detail,actor) in enumerate([('Campus initialized','3 labs · 12 access points · 30 workstations','Atlas Demo'),('Shift assigned','Jamie Santos → Computing Lab A','Alex Morgan'),('Ticket opened','PC-CL-A-03 · Network connection','Jamie Santos'),('Investigation started','INC-1001 assigned to engineering','Daniel Reyes')]):
        await db.audit.insert_one({'id':uid(),'actor_id':'admin','actor':actor,'action':action,'detail':detail,'timestamp':(now()-timedelta(minutes=24-i*6)).isoformat()})
    await db.meta.update_one({'key':'seeded'},{'$set':{'value':True,'created_at':stamp()}},upsert=True)