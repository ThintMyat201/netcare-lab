import React,{useEffect,useState} from 'react';
import {LoaderCircle,AlertCircle,Inbox,Radio,ChevronDown,ArrowUpRight} from 'lucide-react';
import {Button as ShadButton} from './ui/button';
import {Dialog,DialogContent as BaseContent,DialogTitle as BaseTitle,DialogDescription as BaseDescription} from './ui/dialog';
const DialogContent=BaseContent as React.ComponentType<any>;
const DialogTitle=BaseTitle as React.ComponentType<any>;
const DialogDescription=BaseDescription as React.ComponentType<any>;
import {api,errorText} from '../lib/api';

export const Button=({children,id,variant='secondary',className='',...props}:any)=><ShadButton data-testid={id} variant={variant==='primary'?'default':'outline'} className={`btn ${variant} ${className}`} {...props}>{children}</ShadButton>;
export const Status=({value,id}:any)=><span data-testid={id} className={`status ${value}`}><i/>{({online:'Online',congested:'Congested',offline:'Offline',stale:'Stale / unknown',open:'Open',in_progress:'In progress',resolved:'Resolved',active:'Active',inactive:'Inactive',archived:'Archived',acknowledged:'Acknowledged',missed:'Missed',pending:'Pending',upcoming:'Upcoming',high:'High',medium:'Medium',low:'Low'} as any)[value]||value}</span>;
export const Logo=()=> <div className="brand" data-testid="atlas-brand"><span className="brand-icon"><Radio size={23}/></span><span>atlas<span className="brand-suffix">netcare</span></span></div>;
export const PageTitle=({eyebrow,title,subtitle,children}:any)=><header className="page-title"><div>{eyebrow&&<span className="eyebrow" data-testid="page-eyebrow">{eyebrow}</span>}<h1 data-testid="page-title">{title}</h1>{subtitle&&<p data-testid="page-subtitle">{subtitle}</p>}</div><div className="page-actions">{children}</div></header>;
export const Modal=({open,onClose,title,description,children,id}:any)=><Dialog open={open} onOpenChange={onClose}><DialogContent data-testid={id} className="atlas-modal"><DialogTitle data-testid={`${id}-title`}>{title}</DialogTitle><DialogDescription data-testid={`${id}-description`}>{description||'Atlas NetCare · Academic demo'}</DialogDescription>{children}</DialogContent></Dialog>;
export const Field=({label,id,children}:any)=><label className="field" htmlFor={id}><span data-testid={`${id}-label`}>{label}</span>{children}</label>;
export const Select=({id,children,...props}:any)=><div className="select-wrap"><select id={id} data-testid={id} {...props}>{children}</select><ChevronDown size={14}/></div>;
export const Empty=({text='No records yet.',id='empty-state'}:any)=><div className="empty" data-testid={id}><Inbox size={27}/><span>{text}</span></div>;
export const ErrorBox=({error,retry}:any)=>error?<div className="error-box" data-testid="error-message" role="alert"><AlertCircle size={17}/><span>{error}</span>{retry&&<Button id="retry-load" onClick={retry}>Retry</Button>}</div>:null;
export const Loading=()=> <div className="loading" data-testid="loading-state"><LoaderCircle className="spin" size={23}/> Loading workspace…</div>;
export function useData(path:string) {
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
 const load=async()=>{setBusy(true);try{setData((await api.get(path)).data);setError('');}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 useEffect(()=>{setData(null);load();},[path]); // eslint-disable-line react-hooks/exhaustive-deps
 return {data,error,busy,load};
}
export const SectionHead=({title,sub,children}:any)=><div className="section-head"><div><h2 data-testid={`section-${title.toLowerCase().replace(/\s+/g,'-')}`}>{title}</h2>{sub&&<p>{sub}</p>}</div>{children}</div>;