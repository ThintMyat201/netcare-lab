import hashlib
import json
from typing import Literal
from datetime import datetime
from zoneinfo import ZoneInfo
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from core import db, uid, stamp, now, audit, authorize, lease, Document
from auth import current, hash_password, public

router=APIRouter(prefix='/api')
class Input(BaseModel): model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)
class AssetInput(Input):
    tag:str=Field(min_length=3,max_length=40)
    name:str=Field(min_length=2,max_length=80)
    kind:Literal['AP','PC']
    lab_id:str
    model:str=Field(default='',max_length=80)
    ip:str=Field(default='',max_length=45)
class UserInput(Input):
    name:str=Field(min_length=2,max_length=80)
    email:EmailStr
    role:Literal['admin','engineer','assistant']
    password:str=Field(min_length=10,max_length=72)
class UserPatch(Input):
    role:Literal['admin','engineer','assistant']|None=None
    active:bool|None=None
    password:str|None=Field(default=None,min_length=10,max_length=72)
class ShiftInput(Input):
    assistant_id:str
    lab_id:str
    start:datetime
    end:datetime
class ChecklistInput(Input):
    request_id:str=Field(min_length=8,max_length=100)
    asset_id:str
    checks:dict[str,Literal['pass','fail']]
    notes:str=Field(default='',max_length=2000)
class IncidentInput(Input):
    asset_id:str
    category:Literal['power','display','peripherals','network','software','other']
    title:str=Field(min_length=4,max_length=150)
    description:str=Field(min_length=4,max_length=3000)
    priority:Literal['low','medium','high']='medium'
class TicketPatch(Input):
    status:Literal['in_progress','resolved']
    resolution_notes:str=Field(default='',max_length=3000)

async def get_asset(id,active=True):
    query={'id':id}
    if active: query['archived']=False
    row=await db.assets.find_one(query,{'_id':0})
    if not row: raise HTTPException(404,'Active asset not found.')
    return row
async def get_lab(id):
    lab=await db.labs.find_one({'id':id},{'_id':0})
    if not lab: raise HTTPException(404,'Lab not found.')
    return lab
def ticket_scope(user): return {'reporter_ids':user['id']} if user['role']=='assistant' else {}
def checklist_scope(user): return {'created_by':user['id']} if user['role']=='assistant' else {}

@router.get('/labs',response_model=list[Document])
async def labs(user=Depends(current)):
    await authorize(user,'view'); return await db.labs.find({},{'_id':0}).to_list(100)

@router.get('/assets',response_model=list[Document])
async def assets(user=Depends(current)):
    await authorize(user,'view'); return await db.assets.find({},{'_id':0}).sort('tag',1).to_list(500)

@router.post('/assets',response_model=Document)
async def add_asset(body:AssetInput,user=Depends(current)):
    await authorize(user,'inventory'); lab=await get_lab(body.lab_id)
    row={**body.model_dump(),'id':uid(),'tag':body.tag.upper(),'lab_name':lab['name'],'archived':False,'created_at':stamp()}
    if body.kind=='AP': row.update(scenario='normal',scenario_at=stamp(),last_seen=stamp())
    try: await db.assets.insert_one(row.copy())
    except DuplicateKeyError: raise HTTPException(409,'An asset already uses this tag.')
    await audit(user,'Asset added',row['tag'],row['id']); return row

@router.patch('/assets/{id}/archive',response_model=Document)
async def archive(id:str,user=Depends(current)):
    await authorize(user,'inventory'); row=await get_asset(id)
    await db.assets.update_one({'id':id},{'$set':{'archived':True}})
    await db.alerts.update_many({'asset_id':id,'active':True},{'$set':{'active':False,'resolved_at':stamp()},'$unset':{'active_key':''}})
    await audit(user,'Asset archived',row['tag'],id)
    return {**row,'archived':True}

@router.get('/users',response_model=list[Document])
async def users(user=Depends(current)):
    await authorize(user,'users');return await db.users.find({},{'_id':0,'password_hash':0}).sort('created_at',1).to_list(500)

@router.post('/users',response_model=Document)
async def add_user(body:UserInput,user=Depends(current)):
    await authorize(user,'users')
    if len(body.password.encode())>72: raise HTTPException(422,'Password must be at most 72 bytes.')
    row={'id':uid(),'name':body.name,'email':body.email.lower(),'role':body.role,'password_hash':hash_password(body.password),'active':True,'created_at':stamp()}
    try: await db.users.insert_one(row.copy())
    except DuplicateKeyError: raise HTTPException(409,'This email already has an account.')
    await audit(user,'Account provisioned',f'{body.name} · {body.role}',row['id']);return public(row)

@router.patch('/users/{id}',response_model=Document)
async def update_user(id:str,body:UserPatch,user=Depends(current)):
    await authorize(user,'users')
    target=await db.users.find_one({'id':id},{'_id':0,'password_hash':0})
    if not target: raise HTTPException(404,'Account not found.')
    if id==user['id'] and (body.active is False or (body.role and body.role!='admin')): raise HTTPException(409,'You cannot deactivate or demote your current administrator account.')
    changes=body.model_dump(exclude_none=True)
    if 'password' in changes:
        if len(changes['password'].encode())>72: raise HTTPException(422,'Password must be at most 72 bytes.')
        changes['password_hash']=hash_password(changes.pop('password'))
    await db.users.update_one({'id':id},{'$set':changes})
    if body.active is False or body.password: await db.sessions.delete_many({'user_id':id})
    await audit(user,'Account updated',f'{target["name"]} · '+', '.join('password reset' if k=='password_hash' else f'{k}: {v}' for k,v in changes.items()),id)
    return await db.users.find_one({'id':id},{'_id':0,'password_hash':0})

async def make_reminders():
    for s in await db.shifts.find({'cancelled':False},{'_id':0}).to_list(5000):
        await db.reminders.update_one({'shift_id':s['id']},{'$setOnInsert':{'id':uid(),'shift_id':s['id'],'assistant_id':s['assistant_id'],'title':f'{s["lab_name"]} shift','created_at':stamp(),'simulated':True,'acknowledged_at':s.get('acknowledged_at')}},upsert=True)

def shift_status(s):
    if s.get('cancelled'): return 'cancelled'
    if s.get('acknowledged_at'): return 'acknowledged'
    start=datetime.fromisoformat(s['start'])
    if start<=now(): return 'missed'
    if (start-now()).total_seconds()<=900: return 'pending'
    return 'upcoming'

@router.get('/shifts',response_model=list[Document])
async def shifts(user=Depends(current)):
    await authorize(user,'view'); await make_reminders()
    query={'assistant_id':user['id']} if user['role']!='admin' else {}
    rows=await db.shifts.find(query,{'_id':0}).sort('start',1).to_list(500)
    return [{**s,'status':shift_status(s)} for s in rows]

@router.post('/shifts',response_model=Document)
async def add_shift(body:ShiftInput,user=Depends(current)):
    await authorize(user,'shifts'); lab=await get_lab(body.lab_id)
    assistant=await db.users.find_one({'id':body.assistant_id,'role':'assistant','active':True},{'_id':0,'password_hash':0})
    if not assistant: raise HTTPException(422,'Choose an active IT assistant.')
    zone=ZoneInfo(os.environ['CAMPUS_TIMEZONE'])
    start=body.start if body.start.tzinfo else body.start.replace(tzinfo=zone)
    end=body.end if body.end.tzinfo else body.end.replace(tzinfo=zone)
    from datetime import timezone
    start,end=start.astimezone(timezone.utc),end.astimezone(timezone.utc)
    if end<=start or (end-start).total_seconds()>86400: raise HTTPException(422,'Shift end must follow its start, with a duration of at most 24 hours.')
    async with lease('roster:'+body.assistant_id):
        overlap=await db.shifts.find_one({'assistant_id':body.assistant_id,'cancelled':False,'start':{'$lt':end.isoformat()},'end':{'$gt':start.isoformat()}},{'_id':0})
        if overlap: raise HTTPException(409,'This assistant already has an overlapping shift, including across midnight.')
        row={'id':uid(),'assistant_id':body.assistant_id,'assistant_name':assistant['name'],'lab_id':lab['id'],'lab_name':lab['name'],'start':start.isoformat(),'end':end.isoformat(),'acknowledged_at':None,'created_at':stamp(),'created_by':user['id'],'cancelled':False}
        await db.shifts.insert_one(row.copy())
    await make_reminders();await audit(user,'Shift assigned',f'{assistant["name"]} → {lab["name"]}',row['id']); return {**row,'status':shift_status(row)}

@router.post('/shifts/{id}/acknowledge',response_model=Document)
async def ack(id:str,user=Depends(current)):
    await authorize(user,'ack')
    row=await db.shifts.find_one({'id':id,'assistant_id':user['id'],'cancelled':False},{'_id':0})
    if not row: raise HTTPException(404,'Shift not found.')
    await authorize(user,'ack',row)
    if not row.get('acknowledged_at'):
        at=stamp()
        result=await db.shifts.update_one({'id':id,'acknowledged_at':None},{'$set':{'acknowledged_at':at}})
        await db.reminders.update_one({'shift_id':id},{'$set':{'acknowledged_at':at}})
        if result.modified_count: await audit(user,'Shift acknowledged',row['lab_name'],id)
    row=await db.shifts.find_one({'id':id},{'_id':0});return {**row,'status':shift_status(row)}

@router.post('/shifts/{id}/cancel')
async def cancel_shift(id:str,user=Depends(current)):
    await authorize(user,'shifts')
    row=await db.shifts.find_one({'id':id},{'_id':0})
    if not row: raise HTTPException(404,'Shift not found.')
    await db.shifts.update_one({'id':id},{'$set':{'cancelled':True}})
    await audit(user,'Shift cancelled',row['assistant_name'],id);return {'message':'Shift cancelled. History retained.'}

async def open_ticket(asset,category,title,description,user,priority='medium'):
    key=f'{asset["id"]}:{category}'
    counter=await db.counters.find_one_and_update({'key':'ticket'},{'$inc':{'value':1}},upsert=True,return_document=ReturnDocument.AFTER)
    row={'id':uid(),'number':f'INC-{counter["value"]}','asset_id':asset['id'],'asset_tag':asset['tag'],'lab_name':asset['lab_name'],'category':category,'title':title,'description':description,'status':'open','priority':priority,'active_key':key,'created_by':user['id'],'created_at':stamp(),'updated_at':stamp(),'resolution_notes':'','events':[{'actor':user['name'],'action':'Ticket opened','timestamp':stamp()}]}
    try:
        ticket=await db.tickets.find_one_and_update({'active_key':key},{'$setOnInsert':row,'$addToSet':{'reporter_ids':user['id']}},upsert=True,return_document=ReturnDocument.AFTER,projection={'_id':0})
    except DuplicateKeyError:
        ticket=await db.tickets.find_one_and_update({'active_key':key},{'$addToSet':{'reporter_ids':user['id']}},return_document=ReturnDocument.AFTER,projection={'_id':0})
        if not ticket: return await open_ticket(asset,category,title,description,user,priority)
    return ticket

@router.post('/checklists',response_model=Document)
async def submit_checklist(body:ChecklistInput,user=Depends(current)):
    await authorize(user,'checklist')
    if set(body.checks)!={'power','display','peripherals','network','software'}: raise HTTPException(422,'Complete all five required checks.')
    fingerprint=hashlib.sha256(json.dumps(body.model_dump(),sort_keys=True).encode()).hexdigest()
    async with lease(f'checklist:{user["id"]}:{body.request_id}'):
        query={'created_by':user['id'],'request_id':body.request_id}
        existing=await db.checklists.find_one(query,{'_id':0})
        if existing:
            if existing['fingerprint']!=fingerprint: raise HTTPException(409,'This submission key belongs to a different checklist.')
            return {**existing,'replayed':True}
        asset=await get_asset(body.asset_id)
        if asset['kind']!='PC': raise HTTPException(422,'Checklists are only available for workstations.')
        tickets=[]
        for category,result in body.checks.items():
            if result=='fail':
                t=await open_ticket(asset,category,f'{category.title()} check failed',body.notes or 'Failed during equipment inspection.',user)
                tickets.append({'id':t['id'],'number':t['number'],'category':category})
        row={'id':uid(),**body.model_dump(),'fingerprint':fingerprint,'asset_tag':asset['tag'],'lab_name':asset['lab_name'],'created_by':user['id'],'created_by_name':user['name'],'created_at':stamp(),'tickets':tickets,'result':'failed' if tickets else 'passed'}
        await db.checklists.insert_one(row.copy())
        await audit(user,'Checklist submitted',f'{asset["tag"]} · {row["result"]} · {len(tickets)} ticket(s)',row['id'])
        return {**row,'replayed':False}

@router.get('/checklists',response_model=list[Document])
async def checklists(user=Depends(current)):
    await authorize(user,'view');return await db.checklists.find(checklist_scope(user),{'_id':0,'fingerprint':0}).sort('created_at',-1).to_list(500)

@router.get('/checklists/{id}',response_model=Document)
async def checklist(id:str,user=Depends(current)):
    await authorize(user,'view');row=await db.checklists.find_one({'id':id,**checklist_scope(user)},{'_id':0,'fingerprint':0})
    if not row: raise HTTPException(404,'Checklist not found.')
    return row

@router.post('/incidents',response_model=Document)
async def incident(body:IncidentInput,user=Depends(current)):
    await authorize(user,'incident');asset=await get_asset(body.asset_id)
    t=await open_ticket(asset,body.category,body.title,body.description,user,body.priority)
    await audit(user,'Incident reported',f'{asset["tag"]} · linked to {t["number"]}',t['id']);return t

@router.get('/tickets',response_model=list[Document])
async def tickets(user=Depends(current)):
    await authorize(user,'view');return await db.tickets.find(ticket_scope(user),{'_id':0}).sort('created_at',-1).to_list(500)

@router.get('/tickets/{id}',response_model=Document)
async def ticket(id:str,user=Depends(current)):
    await authorize(user,'view');row=await db.tickets.find_one({'id':id,**ticket_scope(user)},{'_id':0})
    if not row: raise HTTPException(404,'Ticket not found.')
    return row

@router.patch('/tickets/{id}',response_model=Document)
async def progress(id:str,body:TicketPatch,user=Depends(current)):
    await authorize(user,'tickets')
    row=await db.tickets.find_one({'id':id},{'_id':0})
    if not row: raise HTTPException(404,'Ticket not found.')
    if row['status']=='resolved': raise HTTPException(409,'Resolved tickets are read-only. Report a new incident if the fault returns.')
    if row['status']==body.status: return row
    if body.status=='resolved' and row['status']!='in_progress': raise HTTPException(409,'Start the investigation before resolving this ticket.')
    if body.status=='resolved' and len(body.resolution_notes.strip())<10: raise HTTPException(422,'Resolution notes must contain at least 10 characters.')
    change={'status':body.status,'updated_at':stamp(),'assigned_to':user['id'],'assigned_name':user['name']}
    update={'$set':change,'$push':{'events':{'actor':user['name'],'action':'Resolved' if body.status=='resolved' else 'Investigation started','notes':body.resolution_notes,'timestamp':stamp()}}}
    if body.status=='resolved':
        change.update(resolution_notes=body.resolution_notes,resolved_at=stamp());update['$unset']={'active_key':''}
    result=await db.tickets.find_one_and_update({'id':id,'status':row['status']},update,projection={'_id':0},return_document=ReturnDocument.AFTER)
    if not result: raise HTTPException(409,'This ticket changed. Refresh and try again.')
    await audit(user,'Ticket '+body.status.replace('_',' '),f'{row["number"]} · {row["asset_tag"]}',id);return result