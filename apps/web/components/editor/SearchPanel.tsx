'use client';

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore } from '@/stores/workflowStore';
import { usePluginStore } from '@/stores/pluginStore';
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore';

export default function SearchPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCenter } = useReactFlow();

  const nodes = useWorkflowStore((s) => s.nodes);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const { getPluginLabel } = usePluginStore();
  const {
    searchVisible,
    searchQuery,
    searchMatchIndex,
    setSearchVisible,
    setSearchQuery,
    setSearchMatchIndex,
  } = useUIPreferencesStore();

  // Focus input when panel becomes visible
  useEffect(() => {
    if (searchVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchVisible]);

  // Compute matches
  const matches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return nodes.filter((node) => {
      const label = getPluginLabel(node.type).toLowerCase();
      const type = node.type.toLowerCase();
      return label.includes(query) || type.includes(query);
    });
  }, [nodes, searchQuery, getPluginLabel]);

  // Navigate to current match
  useEffect(() => {
    if (matches.length > 0 && searchMatchIndex < matches.length) {
      const match = matches[searchMatchIndex];
      setCenter(match.position.x + 80, match.position.y + 30, { zoom: 1, duration: 300 });
      selectNode(match.id);
    }
  }, [matches, searchMatchIndex, setCenter, selectNode]);

  const goToNext = useCallback(() => {
    if (matches.length > 0) {
      setSearchMatchIndex((searchMatchIndex + 1) % matches.length);
    }
  }, [matches.length, searchMatchIndex, setSearchMatchIndex]);

  const goToPrev = useCallback(() => {
    if (matches.length > 0) {
      setSearchMatchIndex((searchMatchIndex - 1 + matches.length) % matches.length);
    }
  }, [matches.length, searchMatchIndex, setSearchMatchIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearchVisible(false);
    }
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        goToPrev();
      } else {
        goToNext();
      }
    }
  };

  if (!searchVisible) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-800/95 backdrop-blur-sm border border-white/10 rounded-lg shadow-lg px-3 py-2">
      {/* Search icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="ノードを検索..."
        className="bg-transparent text-white text-sm outline-none w-48 placeholder-white/30"
      />

      {/* Match count */}
      {searchQuery && (
        <span className="text-[11px] text-white/50 whitespace-nowrap">
          {matches.length > 0
            ? `${searchMatchIndex + 1}/${matches.length}`
            : '0/0'}
        </span>
      )}

      {/* Navigation buttons */}
      <button
        onClick={goToPrev}
        className="text-white/50 hover:text-white/80 transition-colors p-0.5"
        title="前の結果 (Shift+Enter)"
        aria-label="前の結果"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
      <button
        onClick={goToNext}
        className="text-white/50 hover:text-white/80 transition-colors p-0.5"
        title="次の結果 (Enter)"
        aria-label="次の結果"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Close button */}
      <button
        onClick={() => setSearchVisible(false)}
        className="text-white/50 hover:text-white/80 transition-colors p-0.5 ml-1"
        title="閉じる (Esc)"
        aria-label="検索を閉じる"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
