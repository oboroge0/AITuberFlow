'use client';

import React from 'react';

interface Expression {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

const expressions: Expression[] = [
  { id: 'neutral', name: 'Neutral', emoji: '😐', color: '#6B7280' },
  { id: 'happy', name: 'Happy', emoji: '😊', color: '#10B981' },
  { id: 'sad', name: 'Sad', emoji: '😢', color: '#3B82F6' },
  { id: 'angry', name: 'Angry', emoji: '😠', color: '#EF4444' },
  { id: 'surprised', name: 'Surprised', emoji: '😮', color: '#F59E0B' },
  { id: 'relaxed', name: 'Relaxed', emoji: '😌', color: '#8B5CF6' },
];

interface ExpressionPresetsProps {
  currentExpression?: string;
  currentMouthOpen?: number;
  onExpressionChange?: (expression: string) => void;
  onMouthChange?: (value: number) => void;
}

export default function ExpressionPresets({
  currentExpression = 'neutral',
  currentMouthOpen = 0,
  onExpressionChange,
  onMouthChange,
}: ExpressionPresetsProps) {
  const [mouthOpen, setMouthOpen] = React.useState(currentMouthOpen);

  const sendExpression = (expression: string) => {
    onExpressionChange?.(expression);
  };

  const sendMouth = (value: number) => {
    setMouthOpen(value);
    onMouthChange?.(value);
  };

  return (
    <div className="p-3">
      <h3 className="text-sm font-semibold text-fg mb-3">Expression Presets</h3>

      {/* Expression Grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {expressions.map((expr) => (
          <button
            key={expr.id}
            onClick={() => sendExpression(expr.id)}
            className={`p-2 rounded-lg text-center transition-all ${
              currentExpression === expr.id
                ? 'ring-2 ring-offset-2 ring-offset-[var(--surface-strong)]'
                : 'hover:bg-hover'
            }`}
            style={{
              backgroundColor: currentExpression === expr.id ? `${expr.color}30` : 'var(--elevated)',
              '--tw-ring-color': expr.color,
            } as React.CSSProperties}
          >
            <div className="text-2xl mb-1">{expr.emoji}</div>
            <div className="text-[10px] text-fg-muted">{expr.name}</div>
          </button>
        ))}
      </div>

      {/* Mouth Control */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-fg-dim">Mouth Open</span>
          <span className="text-xs text-fg-muted">{(mouthOpen * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={mouthOpen}
          onChange={(e) => sendMouth(parseFloat(e.target.value))}
          className="w-full h-2 bg-elevated rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:bg-purple-500
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>

      {/* Quick Actions */}
      <div className="space-y-2">
        <div className="text-[10px] text-fg-faint uppercase tracking-wider">Quick Actions</div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              sendExpression('neutral');
              sendMouth(0);
            }}
            className="flex-1 py-1.5 text-xs bg-elevated text-fg-muted rounded hover:bg-hover"
          >
            Reset
          </button>
          <button
            onClick={() => {
              // Simulate talking
              let value = 0;
              let direction = 1;
              const interval = setInterval(() => {
                value += direction * 0.1;
                if (value >= 0.8) direction = -1;
                if (value <= 0) {
                  clearInterval(interval);
                  value = 0;
                }
                sendMouth(Math.max(0, Math.min(1, value)));
              }, 50);
              setTimeout(() => {
                clearInterval(interval);
                sendMouth(0);
              }, 2000);
            }}
            className="flex-1 py-1.5 text-xs bg-elevated text-fg-muted rounded hover:bg-hover"
          >
            Test Talk
          </button>
        </div>
      </div>

      {/* Current State Display */}
      <div className="mt-4 p-2 bg-elevated rounded text-[10px] text-fg-dim">
        <div>Expression: <span className="text-fg-muted">{currentExpression}</span></div>
        <div>Mouth: <span className="text-fg-muted">{(mouthOpen * 100).toFixed(0)}%</span></div>
      </div>
    </div>
  );
}
