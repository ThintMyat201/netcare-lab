import asyncio
import copy
import os
import sys
from pathlib import Path

import bcrypt
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

# core.py reads these at import time; a developer's backend/.env still wins because setdefault keeps it.
TEST_ENV = {
    "MONGO_URL": "mongodb://127.0.0.1:27017",
    "DB_NAME": "netcare_test",
    "DEMO_MODE": "true",
    "JWT_SECRET": "test-jwt-secret-of-at-least-32-bytes",
    "WEBHOOK_CRON_SECRET": "test-cron-secret",
    "ADMIN_EMAIL": "owner@example.com",
    "ADMIN_PASSWORD": "OwnerPass2026!",
    "DEMO_PASSWORD": "AtlasDemo2026!",
    "FRONTEND_URL": "http://localhost:3000",
}
for key, value in TEST_ENV.items():
    os.environ.setdefault(key, value)

DEMO_PASSWORD = os.environ["DEMO_PASSWORD"]
BACKEND_MODULES = [
    "core",
    "auth",
    "campus",
    "inventory",
    "team",
    "roster",
    "tickets",
    "monitoring",
    "reporting",
    "seed",
    "server",
]


def _patch_mongomock_find_and_modify():
    """mongomock 4.3 bug: with projection {'_id': 0} and ReturnDocument.AFTER it re-runs the original filter
    after the update, so `find_one_and_update({'status': 'open'}, {'$set': {'status': ...}})` returns None.
    Real MongoDB returns the updated document. Fetch with the full document, then drop _id ourselves."""
    from mongomock.collection import Collection

    original = Collection._find_and_modify

    def find_and_modify(self, query, projection=None, *args, **kwargs):
        if projection != {"_id": 0}:
            return original(self, query, projection, *args, **kwargs)
        result = original(self, query, None, *args, **kwargs)
        return {k: v for k, v in result.items() if k != "_id"} if isinstance(result, dict) else result

    Collection._find_and_modify = find_and_modify


_patch_mongomock_find_and_modify()


def new_mock_db():
    from mongomock_motor import AsyncMongoMockClient

    return AsyncMongoMockClient(tz_aware=True)["netcare_test"]


def patch_db(monkeypatch, db):
    import server  # noqa: F401  (imports every backend module so each one can be patched)

    for name in BACKEND_MODULES:
        monkeypatch.setattr(sys.modules[name], "db", db, raising=False)


async def dump(db):
    return {name: await db[name].find({}).to_list(None) for name in await db.list_collection_names()}


@pytest.fixture(scope="session")
def seeded_snapshot():
    """Seed once per session (about 20 seconds in mongomock) and keep the documents for each test to copy."""
    with pytest.MonkeyPatch.context() as monkeypatch:
        db = new_mock_db()
        patch_db(monkeypatch, db)
        # Low bcrypt cost keeps seeding nine accounts fast; production keeps the library default.
        real_gensalt = bcrypt.gensalt
        monkeypatch.setattr(bcrypt, "gensalt", lambda rounds=4, prefix=b"2b": real_gensalt(4, prefix))
        asyncio.run(sys.modules["seed"].seed())
        return asyncio.run(dump(db))


@pytest.fixture
def mock_db(monkeypatch, seeded_snapshot):
    """A fresh in-memory database, patched into every backend module, holding a first-start seed."""
    db = new_mock_db()
    patch_db(monkeypatch, db)

    async def restore():
        # Copy first, index second: mongomock checks unique indexes per insert, which is 80x slower.
        for name, docs in seeded_snapshot.items():
            if docs:
                await db[name].insert_many(copy.deepcopy(docs))
        await sys.modules["core"].indexes()

    asyncio.run(restore())
    return db


def run(coro):
    """Run backend coroutines (such as the maintenance tick) against the patched database."""
    return asyncio.run(coro)


@pytest.fixture
def client(mock_db):
    """HTTP client for the real app without its lifespan, so no background loop runs during tests."""
    from fastapi.testclient import TestClient

    from server import app

    # https because the session cookies are Secure; the header satisfies the browser request guard.
    return TestClient(app, base_url="https://testserver", headers={"X-Atlas-Request": "1"})


@pytest.fixture
def login(client):
    def _login(email):
        response = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert response.status_code == 200, response.text
        return response.json()

    return _login
