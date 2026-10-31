import { Overview } from './overview';
import { applyUICommand, layoutState } from './ui';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { HudsonApp } from '../../packages/web/hudsonkit/src/types/app';
import { EditorPanels } from '../../packages/web/hudsonkit/src/editor-panels';
import { CodeViewer } from '../../packages/web/hudsonkit/src/components/controls/CodeViewer';
import { HudButton, HudBadge, HudToolbar, HudToolbarSeparator, HudListItem } from '../../packages/web/hudsonkit/src/components/primitives';
import { HudGroupedList } from '../../packages/web/hudsonkit/src/components/patterns/HudGroupedList';
import StatusBar from '../../packages/web/hudsonkit/src/components/chrome/StatusBar';
import { createAgentComposer } from '../../packages/web/hudsonkit/src/agent-composer';
import { createEditorLayoutPersistence, expandedPreset, selectionCountLabel } from './presentation';
import type { AgentWorkspaceController } from '../../packages/web/hudsonkit/src/agent-workspace';
import { selectionForKeys, type EditorModel } from './model';
import { isUnassigned, orderedGroups, relativeTime, removeContextRow, rowLabel, scrollRowIntoView, selectedRows, shortRevision, toggleRow } from './flow';
const Context = createContext<EditorModel | null>(null);
const useModel = () => { const model = useContext(Context); if (!model) throw new Error('Editor Provider required'); return model; };
const useData = () => { const model = useModel(); return useSyncExternalStore(model.subscribe, model.getSnapshot); };
const useSelection = () => { const model = useModel(); return useSyncExternalStore(model.selection.subscribe, model.selection.getSnapshot).selection; };
function Chat() {
  const model = useModel(); const { projection } = useData(); const selection = useSelection();
  const rows = selectedRows(projection, selection);
  const host = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const composer = useRef<ReturnType<typeof createAgentComposer> | null>(null);
  useLayoutEffect(() => {
    composer.current = createAgentComposer(host.current!, {
      placeholder: 'Ask about these windows…',
      ariaLabel: 'Ask about these windows (agent unavailable)',
      onSubmit: () => {}, onContextAction: item => removeContextRow(model, item.id),
    });
    chips.current!.append(composer.current.leadingTools);
    return () => { composer.current?.leadingTools.remove(); composer.current?.destroy(); composer.current = null; };
  }, [model]);
  useLayoutEffect(() => { composer.current?.update({ disabled: true, canSend: false, contextActionsEnabled: true,
    contextItems: rows.map(row => ({ id: row.id, label: rowLabel(row) + ' ×', title: 'Remove ' + rowLabel(row) })) }); }, [rows]);
  return <div className="context-panel text-muted-foreground text-[12px]"><div className="context-scroll">
    {!rows.length && <div className="chat-empty"><h2>Arrange your windows</h2><p className="context-hint">Select windows in Preview to add them as context.</p></div>}
    {rows.length > 0 && <div className="small-caps context-label">Context</div>}
    <div ref={chips} className="context-chips hk-agent-composer" aria-label="Selected windows" />
    <div className="context-examples"><p>Try</p><ul><li>Put these in Build and tile them</li><li>Explain why these windows are grouped together</li><li>Show me the settings for these windows</li></ul></div>
    </div><div ref={host} className="composer-host" />
  </div>;
}
function Terminal() { return <div className="placeholder"><p>This read-only editor does not connect to a terminal.</p></div>; }
function History() {
  const { history } = useData();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  return <div className="history text-[12px] text-muted-foreground">{!history.length
    ? <p className="hint">Changes made elsewhere (for example, the menu bar) appear here.</p>
    : <ol>{[...history].reverse().map((entry, i) =>
      <li key={`${entry.at}:${i}`}><span>Configuration changed</span>
        <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>{relativeTime(entry.at, now)}</time>
        <code title={entry.revision}>{shortRevision(entry.revision)}</code>
      </li>)}</ol>}</div>;
}
function Preview() {
  const { projection } = useData(); const model = useModel(); const selection = useSelection();
  const selected = selectedRows(projection, selection).map(row => row.id);
  const groups = orderedGroups(projection); const rows = groups.flatMap(group => group.rows);
  const [active, setActive] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const rowNodes = useRef(new Map<string, HTMLDivElement>());
  const activeRow = rows.find(row => row.id === active) ?? rows.find(row => selected.includes(row.id)) ?? rows[0];
  const optionId = (id: string) => `preview-row-${encodeURIComponent(id)}`;
  useLayoutEffect(() => {
    if (selection.origin === 'source') {
      const first = selection.refs.find(ref => ref.kind === 'lattices.window');
      if (first) scrollRowIntoView(rowNodes.current.get(first.id));
    }
  }, [selection]);
  return <div className="preview focus-visible:outline focus-visible:outline-accent" ref={list} role="listbox" aria-label="Windows" aria-multiselectable="true"
    tabIndex={0} aria-activedescendant={activeRow ? optionId(activeRow.id) : undefined}
    onKeyDown={event => {
      const index = activeRow ? rows.findIndex(row => row.id === activeRow.id) : -1;
      let next = index;
      if (event.key === 'ArrowDown') next = Math.min(rows.length - 1, index + 1);
      else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = rows.length - 1;
      else if ((event.key === ' ' || event.key === 'Enter') && activeRow) {
        event.preventDefault(); model.selectRows(toggleRow(selected, activeRow.id, event.metaKey || event.ctrlKey)); return;
      } else return;
      event.preventDefault();
      if (rows[next]) { setActive(rows[next].id); scrollRowIntoView(rowNodes.current.get(rows[next].id)); }
    }}>
    <HudGroupedList groups={groups.map(group => ({ id: group.id, title: group.rows.length ? group.label : group.label + ' · no windows', count: group.rows.length || undefined, items: group.rows }))}
      itemKey={row => row.id} renderTitle={row => row.title} stickyHeaders
      groupClassName={group => `preview-group${group.items.length ? '' : ' empty-group'}${group.id.toLowerCase() === 'unassigned' ? ' unassigned border-t border-border mt-3 pt-2' : ''}`}
      renderItem={row => <HudListItem role="option" aria-selected={selected.includes(row.id)} active={activeRow?.id === row.id} selected={selected.includes(row.id)}
        aria-label={rowLabel(row)} title={rowLabel(row)} className="preview-row hover:bg-muted/40" id={optionId(row.id)}
        data-active={activeRow?.id === row.id} elementRef={node => { if (node) rowNodes.current.set(row.id, node); else rowNodes.current.delete(row.id); }}
        onMouseDown={event => event.preventDefault()}
        tabIndex={-1}
        onClick={event => { setActive(row.id); list.current?.focus({ preventScroll: true }); model.selectRows(toggleRow(selected, row.id, event.metaKey || event.ctrlKey)); }}>
        <span className="row-content"><span className="app-glyph bg-muted text-muted-foreground rounded" aria-hidden="true">{Array.from(row.app)[0]?.toUpperCase() || '?'}</span>
        <span className="row-title">{row.title || 'Untitled window'}</span><span className="row-app text-muted-foreground">{row.app}</span>{selected.includes(row.id) && <span className="row-check" aria-hidden="true">✓</span>}</span>
      </HudListItem>} />
  </div>;
}
function Source() {
  const model = useModel(); const { document } = useData(); const selection = useSelection();
  return <div className="source" data-ambiguous={selection.ambiguous}>
    <CodeViewer code={document?.source.text ?? ''} language="json" onSelectRanges={model.selectRanges} ranges={selection.ranges} revealRanges={selection.origin !== 'source'} className="code-host" /></div>;
}
function PreviewHeader() {
  const model = useModel(); const { projection } = useData(); const selection = useSelection();
  const count = selectedRows(projection, selection).length;
  return <div className="panel-metadata"><span className="count-pill">{projection?.groups.flatMap(g => g.rows).length ?? 0} windows</span>
    {count > 0 && <><span className="selected-count">{count} selected</span><button className="clear-selection" onClick={() => model.selection.clear()}>Clear</button></>}
    {selection.ambiguous && <span className="ambiguity-label" title={`Matches ${selection.ranges.length} entries in Source (duplicates)`}>Duplicates</span>}
  </div>;
}
function SourceHeader() {
  const { document } = useData(); const selection = useSelection();
  const first = selection.ranges[0]; const text = document?.source.text ?? '';
  const line = (offset: number) => text.slice(0, offset).split('\n').length;
  return <div className="panel-metadata source-metadata"><code>workspace.json</code>{first && <span className="count-pill">lines {line(first.from)}–{line(first.to)}</span>}</div>;
}
function Content() {
  const model = useModel(); const data = useData(); const selection = useSelection();
  const shell = useRef<AgentWorkspaceController | null>(null);
  const uiUnsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => () => uiUnsubscribe.current?.(), []);
  const [storageNotice, setStorageNotice] = useState(false);
  const panels = useMemo(() => [
    { id: 'chat', label: 'Chat', showActions: false, content: <Chat /> },
    { id: 'terminal', label: 'Terminal', showActions: false, content: <Terminal /> },
    { id: 'preview', label: 'Preview', showActions: false, content: <Preview />, headerContent: <PreviewHeader /> },
    { id: 'history', label: 'History & Results', showActions: false, content: <History /> },
    { id: 'source', label: 'Source', showActions: false, content: <Source />, headerContent: <SourceHeader /> },
  ], []);
  const id = data.document?.subject.id;
  const persistence = useMemo(() => {
    if (!id) return null;
    let storage: Storage | undefined;
    try { storage = globalThis.localStorage; } catch { /* Report on save. */ }
    return createEditorLayoutPersistence(storage, id);
  }, [id]);
  const openWorkspace = (panel?: 'preview'|'source'|'history', ids?: string[], layerId?: string) => {
    model.setView('workspace');
    if (panel === 'source' && layerId && data.projection) model.selection.select(selectionForKeys(data.projection, data.projection.entries.filter(e=>e.layerId===layerId).map(e=>e.key), 'overview'));
    else if (ids) model.selectRows(ids);
    if (panel) shell.current?.showPanel(panel);
  };
  if (data.status === 'unavailable') return <main className="fallback"><h1>Editor unavailable in this Lattices version</h1><p>Update Lattices to a version with the read-only Editor bridge.</p></main>;
  if (!persistence) return <main className="fallback"><h1>{data.status === 'error' ? "Can't read workspace layers" : 'Loading Workspace Layers…'}</h1>{data.error && <><p role="alert">{data.error}</p><button onClick={() => void model.retry()}>Retry</button></>}</main>;
  return <main className="editor-root lv" data-chrome={data.chrome} data-view={data.view}>
    {data.chrome !== 'host' && <header className="editor-heading border-b border-border"><h1 className="text-[14px] font-semibold">{data.document?.subject.label}</h1>
      <div className="view-switch" role="group" aria-label="Layers view">{(['overview','workspace'] as const).map(view=><button key={view} aria-pressed={data.view===view} onClick={()=>model.setView(view)}>{view==='overview'?'Overview':'Workspace'}</button>)}</div><HudToolbar className="header-actions"><HudButton variant="ghost" onClick={() => openWorkspace('source')}>Inspect Source</HudButton><HudToolbarSeparator /><HudButton variant="soft" onClick={() => { openWorkspace(); shell.current?.setPanelLayout(expandedPreset()); }}>Expanded layout</HudButton></HudToolbar>
    </header>}
    {data.error && <div className="notice text-warning bg-warning/10" role="alert">Showing the last consistent view. {data.error} <button onClick={() => void model.retry()}>Retry</button></div>}
    {data.uiError && <div className="notice" role="alert">Layout controls could not sync. <button onClick={() => { if (shell.current) void model.reportLayout(layoutState(shell.current.getPanelLayout())); }}>Retry</button></div>}
    {storageNotice && <div className="notice" role="status">Layout could not be saved on this device.</div>}
    <div className="overview-view" hidden={data.view !== 'overview'}><Overview actions={model.actions} selectedLayerIds={data.selectedLayerIds} onSelectLayers={model.setSelectedLayers} projection={data.projection} readAt={data.readAt} onOpen={openWorkspace}/></div>
    <div className="workspace-view" hidden={data.view !== 'workspace'}><EditorPanels key={id} panels={panels} layout={persistence.getLayout()} onReady={controller => {
      uiUnsubscribe.current?.(); shell.current = controller;
      if (controller) {
        if (data.chrome === 'host') {
          if (!layoutState(controller.getPanelLayout()).panels.length) controller.showPanel('preview');
          controller.hidePanel('terminal');
        }
        uiUnsubscribe.current = model.subscribeUI(command => applyUICommand(controller, command));
        void model.reportLayout(layoutState(controller.getPanelLayout()));
      }
    }} onLayoutChange={layout => { setStorageNotice(!persistence.save(layout)); void model.reportLayout(layoutState(layout)); }} /></div>
    {data.chrome !== 'host' && <div className="editor-status"><StatusBar embedded status={{ label: data.methods.includes('action.plan')?'LAYERS':'READ ONLY', color: 'neutral' }} left={<>
      <span className="status-counts">{data.projection?.groups.filter(g => !isUnassigned(g)).length ?? 0} layers · {data.projection?.groups.flatMap(g => g.rows).length ?? 0} windows</span>
      <div className={selection.ambiguous ? 'selection-summary text-warning' : 'selection-summary text-muted-foreground'} role="status"><span>{selection.ambiguous ? `Matches ${selection.ranges.length} entries in Source (duplicates)` : selectionCountLabel(selectedRows(data.projection, selection).length)}</span>{selection.refs.length > 0 && <HudButton density="compact" variant="ghost" onClick={() => model.selection.clear()}>Clear</HudButton>}</div>
    </>} right={<><code title={data.document?.subject.revision ?? ''}>{shortRevision(data.document?.subject.revision ?? '')}</code><HudBadge tone={data.error ? 'warning' : 'accent'} dot>{data.error ? 'Stale' : 'Live'}</HudBadge></>} /></div>}
  </main>;
}
export function createLatticesEditorApp(model: EditorModel): HudsonApp {
  function Provider({ children }: { children: ReactNode }) {
    useEffect(() => { void model.start(); return () => model.dispose(); }, []);
    return <Context.Provider value={model}>{children}</Context.Provider>;
  }
  return { id: 'lattices-editor', name: 'Lattices Editor', mode: 'panel', Provider,
    slots: { Content }, hooks: { useCommands: () => [], useStatus: () => ({ label: 'READ ONLY', color: 'neutral' }) } };
}
