'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ContextMenuSubmenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface ContextMenuSubmenuSection {
  categoryId: string;
  label: string;
  color?: string;
  items: ContextMenuSubmenuItem[];
}

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  shortcut?: string;
  submenuSections?: ContextMenuSubmenuSection[];
}

// Flyout submenu shown on hover
function SubMenu({
  sections,
  parentRect,
  onClose,
}: {
  sections: ContextMenuSubmenuSection[];
  parentRect: DOMRect;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Position to the right of parent item; flip left if near viewport edge
  const spaceRight = window.innerWidth - parentRect.right;
  const left = spaceRight > 208 ? parentRect.right + 4 : parentRect.left - 208;
  const top = Math.min(parentRect.top, window.innerHeight - 420);

  return (
    <div
      ref={menuRef}
      className="fixed z-[60] py-1 rounded-lg shadow-xl overflow-y-auto"
      style={{
        left,
        top,
        maxHeight: '420px',
        background: 'rgba(17, 24, 39, 0.98)',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: '200px',
      }}
    >
      {sections.map((section, si) => (
        <React.Fragment key={section.categoryId}>
          {si > 0 && <div className="my-1 border-t border-white/10" />}
          <div
            className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: section.color ?? 'rgba(255,255,255,0.35)' }}
          >
            {section.label}
          </div>
          {section.items.map((item, ii) => (
            <button
              key={ii}
              onClick={() => {
                item.onClick();
                onClose();
              }}
              className="w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 text-white/90 hover:bg-white/10 transition-colors"
            >
              {item.icon && (
                <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);
  const [submenuParentRect, setSubmenuParentRect] = useState<DOMRect | null>(null);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36 - 8);

  const handleMouseEnter = (index: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    if (items[index].submenuSections) {
      setActiveSubmenuIndex(index);
      setSubmenuParentRect(e.currentTarget.getBoundingClientRect());
    } else {
      // Small delay before hiding submenu so the mouse can move across without flicker
      clearTimerRef.current = setTimeout(() => {
        setActiveSubmenuIndex(null);
        setSubmenuParentRect(null);
      }, 80);
    }
  };

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
          {item.divider && <div className="my-1 border-t border-white/10" />}
          <button
            onMouseEnter={(e) => handleMouseEnter(index, e)}
            onClick={() => {
              if (item.submenuSections) return; // submenu items opened on hover, not click
              item.onClick?.();
              onClose();
            }}
            className={`
              w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors
              ${item.danger ? 'text-red-400 hover:bg-red-500/20' : 'text-white/90 hover:bg-white/10'}
              ${activeSubmenuIndex === index ? 'bg-white/10' : ''}
            `}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.submenuSections && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/40 flex-shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
            {item.shortcut && (
              <span className="text-xs text-white/40">{item.shortcut}</span>
            )}
          </button>
        </React.Fragment>
      ))}

      {activeSubmenuIndex !== null &&
        submenuParentRect &&
        items[activeSubmenuIndex]?.submenuSections && (
          <SubMenu
            sections={items[activeSubmenuIndex].submenuSections!}
            parentRect={submenuParentRect}
            onClose={onClose}
          />
        )}
    </div>
  );
}
