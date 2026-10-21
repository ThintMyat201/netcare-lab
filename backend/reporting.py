import hmac
import os
from collections import defaultdict
from datetime import datetime,timedelta
from fastapi import APIRouter,Depends,Request,HTTPException,BackgroundTasks
from pymongo.errors import DuplicateKeyError
from core import db,stamp,now,authorize,Document
from auth import current
from operations import ticket_scope,checklist_scope,make_reminders,shift_status
from monitoring import generate_sample,sync_alerts
import risk

router=APIRouter(prefix='/api')
@router.get('/overview')
async def overview(user=Depends(current)):
    await authorize(user,'view');await make_reminders()
    tickets=await db.tickets.find(ticket_scope(user),{'_id':0}).sort('created_at',-1).to_list(500)
    shifts=await db.shifts.find({'cancelled':False,**({'assistant_id':user['id']} if user['role']!='admin' else {})},{'_id':0}).sort('start',1).to_list(500)
    activity=await db.audit.find({} if user['role']=='admin' else {'actor_id':user['id']},{'_id':0}).sort('timestamp',-1).limit(6).to_list(6)
    return {'tickets':tickets[:5],'open_tickets':sum(t['status']!='resolved' for t in tickets),'resolved_tickets':sum(t['status']=='resolved' for t in tickets),'checklists':await db.checklists.count_documents(checklist_scope(user)),'shifts':[{**s,'status':shift_status(s)} for s in shifts],'activity':activity}

@router.get('/audit',response_model=list[Document])
async def audits(user=Depends(current)):
    await authorize(user,'audit');return await db.audit.find({},{'_id':0}).sort('timestamp',-1).to_list(1000)

# Hours from opening until a ticket at each priority should be resolved: Atlas NetCare's targets,
# with netcare-lab's top priority, high, taking Atlas's critical target.
SLA_HOURS={'high':4,'medium':24,'low':72}
PRIORITIES=[('high','High'),('medium','Medium'),('low','Low')]
CATEGORIES=[('power','Power'),('display','Display'),('peripherals','Peripherals'),('network','Network'),('software','Software'),('other','Other')]
TELEMETRY_DAYS=7

def hours_between(start,end):
    try: return (datetime.fromisoformat(end)-datetime.fromisoformat(start)).total_seconds()/3600
    except (TypeError,ValueError): return None

def risk_section(assets):
    """Assets by risk band, lab PCs and access points side by side, plus the ones with nothing to score."""
    rows={key:{'band':key,'label':label,'lab_pcs':0,'access_points':0,'total':0} for key,label in [*risk.BAND_LABELS.items(),('unscored','Not yet scored')]}
    for asset in assets:
        row=rows[asset['risk']['band'] if asset['risk'] else 'unscored']
        row['lab_pcs' if asset['kind']=='PC' else 'access_points']+=1
        row['total']+=1
    return list(rows.values())

def ticket_volume(tickets):
    matrix=[]
    for key,label in CATEGORIES:
        row={'category':key,'label':label,'total':0}
        for priority,_ in PRIORITIES:
            row[priority]=sum(t['category']==key and t['priority']==priority for t in tickets)
            row['total']+=row[priority]
        matrix.append(row)
    return matrix

def resolution_times(tickets):
    """Mean hours from opening to resolution per priority, against its target. Unresolved tickets are left out, not counted as zero."""
    rows=[]
    for priority,label in PRIORITIES:
        hours=[h for t in tickets if t['priority']==priority and t['status']=='resolved' for h in [hours_between(t.get('created_at'),t.get('resolved_at'))] if h is not None and h>=0]
        mean=round(sum(hours)/len(hours),1) if hours else None
        rows.append({'priority':priority,'label':label,'resolved':sum(t['priority']==priority and t['status']=='resolved' for t in tickets),'mean_hours':mean,'target_hours':SLA_HOURS[priority],'within_target':mean is not None and mean<=SLA_HOURS[priority]})
    return rows

def inspection_rates(checklists,labs):
    rows=[]
    for lab in labs:
        mine=[c for c in checklists if c.get('lab_name')==lab['name']]
        if not mine: continue
        passed=sum(c['result']=='passed' for c in mine)
        rows.append({'lab':lab['name'],'code':lab.get('code',lab['name']),'passed':passed,'failed':len(mine)-passed,'total':len(mine),'rate':round(passed/len(mine)*100,1)})
    return rows

def access_point_health(samples,labs):
    """Uptime, latency and the room's busiest moment per lab. Stale samples are unknown, so they count neither as up nor as down."""
    rows=[]
    for lab in labs:
        mine=[s for s in samples if s['lab_id']==lab['id'] and s.get('status') and s['status']!='stale']
        if not mine: continue
        latencies=[s['latency'] for s in mine if s.get('latency') is not None]
        # Clients summed over every access point in the room at each sample time, then the largest of those sums.
        by_slot=defaultdict(int)
        for s in mine: by_slot[s['timestamp']]+=s.get('clients') or 0
        rows.append({'lab':lab['name'],'code':lab.get('code',lab['name']),'access_points':len({s['asset_id'] for s in mine}),'uptime':round(sum(s['status']!='offline' for s in mine)/len(mine)*100,1),'latency':round(sum(latencies)/len(latencies),1) if latencies else None,'peak_clients':max(by_slot.values())})
    return rows

@router.get('/reports')
async def reports(user=Depends(current)):
    await authorize(user,'reports')
    # Simulator tickets describe a demonstration, not campus operations, so the figures leave them out and say how many.
    all_tickets=await db.tickets.find({},{'_id':0,'events':0}).to_list(20000)
    tickets=[t for t in all_tickets if not t.get('synthetic')]
    checklists=await db.checklists.find({},{'_id':0,'fingerprint':0}).to_list(20000)
    labs=await db.labs.find({},{'_id':0}).sort('code',1).to_list(100)
    since=(now()-timedelta(days=TELEMETRY_DAYS)).isoformat()
    samples=await db.telemetry.find({'timestamp':{'$gte':since}},{'_id':0,'asset_id':1,'lab_id':1,'timestamp':1,'status':1,'clients':1,'latency':1}).to_list(50000)
    risk_rows=risk_section(await risk.assess_assets())
    resolution=resolution_times(tickets)
    inspections=inspection_rates(checklists,labs)
    measured=[r for r in resolution if r['mean_hours'] is not None]
    inspected=sum(r['total'] for r in inspections)
    return {
        'generated_at':stamp(),
        'telemetry_days':TELEMETRY_DAYS,
        'simulator_tickets_excluded':len(all_tickets)-len(tickets),
        'figures':{
            'at_risk':sum(r['total'] for r in risk_rows if r['band'] in ('high','critical')),
            'scored':sum(r['total'] for r in risk_rows if r['band']!='unscored'),
            'tickets_raised':len(tickets),
            'tickets_resolved':sum(r['resolved'] for r in resolution),
            'resolution_on_target':all(r['within_target'] for r in measured) if measured else None,
            'inspected':inspected,
            'pass_rate':round(sum(r['passed'] for r in inspections)/inspected*100) if inspected else None,
        },
        'risk':risk_rows,
        'priorities':[{'key':k,'label':l} for k,l in PRIORITIES],
        'ticket_volume':ticket_volume(tickets),
        'resolution':resolution,
        'inspections':inspections,
        'access_points':access_point_health(samples,labs),
    }

async def maintenance(run_id):
    principal={'id':'scheduler','name':'Atlas scheduler','role':'scheduler'}
    try:
        await authorize(principal,'maintain')
        await make_reminders();await generate_sample();await sync_alerts()
        await db.cron_runs.update_one({'run_id':run_id},{'$set':{'status':'complete','finished_at':stamp()}})
    except Exception:
        await db.cron_runs.update_one({'run_id':run_id},{'$set':{'status':'failed','finished_at':stamp()}})
        raise

@router.post('/cron/maintain',status_code=202)
async def cron(request:Request,background:BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth=request.headers.get('Authorization','')
    if not auth.startswith('Bearer ') or not hmac.compare_digest(auth[7:],os.environ['WEBHOOK_CRON_SECRET']): raise HTTPException(401,'Invalid scheduler credentials.')
    try:
        body=await request.json();run_id=request.headers.get('X-Webhook-Id') or body['run_id']
        if not isinstance(body,dict) or body.get('event')!='schedule.triggered' or not isinstance(run_id,str) or not run_id: raise ValueError()
    except Exception: raise HTTPException(400,'Invalid scheduler envelope.')
    try: await db.cron_runs.insert_one({'run_id':run_id,'status':'queued','created_at':stamp()})
    except DuplicateKeyError: return {'accepted':True,'duplicate':True}
    background.add_task(maintenance,run_id);return {'accepted':True}