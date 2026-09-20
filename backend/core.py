import os
import uuid
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, ConfigDict

load_dotenv(Path(__file__).parent / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=4000)
# Demo data never shares operational collections with a non-demo installation.
DEMO = os.environ['DEMO_MODE'] == 'true'
db = client[os.environ['DB_NAME'] + ('_atlas_demo' if DEMO else '_atlas')]
def now(): return datetime.now(timezone.utc)
def stamp(): return now().isoformat()
def uid(): return str(uuid.uuid4())
class Document(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
class Message(BaseModel):
    message: str

async def audit(user, action, detail, resource_id=None):
    await db.audit.insert_one({'id': uid(), 'actor_id': user['id'], 'actor': user['name'], 'action': action, 'detail': detail, 'resource_id': resource_id, 'timestamp': stamp()})

PERMS = {
 'admin': {'view','inventory','users','shifts','ack','checklist','incident','tickets','simulate','audit','reports'},
 'engineer': {'view','incident','tickets','simulate'},
 'assistant': {'view','ack','checklist','incident'},
 'scheduler': {'maintain'}
}
async def authorize(user, action, resource=None):
    if action not in PERMS.get(user.get('role'), set()):
        await audit(user, 'Access denied', action)
        raise HTTPException(403, 'Your role cannot perform this action.')
    if resource and action == 'ack' and resource['assistant_id'] != user['id']:
        await audit(user, 'Access denied', 'Reminder belongs to another assistant')
        raise HTTPException(404, 'Reminder not found.')

@asynccontextmanager
async def lease(key):
    """Cross-worker short lease for mutually exclusive roster/idempotency writes."""
    token = uid()
    for _ in range(100):
        try:
            row = await db.locks.find_one_and_update({'key': key, '$or': [{'expires': {'$lt': now()}}, {'token': token}]}, {'$set': {'token': token, 'expires': now()+timedelta(seconds=30)}, '$setOnInsert': {'key': key}}, upsert=True, return_document=ReturnDocument.AFTER)
            if row and row['token'] == token: break
        except DuplicateKeyError: pass
        await asyncio.sleep(.04)
    else: raise HTTPException(409, 'Another request is processing. Please retry.')
    try: yield
    finally: await db.locks.delete_one({'key': key, 'token': token})

async def indexes():
    for name in ['users','assets','labs','tickets','shifts','checklists','audit','alerts','sessions']:
        await db[name].create_index('id', unique=True)
    await db.users.create_index('email', unique=True)
    await db.assets.create_index('tag', unique=True)
    await db.locks.create_index('key', unique=True)
    await db.locks.create_index('expires', expireAfterSeconds=0)
    await db.tickets.create_index('active_key', unique=True, partialFilterExpression={'active_key': {'$type': 'string'}})
    await db.checklists.create_index([('created_by',1),('request_id',1)], unique=True)
    await db.alerts.create_index('active_key', unique=True, partialFilterExpression={'active_key': {'$type':'string'}})
    await db.reminders.create_index('shift_id', unique=True)
    await db.telemetry.create_index([('asset_id',1),('timestamp',1)], unique=True)
    await db.telemetry.create_index('expires_at', expireAfterSeconds=0)
    await db.sessions.create_index('expires_at', expireAfterSeconds=0)
    await db.login_attempts.create_index('identifier', unique=True)
    await db.login_attempts.create_index('expires_at', expireAfterSeconds=0)
    await db.password_reset_tokens.create_index('expires_at', expireAfterSeconds=0)
    await db.cron_runs.create_index('run_id', unique=True)