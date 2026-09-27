import { useState } from 'react';
import { IconUser, IconBell, IconLock, IconPalette } from '@tabler/icons-react';
import { Card, Tabs, TabsList, Tab, TabPanel, TextInput, Switch, Button } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

function ActionButtons({ saveLabel }: { saveLabel: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="default">Cancel</Button>
      <Button>{saveLabel}</Button>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Settings</h2>
        <p className="text-stone-500 dark:text-stone-400">
          Manage your account and application settings
        </p>
      </div>

      <Card p="md">
        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="profile">
          <TabsList>
            <Tab value="profile" leftSection={<IconUser size={16} />}>
              Profile
            </Tab>
            <Tab value="notifications" leftSection={<IconBell size={16} />}>
              Notifications
            </Tab>
            <Tab value="security" leftSection={<IconLock size={16} />}>
              Security
            </Tab>
            <Tab value="appearance" leftSection={<IconPalette size={16} />}>
              Appearance
            </Tab>
          </TabsList>

          <TabPanel value="profile">
            <div className="flex flex-col gap-4">
              <TextInput label="Full Name" placeholder="John Doe" defaultValue={user?.firstName + ' ' + user?.lastName} />
              <TextInput label="Email" placeholder="john@example.com" defaultValue={user?.email} />
              <TextInput label="Phone" placeholder="+1 234 567 890" />
              <ActionButtons saveLabel="Save Changes" />
            </div>
          </TabPanel>

          <TabPanel value="notifications">
            <div className="flex flex-col gap-4">
              <Switch
                label="Email Notifications"
                description="Receive email updates about your documents"
                defaultChecked
              />
              <Switch
                label="Push Notifications"
                description="Receive push notifications in browser"
                defaultChecked
              />
              <Switch
                label="Document Completion Alerts"
                description="Get notified when documents are completed"
                defaultChecked
              />
              <Switch
                label="Template Updates"
                description="Receive updates about template changes"
              />
              <Switch
                label="Weekly Summary"
                description="Receive weekly summary of activities"
              />
            </div>
          </TabPanel>

          <TabPanel value="security">
            <div className="flex flex-col gap-4">
              <TextInput label="Current Password" type="password" placeholder="Enter current password" />
              <TextInput label="New Password" type="password" placeholder="Enter new password" />
              <TextInput
                label="Confirm Password"
                type="password"
                placeholder="Confirm new password"
              />
              <ActionButtons saveLabel="Update Password" />
            </div>
          </TabPanel>

          <TabPanel value="appearance">
            <div className="flex flex-col gap-4">
              <Switch label="Dark Mode" description="Switch between light and dark theme" />
              <Switch label="Compact Mode" description="Use more compact spacing throughout the app" />
              <Switch
                label="Show Sidebar"
                description="Display sidebar navigation"
                defaultChecked
              />
            </div>
          </TabPanel>
        </Tabs>
      </Card>
    </div>
  );
}
