'use client';

// Internal UI state shared by the pieces of one TabArea. Not exported.
import { createContext, useContext } from 'react';
import type { ActivitySnapshot } from '../../types/activity';
import type { TabsController } from './controller';

export const TAB_DRAG_MIME = 'application/x-hudson-tab';

export interface TabAreaUi {
  controller: TabsController;
  /** Register a group's content box; tab content is positioned over it. */
  registerBody(groupId: string, el: HTMLElement | null): void;
  /** The tab being dragged, if any. */
  dragging: string | null;
  setDragging(instanceId: string | null): void;
  /** One group at a time (phone width). */
  compact: boolean;
  activities: ReadonlyMap<string, ActivitySnapshot>;
  activityFor(instanceId: string): ActivitySnapshot | null;
  emptyState?: React.ReactNode;
}

export const TabAreaUiContext = createContext<TabAreaUi | null>(null);

export function useTabAreaUi(): TabAreaUi {
  const ui = useContext(TabAreaUiContext);
  if (!ui) throw new Error('TabArea internals used outside a TabArea');
  return ui;
}

export function hasTabDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(TAB_DRAG_MIME);
}
