import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  UserPlus,
  X,
  Lock,
  CheckCircle,
  AlertCircle,
  Save,
  Key,
  Edit2,
  Trash2,
  Search,
  RotateCcw,
  LayoutGrid,
  List,
  ShieldAlert,
  History,
  ArrowRight,
  Clock,
  Crown,
  Briefcase,
  UtensilsCrossed
} from 'lucide-react';
import { useAuth, DEFAULT_PERMISSIONS } from '../../context/AuthContext';
import { User, Role, UserRole, UserActivityLog } from '../../types';
import { collection, onSnapshot, setDoc, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';
import {
  recordUserActivityLog,
  subscribeToUserActivityLogs
} from '../../services/userActivityLogService';

const SYSTEM_ROLES: Role[] = [
  { id: 'admin', name: 'Admin (Full Access)', permissions: DEFAULT_PERMISSIONS.ADMIN, active: true },
  { id: 'manager', name: 'Manager', permissions: DEFAULT_PERMISSIONS.MANAGER, active: true },
  { id: 'waiter', name: 'Waiter / Staff', permissions: DEFAULT_PERMISSIONS.WAITER, active: true }
];

export interface AccessModuleOption {
  id: string;
  label: string;
  description: string;
  permissions: string[];
}

export const ACCESS_MODULES: AccessModuleOption[] = [
  {
    id: 'direct_billing',
    label: 'Direct Billing',
    description: 'Fast counter billing and instant thermal receipt printing',
    permissions: ['direct-billing.view', 'billing.create', 'billing.print']
  },
  {
    id: 'pos_billing',
    label: 'POS Billing',
    description: 'Visual category & item grid POS terminal',
    permissions: ['pos.view', 'billing.create', 'billing.print']
  },
  {
    id: 'kot',
    label: 'KOT & Running KOTs',
    description: 'Create kitchen order tickets and manage running table orders',
    permissions: ['kot.view', 'kot.create', 'kot.edit', 'kot.delete']
  },
  {
    id: 'orders',
    label: 'Orders & Bill Reprint',
    description: 'View completed bills, reprint receipts, and cancel bills',
    permissions: ['billing.reprint', 'billing.cancel']
  },
  {
    id: 'dashboard',
    label: 'Dashboard Overview',
    description: 'Live daily sales metrics and business summary',
    permissions: ['dashboard.view']
  },
  {
    id: 'menu',
    label: 'Menu Management',
    description: 'Add, edit, or update menu items, categories, and prices',
    permissions: ['menu.view', 'menu.create', 'menu.edit', 'menu.price']
  },
  {
    id: 'inventory',
    label: 'Inventory Management',
    description: 'Track stock counts, purchases, and low-stock items',
    permissions: ['inventory.view', 'inventory.edit']
  },
  {
    id: 'reports',
    label: 'Sales Reports',
    description: 'View daily, item-wise, and financial sales reports',
    permissions: ['reports.view', 'reports.financial']
  },
  {
    id: 'settings',
    label: 'Store & Receipt Settings',
    description: 'Configure restaurant details, thermal printer, and receipt layout',
    permissions: ['settings.manage']
  },
  {
    id: 'users',
    label: 'Admin User Management',
    description: 'Register new users, assign PINs, and control user access',
    permissions: ['users.manage']
  }
];

const DEFAULT_ADMIN_USER: User = {
  uid: 'user_admin',
  username: 'admin',
  pin: '1234',
  name: 'Admin',
  email: 'admin@hotelpos.local',
  roleId: 'admin',
  fullAccess: true,
  permissions: DEFAULT_PERMISSIONS.ADMIN,
  active: true,
  createdAt: Date.now(),
  updatedAt: Date.now()
};

const ACTIVITY_FILTER_OPTIONS = [
  'All',
  'User Registered',
  'Role Updated',
  'Access Updated',
  'PIN Updated',
  'Status Changed',
  'User Deleted'
] as const;

export const UserManagement: React.FC = () => {
  const { isOwner, currentUser, registerWithUsernameAndPin } = useAuth();

  const getInitialUsers = (): User[] => {
    try {
      let deletedIds: string[] = [];
      const rawDeleted = localStorage.getItem('pos_deleted_user_ids');
      if (rawDeleted) {
        try {
          deletedIds = JSON.parse(rawDeleted);
        } catch (e) {}
      }

      const stored = localStorage.getItem('pos_local_users');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(
            (u: any) =>
              !u.deleted &&
              !deletedIds.includes(u.uid) &&
              !['user_owner', 'user_manager', 'user_cashier', 'user_waiter1'].includes(u.uid)
          );
          const hasAdmin = clean.some(
            (u: User) => u.username?.toLowerCase() === 'admin' || u.uid === 'user_admin'
          );
          const finalUsers = hasAdmin ? clean : [DEFAULT_ADMIN_USER, ...clean];
          return finalUsers;
        }
      }
    } catch (e) {}
    return [DEFAULT_ADMIN_USER];
  };

  const [users, setUsers] = useState<User[]>(getInitialUsers);
  const [roles, setRoles] = useState<Role[]>(SYSTEM_ROLES);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Admin Activity Logs State (Dedicated Firestore collection: user_activity_logs)
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([]);
  const [activityActionFilter, setActivityActionFilter] = useState<string>('All');
  const [activitySearchQuery, setActivitySearchQuery] = useState<string>('');

  // User Form State (Username, PIN, Name, Role, Full Access, and Module Permissions)
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    pin: '',
    roleId: 'waiter' as UserRole,
    fullAccess: false,
    permissions: DEFAULT_PERMISSIONS.WAITER as string[],
    active: true
  });

  // Quick PIN Modal State
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [targetPinUser, setTargetPinUser] = useState<User | null>(null);
  const [newPinValue, setNewPinValue] = useState('');

  // Reset Staff Confirmation & Admin PIN Modal State
  const [resetStaffModalOpen, setResetStaffModalOpen] = useState(false);
  const [resetStaffPin, setResetStaffPin] = useState('');
  const [resetStaffConfirmed, setResetStaffConfirmed] = useState(false);
  const [resetStaffError, setResetStaffError] = useState<string | null>(null);
  const [isResettingStaff, setIsResettingStaff] = useState(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deletion Confirmation Modal State
  const [deleteModalConfig, setDeleteModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    itemSubtitle?: string;
    description?: string;
    warningNote?: string;
    confirmButtonText?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    onConfirm: () => {}
  });
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Synchronize staff records and Admin Activity Logs with Firestore
  useEffect(() => {
    let unsubUsers: (() => void) | undefined;
    let unsubRoles: (() => void) | undefined;
    let unsubActivityLogs: (() => void) | undefined;

    try {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          let deletedIds: string[] = [];
          try {
            const rawDeleted = localStorage.getItem('pos_deleted_user_ids');
            if (rawDeleted) deletedIds = JSON.parse(rawDeleted);
          } catch (e) {}

          const list: User[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            if (
              !data.deleted &&
              !deletedIds.includes(d.id) &&
              !['user_owner', 'user_manager', 'user_cashier', 'user_waiter1'].includes(d.id)
            ) {
              list.push({ uid: d.id, ...data });
            }
          });

          const hasAdmin = list.some(
            (u) => u.username?.toLowerCase() === 'admin' || u.uid === 'user_admin'
          );
          const mergedList = hasAdmin ? list : [DEFAULT_ADMIN_USER, ...list];
          setUsers(mergedList);
          localStorage.setItem('pos_local_users', JSON.stringify(mergedList));
        },
        (err) => {
          console.warn('Users Firestore listener note:', err?.message || err);
        }
      );
    } catch (e) {
      console.warn('Users query notice:', e);
    }

    try {
      unsubRoles = onSnapshot(
        collection(db, 'roles'),
        (snap) => {
          const list: Role[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Role));
          if (list.length > 0) {
            setRoles(list);
          }
        },
        (err) => {
          console.warn('Roles Firestore notice:', err?.message || err);
        }
      );
    } catch (e) {
      console.warn('Roles query notice:', e);
    }

    if (isOwner) {
      unsubActivityLogs = subscribeToUserActivityLogs((logs) => {
        setActivityLogs(logs);
      }, 100);
    }

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubRoles) unsubRoles();
      if (unsubActivityLogs) unsubActivityLogs();
    };
  }, [isOwner]);

  const getPermissionsForRole = (role: string): string[] => {
    const norm = role.toLowerCase();
    if (norm === 'admin' || norm === 'owner') return [...DEFAULT_PERMISSIONS.ADMIN];
    if (norm === 'manager') return [...DEFAULT_PERMISSIONS.MANAGER];
    return [...DEFAULT_PERMISSIONS.WAITER];
  };

  const handleRoleChangeInForm = (newRole: UserRole) => {
    const norm = newRole.toLowerCase();
    const isFull = norm === 'admin' || norm === 'owner';
    setFormData((prev) => ({
      ...prev,
      roleId: newRole,
      fullAccess: isFull,
      permissions: getPermissionsForRole(norm)
    }));
  };

  const handleToggleFullAccessInForm = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      fullAccess: checked,
      roleId: checked ? 'admin' : prev.roleId === 'admin' || prev.roleId === 'owner' ? 'manager' : prev.roleId,
      permissions: checked ? [...DEFAULT_PERMISSIONS.ADMIN] : prev.permissions
    }));
  };

  const isModuleEnabledInForm = (mod: AccessModuleOption): boolean => {
    if (formData.fullAccess) return true;
    return mod.permissions.some((p) => formData.permissions.includes(p));
  };

  const handleToggleModuleInForm = (mod: AccessModuleOption) => {
    if (formData.fullAccess) return;
    const currentlyEnabled = isModuleEnabledInForm(mod);
    setFormData((prev) => {
      const nextPerms = new Set(prev.permissions);
      if (currentlyEnabled) {
        mod.permissions.forEach((p) => nextPerms.delete(p));
      } else {
        mod.permissions.forEach((p) => nextPerms.add(p));
      }
      return {
        ...prev,
        permissions: Array.from(nextPerms)
      };
    });
  };

  const openAddModal = () => {
    if (!isOwner) {
      setNotification({ type: 'error', message: 'Only the Admin account can register new users.' });
      return;
    }
    setEditingUser(null);
    setFormData({
      name: '',
      username: '',
      pin: '',
      roleId: 'waiter',
      fullAccess: false,
      permissions: [...DEFAULT_PERMISSIONS.WAITER],
      active: true
    });
    setModalOpen(true);
  };

  const openEditModal = (u: User) => {
    if (!isOwner) {
      setNotification({ type: 'error', message: 'Only the Admin account can modify user access.' });
      return;
    }
    const roleLower = (u.roleId?.toLowerCase() || 'waiter') as UserRole;
    const isUserAdmin = roleLower === 'admin' || roleLower === 'owner' || Boolean(u.fullAccess);
    const existingPerms =
      Array.isArray(u.permissions) && u.permissions.length > 0
        ? u.permissions
        : getPermissionsForRole(roleLower);

    setEditingUser(u);
    setFormData({
      name: u.name || '',
      username: u.username || u.uid.replace('user_', ''),
      pin: u.pin || '1234',
      roleId: isUserAdmin ? 'admin' : roleLower,
      fullAccess: isUserAdmin,
      permissions: isUserAdmin ? [...DEFAULT_PERMISSIONS.ADMIN] : existingPerms,
      active: u.active !== false
    });
    setModalOpen(true);
  };

  const openChangePinModal = (u: User) => {
    if (!isOwner) return;
    setTargetPinUser(u);
    setNewPinValue('');
    setPinModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) {
      setNotification({ type: 'error', message: 'Only the Admin account can register or edit users.' });
      return;
    }

    if (!formData.name.trim()) {
      setNotification({ type: 'error', message: 'Full name is required.' });
      return;
    }

    const cleanUsername = (
      formData.username.trim() ||
      formData.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    ).toLowerCase();
    const cleanPin = formData.pin.trim();

    if (!cleanUsername || cleanUsername.length < 2) {
      setNotification({ type: 'error', message: 'Username must be at least 2 characters.' });
      return;
    }

    if (!cleanPin || cleanPin.length < 4) {
      setNotification({ type: 'error', message: 'PIN must be at least 4 numeric digits.' });
      return;
    }

    setIsSubmitting(true);

    try {
      const finalRoleId = formData.fullAccess ? 'admin' : formData.roleId.toLowerCase();
      const finalPermissions = formData.fullAccess
        ? [...DEFAULT_PERMISSIONS.ADMIN]
        : formData.permissions;

      if (editingUser) {
        const previousRole = (editingUser.roleId || 'waiter').toUpperCase();
        const nextRole = finalRoleId.toUpperCase();
        const roleChanged =
          previousRole !== nextRole || Boolean(editingUser.fullAccess) !== Boolean(formData.fullAccess);
        const pinChanged = (editingUser.pin || '1234') !== cleanPin;

        const updatedData: Partial<User> = {
          name: formData.name.trim(),
          username: cleanUsername,
          pin: cleanPin,
          email: `${cleanUsername}@hotelpos.local`,
          roleId: finalRoleId,
          fullAccess: formData.fullAccess,
          permissions: finalPermissions,
          active: formData.active,
          updatedAt: Date.now()
        };

        try {
          await setDoc(doc(db, 'users', editingUser.uid), { ...editingUser, ...updatedData }, { merge: true });
        } catch (e: any) {
          console.warn('Firestore updateDoc notice:', e?.message || e);
        }

        setUsers((prev) => {
          const updated = prev.map((u) =>
            u.uid === editingUser.uid ? ({ ...u, ...updatedData } as User) : u
          );
          localStorage.setItem('pos_local_users', JSON.stringify(updated));
          return updated;
        });

        // Record audit log in dedicated Firestore collection (user_activity_logs)
        if (roleChanged) {
          await recordUserActivityLog({
            action: 'Role Updated',
            targetUser: {
              uid: editingUser.uid,
              name: formData.name.trim(),
              username: cleanUsername,
              roleId: finalRoleId
            },
            performedBy: currentUser,
            previousValue: previousRole,
            newValue: formData.fullAccess ? 'ADMIN (FULL ACCESS)' : nextRole,
            details: `Updated role for "${formData.name.trim()}" (@${cleanUsername}) from ${previousRole} to ${
              formData.fullAccess ? 'ADMIN (FULL ACCESS)' : nextRole
            }.`
          });
        } else {
          const enabledModuleLabels = ACCESS_MODULES.filter((m) =>
            formData.fullAccess ? true : m.permissions.some((p) => finalPermissions.includes(p))
          ).map((m) => m.label);

          await recordUserActivityLog({
            action: pinChanged ? 'PIN Updated' : 'Access Updated',
            targetUser: {
              uid: editingUser.uid,
              name: formData.name.trim(),
              username: cleanUsername,
              roleId: finalRoleId
            },
            performedBy: currentUser,
            details: `Updated access & profile for "${formData.name.trim()}" (@${cleanUsername}) — ${
              formData.fullAccess ? 'Full System Access' : `${enabledModuleLabels.length} allowed modules`
            }.`
          });
        }

        setNotification({
          type: 'success',
          message: `User "${formData.name.trim()}" (@${cleanUsername}) updated by Admin.`
        });
      } else {
        // Register new user via AuthContext (Admin-only guard enforced)
        const createdUser = await registerWithUsernameAndPin(
          cleanUsername,
          cleanPin,
          formData.name.trim(),
          finalRoleId,
          {
            fullAccess: formData.fullAccess,
            permissions: finalPermissions
          }
        );

        setUsers((prev) => {
          const updated = [...prev.filter((u) => u.uid !== createdUser.uid), createdUser];
          localStorage.setItem('pos_local_users', JSON.stringify(updated));
          return updated;
        });

        // Record 'User Registered' in dedicated Firestore collection (user_activity_logs)
        await recordUserActivityLog({
          action: 'User Registered',
          targetUser: {
            uid: createdUser.uid,
            name: createdUser.name,
            username: cleanUsername,
            roleId: finalRoleId
          },
          performedBy: currentUser,
          newValue: formData.fullAccess ? 'ADMIN (FULL ACCESS)' : finalRoleId.toUpperCase(),
          details: `Registered new user "${createdUser.name}" (@${cleanUsername}) with role ${
            formData.fullAccess ? 'ADMIN (FULL ACCESS)' : finalRoleId.toUpperCase()
          }.`
        });

        setNotification({
          type: 'success',
          message: `New user "${createdUser.name}" registered (Username: @${cleanUsername}, PIN: ${cleanPin}).`
        });
      }

      setModalOpen(false);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to save user.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPinUser || !isOwner) return;
    if (newPinValue.length < 4 || !/^\d{4,6}$/.test(newPinValue)) {
      setNotification({ type: 'error', message: 'PIN must be 4 to 6 numeric digits (e.g. 1234).' });
      return;
    }

    try {
      await setDoc(
        doc(db, 'users', targetPinUser.uid),
        {
          ...targetPinUser,
          pin: newPinValue,
          updatedAt: Date.now()
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Firestore PIN update notice:', e);
    }

    setUsers((prev) => {
      const updated = prev.map((u) =>
        u.uid === targetPinUser.uid ? { ...u, pin: newPinValue, updatedAt: Date.now() } : u
      );
      localStorage.setItem('pos_local_users', JSON.stringify(updated));
      return updated;
    });

    await recordUserActivityLog({
      action: 'PIN Updated',
      targetUser: {
        uid: targetPinUser.uid,
        name: targetPinUser.name,
        username: targetPinUser.username,
        roleId: targetPinUser.roleId
      },
      performedBy: currentUser,
      details: `Security PIN updated for "${targetPinUser.name}" (@${
        targetPinUser.username || targetPinUser.uid.replace('user_', '')
      }).`
    });

    setPinModalOpen(false);
    setNotification({
      type: 'success',
      message: `PIN updated for @${targetPinUser.username || targetPinUser.name}.`
    });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteUser = (u: User) => {
    if (!isOwner) return;
    if (u.username?.toLowerCase() === 'admin' || u.uid === 'user_admin') {
      setNotification({ type: 'error', message: 'The primary Admin account cannot be deleted.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    if (currentUser?.uid === u.uid) {
      setNotification({ type: 'error', message: 'You cannot remove your own currently logged-in account.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const roleName = roles.find((r) => r.id === u.roleId)?.name || u.roleId?.toUpperCase();

    setDeleteModalConfig({
      isOpen: true,
      title: 'Remove User Account',
      itemName: u.name,
      itemSubtitle: `Username: @${u.username || u.uid} • Role: ${roleName}`,
      description: `Are you sure you want to permanently remove "${u.name}"?`,
      warningNote: 'This user will immediately lose login and POS access.',
      confirmButtonText: 'Remove User',
      onConfirm: async () => {
        setIsDeletingUser(true);
        try {
          try {
            await deleteDoc(doc(db, 'users', u.uid));
          } catch (deleteErr: any) {
            await setDoc(
              doc(db, 'users', u.uid),
              {
                deleted: true,
                active: false,
                deletedAt: Date.now()
              },
              { merge: true }
            );
          }

          try {
            const rawDeleted = localStorage.getItem('pos_deleted_user_ids');
            const deletedIds: string[] = rawDeleted ? JSON.parse(rawDeleted) : [];
            if (!deletedIds.includes(u.uid)) {
              deletedIds.push(u.uid);
              localStorage.setItem('pos_deleted_user_ids', JSON.stringify(deletedIds));
            }
          } catch (e) {}

          setUsers((prev) => {
            const updated = prev.filter((item) => item.uid !== u.uid);
            localStorage.setItem('pos_local_users', JSON.stringify(updated));
            return updated;
          });

          await recordUserActivityLog({
            action: 'User Deleted',
            targetUser: {
              uid: u.uid,
              name: u.name,
              username: u.username,
              roleId: u.roleId
            },
            performedBy: currentUser,
            previousValue: (u.roleId || 'waiter').toUpperCase(),
            newValue: 'DELETED',
            details: `Removed user account "${u.name}" (@${u.username || u.uid.replace('user_', '')}).`
          });

          setNotification({ type: 'success', message: `User "${u.name}" removed successfully.` });
          setTimeout(() => setNotification(null), 3000);
          setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }));
        } catch (e: any) {
          setNotification({ type: 'error', message: e?.message || 'Failed to remove user.' });
        } finally {
          setIsDeletingUser(false);
        }
      }
    });
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    if (!isOwner) return;
    const target = users.find((u) => u.uid === userId);
    const nextActive = !currentActive;

    try {
      await updateDoc(doc(db, 'users', userId), {
        active: nextActive,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.warn('Firestore toggle user active notice:', e);
    }

    setUsers((prev) => {
      const updated = prev.map((u) =>
        u.uid === userId ? { ...u, active: nextActive, updatedAt: Date.now() } : u
      );
      localStorage.setItem('pos_local_users', JSON.stringify(updated));
      return updated;
    });

    if (target) {
      await recordUserActivityLog({
        action: 'Status Changed',
        targetUser: {
          uid: target.uid,
          name: target.name,
          username: target.username,
          roleId: target.roleId
        },
        performedBy: currentUser,
        previousValue: currentActive ? 'ACTIVE' : 'DISABLED',
        newValue: nextActive ? 'ACTIVE' : 'DISABLED',
        details: `${nextActive ? 'Enabled' : 'Disabled'} login access for "${target.name}" (@${
          target.username || target.uid.replace('user_', '')
        }).`
      });
    }
  };

  const openResetStaffModal = () => {
    if (!isOwner) return;
    setResetStaffPin('');
    setResetStaffConfirmed(false);
    setResetStaffError(null);
    setResetStaffModalOpen(true);
  };

  const handleConfirmResetStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;

    setResetStaffError(null);

    if (!resetStaffConfirmed) {
      setResetStaffError('Please check the confirmation box to proceed with resetting staff data.');
      return;
    }

    const cleanPin = resetStaffPin.trim();
    if (!cleanPin) {
      setResetStaffError('Please enter the Admin Security PIN to authorize this reset.');
      return;
    }

    const primaryAdmin = users.find(
      (u) => u.username?.toLowerCase() === 'admin' || u.uid === 'user_admin'
    );
    const expectedAdminPin = primaryAdmin?.pin || currentUser?.pin || '1234';

    if (cleanPin !== expectedAdminPin && cleanPin !== (currentUser?.pin || expectedAdminPin)) {
      setResetStaffError('Invalid Admin PIN. Please enter the correct Admin PIN to reset staff data.');
      return;
    }

    const nonAdminUsers = users.filter(
      (u) => u.username?.toLowerCase() !== 'admin' && u.uid !== 'user_admin'
    );

    setIsResettingStaff(true);
    try {
      if (nonAdminUsers.length > 0) {
        try {
          const batch = writeBatch(db);
          nonAdminUsers.forEach((u) => {
            batch.delete(doc(db, 'users', u.uid));
          });
          await batch.commit();
        } catch (e) {
          console.warn('Firestore batch delete notice:', e);
        }

        try {
          const rawDeleted = localStorage.getItem('pos_deleted_user_ids');
          const deletedIds: string[] = rawDeleted ? JSON.parse(rawDeleted) : [];
          nonAdminUsers.forEach((u) => {
            if (!deletedIds.includes(u.uid)) deletedIds.push(u.uid);
          });
          localStorage.setItem('pos_deleted_user_ids', JSON.stringify(deletedIds));
        } catch (e) {}
      }

      const adminAccountToRetain = primaryAdmin || DEFAULT_ADMIN_USER;
      const adminOnly = [adminAccountToRetain];
      localStorage.setItem('pos_local_users', JSON.stringify(adminOnly));
      setUsers(adminOnly);

      await recordUserActivityLog({
        action: 'Staff Reset',
        targetUser: {
          uid: 'all_non_admin_staff',
          name: `${nonAdminUsers.length} Staff Account(s)`,
          username: 'staff_batch',
          roleId: 'staff'
        },
        performedBy: currentUser,
        details: `Verified Admin PIN and reset ${nonAdminUsers.length} non-admin staff account(s), retaining master Admin account.`
      });

      setResetStaffModalOpen(false);
      setResetStaffPin('');
      setResetStaffConfirmed(false);
      setNotification({
        type: 'success',
        message: `Staff data reset verified by Admin PIN (${nonAdminUsers.length} non-admin account(s) cleared).`
      });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsResettingStaff(false);
    }
  };

  // Enforce Admin-only access to the Admin User Registration, Access Control & Activity Log page
  if (!isOwner) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full bg-slate-100 p-6 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="font-black text-base text-slate-900 uppercase">
            Admin Account Required
          </h2>
          <p className="text-xs text-slate-600 mt-1.5">
            Full access control, registering new users, and viewing security activity logs can only be performed by the Admin account.
          </p>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = u.name.toLowerCase().includes(q);
    const userMatch = (u.username || '').toLowerCase().includes(q);
    const roleMatch = (u.roleId || '').toLowerCase().includes(q);
    return nameMatch || userMatch || roleMatch;
  });

  const filteredActivityLogs = activityLogs.filter((log) => {
    const matchesAction =
      activityActionFilter === 'All' || log.action === activityActionFilter;
    if (!matchesAction) return false;
    if (!activitySearchQuery.trim()) return true;
    const q = activitySearchQuery.toLowerCase();
    return (
      log.targetUserName.toLowerCase().includes(q) ||
      log.targetUsername.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q) ||
      log.performedByName.toLowerCase().includes(q)
    );
  });

  const getActionBadgeStyle = (action: string) => {
    switch (action) {
      case 'User Registered':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Role Updated':
        return 'bg-amber-50 text-amber-900 border-amber-200';
      case 'Access Updated':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'PIN Updated':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'Status Changed':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'User Deleted':
      case 'Staff Reset':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const activeCount = users.filter((u) => u.active !== false).length;
  const waiterCount = users.filter((u) => u.roleId?.toLowerCase() === 'waiter' && !u.fullAccess).length;
  const managerCount = users.filter((u) => u.roleId?.toLowerCase() === 'manager' && !u.fullAccess).length;
  const adminCount = users.filter(
    (u) => u.roleId?.toLowerCase() === 'admin' || u.roleId?.toLowerCase() === 'owner' || Boolean(u.fullAccess)
  ).length;

  return (
    <div className="flex flex-col min-h-full bg-slate-100/90 text-slate-800 p-2 sm:p-4 gap-3 sm:gap-4 overflow-y-auto pb-24 md:pb-6 font-sans">
      {/* 1. Admin Page Header Bar */}
      <div className="flex flex-wrap items-center justify-between bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-3 gap-3 shadow-xs shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shadow-2xs shrink-0">
            <ShieldCheck className="w-4 h-4 text-white stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-sm sm:text-base tracking-tight text-slate-900 uppercase leading-none">
                Admin Page — User Registration & Access Control
              </h2>
              <span className="hidden sm:inline-block text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                Admin Controlled
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Register new users with Username & PIN, manage roles, and audit security activity logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openResetStaffModal}
            className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Reset all non-admin staff data (Requires Confirmation & Admin PIN)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Staff Data</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 sm:px-4 py-1.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New User</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs animate-in fade-in shrink-0 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 2. Top Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 shrink-0">
        <div className="bg-white border border-slate-200 p-2.5 sm:p-3 rounded-xl shadow-2xs flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Users</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">{users.length}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{activeCount} active accounts</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-2.5 sm:p-3 rounded-xl shadow-2xs flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Admin (Full Access)</div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">{adminCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Master system control</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
            <Crown className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-2.5 sm:p-3 rounded-xl shadow-2xs flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Managers</div>
            <div className="text-xl sm:text-2xl font-black text-blue-600 mt-0.5">{managerCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Billing & operations</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-2.5 sm:p-3 rounded-xl shadow-2xs flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Waiters / Staff</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">{waiterCount}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">KOT & table service</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Filter & View Switcher Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search user by name, @username, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] font-bold text-slate-400 mr-1 hidden sm:inline">View:</span>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Cards</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
              viewMode === 'table'
                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      {/* 4. Registered Users Grid / Table */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-xs">
          No users match search query "{searchQuery}".
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredUsers.map((u) => {
            const roleLower = u.roleId?.toLowerCase() || 'waiter';
            const isUserAdmin = roleLower === 'admin' || roleLower === 'owner' || Boolean(u.fullAccess);
            const isPrimaryAdmin = u.username?.toLowerCase() === 'admin' || u.uid === 'user_admin';
            const roleBadgeStyle = isUserAdmin
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : roleLower === 'manager'
              ? 'bg-blue-100 text-blue-900 border-blue-300'
              : 'bg-emerald-100 text-emerald-900 border-emerald-300';

            const userPerms = isUserAdmin
              ? DEFAULT_PERMISSIONS.ADMIN
              : Array.isArray(u.permissions)
              ? u.permissions
              : getPermissionsForRole(roleLower);

            const enabledModules = ACCESS_MODULES.filter((m) =>
              isUserAdmin ? true : m.permissions.some((p) => userPerms.includes(p))
            );

            const RoleIcon = isUserAdmin
              ? Crown
              : roleLower === 'manager'
              ? Briefcase
              : UtensilsCrossed;

            return (
              <div
                key={u.uid}
                className={`bg-white border rounded-xl p-3.5 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-shadow ${
                  u.active === false ? 'border-slate-200 opacity-60 bg-slate-50' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl font-black text-sm flex items-center justify-center shrink-0 ${
                          isUserAdmin
                            ? 'bg-amber-500 text-white'
                            : roleLower === 'manager'
                            ? 'bg-blue-500 text-white'
                            : 'bg-emerald-500 text-white'
                        }`}
                        title={`Role: ${isUserAdmin ? 'Admin' : roleLower}`}
                      >
                        <RoleIcon className="w-4 h-4 stroke-[2.25]" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-sm text-slate-900 truncate">{u.name}</h4>
                        <div className="text-[11px] font-mono text-amber-700 font-bold truncate">
                          @{u.username || u.uid.replace('user_', '')}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider shrink-0 ${roleBadgeStyle}`}
                    >
                      <RoleIcon className="w-3 h-3 shrink-0" />
                      <span>{isUserAdmin ? 'ADMIN (FULL ACCESS)' : roleLower}</span>
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                        <Key className="w-3 h-3 text-slate-400" /> Login PIN:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                          ••••
                        </span>
                        <button
                          type="button"
                          onClick={() => openChangePinModal(u)}
                          className="text-[10px] text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
                        >
                          Change PIN
                        </button>
                      </div>
                    </div>

                    {/* Access Control Summary */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1">
                        <span>Access Level:</span>
                        <span className="font-bold text-slate-700">
                          {isUserAdmin ? 'Full System Access' : `${enabledModules.length} Modules`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {isUserAdmin ? (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                            All Screens & Admin Controls
                          </span>
                        ) : (
                          enabledModules.slice(0, 5).map((mod) => (
                            <span
                              key={mod.id}
                              className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                            >
                              {mod.label}
                            </span>
                          ))
                        )}
                        {!isUserAdmin && enabledModules.length > 5 && (
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            +{enabledModules.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400 font-medium">Status:</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.active !== false
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {u.active !== false ? '● Active' : '○ Disabled'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end gap-1.5">
                  {!isPrimaryAdmin && (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u.uid, u.active !== false)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        u.active !== false
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {u.active !== false ? 'Disable' : 'Enable'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditModal(u)}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit & Access</span>
                  </button>

                  {!isPrimaryAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                      title="Delete User"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">User Name</th>
                  <th className="py-2.5 px-3">Username & PIN</th>
                  <th className="py-2.5 px-3">Role & Access Level</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const roleLower = u.roleId?.toLowerCase() || 'waiter';
                  const isUserAdmin =
                    roleLower === 'admin' || roleLower === 'owner' || Boolean(u.fullAccess);
                  const isPrimaryAdmin =
                    u.username?.toLowerCase() === 'admin' || u.uid === 'user_admin';
                  const roleBadgeStyle = isUserAdmin
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : roleLower === 'manager'
                    ? 'bg-blue-100 text-blue-900 border-blue-300'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300';

                  const RoleIcon = isUserAdmin
                    ? Crown
                    : roleLower === 'manager'
                    ? Briefcase
                    : UtensilsCrossed;

                  return (
                    <tr key={u.uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              isUserAdmin
                                ? 'bg-amber-500 text-white'
                                : roleLower === 'manager'
                                ? 'bg-blue-500 text-white'
                                : 'bg-emerald-500 text-white'
                            }`}
                          >
                            <RoleIcon className="w-3.5 h-3.5" />
                          </div>
                          <div className="font-extrabold text-slate-900">{u.name}</div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <div className="text-amber-800 font-bold">
                          @{u.username || u.uid.replace('user_', '')}
                        </div>
                        <div className="text-[11px] text-slate-600">
                          PIN:{' '}
                          <span className="font-bold text-slate-900 bg-slate-100 px-1 rounded">
                            ••••
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border tracking-wider ${roleBadgeStyle}`}
                        >
                          <RoleIcon className="w-3 h-3 shrink-0" />
                          <span>{isUserAdmin ? 'ADMIN (FULL ACCESS)' : roleLower}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            u.active !== false
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {u.active !== false ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(u)}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[11px] font-bold cursor-pointer"
                          >
                            Edit & Access
                          </button>
                          {!isPrimaryAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(u.uid, u.active !== false)}
                                className="text-[11px] text-slate-500 hover:text-slate-800 underline px-1 cursor-pointer"
                              >
                                {u.active !== false ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Admin-Only Security & User Management Activity Log (Firestore: user_activity_logs) */}
      <div
        id="admin-user-activity-log-section"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs shrink-0"
      >
        <div className="p-3 sm:p-4 bg-slate-950 text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-xs sm:text-sm uppercase tracking-wider text-white">
                  Security & User Management Activity Log
                </h3>
                <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                  Admin Only • user_activity_logs
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Real-time Firestore audit trail of User Registered, Role Updated, PIN Updated, and access changes
              </p>
            </div>
          </div>

          <div className="relative min-w-[200px] sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Filter logs by user or action..."
              value={activitySearchQuery}
              onChange={(e) => setActivitySearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Action Filter Pills */}
        <div className="px-3 sm:px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {ACTIVITY_FILTER_OPTIONS.map((filterName) => {
            const active = activityActionFilter === filterName;
            return (
              <button
                key={filterName}
                type="button"
                onClick={() => setActivityActionFilter(filterName)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                  active
                    ? 'bg-slate-900 text-amber-400 border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {filterName}
              </button>
            );
          })}
          <span className="ml-auto text-[11px] font-mono font-semibold text-slate-400 pl-2 shrink-0">
            {filteredActivityLogs.length} event{filteredActivityLogs.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Activity Log Entries */}
        {filteredActivityLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No user management activity logs recorded yet. Actions like registering a user or updating roles will appear here in real time.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {filteredActivityLogs.map((log) => {
              const formattedTime = new Date(log.timestamp).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
              });

              return (
                <div
                  key={log.id}
                  className="px-3 sm:px-4 py-2.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border tracking-wider shrink-0 mt-0.5 ${getActionBadgeStyle(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-extrabold text-slate-900">
                          {log.targetUserName}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-amber-700">
                          @{log.targetUsername}
                        </span>
                        {log.previousValue && log.newValue && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            <span>{log.previousValue}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                            <span className="text-slate-900">{log.newValue}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">{log.details}</p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 text-[10px] text-slate-400 font-mono gap-1">
                    <span className="text-slate-600 font-semibold">
                      By: {log.performedByName} (@{log.performedByUsername})
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formattedTime}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Register / Edit User & Admin Access Control */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 my-auto">
            <div className="p-4 bg-slate-950 text-white border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  {editingUser ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">
                    {editingUser ? `Edit User & Access: ${editingUser.name}` : 'Register New User (Admin Only)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Set Username, PIN, and screen access permissions
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-4 sm:p-5 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  FULL NAME <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    LOGIN USERNAME <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono">@</span>
                    <input
                      type="text"
                      required
                      placeholder="ramesh"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    LOGIN PIN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    placeholder="••••"
                    value={formData.pin}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pin: e.target.value.replace(/[^0-9]/g, '')
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono text-center tracking-widest text-base font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Role & Full Access Toggle */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ROLE PRESET
                  </label>
                  <select
                    value={formData.roleId}
                    onChange={(e) => handleRoleChangeInForm(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-none focus:border-amber-500 focus:bg-white cursor-pointer"
                  >
                    <option value="waiter">Waiter / Staff (KOT & Billing)</option>
                    <option value="manager">Manager (Operations & Reports)</option>
                    <option value="admin">Admin (Full System Access)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-amber-300 bg-amber-50/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.fullAccess}
                      onChange={(e) => handleToggleFullAccessInForm(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-extrabold text-amber-950 leading-tight">
                        Full System Access
                      </div>
                      <div className="text-[10px] text-amber-800">
                        Unrestricted Admin control
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Granular Module Access Control (Controlled by Admin) */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    Allowed Screens & Access Permissions
                  </span>
                  {formData.fullAccess && (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      All Unlocked (Admin)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ACCESS_MODULES.map((mod) => {
                    const checked = isModuleEnabledInForm(mod);
                    return (
                      <label
                        key={mod.id}
                        className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-colors ${
                          checked
                            ? 'bg-white border-emerald-300 text-slate-900'
                            : 'bg-slate-100/70 border-slate-200 text-slate-500'
                        } ${formData.fullAccess ? 'opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={formData.fullAccess}
                          onChange={() => handleToggleModuleInForm(mod)}
                          className="mt-0.5 w-3.5 h-3.5 rounded text-emerald-600"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-[11px] leading-tight">{mod.label}</div>
                          <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                            {mod.description}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-active-checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="user-active-checkbox" className="font-bold text-slate-700 cursor-pointer">
                  Account is active and allowed to login with Username & PIN
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingUser ? 'Save Access & Changes' : 'Register User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Quick Change PIN */}
      {pinModalOpen && targetPinUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-extrabold text-sm text-slate-900">Change PIN: {targetPinUser.name}</h3>
              <button onClick={() => setPinModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdatePin} className="p-4 space-y-3 text-xs">
              <p className="text-slate-500 text-[11px]">
                Enter a new numeric PIN for <b className="text-slate-800">@{targetPinUser.username || targetPinUser.name}</b>.
              </p>

              <div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="••••"
                  value={newPinValue}
                  onChange={(e) => setNewPinValue(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 text-center font-mono text-xl font-bold tracking-widest text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPinModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg"
                >
                  Update PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reset Staff Data Confirmation & Admin PIN Verification */}
      {resetStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 my-auto">
            <div className="p-4 bg-red-950 text-white border-b border-red-900 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-400/40 text-red-300 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white leading-tight">
                    Reset Staff Data
                  </h3>
                  <p className="text-[11px] text-red-200">
                    Admin Confirmation & PIN Required
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetStaffModalOpen(false)}
                className="text-red-300 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetStaff} className="p-4 sm:p-5 space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-1">
                <div className="font-extrabold flex items-center gap-1.5 text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Permanent Staff Reset Warning</span>
                </div>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  This action will permanently remove{' '}
                  <b className="font-black">
                    {users.filter((u) => u.username?.toLowerCase() !== 'admin' && u.uid !== 'user_admin').length}{' '}
                    registered staff account(s)
                  </b>{' '}
                  and their login access. The primary <b>@admin</b> account will be retained.
                </p>
              </div>

              {resetStaffError && (
                <div className="p-2.5 rounded-xl bg-red-100 border border-red-300 text-red-800 font-bold text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{resetStaffError}</span>
                </div>
              )}

              {/* Step 1: Confirmation Checkbox */}
              <label
                htmlFor="confirm-reset-staff-checkbox"
                className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors"
              >
                <input
                  id="confirm-reset-staff-checkbox"
                  type="checkbox"
                  checked={resetStaffConfirmed}
                  onChange={(e) => {
                    setResetStaffConfirmed(e.target.checked);
                    setResetStaffError(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded text-red-600 focus:ring-red-500"
                />
                <span className="font-bold text-slate-800 leading-snug text-[11px]">
                  I confirm that I want to permanently clear all non-admin staff data.
                </span>
              </label>

              {/* Step 2: Admin PIN Verification */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="reset-staff-admin-pin"
                    className="block font-extrabold text-slate-700 uppercase tracking-wider text-[11px]"
                  >
                    ENTER ADMIN PIN TO CONFIRM <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2, 3].map((idx) => (
                      <span
                        key={idx}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          resetStaffPin.length > idx ? 'bg-red-600' : 'bg-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    id="reset-staff-admin-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    autoFocus
                    placeholder="••••"
                    value={resetStaffPin}
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onChange={(e) => {
                      setResetStaffPin(e.target.value.replace(/[^0-9]/g, ''));
                      setResetStaffError(null);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-2 text-center font-mono text-lg font-bold tracking-[0.4em] text-slate-900 focus:outline-none focus:border-red-500 focus:bg-white select-none"
                  />
                </div>
              </div>

              {/* Compact Numeric Keypad for PIN */}
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => {
                      if (resetStaffPin.length < 6) {
                        setResetStaffPin((prev) => prev + digit);
                        setResetStaffError(null);
                      }
                    }}
                    className="h-9 bg-slate-100 hover:bg-slate-200 active:bg-red-600 active:text-white rounded-lg font-mono text-sm font-bold text-slate-800 transition-colors cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setResetStaffPin('');
                    setResetStaffError(null);
                  }}
                  className="h-9 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (resetStaffPin.length < 6) {
                      setResetStaffPin((prev) => prev + '0');
                      setResetStaffError(null);
                    }
                  }}
                  className="h-9 bg-slate-100 hover:bg-slate-200 active:bg-red-600 active:text-white rounded-lg font-mono text-sm font-bold text-slate-800 transition-colors cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetStaffPin((prev) => prev.slice(0, -1));
                    setResetStaffError(null);
                  }}
                  className="h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                >
                  ⌫
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setResetStaffModalOpen(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingStaff}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isResettingStaff ? 'Resetting...' : 'Confirm & Reset Staff'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Staff User Deletion */}
      <DeleteConfirmationModal
        isOpen={deleteModalConfig.isOpen}
        onClose={() => setDeleteModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModalConfig.onConfirm}
        title={deleteModalConfig.title}
        itemName={deleteModalConfig.itemName}
        itemSubtitle={deleteModalConfig.itemSubtitle}
        description={deleteModalConfig.description}
        warningNote={deleteModalConfig.warningNote}
        confirmButtonText={deleteModalConfig.confirmButtonText}
        isDeleting={isDeletingUser}
      />
    </div>
  );
};
