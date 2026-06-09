'use client';

import React, { memo, useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, type Node } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { usePluginStore } from '@/stores/pluginStore';
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore';
import { useLocaleStore } from '@/stores/localeStore';
import { type PortDefinition, PORT_TYPE_COLORS, PORT_TYPE_LABELS, arePortTypesCompatible, type PortType } from '@/lib/portTypes';
import { useDragStateStore } from '@/stores/dragStateStore';
import { renderIcon } from '@/lib/icons';
import { evaluateShowWhen } from '@/lib/configUtils';
import type { ConfigField } from '@/lib/types';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  category: 'input' | 'process' | 'output' | 'control';
  config: Record<string, unknown>;
  pluginConfig?: Record<string, import('@/lib/types').ConfigField>;
  inputs?: PortDefinition[];
  outputs?: PortDefinition[];
  isReachable?: boolean;  // Whether this node is reachable from Start
  isEntryPoint?: boolean; // Whether this node can start execution (no inputs)
  onPlayClick?: () => void; // Callback when play button is clicked
  isSearchMatch?: boolean;  // Whether this node matches the current search
  isSearchDimmed?: boolean; // Whether this node should be dimmed (search active but not matching)
  nodeStatus?: { nodeId: string; status: string; data?: Record<string, unknown> };
}

export type CustomNodeType = Node<CustomNodeData>;

// Node visual configuration derived from plugin store
interface NodeVisualConfig {
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  statusText: string;
}

interface CustomNodeProps {
  id: string;
  data: CustomNodeData;
  selected?: boolean;
}

// Default config for unknown node types
const DEFAULT_COLOR = '#6B7280';
const DEFAULT_BG_COLOR = 'rgba(107, 114, 128, 0.1)';
const DEFAULT_ICON = 'Box';
const DEFAULT_STATUS = 'Ready';

// Chevron SVG components
const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// Status visual config
const STATUS_BORDER_COLORS: Record<string, { border: string; glow: string }> = {
  running: { border: '#3B82F6', glow: 'rgba(59,130,246,0.3)' },
  completed: { border: '#10B981', glow: 'rgba(16,185,129,0.2)' },
  error: { border: '#EF4444', glow: 'rgba(239,68,68,0.3)' },
  warning: { border: '#F59E0B', glow: 'rgba(245,158,11,0.25)' },
};

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const FIELD_BAR_BG = 'rgba(255,255,255,0.07)';
const FOCUS_RING = 'focus-visible:shadow-[0_0_0_1.5px_rgba(255,255,255,0.45)]';
const FOCUS_RING_WITHIN = 'focus-within:shadow-[0_0_0_1.5px_rgba(255,255,255,0.45)]';

// Text input with draft state: commits on blur/Enter, reverts on Escape.
// Keeping edits local until commit means one undo entry / one auto-save per
// edit instead of one per keystroke, and keeps IME composition stable.
function InlineTextField({
  value,
  placeholder,
  ariaLabel,
  password,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  ariaLabel: string;
  password?: boolean;
  onCommit: (val: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const cancelRef = useRef(false);

  const handleBlur = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
    } else if (draft !== null && draft !== value) {
      onCommit(draft);
    }
    setDraft(null);
  };

  return (
    <div
      className={`nodrag nopan ${FOCUS_RING_WITHIN}`}
      style={{ background: FIELD_BAR_BG, borderRadius: '0 0 4px 4px' }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center px-2 h-[26px] gap-1">
        <input
          type={password && !showPw ? 'password' : 'text'}
          className="nodrag nopan bg-transparent text-[10px] text-white/75 outline-none flex-1 min-w-0"
          value={draft ?? value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onFocus={() => setDraft(value)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelRef.current = true;
              e.currentTarget.blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
        {password && (
          <button
            className={`nodrag nopan text-white/30 hover:text-white/60 flex-shrink-0 ${FOCUS_RING}`}
            aria-label={showPw ? 'キーを隠す' : 'キーを表示'}
            title={showPw ? 'キーを隠す' : 'キーを表示'}
            onClick={(e) => { e.stopPropagation(); setShowPw(!showPw); }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showPw
                ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></>
                : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
              }
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// Number field with two widgets:
// - Bounded small ranges → slider bar: drag to scrub (commits on release),
//   plain click switches to direct numeric entry (ComfyUI-style).
// - Unbounded or huge ranges → direct numeric input only. A 240px slider over
//   0–60000 makes precise values impossible, so no slider for those.
function InlineNumberField({
  value,
  min,
  max,
  placeholder,
  ariaLabel,
  accentColor,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  placeholder?: string;
  ariaLabel: string;
  accentColor: string;
  onCommit: (val: number) => void;
}) {
  const hasRange = typeof min === 'number' && typeof max === 'number' && max > min;
  const step = !hasRange ? 1 : (max! - min!) <= 2 ? 0.01 : (max! - min!) <= 10 ? 0.1 : 1;
  const useSlider = hasRange && (max! - min!) / step <= 200;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragState = useRef<{ startX: number; moved: boolean } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  const clamp = (v: number) => {
    let r = v;
    if (typeof min === 'number') r = Math.max(min, r);
    if (typeof max === 'number') r = Math.min(max, r);
    return r;
  };
  const snap = (v: number) => parseFloat((Math.round(v / step) * step).toFixed(4));
  const format = (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(2));

  const display = dragValue ?? value;
  const pct = useSlider
    ? Math.max(0, Math.min(100, ((display - min!) / (max! - min!)) * 100))
    : 0;

  const beginEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };
  const commitDraft = () => {
    setEditing(false);
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      const v = clamp(parsed);
      if (v !== value) onCommit(v);
    }
  };

  const valueFromClientX = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clamp(snap(min! + ratio * (max! - min!)));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (editing || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    if (!dragState.current.moved && Math.abs(e.clientX - dragState.current.startX) < 3) return;
    dragState.current.moved = true;
    setDragValue(valueFromClientX(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const wasDrag = dragState.current.moved;
    dragState.current = null;
    setDragValue(null);
    if (wasDrag) {
      const v = valueFromClientX(e.clientX);
      if (v !== value) onCommit(v);
    } else {
      // Plain click without dragging → switch to direct numeric entry
      beginEdit();
    }
  };
  const onBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onCommit(clamp(snap(value - step)));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onCommit(clamp(snap(value + step)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      beginEdit();
    }
  };

  const editInput = (
    <input
      type="number"
      className="nodrag nopan bg-transparent text-[10px] text-white/90 outline-none text-right flex-1 min-w-0 tabular-nums"
      value={draft}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelRef.current = true;
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );

  if (!useSlider) {
    // Direct input widget
    return (
      <div
        className={`nodrag nopan ${FOCUS_RING_WITHIN}`}
        style={{ background: FIELD_BAR_BG, borderRadius: '0 0 4px 4px' }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-2 h-[26px]">
          {editing ? editInput : (
            <input
              type="number"
              className="nodrag nopan bg-transparent text-[10px] text-white/75 outline-none text-right flex-1 min-w-0 tabular-nums"
              value={format(value)}
              min={min}
              max={max}
              placeholder={placeholder}
              aria-label={ariaLabel}
              onFocus={beginEdit}
              onChange={() => {}}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      </div>
    );
  }

  // Slider widget
  return (
    <div
      ref={barRef}
      role="slider"
      tabIndex={editing ? -1 : 0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={display}
      title="ドラッグで調整 / クリックで数値入力"
      className={`nodrag nopan relative select-none ${editing ? '' : `cursor-ew-resize ${FOCUS_RING}`} ${FOCUS_RING_WITHIN}`}
      style={{ background: FIELD_BAR_BG, borderRadius: '0 0 4px 4px', overflow: 'hidden', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={editing ? undefined : onBarKeyDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute left-0 top-0 bottom-0 pointer-events-none"
        style={{ width: `${pct}%`, background: `${accentColor}50`, transition: dragValue !== null ? 'none' : 'width 0.1s' }}
      />
      <div className="relative flex items-center justify-end px-2 h-[26px]">
        {editing ? editInput : (
          <span className="text-[10px] text-white/75 tabular-nums select-none">
            {format(display)}
          </span>
        )}
      </div>
    </div>
  );
}

// Popover editor for long text (system prompts etc.). A 240px-wide node is no
// place to edit a document, so the field opens this anchored editor instead.
// Commit: outside click / Ctrl+Enter / 保存. Cancel: Escape / キャンセル.
function TextareaEditorPopover({
  label,
  value,
  anchorRect,
  onCommit,
  onClose,
}: {
  label: string;
  value: string;
  anchorRect: { top: number; left: number; right: number };
  onCommit: (val: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const popRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const WIDTH = 400;
  let left = anchorRect.right + 8;
  if (left + WIDTH > window.innerWidth - 8) left = anchorRect.left - WIDTH - 8;
  if (left < 8) left = 8;
  const top = Math.max(8, Math.min(anchorRect.top - 8, window.innerHeight - 340));

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as HTMLElement)) {
        onCommit(draftRef.current);
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onCommit, onClose]);

  return createPortal(
    <div
      ref={popRef}
      className="nowheel"
      style={{ position: 'fixed', left, top, width: WIDTH, zIndex: 9999 }}
    >
      <div
        className="backdrop-blur-md rounded-lg shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'rgba(15, 23, 42, 0.97)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <span className="text-[12px] font-semibold text-white/85">{label}</span>
          <span className="text-[10px] text-white/35">Ctrl+Enter で保存 / Esc でキャンセル</span>
        </div>
        <textarea
          className="nowheel w-full text-[13px] leading-relaxed text-white/90 outline-none resize-y"
          style={{
            background: 'rgba(0,0,0,0.25)',
            padding: '10px 12px',
            minHeight: '180px',
            maxHeight: '50vh',
            border: 'none',
          }}
          value={draft}
          aria-label={label}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onCommit(draft);
              onClose();
            }
          }}
        />
        <div className="flex items-center justify-between px-3 py-2 border-t border-white/10">
          <span className="text-[10px] text-white/40 tabular-nums">{draft.length}字</span>
          <div className="flex items-center gap-2">
            <button
              className="text-[11px] text-white/50 hover:text-white/80 px-2 py-1 rounded transition-colors"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              className="text-[11px] text-white px-3 py-1 rounded transition-colors"
              style={{ background: 'rgba(16, 185, 129, 0.7)' }}
              onClick={() => { onCommit(draft); onClose(); }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Complex field types that cannot be edited inline
const COMPLEX_FIELD_TYPES = new Set([
  'prompt-builder', 'expression-list', 'animation-file',
  'model-file', 'png-expression-map', 'input-list',
]);

// Get a summary string for a field value (used in collapsed view)
function getValueSummary(field: ConfigField, value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (COMPLEX_FIELD_TYPES.has(field.type)) {
    if (Array.isArray(value) && value.length > 0) return 'Configured';
    if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) return 'Configured';
    if (typeof value === 'string' && value) return 'Configured';
    return 'Not set';
  }

  switch (field.type) {
    case 'select': {
      if (!field.options) return String(value);
      const options = field.options.map((opt) =>
        typeof opt === 'string' ? { label: opt, value: opt } : opt
      );
      return options.find(o => String(o.value) === String(value))?.label || String(value);
    }
    case 'number':
      return String(value);
    case 'boolean':
      return value ? 'ON' : 'OFF';
    case 'password':
      return value ? '••••••' : '';
    case 'textarea': {
      const s = String(value);
      return s.length > 30 ? s.slice(0, 30) + '...' : s;
    }
    case 'string':
    default: {
      const str = String(value);
      return str.length > 20 ? str.slice(0, 20) + '...' : str;
    }
  }
}

// Collapsible node config fields component (Phase 2)
function NodeConfigFields({
  config,
  pluginConfig,
  onConfigChange,
  accentColor,
  onOpenSettings,
}: {
  config: Record<string, unknown>;
  pluginConfig: Record<string, ConfigField>;
  onConfigChange: (key: string, value: unknown) => void;
  accentColor: string;
  onOpenSettings: () => void;
}) {
  // Build initial expanded state: inline fields start expanded, others collapsed
  const allFields = Object.entries(pluginConfig);
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const [key, field] of allFields) {
      initial[key] = !!field.inline;
    }
    return initial;
  });
  // Long-text editor popover state (anchored portal)
  const [textareaEditor, setTextareaEditor] = useState<{
    key: string;
    label: string;
    anchorRect: { top: number; left: number; right: number };
  } | null>(null);

  if (allFields.length === 0) return null;

  const barBg = FIELD_BAR_BG;

  const toggleField = (key: string) => {
    setExpandedFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Row that hands off to the settings panel for fields that cannot be edited
  // inline (complex editors, dynamic option lists fetched from engines)
  const OpenSettingsRow = ({ summary }: { summary?: string }) => (
    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '0 0 4px 4px' }}>
      {summary && (
        <div className="nodrag nopan px-2 pt-1.5 text-[10px] text-white/60 truncate">{summary}</div>
      )}
      <button
        className={`nodrag nopan w-full px-2 py-1.5 text-[10px] text-white/55 hover:text-white/90 hover:bg-white/10 transition-colors flex items-center gap-1.5 ${FOCUS_RING}`}
        onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v3m0 16v3m11-11h-3M4 12H1m18.4-7.4l-2.1 2.1M6.7 17.3l-2.1 2.1m14.8 0l-2.1-2.1M6.7 6.7L4.6 4.6"/>
        </svg>
        詳細設定で編集
      </button>
    </div>
  );

  // Toggle icon (small, subtle)
  const ToggleIcon = ({ expanded }: { expanded: boolean }) => (
    <svg
      width="8" height="8" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="3"
      className="flex-shrink-0"
      style={{ color: 'rgba(255,255,255,0.3)' }}
    >
      {expanded
        ? <polyline points="6 9 12 15 18 9"/>
        : <polyline points="9 6 15 12 9 18"/>
      }
    </svg>
  );

  // Render expanded control for a field
  const renderExpandedControl = (key: string, field: ConfigField) => {
    const value = config[key] ?? field.default;

    // Complex types: edited in the settings panel (rich editors live there)
    if (COMPLEX_FIELD_TYPES.has(field.type)) {
      return <OpenSettingsRow />;
    }

    // Dynamic fields: options are fetched from external engines in the
    // settings panel (e.g. VOICEVOX speakers) — show value + hand-off button
    if (field.dynamic) {
      const summary = getValueSummary(field, value);
      return <OpenSettingsRow summary={summary || 'Not set'} />;
    }

    switch (field.type) {
      case 'select': {
        if (!field.options) return null;
        const options = field.options.map((opt) =>
          typeof opt === 'string' ? { label: opt, value: opt } : opt
        );
        const selectedLabel = options.find(o => String(o.value) === String(value))?.label || String(value);
        return (
          <div
            className={`nodrag nopan relative ${FOCUS_RING_WITHIN}`}
            style={{ background: barBg, borderRadius: '0 0 4px 4px' }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 h-[26px]">
              <span className="text-[10px] text-white/75 select-none">{selectedLabel}</span>
            </div>
            <select
              className="nodrag nopan absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              value={String(value ?? '')}
              aria-label={field.label}
              onChange={(e) => {
                // Preserve the original option value type (number/boolean stay
                // intact instead of being stringified by the DOM)
                const match = options.find((o) => String(o.value) === e.target.value);
                onConfigChange(key, match ? match.value : e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {options.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );
      }

      case 'number': {
        const numValue = typeof value === 'number' ? value : Number(value) || 0;
        return (
          <InlineNumberField
            value={numValue}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            ariaLabel={field.label}
            accentColor={accentColor}
            onCommit={(v) => onConfigChange(key, v)}
          />
        );
      }

      case 'boolean': {
        const boolValue = Boolean(value);
        return (
          <button
            className={`nodrag nopan w-full relative text-left ${FOCUS_RING}`}
            style={{ background: barBg, borderRadius: '0 0 4px 4px', overflow: 'hidden' }}
            role="switch"
            aria-checked={boolValue}
            aria-label={field.label}
            onClick={(e) => { e.stopPropagation(); onConfigChange(key, !boolValue); }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {boolValue && (
              <div className="absolute left-0 top-0 bottom-0 w-full pointer-events-none" style={{ background: `${accentColor}20` }} />
            )}
            <div className="relative flex items-center justify-end px-2 h-[26px]">
              <div
                className="relative flex-shrink-0 rounded-full transition-colors"
                style={{ width: '20px', height: '11px', background: boolValue ? accentColor : 'rgba(255,255,255,0.2)' }}
              >
                <span
                  className="absolute top-[1.5px] rounded-full bg-white transition-transform"
                  style={{ width: '8px', height: '8px', transform: boolValue ? 'translateX(10.5px)' : 'translateX(1.5px)' }}
                />
              </div>
            </div>
          </button>
        );
      }

      case 'string':
        return (
          <InlineTextField
            value={String(value ?? '')}
            placeholder={field.placeholder}
            ariaLabel={field.label}
            onCommit={(val) => onConfigChange(key, val)}
          />
        );

      case 'password':
        return (
          <InlineTextField
            value={String(value ?? '')}
            placeholder={field.placeholder}
            ariaLabel={field.label}
            password
            onCommit={(val) => onConfigChange(key, val)}
          />
        );

      case 'textarea': {
        const str = String(value ?? '');
        return (
          <button
            className={`nodrag nopan w-full text-left px-2 py-1.5 hover:bg-white/10 transition-colors ${FOCUS_RING}`}
            style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '0 0 4px 4px' }}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setTextareaEditor({
                key,
                label: field.label,
                anchorRect: { top: rect.top, left: rect.left, right: rect.right },
              });
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {str ? (
              <div className="text-[10px] text-white/70 line-clamp-2 whitespace-pre-wrap break-words">
                {str}
              </div>
            ) : (
              <div className="text-[10px] text-white/35 italic">
                {field.placeholder || '未設定'}
              </div>
            )}
            <div className="text-[9px] text-white/35 mt-0.5">
              {str.length}字 — クリックで編集
            </div>
          </button>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className="flex flex-col gap-[2px] mt-1"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {allFields.map(([key, field]) => {
        if (!evaluateShowWhen(field.showWhen, config)) return null;

        const isExpanded = !!expandedFields[key];
        const value = config[key] ?? field.default;
        const summary = getValueSummary(field, value);

        return (
          <div key={key} style={{ borderRadius: '4px', overflow: 'hidden' }}>
            {/* Header bar - always visible */}
            <button
              className={`nodrag nopan w-full text-left flex items-center gap-1.5 px-2 h-[26px] ${FOCUS_RING}`}
              style={{ background: barBg, borderRadius: isExpanded ? '4px 4px 0 0' : '4px' }}
              aria-expanded={isExpanded}
              onClick={(e) => { e.stopPropagation(); toggleField(key); }}
            >
              <ToggleIcon expanded={isExpanded} />
              <span className="text-[10px] text-white/55 select-none flex-shrink-0">{field.label}</span>
              {!isExpanded && (
                <span className="text-[10px] text-white/60 select-none ml-auto truncate max-w-[60%] text-right">
                  {summary}
                </span>
              )}
            </button>
            {/* Expanded control */}
            {isExpanded && renderExpandedControl(key, field)}
          </div>
        );
      })}

      {/* Long-text editor popover (portal) */}
      {textareaEditor && (
        <TextareaEditorPopover
          label={textareaEditor.label}
          value={String(config[textareaEditor.key] ?? pluginConfig[textareaEditor.key]?.default ?? '')}
          anchorRect={textareaEditor.anchorRect}
          onCommit={(val) => onConfigChange(textareaEditor.key, val)}
          onClose={() => setTextareaEditor(null)}
        />
      )}
    </div>
  );
}

function CustomNode({ id, data, selected }: CustomNodeProps) {
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const updateNode = useWorkflowStore((s) => s.updateNode);
  const setSettingsPanelOpen = useWorkflowStore((s) => s.setSettingsPanelOpen);
  const onInlineConfigChange = useCallback((key: string, value: unknown) => {
    updateNode(id, { config: { ...data.config, [key]: value } });
  }, [id, data.config, updateNode]);
  const openSettings = useCallback(() => {
    selectNode(id);
    setSettingsPanelOpen(true);
  }, [id, selectNode, setSettingsPanelOpen]);
  const status = data.nodeStatus;
  const { getPluginColor, getPluginBgColor, getPluginIcon, getPluginById } = usePluginStore();
  const { nodeDisplayMode, collapsedNodeIds, toggleNodeCollapse } = useUIPreferencesStore();
  const { getNodeDesc } = useLocaleStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Popover state
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [popoverPinned, setPopoverPinned] = useState(false);
  const popoverHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Track drag state for port highlight/dim
  const { draggingSourceType } = useDragStateStore();
  // Hover state for port tooltips
  const [hoveredPort, setHoveredPort] = useState<{ id: string; label: string; type: PortType; description?: string; side: 'input' | 'output' } | null>(null);

  const collapsed = collapsedNodeIds.includes(id);

  // Get visual config from plugin store (with fallbacks)
  const plugin = getPluginById(data.type);
  const config: NodeVisualConfig = {
    color: getPluginColor(data.type) || DEFAULT_COLOR,
    bgColor: getPluginBgColor(data.type) || DEFAULT_BG_COLOR,
    icon: renderIcon(getPluginIcon(data.type) || DEFAULT_ICON, { size: 16, color: 'currentColor' }),
    statusText: plugin?.ui?.statusText || DEFAULT_STATUS,
  };

  // Check if node is an entry point
  const isEntryPoint = data.isEntryPoint === true;

  // Search highlight styles
  const searchStyle: React.CSSProperties = {};
  if (data.isSearchMatch) {
    searchStyle.boxShadow = `0 0 20px ${config.color}80, 0 0 40px ${config.color}40`;
    searchStyle.border = `2px solid ${config.color}`;
  }
  if (data.isSearchDimmed) {
    searchStyle.opacity = 0.3;
  }

  // Popover show/hide logic
  const showPopover = useCallback(() => {
    if (popoverHideTimeoutRef.current) {
      clearTimeout(popoverHideTimeoutRef.current);
      popoverHideTimeoutRef.current = null;
    }
    setPopoverVisible(true);
  }, []);

  const scheduleHidePopover = useCallback(() => {
    if (popoverPinned) return;
    popoverHideTimeoutRef.current = setTimeout(() => {
      setPopoverVisible(false);
    }, 200);
  }, [popoverPinned]);

  const cancelHidePopover = useCallback(() => {
    if (popoverHideTimeoutRef.current) {
      clearTimeout(popoverHideTimeoutRef.current);
      popoverHideTimeoutRef.current = null;
    }
  }, []);

  const togglePin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverPinned((prev) => {
      if (prev) {
        // Unpinning - schedule hide
        popoverHideTimeoutRef.current = setTimeout(() => {
          setPopoverVisible(false);
        }, 200);
      }
      return !prev;
    });
  }, []);

  const copyErrorToClipboard = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const errorMsg = status?.data?.error || status?.data?.validationIssue || '';
    if (errorMsg) {
      navigator.clipboard.writeText(String(errorMsg)).catch(() => {});
    }
  }, [status]);

  // ESC to unpin + click outside to unpin
  useEffect(() => {
    if (!popoverPinned) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverPinned(false);
        setPopoverVisible(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-popover-node-id]') && !nodeRef.current?.contains(target)) {
        setPopoverPinned(false);
        setPopoverVisible(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [popoverPinned]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (popoverHideTimeoutRef.current) clearTimeout(popoverHideTimeoutRef.current);
    };
  }, []);

  // Tooltip show/hide with delay
  const handleMouseEnter = () => {
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 500); // 500ms delay
    if (status && status.status !== 'idle') {
      showPopover();
    }
  };

  const handleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowTooltip(false);
    scheduleHidePopover();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectNode(id);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(id);
  };

  const handleCollapseToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeCollapse(id);
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onPlayClick) {
      data.onPlayClick();
    }
  };

  // Get status text based on running state
  const getStatusText = () => {
    if (status?.status === 'running') return 'Processing...';
    if (status?.status === 'error') return 'Error occurred';
    if (status?.status === 'warning') return 'Warning';
    if (status?.status === 'completed') return 'Completed';

    // Show config-based status
    if (data.type === 'openai-llm' && data.config?.model) {
      return `Model: ${data.config.model}`;
    }
    if (data.type === 'voicevox-tts' && data.config?.speaker) {
      return `Speaker: ${data.config.speaker}`;
    }
    if (data.type === 'delay' && data.config?.delayMs) {
      return `Delay: ${data.config.delayMs}ms`;
    }
    return config.statusText;
  };

  // Get dimensions based on display mode
  const getNodeStyle = (): React.CSSProperties => {
    // Status-based border and glow
    const statusVisual = status?.status ? STATUS_BORDER_COLORS[status.status] : undefined;
    let borderColor = 'rgba(255,255,255,0.1)';
    let boxShadow = '0 4px 20px rgba(0,0,0,0.2)';

    if (selected) {
      borderColor = config.color;
      boxShadow = `0 0 20px ${config.color}40, 0 4px 20px rgba(0,0,0,0.3)`;
    }
    if (statusVisual) {
      borderColor = statusVisual.border;
      boxShadow = `0 0 20px ${statusVisual.glow}, 0 4px 20px rgba(0,0,0,0.3)`;
    }

    const NODE_WIDTH = 240;

    const baseStyle: React.CSSProperties = {
      background: config.bgColor,
      border: `2px solid ${borderColor}`,
      borderRadius: '12px',
      boxShadow,
      transition: 'box-shadow 0.3s, border-color 0.3s, opacity 0.2s',
      width: `${NODE_WIDTH}px`,
      ...searchStyle,
    };

    if (collapsed) {
      return { ...baseStyle, padding: '8px 12px' };
    }

    switch (nodeDisplayMode) {
      case 'simple':
        return { ...baseStyle, padding: '8px 12px' };
      case 'detailed':
        return { ...baseStyle, padding: '0' };
      default: // standard
        return { ...baseStyle, padding: '12px 16px' };
    }
  };

  // Collapse toggle button
  const CollapseButton = ({ className }: { className?: string }) => (
    <button
      onClick={handleCollapseToggle}
      className={`text-white/40 hover:text-white/80 transition-colors flex-shrink-0 ${className ?? ''}`}
      title={collapsed ? '展開する' : '折りたたむ'}
    >
      {collapsed ? <ChevronRight /> : <ChevronDown />}
    </button>
  );

  // Gear button: opens the node settings panel (full editors for all fields)
  const SettingsButton = () => (
    <button
      onClick={(e) => { e.stopPropagation(); openSettings(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="nodrag text-white/30 hover:text-white/80 transition-colors flex-shrink-0 p-0.5"
      title="詳細設定"
      aria-label="詳細設定を開く"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  );

  // Play button component
  const PlayButton = () => (
    isEntryPoint ? (
      <button
        onClick={handlePlayClick}
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 z-10"
        style={{
          background: 'linear-gradient(135deg, #10B981, #059669)',
          border: '2px solid #1F2937',
          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
        }}
        title="Run from this node"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="none">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>
    ) : null
  );

  // Error/warning badge state for showing details on hover
  const [showErrorTooltip, setShowErrorTooltip] = useState(false);
  const [showWarningTooltip, setShowWarningTooltip] = useState(false);

  // Status indicator component with enhanced error/warning badge
  const StatusIndicator = () => (
    <>
      {status?.status === 'running' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse block" />
        </div>
      )}
      {status?.status === 'completed' && (
        <div className="absolute -top-1 -right-1">
          <span className="w-3 h-3 rounded-full bg-green-400 block" />
        </div>
      )}
      {status?.status === 'warning' && (
        <div
          className="absolute -top-2 -right-2"
          onMouseEnter={() => setShowWarningTooltip(true)}
          onMouseLeave={() => setShowWarningTooltip(false)}
        >
          {/* Warning badge with exclamation mark */}
          <div
            className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center cursor-help"
            style={{
              border: '2px solid #1F2937',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.5)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <line x1="12" y1="8" x2="12" y2="12" />
              <circle cx="12" cy="16" r="1.5" fill="white" />
            </svg>
          </div>

          {/* Warning tooltip */}
          {showWarningTooltip && status?.data?.validationIssue && (
            <div
              className="absolute right-0 top-full mt-1 z-50 pointer-events-none"
              style={{ overflow: 'hidden' }}
            >
              <div className="bg-amber-900/95 backdrop-blur-sm border border-amber-500/50 rounded-lg p-2 shadow-xl">
                <div className="text-[10px] font-semibold text-amber-200 mb-1">Warning</div>
                <div className="text-[11px] text-white/90 leading-relaxed break-words">
                  {status.data.validationIssue}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {status?.status === 'error' && (
        <div
          className="absolute -top-2 -right-2"
          onMouseEnter={() => setShowErrorTooltip(true)}
          onMouseLeave={() => setShowErrorTooltip(false)}
        >
          {/* Error badge with exclamation mark */}
          <div
            className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center cursor-help"
            style={{
              border: '2px solid #1F2937',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.5)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <line x1="12" y1="8" x2="12" y2="12" />
              <circle cx="12" cy="16" r="1.5" fill="white" />
            </svg>
          </div>

          {/* Error tooltip */}
          {showErrorTooltip && (status?.data?.error || status?.data?.validationIssue) && (
            <div
              className="absolute right-0 top-full mt-1 z-50 pointer-events-none"
              style={{ overflow: 'hidden' }}
            >
              <div className="bg-red-900/95 backdrop-blur-sm border border-red-500/50 rounded-lg p-2 shadow-xl">
                <div className="text-[10px] font-semibold text-red-200 mb-1">Error</div>
                <div className="text-[11px] text-white/90 leading-relaxed break-words">
                  {status.data.error || status.data.validationIssue}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  // Tooltip component
  const Tooltip = () => {
    const description = getNodeDesc(data.type);

    return showTooltip ? (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none"
        style={{ overflow: 'hidden' }}
      >
        <div
          className="bg-gray-900/95 backdrop-blur-sm border border-white/20 rounded-lg p-3 shadow-xl"
        >
          <div className="text-[11px] text-white/90 whitespace-pre-line leading-relaxed">
            {description}
          </div>
        </div>
        {/* Arrow */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900/95 border-r border-b border-white/20 rotate-45"
        />
      </div>
    ) : null;
  };

  // Port hover tooltip — only renders for the port currently hovered
  const PortTooltip = ({ portId, side }: { portId: string; side: 'input' | 'output' }) => {
    if (!hoveredPort || hoveredPort.id !== portId || hoveredPort.side !== side) return null;
    const typeColor = PORT_TYPE_COLORS[hoveredPort.type] ?? '#6B7280';
    const typeLabel = PORT_TYPE_LABELS[hoveredPort.type] ?? hoveredPort.type;
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-[60] pointer-events-none"
        style={{ overflow: 'hidden' }}
      >
        <div className="bg-gray-950/98 backdrop-blur-sm border rounded-lg p-2 shadow-xl" style={{ borderColor: `${typeColor}60` }}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} />
            <span className="text-[11px] font-semibold text-white/90">{hoveredPort.label}</span>
            <span className="text-[10px] ml-auto" style={{ color: typeColor }}>{typeLabel}</span>
          </div>
          {hoveredPort.description && (
            <div className="text-[10px] text-white/60 leading-relaxed">{hoveredPort.description}</div>
          )}
        </div>
      </div>
    );
  };

  // Status popover rendered via portal
  const NodeStatusPopover = () => {
    if (!popoverVisible || !status || status.status === 'idle') return null;

    const statusColor = STATUS_BORDER_COLORS[status.status]?.border ?? '#6B7280';
    const statusLabel = {
      running: 'Running',
      completed: 'Completed',
      error: 'Error',
      warning: 'Warning',
    }[status.status] ?? status.status;
    const duration = status.data?.duration;
    const resultSummary = status.data?.resultSummary;
    const errorMsg = status.data?.error || status.data?.validationIssue;
    const outputs = status.data?.outputs;

    // Calculate position from the node DOM element
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const popoverStyle: React.CSSProperties = {
      position: 'fixed',
      left: rect.right + 12,
      top: rect.top,
      zIndex: 9999,
      pointerEvents: 'auto',
      minWidth: '220px',
      maxWidth: '320px',
    };

    // Keep popover within viewport
    if (rect.right + 12 + 320 > window.innerWidth) {
      popoverStyle.left = rect.left - 12 - 320;
    }

    return createPortal(
      <div
        data-popover-node-id={id}
        style={popoverStyle}
        onMouseEnter={cancelHidePopover}
        onMouseLeave={scheduleHidePopover}
      >
        <div
          className="backdrop-blur-md rounded-lg shadow-2xl overflow-hidden"
          style={{
            background: 'rgba(15, 23, 42, 0.95)',
            border: `1px solid ${statusColor}40`,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${status.status === 'running' ? 'animate-pulse' : ''}`}
              style={{ background: statusColor }}
            />
            <span className="text-[12px] font-semibold text-white truncate flex-1">
              {data.label}
            </span>
            {duration !== undefined && (
              <span className="text-[10px] text-white/50 flex-shrink-0">
                {formatDuration(duration)}
              </span>
            )}
            <button
              onClick={togglePin}
              className={`w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0 ${
                popoverPinned ? 'text-blue-400 bg-blue-400/20' : 'text-white/30 hover:text-white/60'
              }`}
              title={popoverPinned ? 'Unpin' : 'Pin'}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill={popoverPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M12 2v8m0 4v8M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h8m4 0h8M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"/>
              </svg>
            </button>
          </div>

          {/* Divider */}
          <div className="h-px" style={{ background: `${statusColor}30` }} />

          {/* Status message */}
          <div
            className="px-3 py-2 text-[11px] font-medium"
            style={{
              background: `${statusColor}10`,
              color: statusColor,
            }}
          >
            {statusLabel}
            {status.status === 'running' && '...'}
          </div>

          {/* Detail rows */}
          <div className="px-3 py-2 space-y-1.5">
            {resultSummary && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-white/40 w-14 flex-shrink-0">Result</span>
                <span className="text-[11px] text-white/80">{String(resultSummary)}</span>
              </div>
            )}
            {errorMsg && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-red-400/70 w-14 flex-shrink-0">Error</span>
                <span className="text-[11px] text-red-300 break-words flex-1">{String(errorMsg)}</span>
              </div>
            )}
            {duration !== undefined && (
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-white/40 w-14 flex-shrink-0">Duration</span>
                <span className="text-[11px] text-white/80">{formatDuration(duration)}</span>
              </div>
            )}
          </div>

          {/* Output preview */}
          {outputs && Object.keys(outputs).length > 0 && (
            <div className="px-3 pb-2">
              <div className="text-[9px] text-white/30 uppercase tracking-wider mb-1">Output Preview</div>
              <pre
                className="text-[10px] text-white/60 bg-black/30 rounded p-2 overflow-auto max-h-[80px] whitespace-pre-wrap break-words"
                style={{ fontFamily: 'monospace' }}
              >
                {JSON.stringify(outputs, null, 2).slice(0, 500)}
              </pre>
            </div>
          )}

          {/* Copy error button */}
          {(status.status === 'error' || status.status === 'warning') && errorMsg && (
            <div className="px-3 pb-2 flex justify-end">
              <button
                onClick={copyErrorToClipboard}
                className="text-white/30 hover:text-white/70 transition-colors p-1 rounded hover:bg-white/10"
                title="Copy error message"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>,
      document.body
    );
  };

  /** Return handle style based on drag compatibility */
  const getHandleStyle = (portType: PortType, isTarget: boolean): React.CSSProperties => {
    const base: React.CSSProperties = {
      borderRadius: '50%',
      border: '2px solid #1F2937',
      position: 'relative',
      transition: 'opacity 0.15s, box-shadow 0.15s, width 0.15s, height 0.15s',
    };
    if (!draggingSourceType) {
      // idle: normal appearance
      return { ...base, width: '14px', height: '14px', background: PORT_TYPE_COLORS[portType] ?? '#374151' };
    }
    // Something is being dragged — check compatibility
    const compatible = isTarget
      ? arePortTypesCompatible(draggingSourceType, portType)
      : arePortTypesCompatible(portType, draggingSourceType);

    if (compatible) {
      // Grow via width/height (not transform): React Flow positions handles with a
      // size-relative translate, so enlarging keeps the circle centered and expanding
      // symmetrically. Overriding `transform` here would drop that translate and shift
      // the handle off-center (different per side: left vs right).
      return {
        ...base,
        width: '20px',
        height: '20px',
        background: PORT_TYPE_COLORS[portType] ?? '#374151',
        boxShadow: `0 0 8px ${PORT_TYPE_COLORS[portType] ?? '#374151'}`,
      };
    } else {
      return { ...base, width: '14px', height: '14px', background: '#374151', opacity: 0.25 };
    }
  };
  if (collapsed) {
    return (
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />
        <NodeStatusPopover />

        {/* Input handles (kept for edge connections) */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 flex flex-col gap-1">
            {data.inputs.map((input) => (
              <Handle
                key={input.id}
                type="target"
                position={Position.Left}
                id={input.id}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[input.type] || '#374151',
                  border: '2px solid #1F2937',
                  position: 'relative',
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {/* Output handles (kept for edge connections) */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 flex flex-col gap-1">
            {data.outputs.map((output) => (
              <Handle
                key={output.id}
                type="source"
                position={Position.Right}
                id={output.id}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[output.type] || config.color,
                  border: '2px solid #1F2937',
                  position: 'relative',
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        )}

        {/* Compact header with collapse toggle */}
        <div className="flex items-center gap-2">
          <CollapseButton />
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[11px] text-white truncate">
            {data.label}
          </span>
        </div>

        <StatusIndicator />
      </div>
    );
  }

  // ============ SIMPLE MODE ============
  if (nodeDisplayMode === 'simple') {
    return (
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />
        <NodeStatusPopover />

        {/* Input handles - simple circles */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 flex flex-col gap-1">
            {data.inputs.map((input) => (
              <Handle
                key={input.id}
                type="target"
                position={Position.Left}
                id={input.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[input.type] || '#374151',
                  border: '2px solid #1F2937',
                  position: 'relative',
                }}
              />
            ))}
          </div>
        )}

        {/* Output handles - simple circles */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 flex flex-col gap-1">
            {data.outputs.map((output) => (
              <Handle
                key={output.id}
                type="source"
                position={Position.Right}
                id={output.id}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: PORT_TYPE_COLORS[output.type] || config.color,
                  border: '2px solid #1F2937',
                  position: 'relative',
                }}
              />
            ))}
          </div>
        )}

        {/* Compact header - icon and label only */}
        <div className="flex items-center gap-2">
          <CollapseButton />
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[12px] text-white truncate">
            {data.label}
          </span>
        </div>

        <StatusIndicator />
      </div>
    );
  }

  // ============ DETAILED MODE ============
  if (nodeDisplayMode === 'detailed') {
    return (
      <div
        ref={nodeRef}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
        style={getNodeStyle()}
      >
        <Tooltip />
        <PlayButton />
        <NodeStatusPopover />

        {/* Header section */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
          <CollapseButton />
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '4px',
              background: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              flexShrink: 0,
            }}
          >
            {config.icon}
          </div>
          <span className="font-semibold text-[12px] text-white truncate flex-1 min-w-0">
            {data.label}
          </span>
          <SettingsButton />
        </div>

        {/* Inputs section */}
        {data.inputs && data.inputs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Inputs</div>
            {data.inputs.map((input) => (
              <div key={input.id} className="flex items-center gap-2 py-1 relative">
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[input.type] || '#374151',
                    border: '1px solid #1F2937',
                    left: '-5px',
                    position: 'absolute',
                  }}
                />
                <span className="text-[11px] text-white/80 ml-2">{input.label}</span>
                <span
                  className="text-[9px] ml-auto"
                  style={{ color: PORT_TYPE_COLORS[input.type] || '#6B7280' }}
                >
                  {input.type}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Outputs section */}
        {data.outputs && data.outputs.length > 0 && (
          <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Outputs</div>
            {data.outputs.map((output) => (
              <div key={output.id} className="flex items-center gap-2 py-1 relative">
                <span
                  className="text-[9px]"
                  style={{ color: PORT_TYPE_COLORS[output.type] || '#6B7280' }}
                >
                  {output.type}
                </span>
                <span className="text-[11px] text-white/80 ml-auto mr-2">{output.label}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: PORT_TYPE_COLORS[output.type] || config.color,
                    border: '1px solid #1F2937',
                    right: '-5px',
                    position: 'absolute',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Status footer */}
        <div className="px-3 py-2 text-[10px] text-white/50">
          {getStatusText()}
        </div>

        {/* Config fields */}
        {data.pluginConfig && (
          <div className="px-3 pb-2">
            <NodeConfigFields
              config={data.config}
              pluginConfig={data.pluginConfig}
              onConfigChange={onInlineConfigChange}
              accentColor={config.color}
              onOpenSettings={openSettings}
            />
          </div>
        )}

        <StatusIndicator />
      </div>
    );
  }

  // ============ STANDARD MODE (default) ============
  const inputCount = data.inputs?.length || 0;
  const outputCount = data.outputs?.length || 0;
  const maxPorts = Math.max(inputCount, outputCount);

  return (
    <div
      ref={nodeRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative"
      style={getNodeStyle()}
    >
      <Tooltip />
      <PlayButton />
      <NodeStatusPopover />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <CollapseButton />
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: config.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            flexShrink: 0,
          }}
        >
          {config.icon}
        </div>
        <span className="font-semibold text-[13px] text-white truncate flex-1 min-w-0">
          {data.label}
        </span>
        <SettingsButton />
      </div>

      {/* Ports section - only show if there are ports */}
      {maxPorts > 0 && (
        <div className="flex justify-between gap-4 my-2">
          {/* Input ports */}
          <div className="flex flex-col gap-1">
            {data.inputs?.map((input) => (
              <div
                key={input.id}
                className="flex items-center gap-1 relative h-5"
                onMouseEnter={() => setHoveredPort({ id: input.id, label: input.label, type: input.type as PortType, description: (input as any).description, side: 'input' })}
                onMouseLeave={() => setHoveredPort(null)}
              >
                <PortTooltip portId={input.id} side="input" />
                <Handle
                  type="target"
                  position={Position.Left}
                  id={input.id}
                  style={{ ...getHandleStyle(input.type as PortType, true), left: '-7px', position: 'absolute' }}
                />
                <span className="text-[10px] text-white/60 pl-2 whitespace-nowrap">
                  {input.label}
                </span>
              </div>
            ))}
          </div>

          {/* Output ports */}
          <div className="flex flex-col gap-1 items-end">
            {data.outputs?.map((output) => (
              <div
                key={output.id}
                className="flex items-center gap-1 relative h-5"
                onMouseEnter={() => setHoveredPort({ id: output.id, label: output.label, type: output.type as PortType, description: (output as any).description, side: 'output' })}
                onMouseLeave={() => setHoveredPort(null)}
              >
                <PortTooltip portId={output.id} side="output" />
                <span className="text-[10px] text-white/60 pr-2 whitespace-nowrap">
                  {output.label}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={output.id}
                  style={{ ...getHandleStyle(output.type as PortType, false), right: '-7px', position: 'absolute' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="text-[10px] text-white/40 truncate">
        {getStatusText()}
      </div>

      {/* Config fields */}
      {data.pluginConfig && (
        <NodeConfigFields
          config={data.config}
          pluginConfig={data.pluginConfig}
          onConfigChange={onInlineConfigChange}
          accentColor={config.color}
          onOpenSettings={openSettings}
        />
      )}

      <StatusIndicator />
    </div>
  );
}

export default memo(CustomNode);
