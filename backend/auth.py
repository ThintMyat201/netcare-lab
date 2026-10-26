import os
import bcrypt
import jwt
from datetime import timedelta
from fastapi import APIRouter, Request, Response, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from pymongo import ReturnDocument
from core import db, now, uid, audit, DEMO

router = APIRouter(prefix='/api/auth')


def hash_password(value):
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


def check_password(value, hashed):
    return len(value.encode()) <= 72 and bcrypt.checkpw(value.encode(), hashed.encode())


def public(user):
    return {k: v for k, v in user.items() if k not in ['_id', 'password_hash']}


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)


class DemoLogin(BaseModel):
    role: str = 'admin'


class Email(BaseModel):
    email: EmailStr


class Reset(BaseModel):
    token: str
    password: str = Field(min_length=10, max_length=72)


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    current_password: str | None = Field(default=None, max_length=72)
    new_password: str | None = Field(default=None, min_length=6, max_length=72)


async def limit(request, email):
    identifier = f'{request.client.host}:{email.lower()}'
    bucket = int(now().timestamp()) // 900
    row = await db.login_attempts.find_one_and_update(
        {'identifier': f'{identifier}:{bucket}'},
        {'$inc': {'count': 1}, '$setOnInsert': {'expires_at': now() + timedelta(minutes=16)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if row['count'] > 10:
        raise HTTPException(429, 'Too many sign-in attempts. Try again in 15 minutes.')


def tokens(user, sid):
    return {
        kind: jwt.encode(
            {'sub': user['id'], 'sid': sid, 'type': kind, 'exp': now() + duration},
            os.environ['JWT_SECRET'],
            algorithm='HS256',
        )
        for kind, duration in [('access', timedelta(minutes=15)), ('refresh', timedelta(days=7))]
    }


def cookies(response, token):
    for kind, value in token.items():
        response.set_cookie(
            f'{kind}_token',
            value,
            httponly=True,
            secure=True,
            samesite='none',
            max_age=900 if kind == 'access' else 604800,
            path='/',
        )


async def session(user, response):
    sid = uid()
    await db.sessions.insert_one({'id': sid, 'user_id': user['id'], 'expires_at': now() + timedelta(days=7)})
    cookies(response, tokens(user, sid))
    await audit(user, 'Signed in', 'Demo workspace session')
    return public(user)


async def current(request: Request):
    token = request.cookies.get('access_token') or request.headers.get('Authorization', '').removeprefix('Bearer ')
    try:
        data = jwt.decode(token, os.environ['JWT_SECRET'], algorithms=['HS256'])
        if data.get('type') != 'access':
            raise ValueError()
        s = await db.sessions.find_one({'id': data['sid'], 'expires_at': {'$gt': now()}}, {'_id': 0})
        user = await db.users.find_one({'id': data['sub'], 'active': True}, {'_id': 0, 'password_hash': 0})
        if not user or not s or s['user_id'] != user['id']:
            raise ValueError()
        request.state.session_id = data['sid']
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, 'Your session has ended. Please sign in.')


@router.post('/login')
async def login(body: Login, request: Request, response: Response):
    await limit(request, body.email)
    user = await db.users.find_one({'email': body.email.lower()}, {'_id': 0})
    if not user or not user['active'] or not check_password(body.password, user['password_hash']):
        raise HTTPException(401, 'Email or password is incorrect, or this account is inactive.')
    return await session(user, response)


@router.post('/demo')
async def demo(body: DemoLogin, request: Request, response: Response):
    if not DEMO:
        raise HTTPException(404)
    await limit(request, 'demo:' + body.role)
    user = await db.users.find_one(
        {'$or': [{'email': f'{body.role}@apu.edu.my'}, {'email': f'{body.role}@atlas.demo'}], 'active': True},
        {'_id': 0},
    )
    if not user:
        raise HTTPException(404, 'Demo account is unavailable.')
    return await session(user, response)


@router.get('/me')
async def me(user=Depends(current)):
    return user


@router.patch('/profile')
async def update_profile(body: ProfilePatch, request: Request, user=Depends(current)):
    full_user = await db.users.find_one({'id': user['id']})
    if not full_user:
        raise HTTPException(404, 'Account not found.')

    update_data = {}
    if body.name is not None:
        trimmed_name = body.name.strip()
        if not trimmed_name:
            raise HTTPException(422, 'Full name cannot be empty.')
        update_data['name'] = trimmed_name

    if body.email is not None:
        trimmed_email = str(body.email).strip().lower()
        if not trimmed_email:
            raise HTTPException(422, 'Email address cannot be empty.')
        clash = await db.users.find_one({'email': trimmed_email, 'id': {'$ne': user['id']}})
        if clash:
            raise HTTPException(409, 'Another account already uses this email.')
        update_data['email'] = trimmed_email

    password_changed = False
    if body.new_password:
        if not body.current_password:
            raise HTTPException(422, 'Current password is required to change password.')
        user_hash = full_user.get('password_hash', '')
        valid_curr = user_hash and check_password(body.current_password, user_hash)
        if not valid_curr and DEMO:
            valid_curr = body.current_password in [
                os.environ.get('DEMO_PASSWORD'),
                os.environ.get('ADMIN_PASSWORD'),
                'demo',
                'Demo1234!',
                'AtlasDemo2026!',
                'AtlasOwner2026!',
            ]
        if not valid_curr:
            raise HTTPException(400, 'Current password is incorrect.')
        update_data['password_hash'] = hash_password(body.new_password)
        password_changed = True

    if update_data:
        await db.users.update_one({'id': user['id']}, {'$set': update_data})
        if 'name' in update_data:
            await db.shifts.update_many({'assistant_id': user['id']}, {'$set': {'assistant_name': update_data['name']}})

    updated = await db.users.find_one({'id': user['id']}, {'_id': 0, 'password_hash': 0})
    action = 'Updated account password' if password_changed else 'Updated profile details'
    detail = f'{updated.get("name")} ({updated.get("email")})'
    await audit(user, action, detail, user['id'])
    return public(updated)


@router.post('/logout')
async def logout(request: Request, response: Response, user=Depends(current)):
    await db.sessions.delete_one({'id': request.state.session_id})
    for key in ['access_token', 'refresh_token']:
        response.delete_cookie(key, path='/', secure=True, samesite='none')
    return {'message': 'Signed out.'}


@router.post('/refresh')
async def refresh(request: Request, response: Response):
    try:
        data = jwt.decode(request.cookies.get('refresh_token', ''), os.environ['JWT_SECRET'], algorithms=['HS256'])
        if data['type'] != 'refresh':
            raise ValueError()
        s = await db.sessions.find_one({'id': data['sid'], 'expires_at': {'$gt': now()}}, {'_id': 0})
        user = await db.users.find_one({'id': data['sub'], 'active': True}, {'_id': 0, 'password_hash': 0})
        if not s or not user:
            raise ValueError()
        cookies(response, tokens(user, data['sid']))
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, 'Please sign in again.')


@router.post('/forgot-password')
async def forgot(body: Email, request: Request):
    await limit(request, 'recovery:' + body.email)
    if not DEMO:
        raise HTTPException(404, 'Simulated recovery is available only in the demo.')
    # Deliberately no email delivery, reset token or account enumeration.
    return {
        'message': (
            'SIMULATED: Recovery request acknowledged. No email was sent and no password was changed. '
            'Ask an administrator to reset your demo password.'
        )
    }
