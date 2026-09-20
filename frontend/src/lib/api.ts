import axios from 'axios';
export const api=axios.create({baseURL:`${process.env.REACT_APP_BACKEND_URL}/api`,withCredentials:true,timeout:12000,headers:{'X-Atlas-Request':'1'}});
let refresh:Promise<any>|null=null;
api.interceptors.response.use(r=>r,async error=>{
 const config=error.config;
 if(error.response?.status===401 && !config?._retry && !config?.url?.startsWith('/auth/')) {
  config._retry=true;
  try { refresh=refresh||api.post('/auth/refresh'); await refresh; refresh=null; return api(config); }
  catch { refresh=null; window.dispatchEvent(new Event('session-expired')); }
 }
 return Promise.reject(error);
});
export function errorText(e:any):string {
 const d=e.response?.data?.detail;
 return typeof d==='string'?d:Array.isArray(d)?d.map(x=>x.msg).join('. '):'The server is unavailable. Your unsent work is still here. Please try again.';
}
export const time=(value?:string,full=false)=>value?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',...(full?{month:'short',day:'numeric'}:{}),hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'—';
export const roleLabel=(r:string)=>({admin:'Administrator',engineer:'Network engineer',assistant:'IT assistant'}[r]||r);
export type User={id:string;name:string;email:string;role:string;active:boolean};