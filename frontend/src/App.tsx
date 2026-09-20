import React from 'react';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import {ThemeProvider} from 'next-themes';
import {Toaster} from './components/ui/sonner';
import {AuthProvider,useAuth} from './context';
import {Layout} from './components/Layout';
import {Loading} from './components/shared';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Monitoring from './pages/Monitoring';
import Checklists from './pages/Checklists';
import Tickets from './pages/Tickets';
import Shifts from './pages/Shifts';
import {Assets,Team} from './pages/Management';
import {Reports,Audit,Alerts} from './pages/Insights';
import './App.css';
const Protected=()=>{
 const {user,ready}=useAuth();
 if(!ready)return <div className="full-loading"><Loading/></div>;
 if(!user)return <Login/>;
 return <Layout><Routes><Route path="/" element={<Dashboard/>}/><Route path="/login" element={<Navigate to="/" replace/>}/><Route path="/monitoring" element={<Monitoring/>}/><Route path="/tickets" element={<Tickets/>}/><Route path="/alerts" element={<Alerts/>}/>{user.role!=='engineer'&&<><Route path="/checklists" element={<Checklists/>}/><Route path="/shifts" element={<Shifts/>}/></>}{user.role==='admin'&&<><Route path="/assets" element={<Assets/>}/><Route path="/users" element={<Team/>}/><Route path="/reports" element={<Reports/>}/><Route path="/audit" element={<Audit/>}/></>}<Route path="*" element={<Navigate to="/" replace/>}/></Routes></Layout>;
};
export default function App(){return <ThemeProvider forcedTheme="dark"><BrowserRouter><AuthProvider><Protected/></AuthProvider></BrowserRouter><Toaster position="bottom-right"/></ThemeProvider>;}