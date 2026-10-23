import math
from datetime import datetime,timedelta
from typing import Literal
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from core import db,now,stamp,uid,authorize,audit,Document,DEMO
from auth import current

router=APIRouter(prefix='/api')

SCENARIO_LABELS={
    'normal':'Restore Normal Operations',
    'congestion':'Network Congestion',
    'outage':'Hardware Outage',
    'feed':'Telemetry Interruption',
    'flapping':'Intermittent Link Flapping',
    'degradation':'Gradual Degradation',
}

LAB_PROFILES={
    'lab-1':{'base_clients':30,'client_span':11,'base_load':34,'load_span':16,'tp_factor':0.95},
    'lab-2':{'base_clients':21,'client_span':9,'base_load':26,'load_span':15,'tp_factor':0.85},
    'lab-3':{'base_clients':46,'client_span':14,'base_load':48,'load_span':18,'tp_factor':1.22},
    'lab-4':{'base_clients':27,'client_span':10,'base_load':32,'load_span':15,'tp_factor':0.92},
    'zone-classroom-b':{'base_clients':34,'client_span':12,'base_load':36,'load_span':16,'tp_factor':0.8},
    'zone-lt1':{'base_clients':52,'client_span':16,'base_load':46,'load_span':18,'tp_factor':0.7},
    'zone-library':{'base_clients':38,'client_span':12,'base_load':34,'load_span':14,'tp_factor':0.9},
    'zone-canteen':{'base_clients':48,'client_span':18,'base_load':44,'load_span':20,'tp_factor':0.6},
    'zone-lounge':{'base_clients':29,'client_span':11,'base_load':30,'load_span':14,'tp_factor':0.75},
    'zone-busstop':{'base_clients':14,'client_span':9,'base_load':20,'load_span':12,'tp_factor':0.55},
}

_SAMPLE_SEQ=0

def _ap_num(asset)->int:
    digits=''.join(filter(str.isdigit,str(asset.get('id','1'))))
    return int(digits) if digits else 1

def metrics(asset,at=None):
    at=at or now()
    phase=int(at.timestamp()//900)
    live_tick=(int(at.timestamp()*2)+_SAMPLE_SEQ*7) if (at.second or at.microsecond or _SAMPLE_SEQ) else 0
    ap_num=_ap_num(asset)
    n=sum(map(ord,str(asset.get('id','ap-01'))))+ap_num*17
    lab_id=asset.get('lab_id','lab-1')
    prof=LAB_PROFILES.get(lab_id,LAB_PROFILES['lab-1'])

    campus_c=round(math.sin(live_tick*0.85)*2.5+math.cos(live_tick*0.5)*1.5) if live_tick else 0
    campus_l=round(math.sin(live_tick*0.75)*3+math.cos(live_tick*0.45)*2) if live_tick else 0
    wave_c=round(math.sin(phase*0.65+ap_num*1.3)*6+math.cos(phase*0.3+ap_num*0.7)*3+(math.sin(live_tick*0.9+ap_num*1.7)*3+campus_c if live_tick else 0))
    normal_clients=max(8,prof['base_clients']+(ap_num*5)%prof['client_span']+wave_c)
    wave_l=round(math.sin(phase*0.55+ap_num*1.1)*7+math.cos(phase*0.25+ap_num)*4+(math.cos(live_tick*0.8+ap_num*1.3)*3.5+campus_l if live_tick else 0))
    normal_load=max(12,min(78,prof['base_load']+(ap_num*4)%prof['load_span']+wave_l))
    normal_latency=max(5,8+(ap_num*3+phase+live_tick)%12+(4 if lab_id=='lab-3' else 0))
    normal_queue=max(2,8+(ap_num*3+phase+live_tick)%14)
    normal_tp=round(normal_clients*(prof['tp_factor']+math.sin(phase+ap_num+(live_tick*0.25 if live_tick else 0))*0.14),1)

    scenario=asset.get('scenario','normal')
    last_seen_raw=asset.get('last_seen')
    is_expired=(not last_seen_raw) or (at-datetime.fromisoformat(last_seen_raw)).total_seconds()>1200

    if scenario=='feed' or (is_expired and scenario not in ('outage','congestion','degradation','flapping')):
        return {'status':'stale','clients':None,'load':None,'latency':None,'throughput':None,'queue_depth':None}

    if scenario=='outage':
        return {'status':'offline','clients':0,'load':0,'latency':None,'throughput':0.0,'queue_depth':0}

    if scenario=='congestion':
        jitter_c=round(math.sin(live_tick*0.95+ap_num)*4+campus_c) if live_tick else 0
        jitter_l=round(math.cos(live_tick*0.8+ap_num)*3) if live_tick else 0
        clients=max(62,(84 if lab_id=='lab-3' else 72)+(ap_num*5+phase)%15+jitter_c)
        load=min(98,max(85,88+(ap_num*3+phase)%10+jitter_l))
        latency=122+(ap_num*7+phase+live_tick)%35
        queue_depth=260+(ap_num*29+phase*19+live_tick*13)%180
        tp=round(clients*(0.88+math.sin(phase+n+(live_tick*0.3 if live_tick else 0))*0.15),1)
        return {'status':'congested','clients':clients,'load':load,'latency':latency,'throughput':tp,'queue_depth':queue_depth}

    if scenario=='flapping':
        flap_slot=int(at.timestamp()//30)
        flap_state=asset.get('flap_state')
        flap_mod=(flap_slot+ap_num*2)%3
        if flap_state=='interrupted' or (flap_state is None and flap_mod==0):
            return {'status':'stale','clients':None,'load':None,'latency':None,'throughput':None,'queue_depth':None}
        if flap_state=='normal':
            return {'status':'online','clients':normal_clients,'load':normal_load,'latency':normal_latency,'throughput':normal_tp,'queue_depth':normal_queue}
        # Microburst spike state during flapping
        clients=normal_clients+20+(ap_num*3+flap_slot)%14
        load=min(96,86+(ap_num*4+flap_slot)%10)
        latency=96+(ap_num*9+flap_slot*7)%52
        queue_depth=215+(ap_num*23+flap_slot*31)%175
        tp=round(clients*(1.24+abs(math.sin(flap_slot+ap_num))*0.32),1)
        return {'status':'congested','clients':clients,'load':load,'latency':latency,'throughput':tp,'queue_depth':queue_depth}

    if scenario=='degradation':
        if asset.get('degradation_progress') is not None:
            progress=max(0.0,min(1.0,float(asset['degradation_progress'])))
        else:
            scen_at_raw=asset.get('scenario_at')
            if scen_at_raw:
                scen_at=datetime.fromisoformat(scen_at_raw)
                diff=(at-scen_at).total_seconds()
                if diff<0:
                    # Ramp over the 2-hour window leading up to scenario_at
                    progress=max(0.0,min(1.0,1.0+diff/7200.0))
                else:
                    progress=min(1.0,0.87+((ap_num%4)*0.04)+diff/900.0)
            else:
                progress=0.9
        load=min(95,max(20,round(20+progress*75)))
        clients=max(10,round(normal_clients*(0.65+progress*1.15)))
        queue_depth=round(14+(progress**2.1)*450+(30 if progress>=0.7 else 0)*abs(math.sin(phase+ap_num)))
        latency=round(12+(progress**1.8)*148+(ap_num%5)*3)
        status='congested' if load>=85 else 'online'
        tp=round(clients*(0.85+progress*0.42),1)
        return {'status':status,'clients':clients,'load':load,'latency':latency,'throughput':tp,'queue_depth':queue_depth}

    return {'status':'online','clients':normal_clients,'load':normal_load,'latency':normal_latency,'throughput':normal_tp,'queue_depth':normal_queue}

async def generate_sample(at=None,seed_history=False,overwrite=False):
    global _SAMPLE_SEQ
    if overwrite and not seed_history:
        _SAMPLE_SEQ+=1
    raw_at=at or now()
    slot_at=raw_at if seed_history else raw_at.replace(second=0,microsecond=0)
    slot_iso=slot_at.isoformat()
    rows=await db.assets.find({'kind':'AP','archived':False},{'_id':0}).to_list(500)
    for asset in rows:
        if asset.get('scenario')=='feed' and not overwrite: continue
        if not seed_history and asset.get('scenario')!='feed': asset['last_seen']=raw_at.isoformat()
        sample_asset={**asset,'last_seen':raw_at.isoformat()} if seed_history else asset
        if seed_history and raw_at<now()-timedelta(hours=2):
            sample_asset['scenario']='normal'
            sample_asset.pop('degradation_progress',None)
            sample_asset.pop('flap_state',None)
        m=metrics(sample_asset,raw_at)
        row={'id':uid(),'asset_id':asset['id'],'lab_id':asset['lab_id'],'timestamp':slot_iso,**m,'expires_at':slot_at+timedelta(days=7),'synthetic':True}
        if overwrite:
            row_update={k:v for k,v in row.items() if k!='id'}
            await db.telemetry.update_one({'asset_id':asset['id'],'timestamp':slot_iso},{'$set':row_update,'$setOnInsert':{'id':row['id']}},upsert=True)
        else:
            await db.telemetry.update_one({'asset_id':asset['id'],'timestamp':slot_iso},{'$setOnInsert':row},upsert=True)
        if not seed_history and asset.get('scenario')!='feed':
            await db.assets.update_one({'id':asset['id']},{'$set':{'last_seen':raw_at.isoformat()}})
    if not seed_history:
        # Explicit bound in addition to TTL, including manual high-frequency scenario exercises.
        await db.telemetry.delete_many({'expires_at':{'$lt':now()}})
        count=await db.telemetry.count_documents({})
        if count>20000:
            oldest=await db.telemetry.find({},{'_id':0,'id':1}).sort('timestamp',1).limit(count-20000).to_list(count-20000)
            await db.telemetry.delete_many({'id':{'$in':[r['id'] for r in oldest]}})

async def _write_scenario_sequence(assets,scenario,at_now):
    """Populate recent 15-minute slots so progressive degradation, flapping, or baseline restoration is immediately reflected in telemetry history."""
    base=at_now.replace(minute=(at_now.minute//15)*15,second=0,microsecond=0)
    steps=8
    for idx in range(steps,-1,-1):
        slot=base-timedelta(minutes=15*idx)
        progress=(steps-idx)/steps
        for asset in assets:
            sample_asset={**asset,'scenario':scenario,'last_seen':slot.isoformat()}
            if scenario=='degradation':
                sample_asset['degradation_progress']=progress
            elif scenario=='flapping':
                sample_asset['flap_state']='interrupted' if (idx+_ap_num(asset))%3==0 else ('microburst' if (idx+_ap_num(asset))%2==0 else 'normal')
            elif scenario=='normal':
                sample_asset.pop('degradation_progress',None)
                sample_asset.pop('flap_state',None)
            m=metrics(sample_asset,slot)
            row_update={'asset_id':asset['id'],'lab_id':asset['lab_id'],'timestamp':slot.isoformat(),**m,'expires_at':slot+timedelta(days=7),'synthetic':True}
            await db.telemetry.update_one({'asset_id':asset['id'],'timestamp':slot.isoformat()},{'$set':row_update,'$setOnInsert':{'id':uid()}},upsert=True)

async def ensure_access_points():
    labs = [
        {'id': 'lab-1', 'name': 'Computing Lab A', 'code': 'CL-A'},
        {'id': 'lab-2', 'name': 'Computing Lab B', 'code': 'CL-B'},
        {'id': 'lab-3', 'name': 'Innovation Lab', 'code': 'IL'},
    ]
    now_ts = stamp()
    for i in range(12):
        lab = labs[i // 4]
        n = i + 1
        ap_id = f'ap-{n:02}'
        tag = f'AP-{lab["code"]}-{i % 4 + 1:02}'
        row = {
            'id': ap_id,
            'tag': tag,
            'name': f'{lab["name"]} · AP {i % 4 + 1:02}',
            'kind': 'AP',
            'lab_id': lab['id'],
            'lab_name': lab['name'],
            'ip': f'10.20.{i // 4 + 1}.{n + 10}',
            'model': 'Aruba AP-515',
            'archived': False,
            'scenario': 'normal',
            'scenario_at': now_ts,
            'last_seen': now_ts,
            'created_at': now_ts,
        }
        await db.assets.update_one({'id': ap_id}, {'$setOnInsert': row}, upsert=True)
        await db.assets.update_one({'id': ap_id, 'archived': True}, {'$set': {'archived': False}})

async def ensure_telemetry_history():
    if not DEMO: return
    await ensure_access_points()
    active_aps=await db.assets.find({'kind':'AP','archived':False},{'_id':0}).sort('tag',1).to_list(500)
    if len(active_aps)>=4 and all(a.get('scenario') in ('congestion','degradation') for a in active_aps):
        latest_scen=max((a.get('scenario_at','') for a in active_aps),default='')
        should_reset=True
        if latest_scen:
            try:
                should_reset=(now()-datetime.fromisoformat(latest_scen)).total_seconds()>120
            except ValueError:
                should_reset=True
        if should_reset:
            ts_now=stamp()
            congested_target='ap-07' if any(a['id']=='ap-07' for a in active_aps) else active_aps[-2]['id']
            await db.assets.update_many({'kind':'AP','archived':False,'id':{'$ne':congested_target}},{'$set':{'scenario':'normal','scenario_at':ts_now,'last_seen':ts_now},'$unset':{'degradation_progress':'','flap_state':'','synthetic_override':''}})
            await db.assets.update_one({'id':congested_target},{'$set':{'scenario':'congestion','scenario_at':ts_now,'last_seen':ts_now}})
            repaired_aps=await db.assets.find({'kind':'AP','archived':False,'id':{'$ne':congested_target}},{'_id':0}).to_list(500)
            await _write_scenario_sequence(repaired_aps,'normal',now())
    all_ts=await db.telemetry.distinct('timestamp')
    stale_ts=[]
    for t in all_ts:
        if not isinstance(t,str): continue
        if t.endswith('+00:00') or t.endswith('Z'):
            stale_ts.append(t)
            continue
        try:
            dt=datetime.fromisoformat(t)
            if dt.second!=0 or dt.microsecond!=0:
                stale_ts.append(t)
        except ValueError:
            pass
    if stale_ts:
        await db.telemetry.delete_many({'timestamp':{'$in':stale_ts}})
    cutoff=(now()-timedelta(hours=24,minutes=15)).isoformat()
    existing=[datetime.fromisoformat(t) for t in await db.telemetry.distinct('timestamp',{'timestamp':{'$gte':cutoff}})]
    base=now().replace(minute=(now().minute//15)*15,second=0,microsecond=0)
    missing=[base-timedelta(minutes=15*step) for step in range(96,-1,-1) if not any(abs((ts-(base-timedelta(minutes=15*step))).total_seconds())<450 for ts in existing)]
    if not missing: return
    for slot in missing:
        await generate_sample(slot,seed_history=True)
    if not any((now()-ts).total_seconds()<3600 for ts in existing):
        await db.assets.update_many({'kind':'AP','archived':False,'scenario':{'$ne':'feed'}},{'$set':{'last_seen':base.isoformat()}})
    await db.telemetry.delete_many({'expires_at':{'$lt':now()}})

async def sync_alerts():
    for a in await db.assets.find({'kind':'AP','archived':False},{'_id':0}).to_list(500):
        m=metrics(a); status=m['status']; scenario=a.get('scenario','normal')
        key=f'{a["id"]}:{status}'
        await db.alerts.update_many({'asset_id':a['id'],'active':True,'active_key':{'$ne':key}},{'$set':{'active':False,'resolved_at':stamp()},'$unset':{'active_key':''}})
        if status=='online': continue
        if scenario=='flapping':
            title='Intermittent link flapping — feed unstable' if status=='stale' else 'Microburst congestion — link flapping'
            detail='Access point is rapidly transitioning between normal and feed-interrupted states with microburst traffic spikes.'
        elif scenario=='degradation':
            title='Gradual bandwidth degradation — queue depth spike'
            detail=f'Progressive congestion climb (20% → {m.get("load",90)}%) with dynamic queue depth spike ({m.get("queue_depth",320)} pkts).'
        else:
            title={'offline':'Access point unreachable','congested':'High client congestion','stale':'Telemetry feed interrupted — status unknown'}[status]
            detail={'offline':'Explicit synthetic AP outage scenario.','congested':'Synthetic utilization exceeds the 85% threshold.','stale':'No fresh telemetry. An outage is not inferred.'}[status]
        row={'id':uid(),'asset_id':a['id'],'asset_tag':a['tag'],'lab_id':a['lab_id'],'lab_name':a['lab_name'],'status':status,'severity':'high' if status=='offline' else 'medium','title':title,'detail':detail,'active_key':key,'active':True,'created_at':stamp(),'synthetic':True}
        try: await db.alerts.update_one({'active_key':key},{'$setOnInsert':row},upsert=True)
        except DuplicateKeyError: pass

async def sync_simulation_tickets(assets,scenario:str,user:dict):
    asset_ids=[a['id'] for a in assets]
    if scenario=='normal':
        await db.tickets.update_many(
            {'asset_id':{'$in':asset_ids},'synthetic':True,'status':{'$ne':'resolved'}},
            {
                '$set':{'status':'resolved','resolved_at':stamp(),'updated_at':stamp(),'resolution_notes':'Automatically resolved upon restoring normal network operations.'},
                '$unset':{'active_key':''},
                '$push':{'events':{'actor':user['name'],'action':'Resolved (Normal operations restored)','timestamp':stamp()}},
            },
        )
        return
    # For fault scenarios, open/update synthetic support tickets for representative APs (up to 1 per lab when bulk, or exact AP when single)
    if len(assets)==1:
        targets=assets
    else:
        by_lab={}
        for a in assets:
            by_lab.setdefault(a['lab_id'],a)
        targets=list(by_lab.values())

    meta={
        'outage':('high','AP hardware outage — loss of signal','Synthetic hardware outage triggered via Network Simulation Controls. Access point is unreachable and requires investigation.'),
        'feed':('medium','AP telemetry feed interrupted','Telemetry heartbeat timed out during simulation exercise. Device status is unconfirmed.'),
        'congestion':('medium','High client congestion threshold exceeded','Simulated client density and bandwidth load exceeded 85% utilization threshold.'),
        'flapping':('high','Intermittent link flapping & microburst loss','Access point is rapidly transitioning between normal and feed-interrupted states over short intervals.'),
        'degradation':('medium','Progressive bandwidth degradation & queue spike','Bandwidth load ramped from 20% to 95% with elevated packet queue depth spikes.'),
    }[scenario]
    priority,title,description=meta
    for asset in targets:
        key=f'{asset["id"]}:network'
        existing=await db.tickets.find_one({'active_key':key},{'_id':0})
        if existing:
            await db.tickets.update_one(
                {'id':existing['id']},
                {
                    '$set':{'title':title,'description':description,'priority':priority,'updated_at':stamp(),'synthetic':True,'scenario':scenario},
                    '$addToSet':{'reporter_ids':user['id']},
                    '$push':{'events':{'actor':user['name'],'action':f'Simulation triggered ({SCENARIO_LABELS.get(scenario,scenario)})','timestamp':stamp()}},
                },
            )
        else:
            counter=await db.counters.find_one_and_update({'key':'ticket'},{'$inc':{'value':1}},upsert=True,return_document=ReturnDocument.AFTER)
            row={
                'id':uid(),
                'number':f'INC-{counter["value"]}',
                'asset_id':asset['id'],
                'asset_tag':asset['tag'],
                'lab_name':asset['lab_name'],
                'category':'network',
                'title':title,
                'description':description,
                'status':'open',
                'priority':priority,
                'active_key':key,
                'reporter_ids':list({user['id'],'assistant'}),
                'created_by':user['id'],
                'created_at':stamp(),
                'updated_at':stamp(),
                'resolution_notes':'',
                'synthetic':True,
                'scenario':scenario,
                'events':[{'actor':user['name'],'action':f'Ticket opened ({SCENARIO_LABELS.get(scenario,scenario)})','timestamp':stamp()}],
            }
            try:
                await db.tickets.insert_one(row.copy())
            except DuplicateKeyError:
                pass

@router.get('/monitoring')
async def monitoring(lab_id:str='',user=Depends(current)):
    await authorize(user,'view'); await ensure_telemetry_history(); await sync_alerts()
    query={'kind':'AP','archived':False}
    if lab_id: query['lab_id']=lab_id
    aps=await db.assets.find(query,{'_id':0}).sort('tag',1).to_list(500)
    aps=[{**a,**metrics(a)} for a in aps]
    histories=await db.telemetry.find({'asset_id':{'$in':[a['id'] for a in aps]},'timestamp':{'$gte':(now()-timedelta(hours=24)).isoformat()}},{'_id':0,'expires_at':0}).sort('timestamp',1).to_list(20000)
    buckets={}
    for t in histories:
        b=buckets.setdefault(t['timestamp'],{'timestamp':t['timestamp'],'clients':0,'throughput':0,'load':[],'latency':[],'queue_depth':[]})
        b['clients']+=t['clients'] or 0;b['throughput']+=t['throughput'] or 0
        if t.get('load') is not None: b['load'].append(t['load'])
        if t.get('latency') is not None: b['latency'].append(t['latency'])
        if t.get('queue_depth') is not None: b['queue_depth'].append(t['queue_depth'])
    history=[{**b,'throughput':round(b['throughput'],1),'load':round(sum(b['load'])/len(b['load']),1) if b['load'] else None,'latency':round(sum(b['latency'])/len(b['latency']),1) if b['latency'] else None,'queue_depth':round(sum(b['queue_depth'])/len(b['queue_depth']),1) if b['queue_depth'] else 0} for b in buckets.values()]
    alerts=await db.alerts.find({'active':True,**({'lab_id':lab_id} if lab_id else {})},{'_id':0}).sort('created_at',-1).to_list(500)
    return {'aps':aps,'history':history,'alerts':alerts,'synthetic':True,'last_updated':max((a.get('last_seen','') for a in aps),default=None),'server_time':stamp(),'stats':{'total':len(aps),'online':sum(a['status']=='online' for a in aps),'congested':sum(a['status']=='congested' for a in aps),'offline':sum(a['status']=='offline' for a in aps),'stale':sum(a['status']=='stale' for a in aps),'clients':sum(a['clients'] or 0 for a in aps)}}

@router.get('/monitoring/{id}/history')
async def ap_history(id:str,user=Depends(current)):
    await authorize(user,'view'); await ensure_telemetry_history()
    asset=await db.assets.find_one({'id':id,'kind':'AP'},{'_id':0})
    if not asset: raise HTTPException(404,'Access point not found.')
    rows=await db.telemetry.find({'asset_id':id},{'_id':0,'expires_at':0}).sort('timestamp',-1).limit(200).to_list(200)
    return {'asset':{**asset,**metrics(asset)},'history':rows[::-1]}

class Scenario(BaseModel):
    asset_id:str='all'
    lab_id:str|None=None
    scenario:Literal['normal','congestion','outage','feed','flapping','degradation']

@router.post('/simulation')
async def simulation(body:Scenario,user=Depends(current)):
    await authorize(user,'simulate')
    query:dict={'kind':'AP','archived':False}
    target_id=body.lab_id or body.asset_id
    if target_id!='all':
        if target_id.startswith(('lab-','zone-')) or target_id in ('Computing Lab A','Computing Lab B','Computing Lab C','Innovation Lab'):
            query['$or']=[{'lab_id':target_id},{'lab_name':target_id}]
        else:
            query['$or']=[{'id':target_id},{'tag':target_id}]
    assets=await db.assets.find(query,{'_id':0}).to_list(500)
    if not assets: raise HTTPException(404,'Access point not found.')
    at_now=now()
    ts=at_now.isoformat()
    change={'scenario':body.scenario,'scenario_at':ts}
    if body.scenario!='feed': change['last_seen']=ts
    unset_fields={'degradation_progress':'','flap_state':'','synthetic_override':''}
    if body.scenario=='normal':
        await db.assets.update_many({'id':{'$in':[a['id'] for a in assets]}},{'$set':change,'$unset':unset_fields})
    else:
        await db.assets.update_many({'id':{'$in':[a['id'] for a in assets]}},{'$set':{**change,'synthetic_override':True},'$unset':{'degradation_progress':'','flap_state':''}})
    if body.scenario in ('degradation','flapping','normal'):
        await _write_scenario_sequence(assets,body.scenario,at_now)
    await generate_sample(at_now,overwrite=True)
    await sync_alerts()
    await sync_simulation_tickets(assets,body.scenario,user)
    target_label='All Access Points' if target_id=='all' else (assets[0]['lab_name'] if target_id.startswith(('lab-','zone-')) else (assets[0]['tag'] if len(assets)==1 else target_id))
    await audit(user,'Scenario simulated',f'{target_label} · {body.scenario}')
    return {'message':f'Simulation ({SCENARIO_LABELS.get(body.scenario,body.scenario)}) applied to {len(assets)} access point(s).','scenario':body.scenario,'affected':len(assets)}

@router.post('/monitoring/sample')
async def sample(user=Depends(current)):
    await authorize(user,'simulate');await generate_sample(overwrite=True);await sync_alerts()
    return {'message':'Synthetic sample generated. Interrupted feeds remain unknown.','sampled_at':stamp()}

@router.get('/alerts',response_model=list[Document])
async def alerts(user=Depends(current)):
    await authorize(user,'view');await sync_alerts();return await db.alerts.find({},{'_id':0}).sort('created_at',-1).to_list(500)

class RemediateInput(BaseModel):
    action:Literal['reboot','reset_radio','verify_feed','reboot_poe','rebalance_channel','restart_agent']='reboot'

RemediateAction = RemediateInput

@router.post('/monitoring/{id}/diagnose')
async def diagnose_ap(id:str,user=Depends(current)):
    await authorize(user,'view')
    asset=await db.assets.find_one({'id':id},{'_id':0})
    if not asset: raise HTTPException(404,'Device not found.')
    m=metrics(asset) if asset.get('kind')=='AP' else {'status':'online','latency':9,'load':24,'clients':1}
    status=m.get('status','online')
    base_rtt=m.get('latency') or (142 if status=='congested' else 11)
    loss=100 if status=='offline' else (25 if status=='stale' else (8 if status=='congested' else 0))
    ap_num=_ap_num(asset)
    channel=149 if status=='congested' else 36+((ap_num*4)%4)*4
    poe_watts=0.0 if status=='offline' else round(14.2+(ap_num%5)*1.1+(3.4 if status=='congested' else 0),1)
    snr=0 if status=='offline' else (21 if status=='congested' else 38-(ap_num%6))
    ch_label=f'Ch {channel} (80 MHz · High DFS Contention)' if status=='congested' else f'Ch {channel} (80 MHz · Clean)'
    sw_port=f'SW-{(asset.get("lab_id") or "LAB1").upper().replace("-","")}-Gi1/0/{ap_num}'
    summary=(
        '100% ICMP packet loss. Switch port reports PoE link down.'
        if status=='offline'
        else 'Elevated airtime utilization and packet retransmissions on 5GHz radio.'
        if status=='congested'
        else 'ICMP reachable with intermittent SNMP/telemetry agent timeout.'
        if status=='stale'
        else '0% packet loss, healthy PoE power draw, and optimal SNR.'
    )
    return {
        'asset_id':asset['id'],
        'asset_tag':asset['tag'],
        'tag':asset['tag'],
        'ip':asset.get('ip','10.20.1.11'),
        'status':status,
        'packets_sent':5,
        'packets_received':0 if status=='offline' else (4 if status in ('stale','congested') else 5),
        'packet_loss_pct':loss,
        'rtt_min_ms':None if status=='offline' else max(2,base_rtt-3),
        'rtt_avg_ms':None if status=='offline' else base_rtt,
        'rtt_max_ms':None if status=='offline' else base_rtt+7,
        'poe_draw_watts':poe_watts,
        'poe_status':'No Power / Link Down' if status=='offline' else '802.3at PoE+ Nominal',
        'radio_channel':ch_label,
        'channel_5ghz':ch_label,
        'snr_db':snr,
        'switch_port':sw_port,
        'gateway_hop':f'10.20.{max(1,min(3,(ap_num-1)//4+1))}.1',
        'summary':summary,
        'timestamp':stamp(),
    }

@router.post('/monitoring/{id}/remediate')
async def remediate_ap(id:str,body:RemediateInput,user=Depends(current)):
    await authorize(user,'simulate')
    asset=await db.assets.find_one({'id':id},{'_id':0})
    if not asset: raise HTTPException(404,'Device not found.')
    ts_now=stamp()
    await db.assets.update_one(
        {'id':id},
        {
            '$set':{'scenario':'normal','scenario_at':ts_now,'last_seen':ts_now},
            '$unset':{'degradation_progress':'','flap_state':'','synthetic_override':''},
        },
    )
    await db.alerts.update_many(
        {'asset_id':id,'active':True},
        {'$set':{'active':False,'resolved_at':ts_now},'$unset':{'active_key':''}},
    )
    updated=await db.assets.find_one({'id':id},{'_id':0})
    await _write_scenario_sequence([updated],'normal',now())
    await generate_sample(overwrite=True)
    await sync_alerts()
    action_label={
        'reboot':'PoE port cycled & AP rebooted — Device Restored to Online',
        'reboot_poe':'PoE port cycled & AP rebooted — Device Restored to Online',
        'reset_radio':'5GHz radio channels rebalanced — Device Restored to Online',
        'rebalance_channel':'5GHz radio channels rebalanced — Device Restored to Online',
        'verify_feed':'Telemetry heartbeat agent restarted — Device Restored to Online',
        'restart_agent':'Telemetry heartbeat agent restarted — Device Restored to Online',
    }.get(body.action,'Remediation completed — Device Restored to Online')
    await audit(user,'Device remediated',f'{asset["tag"]} · {action_label}',id)
    fresh={**updated,**metrics(updated)}
    return {'ok':True,'status':'online','action_label':action_label,'message':f'{action_label} on {asset["tag"]}.','asset':fresh}