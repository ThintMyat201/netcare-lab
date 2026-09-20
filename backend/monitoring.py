import math
from datetime import datetime,timedelta
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError
from core import db,now,stamp,uid,authorize,audit,Document
from auth import current

router=APIRouter(prefix='/api')
def metrics(asset,at=None):
    at=at or now(); phase=int(at.timestamp()//900); n=sum(map(ord,asset['id']))
    stale=asset.get('scenario')=='feed' or not asset.get('last_seen') or (now()-datetime.fromisoformat(asset['last_seen'])).total_seconds()>1200
    scenario=asset.get('scenario','normal')
    status='stale' if stale else 'offline' if scenario=='outage' else 'congested' if scenario=='congestion' else 'online'
    clients=None if stale else 0 if status=='offline' else 70+n%15 if status=='congested' else 14+(n+phase)%26
    load=None if stale else 0 if status=='offline' else 88+(n+phase)%10 if status=='congested' else 18+(n+phase)%36
    latency=None if stale or status=='offline' else 120+(n+phase)%35 if status=='congested' else 8+(n+phase)%14
    return {'status':status,'clients':clients,'load':load,'latency':latency,'throughput':None if stale else round((clients or 0)*(.8+math.sin(phase+n)*.15),1)}

async def generate_sample(at=None,seed_history=False):
    at=at or now(); rows=await db.assets.find({'kind':'AP','archived':False},{'_id':0}).to_list(500)
    for asset in rows:
        if asset.get('scenario')=='feed': continue
        if not seed_history: asset['last_seen']=at.isoformat()
        m=metrics(asset,at)
        if seed_history and at<now()-timedelta(hours=2):
            asset['scenario']='normal';m=metrics(asset,at)
        row={'id':uid(),'asset_id':asset['id'],'lab_id':asset['lab_id'],'timestamp':at.isoformat(),**m,'expires_at':at+timedelta(days=7),'synthetic':True}
        await db.telemetry.update_one({'asset_id':asset['id'],'timestamp':at.isoformat()},{'$setOnInsert':row},upsert=True)
        if not seed_history: await db.assets.update_one({'id':asset['id']},{'$set':{'last_seen':at.isoformat()}})
    # Explicit bound in addition to TTL, including manual high-frequency scenario exercises.
    await db.telemetry.delete_many({'expires_at':{'$lt':now()}})
    count=await db.telemetry.count_documents({})
    if count>20000:
        oldest=await db.telemetry.find({},{'_id':0,'id':1}).sort('timestamp',1).limit(count-20000).to_list(count-20000)
        await db.telemetry.delete_many({'id':{'$in':[r['id'] for r in oldest]}})

async def sync_alerts():
    for a in await db.assets.find({'kind':'AP','archived':False},{'_id':0}).to_list(500):
        m=metrics(a); status=m['status']; key=f'{a["id"]}:{status}'
        await db.alerts.update_many({'asset_id':a['id'],'active':True,'active_key':{'$ne':key}},{'$set':{'active':False,'resolved_at':stamp()},'$unset':{'active_key':''}})
        if status=='online': continue
        row={'id':uid(),'asset_id':a['id'],'asset_tag':a['tag'],'lab_id':a['lab_id'],'lab_name':a['lab_name'],'status':status,'severity':'high' if status=='offline' else 'medium','title':{'offline':'Access point unreachable','congested':'High client congestion','stale':'Telemetry feed interrupted — status unknown'}[status],'detail':{'offline':'Explicit synthetic AP outage scenario.','congested':'Synthetic utilization exceeds the 85% threshold.','stale':'No fresh telemetry. An outage is not inferred.'}[status],'active_key':key,'active':True,'created_at':stamp(),'synthetic':True}
        try: await db.alerts.update_one({'active_key':key},{'$setOnInsert':row},upsert=True)
        except DuplicateKeyError: pass

@router.get('/monitoring')
async def monitoring(lab_id:str='',user=Depends(current)):
    await authorize(user,'view'); await sync_alerts()
    query={'kind':'AP','archived':False}
    if lab_id: query['lab_id']=lab_id
    aps=await db.assets.find(query,{'_id':0}).sort('tag',1).to_list(500)
    aps=[{**a,**metrics(a)} for a in aps]
    histories=await db.telemetry.find({'asset_id':{'$in':[a['id'] for a in aps]},'timestamp':{'$gte':(now()-timedelta(hours=24)).isoformat()}},{'_id':0,'expires_at':0}).sort('timestamp',1).to_list(20000)
    buckets={}
    for t in histories:
        b=buckets.setdefault(t['timestamp'],{'timestamp':t['timestamp'],'clients':0,'throughput':0,'load':[],'latency':[]})
        b['clients']+=t['clients'] or 0;b['throughput']+=t['throughput'] or 0
        if t['load'] is not None: b['load'].append(t['load'])
        if t['latency'] is not None: b['latency'].append(t['latency'])
    history=[{**b,'throughput':round(b['throughput'],1),'load':round(sum(b['load'])/len(b['load']),1) if b['load'] else None,'latency':round(sum(b['latency'])/len(b['latency']),1) if b['latency'] else None} for b in buckets.values()]
    alerts=await db.alerts.find({'active':True,**({'lab_id':lab_id} if lab_id else {})},{'_id':0}).sort('created_at',-1).to_list(500)
    return {'aps':aps,'history':history,'alerts':alerts,'synthetic':True,'last_updated':max((a.get('last_seen','') for a in aps),default=None),'server_time':stamp(),'stats':{'total':len(aps),'online':sum(a['status']=='online' for a in aps),'congested':sum(a['status']=='congested' for a in aps),'offline':sum(a['status']=='offline' for a in aps),'stale':sum(a['status']=='stale' for a in aps),'clients':sum(a['clients'] or 0 for a in aps)}}

@router.get('/monitoring/{id}/history')
async def ap_history(id:str,user=Depends(current)):
    await authorize(user,'view')
    asset=await db.assets.find_one({'id':id,'kind':'AP'},{'_id':0})
    if not asset: raise HTTPException(404,'Access point not found.')
    rows=await db.telemetry.find({'asset_id':id},{'_id':0,'expires_at':0}).sort('timestamp',-1).limit(200).to_list(200)
    return {'asset':{**asset,**metrics(asset)},'history':rows[::-1]}

class Scenario(BaseModel):
    asset_id:str
    scenario:Literal['normal','congestion','outage','feed']

@router.post('/simulation')
async def simulation(body:Scenario,user=Depends(current)):
    await authorize(user,'simulate');query={'kind':'AP','archived':False}
    if body.asset_id!='all': query['id']=body.asset_id
    assets=await db.assets.find(query,{'_id':0}).to_list(500)
    if not assets: raise HTTPException(404,'Access point not found.')
    change={'scenario':body.scenario,'scenario_at':stamp()}
    if body.scenario!='feed': change['last_seen']=stamp()
    await db.assets.update_many(query,{'$set':change})
    await generate_sample();await sync_alerts()
    await audit(user,'Scenario simulated',f'{body.asset_id} · {body.scenario}')
    return {'message':f'Simulation applied to {len(assets)} access point(s).','scenario':body.scenario}

@router.post('/monitoring/sample')
async def sample(user=Depends(current)):
    await authorize(user,'simulate');await generate_sample();await sync_alerts()
    return {'message':'Synthetic sample generated. Interrupted feeds remain unknown.'}

@router.get('/alerts',response_model=list[Document])
async def alerts(user=Depends(current)):
    await authorize(user,'view');await sync_alerts();return await db.alerts.find({},{'_id':0}).sort('created_at',-1).to_list(500)