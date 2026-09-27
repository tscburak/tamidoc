import type { ComponentType } from 'react';
import type { IconSettings } from '@tabler/icons-react';

export interface SettingsNavItem {
  key: string;
  label: string;
  icon: typeof IconSettings;
  description: string;
}

export interface SettingsSectionProps {
  section: string;
  organizationId: string;
}

export type InvitePageComponent = ComponentType | null;
