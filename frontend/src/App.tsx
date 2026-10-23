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
import Locations from './pages/Locations';
import {Reports,Audit,Alerts} from './pages/Insights';
import './App.css';
const Protected=()=>{
 const {user,ready}=useAuth();
 if(!ready)return <div className="full-loading"><Loading/></div>;
 if(!user)return <Login/>;
 const isAssistant = user.role === 'assistant';
 const isEngineer = user.role === 'engineer';
 return (
  <Layout>
   <Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/login" element={<Navigate to="/" replace/>}/>
    {isAssistant ? (
     <>
      <Route path="/shifts" element={<Shifts/>}/>
      <Route path="/checklists" element={<Checklists/>}/>
      {/* IT Assistants strictly focused on physical lab shifts & checklists: redirect unauthorized routes to / */}
      <Route path="/tickets" element={<Navigate to="/" replace/>}/>
      <Route path="/monitoring" element={<Navigate to="/" replace/>}/>
      <Route path="/alerts" element={<Navigate to="/" replace/>}/>
      <Route path="/assets" element={<Navigate to="/" replace/>}/>
      <Route path="/inventory" element={<Navigate to="/" replace/>}/>
      <Route path="/locations" element={<Navigate to="/" replace/>}/>
      <Route path="/users" element={<Navigate to="/" replace/>}/>
      <Route path="/reports" element={<Navigate to="/" replace/>}/>
      <Route path="/audit" element={<Navigate to="/" replace/>}/>
     </>
    ) : isEngineer ? (
     <>
      <Route path="/monitoring" element={<Monitoring/>}/>
      <Route path="/tickets" element={<Tickets/>}/>
      <Route path="/alerts" element={<Alerts/>}/>
      {/* Network Engineers strictly focused on AP telemetry & incident tickets: redirect checklists, shifts, and administration */}
      <Route path="/checklists" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/shifts" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/assets" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/inventory" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/locations" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/users" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/reports" element={<Navigate to="/tickets" replace/>}/>
      <Route path="/audit" element={<Navigate to="/tickets" replace/>}/>
     </>
    ) : (
     <>
      <Route path="/monitoring" element={<Monitoring/>}/>
      <Route path="/tickets" element={<Tickets/>}/>
      <Route path="/checklists" element={<Checklists/>}/>
      <Route path="/alerts" element={<Alerts/>}/>
      <Route path="/shifts" element={<Shifts/>}/>
      {user.role==='admin'&&(
       <>
        <Route path="/assets" element={<Assets/>}/>
        <Route path="/inventory" element={<Navigate to="/assets" replace/>}/>
        <Route path="/locations" element={<Locations/>}/>
        <Route path="/users" element={<Team/>}/>
        <Route path="/reports" element={<Reports/>}/>
        <Route path="/audit" element={<Audit/>}/>
       </>
      )}
     </>
    )}
    <Route path="*" element={<Navigate to="/" replace/>}/>
   </Routes>
  </Layout>
 );
};
export default function App(){return <ThemeProvider forcedTheme="dark"><BrowserRouter><AuthProvider><Protected/></AuthProvider></BrowserRouter><Toaster position="bottom-right"/></ThemeProvider>;}