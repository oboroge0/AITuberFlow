'use client';

import React, { useState } from 'react';

interface Motion {
  id: string;
  name: string;
  url: string;
  category: string;
  duration?: number;
  thumbnail?: string;
}

// Predefined motion library - can be extended or loaded from API
const defaultMotions: Motion[] = [
  // Greetings
  { id: 'wave', name: 'Wave', url: '/animations/wave.fbx', category: 'Greeting' },
  { id: 'bow', name: 'Bow', url: '/animations/bow.fbx', category: 'Greeting' },

  // Reactions
  { id: 'clap', name: 'Clap', url: '/animations/clap.fbx', category: 'Reaction' },
  { id: 'thumbsup', name: 'Thumbs Up', url: '/animations/thumbsup.fbx', category: 'Reaction' },
  { id: 'cheer', name: 'Cheer', url: '/animations/cheer.fbx', category: 'Reaction' },

  // Dance
  { id: 'dance1', name: 'Dance 1', url: '/animations/dance1.fbx', category: 'Dance' },
  { id: 'dance2', name: 'Dance 2', url: '/animations/dance2.fbx', category: 'Dance' },

  // Idle variations
  { id: 'idle', name: 'Idle', url: '/animations/idle.fbx', category: 'Idle' },
];

interface MotionLibraryProps {
  onSelect: (motion: Motion) => void;
  onPreview?: (motion: Motion) => void;
  selectedUrl?: string;
}

export default function MotionLibrary({ onSelect, onPreview, selectedUrl }: MotionLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState('');

  // Get unique categories
  const categories = Array.from(new Set(defaultMotions.map((m) => m.category)));

  // Filter motions
  const filteredMotions = defaultMotions.filter((motion) => {
    const matchesSearch = motion.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || motion.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group by category
  const groupedMotions = filteredMotions.reduce((acc, motion) => {
    if (!acc[motion.category]) {
      acc[motion.category] = [];
    }
    acc[motion.category].push(motion);
    return acc;
  }, {} as Record<string, Motion[]>);

  const handleCustomUrlSubmit = () => {
    if (customUrl.trim()) {
      onSelect({
        id: 'custom',
        name: 'Custom Motion',
        url: customUrl.trim(),
        category: 'Custom',
      });
    }
  };

  return (
    <div className="flex flex-col h-full max-h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white mb-2">Motion Library</h3>

        {/* Search */}
        <div className="relative mb-2">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search motions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
          />
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-2 py-0.5 text-[10px] rounded ${
              !selectedCategory
                ? 'bg-purple-500/30 text-purple-300'
                : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 text-[10px] rounded ${
                selectedCategory === cat
                  ? 'bg-purple-500/30 text-purple-300'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Motion List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {Object.entries(groupedMotions).map(([category, motions]) => (
          <div key={category}>
            <div className="text-[10px] text-white/40 uppercase tracking-wider mb-1 px-1">
              {category}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {motions.map((motion) => (
                <button
                  key={motion.id}
                  onClick={() => onSelect(motion)}
                  onMouseEnter={() => onPreview?.(motion)}
                  className={`p-2 rounded text-left transition-all ${
                    selectedUrl === motion.url
                      ? 'bg-purple-500/30 border border-purple-500/50'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className="text-xs text-white truncate">{motion.name}</div>
                  <div className="text-[10px] text-white/40 truncate">{motion.url.split('/').pop()}</div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {filteredMotions.length === 0 && (
          <div className="text-center py-4 text-white/40 text-xs">
            No motions found
          </div>
        )}
      </div>

      {/* Custom URL Input */}
      <div className="p-3 border-t border-white/10">
        <div className="text-[10px] text-white/40 mb-1">Custom FBX URL</div>
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="/animations/custom.fbx"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="flex-1 px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
          />
          <button
            onClick={handleCustomUrlSubmit}
            className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30"
          >
            Use
          </button>
        </div>
      </div>
    </div>
  );
}

export type { Motion };
