import React,{createContext,useContext,useEffect,useState} from 'react';
import {api,User} from './lib/api';
const Context=createContext<any>(null);
export const useAuth=()=>useContext(Context);
export const AuthProvider=({children}:any)=>{
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{let live=true;(async()=>{try{const r=await api.get('/auth/me');if(live)setUser(r.data);}catch(e:any){if(e.response?.status===401&&!sessionStorage.getItem('atlas-logged-out')&&window.location.pathname!=='/login'){try{const r=await api.post('/auth/demo',{role:'admin'});if(live)setUser(r.data);}catch{}}}finally{if(live)setReady(true);}})();const expired=()=>setUser(null);window.addEventListener('session-expired',expired);return()=>{live=false;window.removeEventListener('session-expired',expired);};},[]);
 const login=async(body:any,demo=false)=>{const r=await api.post(demo?'/auth/demo':'/auth/login',body);sessionStorage.removeItem('atlas-logged-out');setUser(r.data);};
 const logout=async()=>{await api.post('/auth/logout');sessionStorage.setItem('atlas-logged-out','true');setUser(null);};
 return <Context.Provider value={{user,ready,login,logout}}>{children}</Context.Provider>;
};