// @ts-nocheck
'use client';

import type { AppIntent } from 'hudsonkit';

export const heroIntents: AppIntent[] = [
  {
    commandId: 'hero:view:grid',
    title: 'Switch to Grid View',
    description: 'Show the glyph grid for the active font',
    category: 'view',
    keywords: ['grid', 'glyphs', 'view', 'overview'],
    shortcut: 'Cmd+1',
  },
  {
    commandId: 'hero:view:compare',
    title: 'Switch to Compare View',
    description: 'Compare multiple loaded fonts side by side',
    category: 'view',
    keywords: ['compare', 'fonts', 'side by side', 'diff'],
    shortcut: 'Cmd+2',
  },
  {
    commandId: 'hero:view:talkie',
    title: 'Open Talkie Studio',
    description: 'Wordmark design studio with live glyph manipulation',
    category: 'view',
    keywords: ['talkie', 'wordmark', 'studio', 'brand', 'design'],
    shortcut: 'Cmd+3',
  },
  {
    commandId: 'hero:view:talkie-font',
    title: 'Open Font Studio',
    description: 'Talkie font family manager — Soft, Hard, Mono variants',
    category: 'view',
    keywords: ['font', 'family', 'soft', 'hard', 'mono', 'variant', 'export'],
    shortcut: 'Cmd+4',
  },
  {
    commandId: 'hero:import-font',
    title: 'Import Font',
    description: 'Import a font file (.ttf, .otf, .woff, .woff2, or .json)',
    category: 'file',
    keywords: ['import', 'open', 'load', 'font', 'file'],
    shortcut: 'Cmd+O',
  },
  {
    commandId: 'hero:start-session',
    title: 'Start Editing Session',
    description: 'Begin an editing session for the active font, enabling glyph editing and auto-save',
    category: 'edit',
    keywords: ['session', 'start', 'edit', 'begin'],
  },
  {
    commandId: 'hero:export-hero',
    title: 'Export .hero Session File',
    description: 'Export the current editing session as a .hero file with full edit history',
    category: 'file',
    keywords: ['export', 'save', 'session', 'hero'],
    shortcut: 'Cmd+S',
  },
  {
    commandId: 'hero:export-json',
    title: 'Export Font as JSON',
    description: 'Export the current font data as a standalone JSON file',
    category: 'file',
    keywords: ['export', 'json', 'font', 'save'],
    shortcut: 'Cmd+Shift+S',
  },
  {
    commandId: 'hero:close-session',
    title: 'Close Session',
    description: 'Close the current editing session',
    category: 'edit',
    keywords: ['close', 'end', 'session', 'stop'],
    dangerous: true,
  },
  {
    commandId: 'hero:edit-glyph',
    title: 'Edit Selected Glyph',
    description: 'Open the path editor for the currently selected glyph',
    category: 'edit',
    keywords: ['edit', 'glyph', 'path', 'bezier', 'points'],
    shortcut: 'Enter',
  },
];
