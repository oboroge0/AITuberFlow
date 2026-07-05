import React from 'react';
import {
  // Control flow
  Play,
  Square,
  RefreshCw,
  List,
  GitBranch,
  Clock,
  Hourglass,
  Move,
  CalendarClock,
  // Input / text
  Type,
  CaseSensitive,
  // LLM
  Cpu,
  Zap,
  // TTS / audio
  Volume2,
  AudioLines,
  AudioWaveform,
  Radio,
  Mic2,
  Speaker,
  // Avatar
  User,
  Smile,
  Mic,
  // Output
  Terminal,
  Subtitles,
  Gift,
  // Utility
  Variable,
  Globe,
  Dice5,
  FileJson,
  Database,
  Search,
  FileText,
  // Fallback
  Box,
  type LucideProps,
} from 'lucide-react';
import {
  siAnthropic,
  siGooglegemini,
  siMistralai,
  siOllama,
  siDiscord,
  siTwitch,
  siYoutube,
  siObsstudio,
  type SimpleIcon,
} from 'simple-icons';

// Icon component props (kept stable — consumed by Sidebar.tsx and CustomNode.tsx)
interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * lucide-react icons, imported individually (named imports) so unused icons are tree-shaken
 * out of the production bundle. Add new entries here as plugins adopt new icon names —
 * only icons actually referenced by a plugin's manifest.json `ui.icon` should be listed.
 */
const lucideIcons: Record<string, React.ComponentType<LucideProps>> = {
  Play,
  Square,
  RefreshCw,
  List,
  GitBranch,
  Clock,
  Hourglass,
  Move,
  CalendarClock,
  Type,
  CaseSensitive,
  Cpu,
  Zap,
  Volume2,
  AudioLines,
  AudioWaveform,
  Radio,
  Mic2,
  Speaker,
  User,
  Smile,
  Mic,
  Terminal,
  Subtitles,
  Gift,
  Variable,
  Globe,
  Dice5,
  FileJson,
  Database,
  Search,
  FileText,
  Box,
};

/**
 * simple-icons brand icons, imported individually (named imports) and referenced via the
 * "si:<slug>" convention in a plugin's `ui.icon` (e.g. "si:anthropic"). simple-icons paths are
 * monochrome silhouettes meant to be filled with a single color, so these are rendered with
 * `fill`, unlike the stroke-based lucide icons above.
 */
const simpleIcons: Record<string, SimpleIcon> = {
  anthropic: siAnthropic,
  googlegemini: siGooglegemini,
  mistralai: siMistralai,
  ollama: siOllama,
  discord: siDiscord,
  twitch: siTwitch,
  youtube: siYoutube,
  obsstudio: siObsstudio,
};

function SimpleIconSvg({
  icon,
  size = 14,
  color = 'currentColor',
  className,
}: IconProps & { icon: SimpleIcon }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={icon.title}
    >
      <path d={icon.path} fill={color} />
    </svg>
  );
}

/**
 * Get an icon component by name.
 * - "si:<slug>" resolves against simple-icons brand icons (e.g. "si:anthropic").
 * - Anything else resolves against the lucide-react icon map above.
 * - Falls back to the generic `Box` icon if the name isn't found.
 */
export function getIconComponent(iconName: string): React.FC<IconProps> {
  if (iconName?.startsWith('si:')) {
    const slug = iconName.slice(3);
    const icon = simpleIcons[slug];
    if (icon) {
      return (props: IconProps) => <SimpleIconSvg icon={icon} {...props} />;
    }
    return lucideIcons.Box as unknown as React.FC<IconProps>;
  }
  return (lucideIcons[iconName] ?? lucideIcons.Box) as unknown as React.FC<IconProps>;
}

/**
 * Render an icon by name.
 */
export function renderIcon(iconName: string, props: IconProps = {}): React.ReactNode {
  const IconComponent = getIconComponent(iconName);
  return <IconComponent {...props} />;
}

export default lucideIcons;
