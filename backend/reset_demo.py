"""Explicit, repeatable, demo-only reset. Never called by a web endpoint."""
import argparse
import asyncio
from core import db,DEMO,client
from seed import seed

async def run():
    parser=argparse.ArgumentParser(description='Reset only the isolated Atlas academic demo database.')
    parser.add_argument('--confirm',required=True,choices=['RESET-ATLAS-DEMO'])
    parser.parse_args()
    if not DEMO or not db.name.endswith('_atlas_demo'): raise SystemExit('REFUSED: reset is restricted to the isolated demo database.')
    await client.drop_database(db.name)
    await seed()
    print('Atlas academic demo reset: 3 labs, 12 APs, 30 PCs, 9 accounts. All prior demo sessions are invalid.')
    client.close()

if __name__=='__main__': asyncio.run(run())