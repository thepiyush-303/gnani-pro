/** Material Design Icons: the same set the app uses (MaterialCommunityIcons). */

import MdiIcon from '@mdi/react';

export function Icon({ path, size = 28, color = 'currentColor' }: { path: string; size?: number; color?: string }) {
  return <MdiIcon path={path} size={`${size}px`} color={color} />;
}
