"""Team accounts: who can sign in, with which role and primary scope."""

import secrets
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, EmailStr
from pymongo.errors import DuplicateKeyError
from core import db, uid, stamp, audit, authorize, Document, Input
from auth import current, hash_password, public

router = APIRouter(prefix='/api')


ROLE_LABELS = {'admin': 'Administrator', 'engineer': 'Network Engineer', 'assistant': 'IT Assistant'}


def roleLabel(role):
    return ROLE_LABELS.get(role, role)


class UserInput(Input):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    role: Literal['admin', 'engineer', 'assistant']
    scope: str | None = Field(default=None, max_length=60)
    active: bool = True
    password: str | None = Field(default=None, min_length=10, max_length=72)


class UserPatch(Input):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    role: Literal['admin', 'engineer', 'assistant'] | None = None
    scope: str | None = Field(default=None, max_length=60)
    active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=72)


USER_SCOPES = [
    'All Campus Systems',
    'Campus Core Network',
    'Core & AP Telemetry',
    'Computing Lab A',
    'Computing Lab B',
    'Computing Lab C',
    'Innovation Lab',
]


SEED_USER_SCOPES = {
    'owner': 'All Campus Systems',
    'admin': 'All Campus Systems',
    'engineer': 'Campus Core Network',
    'eng-2': 'Core & AP Telemetry',
    'assistant': 'Computing Lab A',
    'asst-2': 'Computing Lab B',
    'asst-3': 'Innovation Lab',
    'asst-4': 'Computing Lab A',
    'asst-5': 'Computing Lab B',
}


ROLE_DEFAULT_SCOPE = {'admin': 'All Campus Systems', 'engineer': 'Core & AP Telemetry', 'assistant': 'Computing Lab A'}


def _with_scope(u):
    if u.get('scope'):
        return u
    return {
        **u,
        'scope': SEED_USER_SCOPES.get(u.get('id'), ROLE_DEFAULT_SCOPE.get(u.get('role'), 'All Campus Systems')),
    }


def _check_scope(scope):
    if scope is not None and scope not in USER_SCOPES:
        raise HTTPException(422, 'Choose a valid primary assignment / scope.')


def _is_protected(target, user):
    return target.get('id') == 'owner' or target.get('id') == user.get('id')


@router.get('/users', response_model=list[Document])
async def users(user=Depends(current)):
    await authorize(user, 'users')
    rows = await db.users.find({}, {'_id': 0, 'password_hash': 0}).sort('created_at', 1).to_list(500)
    return [public(_with_scope(u)) for u in rows]


@router.post('/users', response_model=Document)
async def add_user(body: UserInput, user=Depends(current)):
    await authorize(user, 'users')
    _check_scope(body.scope)
    password = body.password or secrets.token_urlsafe(16)
    if len(password.encode()) > 72:
        raise HTTPException(422, 'Password must be at most 72 bytes.')
    email = body.email.lower()
    if await db.users.find_one({'email': email}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'This email already has an account.')
    row = {
        'id': uid(),
        'name': body.name,
        'email': email,
        'role': body.role,
        'scope': body.scope or ROLE_DEFAULT_SCOPE[body.role],
        'password_hash': hash_password(password),
        'active': body.active,
        'created_at': stamp(),
    }
    try:
        await db.users.insert_one(row.copy())
    except DuplicateKeyError:
        raise HTTPException(409, 'This email already has an account.')
    await audit(
        user,
        'Team member added',
        f'Added team member {body.name} as {roleLabel(body.role)} · {row["scope"]}',
        row['id'],
    )
    return public(row)


@router.patch('/users/{id}', response_model=Document)
async def update_user(id: str, body: UserPatch, user=Depends(current)):
    await authorize(user, 'users')
    target = await db.users.find_one({'id': id}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(404, 'Account not found.')
    _check_scope(body.scope)
    if _is_protected(target, user) and (
        body.active is False or (body.role and body.role != 'admin' and target.get('role') == 'admin')
    ):
        raise HTTPException(
            409, 'This account is protected: the workspace owner and your own account cannot be suspended or demoted.'
        )
    changes = body.model_dump(exclude_none=True)
    if 'email' in changes:
        changes['email'] = changes['email'].lower()
        clash = await db.users.find_one({'email': changes['email']}, {'_id': 0, 'id': 1})
        if clash and clash.get('id') != id:
            raise HTTPException(409, 'Another account already uses this email.')
    if 'password' in changes:
        if len(changes['password'].encode()) > 72:
            raise HTTPException(422, 'Password must be at most 72 bytes.')
        changes['password_hash'] = hash_password(changes.pop('password'))
    changes = {k: v for k, v in changes.items() if k == 'password_hash' or target.get(k) != v}
    if not changes:
        return public(_with_scope(target))
    try:
        await db.users.update_one({'id': id}, {'$set': changes})
    except DuplicateKeyError:
        raise HTTPException(409, 'Another account already uses this email.')
    if 'name' in changes:
        await db.shifts.update_many({'assistant_id': id}, {'$set': {'assistant_name': changes['name']}})
    if changes.get('active') is False or 'password_hash' in changes:
        await db.sessions.delete_many({'user_id': id})

    def _desc(k, v):
        if k == 'password_hash':
            return 'password reset'
        if k == 'active':
            return 'status: Active' if v else 'status: Suspended'
        if k == 'role':
            return f'role: {roleLabel(v)}'
        return f'{k}: {v}'

    action = (
        'Team member suspended'
        if changes.get('active') is False
        else 'Team member reactivated' if changes.get('active') is True else 'Team member updated'
    )
    await audit(
        user,
        action,
        f'{changes.get("name", target["name"])} · ' + ', '.join(_desc(k, v) for k, v in changes.items()),
        id,
    )
    return public(_with_scope(await db.users.find_one({'id': id}, {'_id': 0, 'password_hash': 0})))


@router.delete('/users/{id}', response_model=Document)
async def remove_user(id: str, user=Depends(current)):
    await authorize(user, 'users')
    target = await db.users.find_one({'id': id}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(404, 'Account not found.')
    if _is_protected(target, user):
        raise HTTPException(
            409, 'This account is protected: the workspace owner and your own account cannot be removed.'
        )
    await db.users.delete_many({'id': id})
    await db.sessions.delete_many({'user_id': id})
    await db.shifts.update_many(
        {'assistant_id': id, 'cancelled': False, 'completed_at': None, 'start': {'$gt': stamp()}},
        {'$set': {'cancelled': True}},
    )
    await audit(
        user, 'Team member removed', f'Removed team member {target["name"]} ({roleLabel(target.get("role", ""))})', id
    )
    return {'ok': True, 'id': id, 'name': target['name']}
