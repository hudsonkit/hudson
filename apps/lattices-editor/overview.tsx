import {ActTrigger,LayerChat} from './act-components';
import {ActionReceipt,usePageUndo} from './action-history';
import type {ActClient} from './act-wire';
import { matchedEntry } from './geometry';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DisplayMap } from './display-map';
import { ShouldBe } from './should-be';
import type { Projection } from './model';
import { waitingRules, overviewSelectionFacts, toggleLayer, contextLabel } from './overview-data';
import { isUnassigned } from './flow';
const updatedLabel=(seconds:number)=>seconds<60?'Updated just now':`Updated ${Math.floor(seconds/60)} min ago`;
export function Overview({ actions, projection, readAt, onOpen, selectedLayerIds, onSelectLayers }: { actions:ActClient; selectedLayerIds:string[]; onSelectLayers:(ids:string[])=>void; projection: Projection | null; readAt:number|null; onOpen:(panel?:'preview'|'source'|'history', ids?:string[], layerId?:string)=>void }) {
  const indexHost=useRef<HTMLElement>(null),root=useRef<HTMLDivElement>(null);
  const activity=useSyncExternalStore(actions.controller.subscribe,actions.controller.getSnapshot,actions.controller.getSnapshot);
  const [triggerKey,setTriggerKey]=useState('');
  const selectedId=selectedLayerIds.length===1?selectedLayerIds[0]:null;
  const canAct=actions.supported('action.plan')&&actions.supported('action.confirm'),canChat=actions.supported('assistant.send');
  useEffect(()=>{if(selectedId)void actions.readAssistant(selectedId);},[actions,selectedId,canChat]);
  useEffect(()=>{if(actions.supported('actions.list'))void actions.controller.list();},[actions,canAct]);
  usePageUndo(root,actions.supported('action.undo')&&!!activity.newestUndoableActionId&&!activity.busy,actions.controller.undo);
  useLayoutEffect(()=>{const active=document.activeElement;if(active instanceof HTMLElement && indexHost.current?.contains(active) && active.getAttribute('aria-pressed')==='false') active.blur();},[selectedLayerIds]);
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const groups=projection?.groups ?? []; const layers=groups.filter(g=>!isUnassigned(g)); const unassigned=groups.find(isUnassigned);
  const single=selectedLayerIds.length===1 ? groups.find(g=>g.id===selectedLayerIds[0]) : undefined;
  const group=single ?? {id:'',label:selectedLayerIds.length ? `${selectedLayerIds.length} layers` : 'All windows',rows:groups.filter(g=>!selectedLayerIds.length||selectedLayerIds.includes(g.id)).flatMap(g=>g.rows)};
  if(!group || !projection) return <div className="overview-empty"><h1>No layers configured</h1><button onClick={()=>onOpen()}>Open Workspace ›</button></div>;
  const facts=overviewSelectionFacts(projection,selectedLayerIds); const index=layers.findIndex(g=>g.id===single?.id);
  const open=(panel?:'preview'|'source'|'history')=>onOpen(panel, facts.rows.map(r=>r.id), single?.id);
  const unassignedSelected=!!single&&isUnassigned(single);
  const waiting=waitingRules(facts.rules);
  const waitingCount=waiting.length;
  const displayCount=new Set(facts.rows.flatMap(r=>r.displayId?[r.displayId]:[])).size;
  const description=unassignedSelected ? `${facts.rows.length} open windows aren't in a layer. Nothing here moves them.` : !facts.rows.length ? `${waitingCount} ${waitingCount===1?'rule is':'rules are'} waiting for a matching window.` : facts.description;
  const actionButton=(kind:'gather'|'open',label:string,entryIndex?:number,primary=false)=>{const key=entryIndex===undefined?kind:'entry:'+entryIndex;const plan=activity.plan;return <ActTrigger label={label} primary={primary} busy={activity.busy||activity.planning} disabled={!canAct} confirmation={triggerKey===key&&(activity.planning||plan?.layerId===single?.id)?plan??{title:'Review action',explanation:'Reading the current plan…',lines:[],warnings:[],confirmLabel:'Confirm'}:null} onPlan={()=>{if(!single)return;setTriggerKey(key);void actions.controller.plan({kind,layerId:single.id,...(entryIndex===undefined?{}:{entryIndex})});}} onCancel={actions.controller.cancel} onConfirm={()=>void actions.controller.confirm()}/>;};
  const receipt=<ActionReceipt result={activity.result} error={activity.error} history={activity.history} newestUndoableActionId={actions.supported('action.undo')?activity.newestUndoableActionId:null} busy={activity.busy} onUndo={()=>void actions.controller.undo()} onReveal={()=>void actions.controller.reveal()} onDetails={actions.controller.list}/>;
  const layerRow=(g:typeof group)=> <button key={g.id} aria-pressed={selectedLayerIds.includes(g.id)} onClick={e=>onSelectLayers(toggleLayer(selectedLayerIds,g.id,e.metaKey||e.ctrlKey))}><span className={isUnassigned(g)?"layer-dot unassigned-dot":"layer-dot"} data-open={!isUnassigned(g)&&!!g.rows.length}/><span>{g.label}</span><code>{isUnassigned(g)?g.rows.length:g.rows.length||'—'}</code></button>;
  return <div ref={root} className="overview">
    <aside onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open();return;}if(!['ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const buttons=Array.from(indexHost.current?.querySelectorAll<HTMLButtonElement>('button')??[]);const i=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=buttons[Math.max(0,Math.min(buttons.length-1,i+(e.key==='ArrowDown'?1:-1)))];next?.click();next?.focus();}} ref={indexHost} className="layer-index" aria-label="Layers"><h2>Layers <span>{layers.length}</span></h2><button aria-pressed={!selectedLayerIds.length} onClick={()=>onSelectLayers([])}><span className="all-windows-glyph"/><span>All windows</span><code>{groups.reduce((n,g)=>n+g.rows.length,0)}</code></button><nav>{layers.map(layerRow)}</nav>{unassigned && <div className="unassigned-index">{layerRow(unassigned)}</div>}
      <footer><div className="index-key-hints">↑↓ move · ⏎ edit</div>{readAt!==null && <div>{updatedLabel(Math.max(0,Math.floor((now-readAt)/1000)))}</div>}</footer>
    </aside>
    <div className="overview-main">
      <div className="layer-picker"><span className="layer-dot" data-open={!!group.rows.length}/><select aria-label="Choose layer" value={single?.id ?? (selectedLayerIds.length ? '__multiple' : '')} onChange={e=>onSelectLayers(e.target.value ? [e.target.value] : [])}><option value="">All windows</option>{selectedLayerIds.length>1 && <option value="__multiple" disabled>{selectedLayerIds.length} layers selected</option>}{groups.map(g=><option value={g.id} key={g.id}>{g.label}</option>)}</select><span>⌄</span><code>{index>=0?`${index+1} of ${layers.length} · `:''}{facts.rows.length} open</code></div>
      <article className="layer-reading"><div className="overview-content">
        <div className="overview-hero"><div><div className="overview-eyebrow">{index>=0?`Layer · ${index+1} of ${layers.length}`:group.label}</div>
        <h1>{group.label}</h1><p className="layer-description">{description}</p>
        <div className={`layer-facts ${!facts.rows.length?'idle':''}`}><span><i className="layer-dot" data-open={!!facts.rows.length}/>{facts.rows.length?'Active':'Idle'}</span><span>{facts.rows.length} {facts.rows.length===1?'window':'windows'}</span>{!unassignedSelected&&<span>{facts.ruleCount} rules</span>}{displayCount>0&&<span>{displayCount} {displayCount===1?'display':'displays'}</span>}</div></div>
        {single&&!unassignedSelected&&canAct&&<div className="layer-actions">{waitingCount>0&&actionButton('open','＋ Open '+waitingCount+' missing')}{actionButton('gather','▦ Gather windows'+(activity.plan?.layerId===single.id&&activity.plan.shortcut?'  '+activity.plan.shortcut:''),undefined,true)}</div>}</div>
        {single&&!unassignedSelected?<ShouldBe key={single.id} projection={projection} group={single} onSource={()=>open('source')} receipt={receipt} openEntry={canAct?(index,app)=>actionButton('open','Open '+app,index):undefined}/>:<><DisplayMap projection={projection} rows={facts.rows} white={unassignedSelected}/>{facts.rows.length>0&&<table className="overview-window-table"><thead><tr><th aria-label="App icon"/><th>Window</th><th>App</th><th className={unassignedSelected?'where-column':'rule-column'}>{unassignedSelected?'Where':'Placed here by'}</th></tr></thead><tbody>{facts.rows.map(row=>{const entry=matchedEntry(projection,row);const rule=facts.rules.find(r=>r.key===entry?.key);const display=projection.displays?.find(d=>d.id===row.displayId);return <tr key={row.id}><td><span className="overview-app-tile">{row.app.slice(0,1)}</span></td><td title={row.title}>{row.title||row.app}</td><td>{row.app}</td><td className={unassignedSelected?'where-column':'rule-column'}>{unassignedSelected ? display ? <code>{display.name}</code> : null : rule ? <><span className="rule-chip"><code>{rule.text}</code></span><small className="rule-open-count">{rule.open} open</small></> : row.matchedRule===null&&row.entryKeys.length ? <span className="overview-muted">Multiple identical entries</span> : null}</td></tr>;})}</tbody></table>}<button className="quiet-action" onClick={()=>open('source')}>Show source</button></>}
        <div className="overview-add"><h2>Add to this page</h2><div>{(['preview','source','history'] as const).map(panel=><button key={panel} onClick={()=>open(panel)}>+ {panel[0].toUpperCase()+panel.slice(1)}</button>)}</div></div>
      </div><div className="overview-spacer"/>{single&&canChat&&<section className={`overview-chat ${!facts.rows.length?'empty-layer':''}`}><div><h2>{single ? 'Chat about this layer' : 'Chat about these windows'}</h2><button className="quiet-action" onClick={()=>open()}>Open Workspace ›</button></div><LayerChat context={contextLabel(group.label,facts.rows)+' · '+facts.ruleCount+' rules'} messages={activity.assistant[single.id]?.messages??[]} suggestions={(activity.assistant[single.id]?.suggestions??[]).map((suggestion,i)=>({id:String(i),label:suggestion.label,onPlan:()=>{setTriggerKey('gather');void actions.controller.plan(suggestion);}}))} isSending={activity.assistant[single.id]?.isSending??false} available={canChat} error={activity.assistant[single.id]?.error??null} onSend={text=>actions.controller.send(single.id,text)}/></section>}
      </article>
    </div>
  </div>;
}
