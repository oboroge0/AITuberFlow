'use client';

import React, { useEffect, useRef } from 'react';

interface DataPreviewPopupProps {
  x: number;
  y: number;
  sourceNodeLabel: string;
  sourceNodeType: string;
  targetNodeLabel: string;
  data: unknown;
  selectedFields?: string[];
  onFieldsChange?: (fields: string[]) => void;
  onClose: () => void;
}

// Known output fields for each node type (used when no runtime data is available)
const nodeOutputFields: Record<string, string[]> = {
  'twitch-chat': ['text', 'author', 'message'],
  'youtube-chat': ['text', 'author', 'message'],
  'manual-input': ['text'],
  'openai-llm': ['response'],
  'anthropic-llm': ['response'],
  'google-llm': ['response'],
  'ollama-llm': ['response'],
  'timer': ['tick', 'count'],
  'http-request': ['response', 'status', 'headers'],
  'text-transform': ['result'],
  'field-selector': ['output'],
  'random': ['value'],
  'variable': ['value'],
  'switch': ['value', 'data'],
  'delay': ['output'],
  'loop': ['index', 'value'],
  'foreach': ['item', 'index'],
};

export default function DataPreviewPopup({
  x,
  y,
  sourceNodeLabel,
  sourceNodeType,
  targetNodeLabel,
  data,
  selectedFields = [],
  onFieldsChange,
  onClose,
}: DataPreviewPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Get field value preview (truncated)
  const getFieldPreview = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
      return value.length > 30 ? value.substring(0, 30) + '...' : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    if (typeof value === 'object') {
      return '{...}';
    }
    return String(value);
  };

  // Extract fields from data if it's an object
  const getFieldsFromData = (obj: unknown): { key: string; value: unknown }[] => {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
        key,
        value,
      }));
    }
    return [];
  };

  // Get available fields - from runtime data or node schema
  const runtimeFields = getFieldsFromData(data);
  const schemaFields = nodeOutputFields[sourceNodeType] || [];

  const hasData = data !== null && data !== undefined;
  const hasRuntimeFields = runtimeFields.length > 0;

  // Use runtime fields if available, otherwise use schema fields
  const availableFieldKeys = hasRuntimeFields
    ? runtimeFields.map(f => f.key)
    : schemaFields;

  const hasFields = availableFieldKeys.length > 0;

  // Toggle field selection
  const toggleField = (fieldKey: string) => {
    if (!onFieldsChange) return;

    if (selectedFields.includes(fieldKey)) {
      // Remove field
      onFieldsChange(selectedFields.filter(f => f !== fieldKey));
    } else {
      // Add field
      onFieldsChange([...selectedFields, fieldKey]);
    }
  };

  // Select all fields
  const selectAll = () => {
    if (!onFieldsChange) return;
    onFieldsChange(availableFieldKeys);
  };

  // Clear all selections
  const clearAll = () => {
    if (!onFieldsChange) return;
    onFieldsChange([]);
  };

  // Adjust position to keep popup in viewport
  const adjustedX = Math.min(x, window.innerWidth - 350);
  const adjustedY = Math.min(y, window.innerHeight - 400);

  return (
    <div
      ref={popupRef}
      className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: adjustedX,
        top: adjustedY,
        minWidth: '300px',
        maxWidth: '420px',
      }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(17, 24, 39, 0.98)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 flex items-center justify-between"
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-emerald-400"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span className="text-xs font-medium text-white/90">Data Flow</span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Connection Info */}
        <div className="px-3 py-2 flex items-center gap-2 text-xs">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
            {sourceNodeLabel}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white/40"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
            {targetNodeLabel}
          </span>
        </div>

        {/* Field Selector - show if we have fields from runtime data or node schema */}
        {hasFields && onFieldsChange && (
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                Select Fields to Pass
              </div>
              <div className="flex gap-1">
                <button
                  onClick={selectAll}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  All
                </button>
                <span className="text-white/20">|</span>
                <button
                  onClick={clearAll}
                  className="text-[10px] text-white/40 hover:text-white/60 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableFieldKeys.map((key) => {
                const isSelected = selectedFields.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleField(key)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <span
                      className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-white/30'
                      }`}
                    >
                      {isSelected && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    {key}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Data Content */}
        <div className="px-3 pb-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">
            {selectedFields.length > 0
              ? `Selected: ${selectedFields.join(', ')}`
              : hasRuntimeFields ? 'Output Data (all fields)' : 'Available Fields'}
          </div>
          {hasRuntimeFields ? (
            // Show runtime data fields with values
            <div
              className="rounded-lg overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.3)' }}
            >
              {runtimeFields.map(({ key, value }, index) => {
                const isSelected = selectedFields.length === 0 || selectedFields.includes(key);
                return (
                  <div
                    key={key}
                    className={`px-3 py-2 flex items-start gap-2 ${
                      index > 0 ? 'border-t border-white/5' : ''
                    } ${isSelected ? '' : 'opacity-30'}`}
                  >
                    <span className={`text-xs font-medium shrink-0 ${
                      isSelected ? 'text-emerald-400' : 'text-white/40'
                    }`}>
                      {key}:
                    </span>
                    <span className="text-white/70 text-xs font-mono break-all">
                      {getFieldPreview(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : hasFields ? (
            // Show schema fields (no runtime data yet)
            <div
              className="rounded-lg overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.3)' }}
            >
              {availableFieldKeys.map((key, index) => {
                const isSelected = selectedFields.length === 0 || selectedFields.includes(key);
                return (
                  <div
                    key={key}
                    className={`px-3 py-2 flex items-start gap-2 ${
                      index > 0 ? 'border-t border-white/5' : ''
                    } ${isSelected ? '' : 'opacity-30'}`}
                  >
                    <span className={`text-xs font-medium shrink-0 ${
                      isSelected ? 'text-emerald-400' : 'text-white/40'
                    }`}>
                      {key}
                    </span>
                    <span className="text-white/40 text-xs italic">
                      (no data yet)
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            // No fields available
            <div
              className="rounded-lg p-3 text-center"
              style={{ background: 'rgba(0,0,0,0.3)' }}
            >
              <div className="text-white/40 text-xs">
                No fields available
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="px-3 py-1.5 text-[10px] text-white/30"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {hasFields && onFieldsChange
            ? 'Selected fields become template variables (e.g., {{text}})'
            : 'Click outside or press Esc to close'}
        </div>
      </div>
    </div>
  );
}
