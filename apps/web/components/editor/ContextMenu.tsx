'use client';

import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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

  // Adjust position to keep menu in viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 40);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 py-1 rounded-lg shadow-xl"
      style={{
        left: adjustedX,
        top: adjustedY,
        background: 'rgba(17, 24, 39, 0.98)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: '160px',
      }}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {item.divider && (
            <div className="my-1 border-t border-white/10" />
          )}
          <button
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`
              w-full px-3 py-2 text-left text-sm flex items-center gap-2
              transition-colors
              ${item.danger
                ? 'text-red-400 hover:bg-red-500/20'
                : 'text-white/90 hover:bg-white/10'
              }
            `}
          >
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-white/40">{item.shortcut}</span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
