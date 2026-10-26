from core import db,client
import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from seed import seed
from auth import router as auth_router
from operations import router as operations_router, make_reminders
from monitoring import router as monitoring_router, generate_sample, sync_alerts
from reporting import router as reporting_router

async def _background_telemetry_loop():
    while True:
        try:
            await asyncio.sleep(15)
            await generate_sample(overwrite=True)
            await sync_alerts()
            await make_reminders()
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(15)

@asynccontextmanager
async def lifespan(app):
    await seed()
    bg_task = asyncio.create_task(_background_telemetry_loop())
    try:
        yield
    finally:
        bg_task.cancel()
        client.close()

app=FastAPI(title='Atlas NetCare Academic Demo',lifespan=lifespan)
allowed_origins=[os.environ['FRONTEND_URL']]
if os.environ.get('PREVIEW_PROXY_ORIGIN'): allowed_origins.append(os.environ['PREVIEW_PROXY_ORIGIN'])
app.add_middleware(CORSMiddleware,allow_origins=allowed_origins,allow_credentials=True,allow_methods=['GET','POST','PATCH'],allow_headers=['Content-Type','Authorization','X-Atlas-Request'])
@app.middleware('http')
async def guard_origin(request:Request,call_next):
    if request.method in ['POST','PATCH','PUT','DELETE'] and not request.url.path.startswith('/api/cron/'):
        origin=request.headers.get('origin')
        if origin and origin not in allowed_origins:
            return JSONResponse({'detail':'Untrusted request origin.'},status_code=403)
        if (origin or request.cookies.get('access_token') or request.cookies.get('refresh_token')) and request.headers.get('X-Atlas-Request')!='1':
            return JSONResponse({'detail':'Browser request safeguard is required.'},status_code=403)
        if request.cookies.get('access_token') and not origin and request.headers.get('sec-fetch-site')=='cross-site': return JSONResponse({'detail':'Origin is required.'},status_code=403)
    return await call_next(request)
for router in [auth_router,operations_router,monitoring_router,reporting_router]: app.include_router(router)
@app.get('/api/health')
async def health():
    await db.command('ping');return {'status':'ok','service':'Atlas NetCare','mode':'academic-demo'}