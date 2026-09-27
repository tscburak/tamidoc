import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconMenu2,
  IconMoon,
  IconSun,
  IconTemplate,
  IconFileText,
  IconComponents,
  IconClipboardList,
  IconSettings,
  IconChevronDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconLogout,
  IconUser,
  IconPlus,
  IconDotsVertical,
  IconEdit,
  IconTrash,
} from '@tabler/icons-react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useColorScheme } from '../context/color-scheme';
import { cn } from '../lib/cn';
import { Avatar, Dropdown, DropdownItem, DropdownLabel, DropdownDivider, ConfirmDialog } from '../components/ui';
import { Modal } from '../components/ui/Modal';
import { OrganizationForm } from '../components/organization/OrganizationForm';
import { BrandLogo } from '../components/brand/BrandLogo';
import { useUserStore } from '@/stores/userStore';
import { useOrganizationStore, useActiveOrganizationFromPath } from '@/stores/organizationStore';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '../context/toast';
import { getOrganizationLogoUrl } from '../lib/assets';

/** localStorage key persisting the desktop collapse state across sessions. */
const COLLAPSE_KEY = 'tamidoc.sidebar.collapsed';

interface NavChild {
  label: string;
  path: string;
  icon: typeof IconTemplate;
}

interface NavSection {
  label: string;
  children: NavChild[];
}

// Grouped sidebar mirroring the target IA:
//   Templates → All Templates / Fixed-layout / Composable / Components (future)
//   Forms → Forms / Submissions (future global page)
//   Documents → All Documents / Drafts / Generated / Archived (future)
// Only items with live routes are listed; future items stay out until built.
const navSections: NavSection[] = [
  {
    label: 'Templates',
    children: [
      { label: 'All Templates', path: 'templates', icon: IconTemplate },
      { label: 'Fixed-layout', path: 'templates/fixed', icon: IconFileText },
      { label: 'Composable', path: 'templates/composable', icon: IconComponents },
    ],
  },
  {
    label: 'Forms',
    children: [{ label: 'Forms', path: 'forms', icon: IconClipboardList }],
  },
];

// Standalone items with live routes that sit outside the grouped IA.
const bottomNavItems = [{ label: 'Settings', path: 'settings', icon: IconSettings }];

/** Brand mark — the Tamidoc logo. Sized to match the sidebar header. */
function BrandMark({ className }: { className?: string }) {
  return <BrandLogo variant="color" className={cn('h-7 w-auto', className)} />;
}

function OrgSelector({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const { organizations, updateOrganizationLocal, deleteOrganization } = useOrganizationStore();
  const activeOrganization = useActiveOrganizationFromPath();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState<string | null>(null);
  const [orgSelectorOpen, setOrgSelectorOpen] = useState(false);
  const { show } = useToast();

  // Close organization selector when any modal opens
  useEffect(() => {
    if (isCreateModalOpen || isEditModalOpen || deleteConfirmOpen) {
      // Use requestAnimationFrame to ensure this runs after the modal state is set
      requestAnimationFrame(() => {
        setOrgSelectorOpen(false);
      });
    }
  }, [isCreateModalOpen, isEditModalOpen, deleteConfirmOpen]);

  // Generate initials from org name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Handle switching to an organization
  const handleSwitchOrg = (orgId: string) => {
    // Close the dropdown
    setOrgSelectorOpen(false);

    // Just navigate to the organization path - no API call needed
    navigate(`/o/${orgId}/templates`, { replace: true });
  };

  // Handle creating a new organization
  const handleCreateSuccess = (organization: any) => {
    show({
      title: 'Success',
      message: 'Organization created successfully',
      color: 'teal',
    });
    setIsCreateModalOpen(false);
    // Navigate to the new org
    navigate(`/o/${organization._id}/templates`, { replace: true });
  };

  // Handle editing an organization
  const handleEditOrg = (orgId: string) => {
    setEditingOrg(orgId);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = async (organization: any) => {
    // Update the organization in the local state
    updateOrganizationLocal(organization);

    show({
      title: 'Success',
      message: 'Organization updated successfully',
      color: 'teal',
    });
    setIsEditModalOpen(false);
    setEditingOrg(null);
  };

  // Handle deleting an organization
  const handleDeleteOrg = (orgId: string) => {
    setDeletingOrg(orgId);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingOrg) return;

    try {
      await deleteOrganization(deletingOrg);

      // If we deleted the active organization, navigate to the first available org or home
      if (activeOrganization?._id === deletingOrg) {
        const remainingOrgs = organizations.filter((org) => org._id !== deletingOrg);
        if (remainingOrgs.length > 0) {
          navigate(`/o/${remainingOrgs[0]._id}/templates`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }

      show({
        title: 'Success',
        message: 'Organization deleted successfully',
        color: 'teal',
      });
    } catch (error) {
      console.error('Failed to delete organization:', error);
      show({
        title: 'Error',
        message: 'Failed to delete organization',
        color: 'red',
      });
    } finally {
      setDeleteConfirmOpen(false);
      setDeletingOrg(null);
    }
  };

  const activeOrgInitials = activeOrganization ? getInitials(activeOrganization.name) : '...';
  const activeOrgName = activeOrganization?.name || 'Loading...';
  const activeOrgHasLogo = activeOrganization?.logo;
  const activeOrgColor = activeOrganization?.settings?.branding?.primaryColor;

  // Component for each organization item with three-dot menu
  function OrganizationItem({ org }: { org: any }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Check if user has only one organization
    const isOnlyOrganization = organizations.length === 1;

    const handleMenuToggle = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom + 4,
          left: rect.right - 128, // Align to right edge, menu width is ~128px
        });
      }
      setMenuOpen(!menuOpen);
    };

    const handleOrgClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleSwitchOrg(org._id);
    };

    const handleEdit = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleEditOrg(org._id);
      setMenuOpen(false);
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Frontend validation: prevent deleting last organization
      if (isOnlyOrganization) {
        show({
          title: 'Cannot Delete',
          message: 'You cannot delete your only organization. Please create another organization first.',
          color: 'red',
        });
        setMenuOpen(false);
        return;
      }

      handleDeleteOrg(org._id);
      setMenuOpen(false);
    };

    useEffect(() => {
      if (!menuOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        // Don't close if clicking on the trigger or menu
        if (
          (triggerRef.current && triggerRef.current.contains(target)) ||
          (menuRef.current && menuRef.current.contains(target))
        ) {
          return;
        }
        setMenuOpen(false);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setMenuOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [menuOpen]);

    return (
      <div className="relative group">
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700"
          onClick={handleOrgClick}
        >
          <div className="flex-1 flex items-center gap-2">
            {org.logo ? (
              <Avatar
                size={"xs"}
                radius="sm"
                src={getOrganizationLogoUrl(org._id, org.updatedAt)}
                style={{
                  border: org._id === activeOrganization?._id ? '2px solid #f97316' : 'none',
                }}
              />
            ) : (
              <Avatar
                size={"xs"}
                radius="sm"
                style={{
                  backgroundColor: org.settings?.branding?.primaryColor || '#C65D2E',
                  color: 'white',
                }}
              >
                {getInitials(org.name)}
              </Avatar>
            )}
            <div className="flex-1">
              <div className="truncate">{org.name}</div>
              {org._id === activeOrganization?._id && (
                <div className="text-xs text-stone-500">Active</div>
              )}
            </div>
          </div>
          {/* Three-dot menu for edit/delete */}
          <div
            ref={triggerRef}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-stone-200 rounded"
            onClick={handleMenuToggle}
          >
            <IconDotsVertical size={16} className="text-stone-400 hover:text-stone-600" />
          </div>
        </div>

        {/* Action menu dropdown - portaled to body */}
        {menuOpen && menuPosition && createPortal(
          <div
            ref={menuRef}
            className="fixed z-[1200] min-w-[8rem] overflow-hidden rounded-md border border-stone-200 bg-white p-1 shadow-lg dark:border-stone-700 dark:bg-stone-800"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
            }}
          >
            <button
              type="button"
              onClick={handleEdit}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <IconEdit size={14} />
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isOnlyOrganization}
              className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm ${
                isOnlyOrganization
                  ? 'text-stone-400 cursor-not-allowed opacity-50'
                  : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
              }`}
              title={isOnlyOrganization ? 'You cannot delete your only organization' : 'Delete organization'}
            >
              <IconTrash size={14} />
              Delete
            </button>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <>
      <Dropdown
        align="start"
        panelClassName="w-64"
        closeOnScroll={false}
        open={orgSelectorOpen}
        onOpenChange={setOrgSelectorOpen}
        trigger={
          collapsed ? (
            <div className="flex justify-center" title="Switch organization">
              {activeOrgHasLogo ? (
                <Avatar size={"sm"} radius="sm" src={getOrganizationLogoUrl(activeOrganization._id, activeOrganization?.updatedAt)} />
              ) : (
                <Avatar
                  size={"sm"}
                  radius="sm"
                  style={{
                    backgroundColor: activeOrgColor || '#C65D2E',
                    color: 'white',
                  }}
                >
                  {activeOrgInitials}
                </Avatar>
              )}
            </div>
          ) : (
            <div className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700">
              {activeOrgHasLogo ? (
                <Avatar size={"xs"} radius="sm" src={getOrganizationLogoUrl(activeOrganization._id, activeOrganization?.updatedAt)} />
              ) : (
                <Avatar
                  size={"xs"}
                  radius="sm"
                  style={{
                    backgroundColor: activeOrgColor || '#C65D2E',
                    color: 'white',
                  }}
                >
                  {activeOrgInitials}
                </Avatar>
              )}
              <span className="flex-1 truncate text-left">{activeOrgName}</span>
              <IconChevronDown size={16} className="text-stone-400" />
            </div>
          )
        }
      >
        <DropdownLabel>Organizations</DropdownLabel>
        {organizations.map((org) => (
          <OrganizationItem key={org._id} org={org} />
        ))}
        <DropdownDivider />
        <DropdownItem
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setIsCreateModalOpen(true);
            setOrgSelectorOpen(false);
          }}
        >
          Create Organization
        </DropdownItem>
        {activeOrganization?._id && (
          <DropdownItem
            leftSection={<IconSettings size={16} />}
            onClick={() => {
              setOrgSelectorOpen(false);
              navigate(`/o/${activeOrganization._id}/org-settings`);
            }}
          >
            Organization settings
          </DropdownItem>
        )}
      </Dropdown>

      {/* Create Organization Modal */}
      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Organization"
        size="lg"
      >
        <OrganizationForm
          mode="create"
          onSuccess={handleCreateSuccess}
          submitLabel="Create Organization"
        />
      </Modal>

      {/* Edit Organization Modal */}
      <Modal
        open={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingOrg(null);
        }}
        title="Edit Organization"
        size="lg"
      >
        {editingOrg && (
          <OrganizationForm
            mode="edit"
            organizationId={editingOrg}
            defaultValues={{
              name: organizations.find((org) => org._id === editingOrg)?.name,
              description: organizations.find((org) => org._id === editingOrg)?.description,
              website: organizations.find((org) => org._id === editingOrg)?.website,
              industry: organizations.find((org) => org._id === editingOrg)?.industry,
              size: organizations.find((org) => org._id === editingOrg)?.size,
              brandColor: organizations.find((org) => org._id === editingOrg)?.settings?.branding?.primaryColor,
            }}
            onSuccess={handleEditSuccess}
            submitLabel="Save Changes"
          />
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeletingOrg(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Organization"
        message={`Are you sure you want to delete "${organizations.find((org) => org._id === deletingOrg)?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </>
  );
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const { logout } = useAuth();
  const user = useUserStore().user;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // Generate initials from user name
  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  return (
    <Dropdown
      align={collapsed ? 'start' : 'end'}
      placement="top"
      panelClassName="w-56"
      trigger={
        collapsed ? (
          <div className="flex justify-center" title="Account">
            <Avatar color="blue" radius="xl" size="md">
              {getInitials()}
            </Avatar>
          </div>
        ) : (
          <div
            className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            <Avatar color="blue" radius="xl" size="md">
              {getInitials()}
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs text-stone-500 dark:text-stone-400">{user?.email}</p>
            </div>
            <IconChevronDown size={16} className="text-stone-400" />
          </div>
        )
      }
    >
      <DropdownLabel>Account</DropdownLabel>
      <DropdownItem leftSection={<IconUser size={16} />}>Profile</DropdownItem>
      <DropdownDivider />
      <DropdownItem
        leftSection={<IconLogout size={16} />}
        color="red"
        onClick={handleLogout}
      >
        Logout
      </DropdownItem>
    </Dropdown>
  );
}

export function MainLayout() {
  const { organizationId } = useParams<{ organizationId: string }>();
  // Desktop collapse (persisted) + mobile drawer (transient).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Build org-relative path
  const buildPath = (path: string) => `/o/${organizationId}/${path}`;

  const isChildActive = (child: NavChild) => {
    const fullPath = buildPath(child.path);
    if (location.pathname === fullPath || location.pathname.startsWith(fullPath + '/')) {
      // `templates` is a prefix of `templates/fixed` — All Templates must not
      // claim the family pages. Detail pages (templates/new, templates/:id/…)
      // still fall back to All Templates.
      if (child.path === 'templates') {
        const familyPaths = [buildPath('templates/fixed'), buildPath('templates/composable')];
        return !familyPaths.some(
          (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
        );
      }
      return true;
    }
    return false;
  };

  // The mobile drawer always renders expanded, so hide labels only when
  // collapsed AND the drawer isn't covering the screen.
  const collapsedNow = collapsed && !mobileOpen;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 dark:bg-stone-900 dark:text-stone-100">
      <div className="flex">
        <aside
          className={cn(
            'fixed left-0 top-0 z-50 flex h-screen w-70 shrink-0 flex-col border-r border-stone-200 bg-white transition-transform duration-300 sm:sticky sm:z-30 sm:translate-x-0 sm:transition-[width] dark:border-stone-700 dark:bg-stone-800',
            collapsed ? 'sm:w-20' : 'sm:w-64',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Sidebar header: brand logo (no separate top header). */}
          <div className="px-6 pt-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Tamidoc home"
              className={cn(
                'flex w-full items-center rounded-lg',
                collapsedNow ? 'justify-center' : 'justify-start gap-3',
              )}
            >
              <BrandMark />
              {!collapsedNow && (
                <span className="truncate text-xl font-extrabold tracking-tight text-stone-800 dark:text-stone-100">
                  tamidoc
                </span>
              )}
            </button>
          </div>

          {/* Scrollable middle: organization selector + nav. */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <OrgSelector collapsed={collapsedNow} />

            <nav className="mt-4 flex flex-col gap-4">
              {navSections.map((section) => (
                <div key={section.label} className="flex flex-col gap-1">
                  {!collapsedNow && (
                    <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      {section.label}
                    </p>
                  )}
                  {section.children.map((item) => (
                    <button
                      key={`${section.label}:${item.label}`}
                      type="button"
                      title={collapsedNow ? item.label : undefined}
                      aria-label={item.label}
                      onClick={() => {
                        navigate(buildPath(item.path));
                        setMobileOpen(false);
                      }}
                      className={cn(
                        'flex items-center rounded-md py-2 text-sm font-medium transition-colors',
                        collapsedNow ? 'justify-center' : 'gap-3 px-3',
                        isChildActive(item)
                          ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                          : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700',
                      )}
                    >
                      <item.icon size={18} className="shrink-0" />
                      {!collapsedNow && <span className="truncate">{item.label}</span>}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex flex-col gap-1">
                {bottomNavItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    title={collapsedNow ? item.label : undefined}
                    aria-label={item.label}
                    onClick={() => {
                      navigate(buildPath(item.path));
                      setMobileOpen(false);
                    }}
                    className={cn(
                      'flex items-center rounded-md py-2 text-sm font-medium transition-colors',
                      collapsedNow ? 'justify-center' : 'gap-3 px-3',
                      isChildActive(item)
                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                        : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700',
                    )}
                  >
                    <item.icon size={18} className="shrink-0" />
                    {!collapsedNow && <span className="truncate">{item.label}</span>}
                  </button>
                ))}
              </div>
            </nav>
          </div>

          {/* Footer: theme toggle + user. */}
          <div className="border-t border-stone-200 p-3 dark:border-stone-700">
            <button
              type="button"
              onClick={toggleColorScheme}
              aria-label="Toggle color scheme"
              title={collapsedNow ? 'Toggle theme' : undefined}
              className={cn(
                'flex w-full items-center rounded-md py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700',
                collapsedNow ? 'justify-center' : 'gap-3 px-3',
              )}
            >
              {colorScheme === 'light' ? <IconSun size={18} /> : <IconMoon size={18} />}
              {!collapsedNow && <span>Theme</span>}
            </button>

            <div className="mt-1">
              <UserCard collapsed={collapsedNow} />
            </div>
          </div>

          {/* Floating collapse toggle — sits on the sidebar's right edge. */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute right-0 top-6 z-50 hidden size-6 translate-x-1/2 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition-colors hover:bg-stone-100 hover:text-stone-700 sm:flex dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
          >
            {collapsed ? <IconChevronsRight size={14} /> : <IconChevronsLeft size={14} />}
          </button>
        </aside>

        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        {/* Right column: minimal mobile chrome + main content. */}
        <div className="min-w-0 flex-1">
          {/* Mobile-only bar (no header on desktop). */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-stone-200 bg-white/80 px-4 backdrop-blur sm:hidden dark:border-stone-700 dark:bg-stone-800/80">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="-ml-1 flex size-9 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
              >
                <IconMenu2 size={20} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <BrandMark />
                <span className="text-xl font-extrabold tracking-tight">tamidoc</span>
              </button>
            </div>
            <button
              type="button"
              onClick={toggleColorScheme}
              aria-label="Toggle color scheme"
              className="flex size-9 items-center justify-center rounded-md border border-stone-300 text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {colorScheme === 'light' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
          </header>

          <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
