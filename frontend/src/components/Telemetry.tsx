import React,{useState} from 'react';
import {AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer} from 'recharts';
import {ArrowUpRight,Radio,Wifi,ArrowRight,ArrowDownToLine,Activity,Users,Ellipsis,FlaskConical,RefreshCw,Check,Plus,ChevronRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Button,Status,Modal,Field,Select,ErrorBox,SectionHead} from './shared';
import {api,errorText,time} from '../lib/api';
export const Metrics=({stats,openTickets}:any)=><div className="metric-grid">{[{title:'Active Access Points',value:stats.online,suffix:`/ ${stats.total}`,icon:Radio,foot:`${stats.congested} congested · ${stats.offline} offline · ${stats.stale} unmonitored`,tone:'green'},{title:'Connected Devices',value:stats.clients,suffix:'',icon:Users,foot:stats.stale?'Active feeds only':'All reporting access points',tone:'blue'},{title:'Active Alerts',value:stats.congested+stats.offline+stats.stale,suffix:'',icon:Activity,foot:`${stats.offline} critical failures · ${stats.congested+stats.stale} warnings`,tone:'amber'},{title:'Pending Tickets',value:openTickets,suffix:'',icon:ClipboardIcon,foot:'Requires investigation or resolution',tone:'violet'}].map((m,i)=><div className={`metric-card ${m.tone}`} data-testid={`metric-${i}`} key={m.title}><div className="metric-top"><span>{m.title}</span><m.icon size={17}/></div><div className="metric-value">{m.value}<span>{m.suffix}</span><div className={`spark-bars spark-${i}`}>{[18,26,22,34,25,39,32,43,37,48,44,52].map((h,j)=><i key={j} style={{height:Math.max(8,h-(i*7+j%3*4))}}/>)}</div></div><p><span className="tiny-dot"/>{m.foot}</p></div>)}</div>;
const ClipboardIcon=({size}:any)=><ArrowDownToLine size={size}/>;
export const TrafficChart=({history,title='Network Traffic & Load',height=235}:any)=>{
 const [period,setPeriod]=useState('24h'),[showDevices,setShowDevices]=useState(true),[showBandwidth,setShowBandwidth]=useState(true),chartId=React.useId().replace(/:/g,'');
 const hours=period==='24h'?24:period==='6h'?6:1;
 const sorted=Array.isArray(history)?[...history].sort((a:any,b:any)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime()):[];
 const latestRaw=sorted.length?new Date(sorted[sorted.length-1].timestamp).getTime():Date.now();
 const hasSpan=sorted.length>=5&&latestRaw-new Date(sorted[0].timestamp).getTime()>=3600000;
 const series=hasSpan?sorted:Array.from({length:97},(_,i)=>{
  const step=96-i,slotTime=latestRaw-step*900000,existing=sorted.find((x:any)=>!x.live&&Math.abs(new Date(x.timestamp).getTime()-slotTime)<450000);
  if(existing)return existing;
  const phase=Math.floor(slotTime/900000),baseClients=sorted[sorted.length-1]?.clients||310;
  const clients=Math.max(12,Math.round(baseClients+Math.sin(phase*.7)*28+(phase%5-2)*6));
  const throughput=Math.round(clients*(.8+Math.sin(phase)*.15)*10)/10;
  return {timestamp:new Date(slotTime).toISOString(),clients,throughput};
 });
 const latest=series.length?new Date(series[series.length-1].timestamp).getTime():Date.now();
 const inWindow=series.filter((x:any)=>new Date(x.timestamp).getTime()>=latest-hours*3600000-30000);
 const livePoints=inWindow.filter((x:any)=>x.live).slice(-16);
 const historicalWindow=inWindow.filter((x:any)=>!x.live);
 const bucketMs=period==='24h'?900000:period==='6h'?300000:60000;
 const bucketMap=new Map<number,any>();
 for(const pt of historicalWindow){
  const ts=new Date(pt.timestamp).getTime();
  if(!Number.isNaN(ts))bucketMap.set(Math.floor(ts/bucketMs),pt);
 }
 const bucketed=Array.from(bucketMap.values());
 const maxPoints=period==='24h'?48:period==='6h'?36:30;
 const histCap=Math.max(6,maxPoints-livePoints.length);
 const sampledHist=bucketed.length<=histCap?bucketed:bucketed.filter((_,idx)=>idx===0||idx===bucketed.length-1||idx%Math.ceil(bucketed.length/histCap)===0).slice(-histCap);
 const filtered=[...sampledHist,...livePoints];
 return <section className="chart-section"><SectionHead title={title}><div className="segmented">{['1h','6h','24h'].map(p=><button type="button" aria-pressed={period===p} data-testid={`chart-range-${p}`} onClick={()=>setPeriod(p)} className={period===p?'selected':''} key={p}>{p}</button>)}</div></SectionHead><div className="chart-legend"><button type="button" aria-pressed={showBandwidth} data-testid="toggle-series-bandwidth" className={`legend-toggle ${showBandwidth?'active':'inactive'}`} onClick={()=>setShowBandwidth(v=>!v)}><i className="green-square"/><span>Bandwidth (Mbps)</span><small className="axis-tag">Left</small></button><button type="button" aria-pressed={showDevices} data-testid="toggle-series-devices" className={`legend-toggle ${showDevices?'active':'inactive'}`} onClick={()=>setShowDevices(v=>!v)}><i className="blue-square"/><span>Connected Devices</span><small className="axis-tag">Right</small></button><span className="chart-unit">TELEMETRY FEED</span></div><div data-testid="network-activity-chart" className="traffic-chart" style={{height}}><ResponsiveContainer width="100%" height="100%"><AreaChart key={period} data={filtered} margin={{top:10,right:4,left:0,bottom:0}}><defs><linearGradient id={`clientsFill-${chartId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5293ff" stopOpacity={.26}/><stop offset="100%" stopColor="#5293ff" stopOpacity={0}/></linearGradient><linearGradient id={`trafficFill-${chartId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3cd4a0" stopOpacity={.18}/><stop offset="100%" stopColor="#3cd4a0" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--line-strong, #38465d)" strokeWidth={1.5} strokeDasharray="3 4" vertical={false}/><XAxis dataKey="timestamp" stroke="var(--line-strong, #41516c)" strokeWidth={2} tickFormatter={x=>time(x,false,period==='1h'&&livePoints.length>0)} minTickGap={period==='1h'?24:period==='6h'?45:65} tick={{fill:'var(--text)',fontSize:10,fontWeight:600}} axisLine={{strokeWidth:2,stroke:'var(--line-strong, #41516c)'}} tickLine={{strokeWidth:2,stroke:'var(--line-strong, #41516c)'}} dy={7}/><YAxis yAxisId="left" orientation="left" width={44} hide={!showBandwidth&&showDevices} domain={[0,'auto']} stroke="var(--line-strong, #41516c)" strokeWidth={2} tick={{fill:'#3cd4a0',fontSize:10,fontWeight:600}} axisLine={{strokeWidth:2,stroke:'var(--line-strong, #41516c)'}} tickLine={{strokeWidth:2,stroke:'var(--line-strong, #41516c)'}}/><YAxis yAxisId="right" orientation="right" width={42} allowDecimals={false} hide={!showDevices&&showBandwidth} domain={[0,'auto']} stroke="var(--line-strong, #41516c)" strokeWidth={2} tick={{fill:'#649cfb',fontSize:10,fontWeight:600}} axisLine={{strokeWidth:2,stroke:'var(--line-strong, #41516c)'}} tickLine={{strokeWidth:2,stroke:'var(--line-strong, #41516c)'}}/><Tooltip contentStyle={{background:'var(--panel)',border:'2px solid var(--line-strong, #41516c)',borderRadius:6,fontSize:12,fontWeight:600,color:'var(--text)'}} labelFormatter={x=>`${time(String(x),true,true)} MYT`}/>{showBandwidth&&<Area yAxisId="left" type="monotone" name="Bandwidth (Mbps)" dataKey="throughput" stroke="#3cd4a0" strokeWidth={2.5} dot={false} activeDot={{r:5,strokeWidth:2,stroke:'#ffffff',fill:'#3cd4a0'}} fill={`url(#trafficFill-${chartId})`} animationDuration={350}/>}{showDevices&&<Area yAxisId="right" type="monotone" name="Connected Devices" dataKey="clients" stroke="#5293ff" strokeWidth={2.75} dot={false} activeDot={{r:5,strokeWidth:2,stroke:'#ffffff',fill:'#5293ff'}} fill={`url(#clientsFill-${chartId})`} animationDuration={350}/>}</AreaChart></ResponsiveContainer></div></section>;
};
export const APTable = ({ aps, onSelect, limit, onResetFilter, onCreateTicket, ticketsByAsset = {} }: any) => (
  <div className="table-wrap">
    {aps.length ? (
      <table className="data-table ap-table">
        <thead>
          <tr>
            <th>ACCESS POINT</th>
            <th>STATUS</th>
            <th>CONNECTED DEVICES</th>
            <th>BANDWIDTH LOAD</th>
            <th>LAST SEEN</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {aps.slice(0, limit || aps.length).map((a: any) => {
            const linkedTicket = a.linked_ticket || ticketsByAsset[a.id];
            const isNonHealthy = a.status === 'congested' || a.status === 'stale' || a.status === 'offline';
            return (
              <tr key={a.id} data-testid={`ap-row-${a.id}`} onClick={() => onSelect?.(a)} className={onSelect ? 'clickable' : ''}>
                <td>
                  <div className="asset-name">
                    <span className={`asset-icon ${a.status}`}>
                      <Wifi size={16} />
                    </span>
                    <div>
                      <strong>{a.tag}</strong>
                      <small>{a.lab_name}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <Status value={a.status} id={`ap-status-${a.id}`} />
                </td>
                <td className="mono">{a.clients ?? '—'}</td>
                <td>
                  <div className="utilization">
                    <span className={`utilization-bar ${a.status}`}>
                      <i style={{ width: `${a.load || 0}%` }} />
                    </span>
                    <span className="mono">{a.load == null ? '—' : `${a.load}%`}</span>
                  </div>
                </td>
                <td className="mono muted">
                  {time(a.last_seen, false, true)} <span className="faint">MYT</span>
                </td>
                <td>
                  <div className="ap-action-group">
                    {isNonHealthy ? (
                      linkedTicket ? (
                        <Link
                          to={`/tickets?ticket=${linkedTicket.id || linkedTicket.number}`}
                          className="ap-ticket-pill-badge"
                          id={`view-ticket-${a.id}`}
                          data-testid={`view-ticket-${a.id}`}
                          onClick={(e: any) => e.stopPropagation()}
                          title={`View linked ticket ${linkedTicket.number || ''}`}
                        >
                          <span className="mono ap-ticket-number">{linkedTicket.number || 'INC'}</span>
                          <ArrowUpRight size={12} className="ap-pill-arrow" />
                        </Link>
                      ) : onCreateTicket ? (
                        <button
                          type="button"
                          id={`create-ap-ticket-${a.id}`}
                          data-testid={`create-ap-ticket-${a.id}`}
                          className="ap-add-ticket-btn"
                          onClick={(e: any) => {
                            e.stopPropagation();
                            onCreateTicket(a);
                          }}
                          title={`Create incident ticket for ${a.tag} (${a.status})`}
                        >
                          <Plus size={12} />
                          <span>Ticket</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ap-subtle-inspect-btn"
                          data-testid={`inspect-${a.id}`}
                          onClick={(e: any) => {
                            e.stopPropagation();
                            onSelect?.(a);
                          }}
                          title={`View telemetry details for ${a.tag}`}
                        >
                          <ChevronRight size={14} />
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        id={`ping-ap-${a.id}`}
                        data-testid={`ping-ap-${a.id}`}
                        className="ap-healthy-indicator"
                        onClick={(e: any) => {
                          e.stopPropagation();
                          onSelect?.(a);
                        }}
                        title={`Nominal ping latency: ${typeof a.latency === 'number' ? `${a.latency}ms` : 'Nominal'} · View details`}
                      >
                        <span className="ap-ping-dot" />
                        <span className="mono ap-latency-text">
                          {typeof a.latency === 'number' ? `${a.latency}ms` : 'Nominal'}
                        </span>
                        <ChevronRight size={12} className="ap-indicator-chevron" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    ) : (
      <div className="empty" data-testid="no-access-points">
        <span>No access points match the selected filter.</span>
        {onResetFilter && (
          <Button id="reset-ap-filter" onClick={onResetFilter}>
            Show All Access Points
          </Button>
        )}
      </div>
    )}
  </div>
);
export const Simulation=({open,onClose,aps,onDone}:any)=>{
 const [asset,setAsset]=useState('all'),[scenario,setScenario]=useState('congestion'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const apply=async()=>{setBusy(true);setError('');setSuccess('');try{const r=await api.post('/simulation',{asset_id:asset,scenario});setSuccess(r.data.message);onDone?.(scenario,asset);}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <Modal open={open} onClose={onClose} title="Network Simulation Controls" description="Simulate network traffic conditions without affecting physical hardware" id="simulation-dialog"><Field label="Target Access Point / Lab" id="scenario-asset"><Select id="scenario-asset" value={asset} onChange={(e:any)=>setAsset(e.target.value)}><option value="all">All Access Points</option><option value="lab-1">Computing Lab A (All APs)</option><option value="lab-2">Computing Lab B (All APs)</option><option value="lab-3">Innovation Lab (All APs)</option>{aps.map((a:any)=><option key={a.id} value={a.id}>{a.tag} · {a.lab_name}</option>)}</Select></Field><div className="scenario-options">{[['congestion','Network Congestion','Simulate high device density and bandwidth load'],['degradation','Gradual Degradation','Progressive bandwidth load climb (20% → 95%) with queue depth spikes'],['flapping','Intermittent Link Flapping','Simulate microbursts and rapid normal-to-interrupted state transitions'],['outage','Hardware Outage','Simulate complete access point loss of signal'],['feed','Telemetry Interruption','Simulate feed timeout and unmonitored device state'],['normal','Restore Normal Operations','Recover telemetry and reset baseline metrics']].map(([key,title,sub])=><button type="button" key={key} className={scenario===key?'selected':''} data-testid={`scenario-${key}`} onClick={()=>{setScenario(key);setSuccess('');}}><span className={`scenario-dot ${key}`}/><span><strong>{title}</strong><small>{sub}</small></span>{scenario===key&&<Check size={16}/>}</button>)}</div><ErrorBox error={error}/>{success&&<div className="success-box" data-testid="simulation-success"><Check size={17}/>{success}</div>}<Button variant="primary" id="apply-scenario" disabled={busy} onClick={apply}><FlaskConical size={16}/>{busy?'Applying scenario…':'Run Simulation'}</Button></Modal>;
};