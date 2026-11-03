import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { AppUser, Role, UserRole } from '../types';
import { DEFAULT_RESTAURANT_LOGO } from '../data/defaultLogo';
import { OFFICIAL_LOGO_STORAGE_PATH, OFFICIAL_LOGO_STORAGE_URL } from '../services/brandLogoService';
import {
  checkAccountLockout,
  clearFailedPinAttempts,
  hashPin,
  purgePersistedLoginSession,
  recordFailedPinAttempt,
  recordSecurityAuditLog,
  sanitizeUserForStorage,
  verifyUserPin
} from '../services/securityService';

export const DEFAULT_PERMISSIONS = {
  ADMIN: [
    'dashboard.view',
    'pos.view',
    'direct-billing.view',
    'kot.create',
    'kot.edit',
    'kot.delete',
    'kot.view',
    'billing.create',
    'billing.print',
    'billing.reprint',
    'billing.cancel',
    'menu.view',
    'menu.create',
    'menu.edit',
    'menu.price',
    'inventory.view',
    'inventory.edit',
    'reports.view',
    'reports.financial',
    'reports.backup',
    'users.manage',
    'settings.manage',
    'security.manage'
  ],
  OWNER: [
    'dashboard.view',
    'pos.view',
    'direct-billing.view',
    'kot.create',
    'kot.edit',
    'kot.delete',
    'kot.view',
    'billing.create',
    'billing.print',
    'billing.reprint',
    'billing.cancel',
    'menu.view',
    'menu.create',
    'menu.edit',
    'menu.price',
    'inventory.view',
    'inventory.edit',
    'reports.view',
    'reports.financial',
    'reports.backup',
    'users.manage',
    'settings.manage',
    'security.manage'
  ],
  MANAGER: [
    'dashboard.view',
    'pos.view',
    'direct-billing.view',
    'kot.create',
    'kot.edit',
    'kot.delete',
    'kot.view',
    'billing.create',
    'billing.print',
    'billing.reprint',
    'billing.cancel',
    'menu.view',
    'menu.create',
    'menu.edit',
    'menu.price',
    'inventory.view',
    'reports.view',
    'reports.financial',
    'reports.backup'
  ],
  WAITER: [
    'kot.create',
    'kot.edit',
    'kot.view',
    'billing.create',
    'billing.print'
  ]
};

interface AuthContextType {
  currentUser: AppUser | null;
  firebaseUser: FirebaseUser | null;
  currentRole: Role | null;
  loading: boolean;
  isOnline: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string, roleId: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string, roleId: string) => Promise<void>;
  loginWithUsernameAndPin: (username: string, pin: string) => Promise<AppUser>;
  registerWithUsernameAndPin: (
    username: string,
    pin: string,
    name: string,
    roleId: string,
    options?: { fullAccess?: boolean; permissions?: string[] }
  ) => Promise<AppUser>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
  hasPermission: (perm: string) => boolean;
  isOwner: boolean;
  isManager: boolean;
  isWaiter: boolean;
  bootstrapSystem: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  // Requirement 1: Mandatory login every time the application opens or restarts.
  // currentUser always starts as null and is never restored from browser storage.
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isExplicitSessionAuthRef = useRef<boolean>(false);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Requirement 1: Purge any saved login session / plain-text PINs on startup
  // and automatically log out when the application is closed or restarted.
  useEffect(() => {
    purgePersistedLoginSession();

    const handleAppCloseLogout = () => {
      isExplicitSessionAuthRef.current = false;
      purgePersistedLoginSession();
    };

    window.addEventListener('beforeunload', handleAppCloseLogout);
    window.addEventListener('pagehide', handleAppCloseLogout);

    return () => {
      window.removeEventListener('beforeunload', handleAppCloseLogout);
      window.removeEventListener('pagehide', handleAppCloseLogout);
    };
  }, []);

  // Monitor Firebase Auth state (only apply if user explicitly authenticated in this session)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser && isExplicitSessionAuthRef.current) {
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = sanitizeUserForStorage(userDocSnap.data() as AppUser);
            setCurrentUser(userData);
            await loadRole(userData.roleId);
          } else {
            const defaultUser: AppUser = {
              uid: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
              email: fbUser.email || '',
              roleId: 'owner',
              active: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              lastLoginAt: Date.now()
            };
            await setDoc(userDocRef, defaultUser);
            setCurrentUser(defaultUser);
            await loadRole('owner');
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          const fallbackUser: AppUser = {
            uid: fbUser.uid,
            name: fbUser.email?.split('@')[0] || 'Admin Owner',
            email: fbUser.email || '',
            roleId: 'owner',
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          setCurrentUser(fallbackUser);
          await loadRole('owner');
        }
      } else if (!isExplicitSessionAuthRef.current) {
        // Do NOT auto-login from saved credentials or previous sessions
        setCurrentUser(null);
        setCurrentRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const applyDemoUser = (role: UserRole) => {
    const rawLower = role.toLowerCase();
    const lowerRole = (rawLower === 'admin' || rawLower === 'owner') ? 'owner' : rawLower as 'manager' | 'waiter';
    const names = {
      owner: 'Owner',
      manager: 'Store Manager',
      waiter: 'Floor Waiter'
    };

    const demoUser: AppUser = {
      uid: `user_${lowerRole}`,
      username: lowerRole,
      name: names[lowerRole] || 'Owner',
      email: `${lowerRole}@hotelpos.local`,
      roleId: lowerRole,
      fullAccess: lowerRole === 'owner',
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    isExplicitSessionAuthRef.current = true;
    setCurrentUser(demoUser);
    setCurrentRole({
      id: lowerRole,
      name: lowerRole.toUpperCase(),
      permissions: DEFAULT_PERMISSIONS[lowerRole.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] || DEFAULT_PERMISSIONS.OWNER,
      active: true
    });
  };

  const loadRole = async (roleId: string) => {
    const normRoleId = roleId.toLowerCase();
    try {
      const roleRef = doc(db, 'roles', normRoleId);
      const roleSnap = await getDoc(roleRef);
      if (roleSnap.exists()) {
        setCurrentRole(roleSnap.data() as Role);
      } else {
        const perms = DEFAULT_PERMISSIONS[normRoleId.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] || DEFAULT_PERMISSIONS.OWNER;
        const newRole: Role = {
          id: normRoleId,
          name: normRoleId.toUpperCase(),
          permissions: perms,
          active: true
        };
        await setDoc(roleRef, newRole);
        setCurrentRole(newRole);
      }
    } catch (e) {
      setCurrentRole({
        id: normRoleId,
        name: normRoleId.toUpperCase(),
        permissions: DEFAULT_PERMISSIONS[normRoleId.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] || [],
        active: true
      });
    }
  };

  const login = async (email: string, pass: string) => {
    setLoading(true);
    try {
      isExplicitSessionAuthRef.current = true;
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      isExplicitSessionAuthRef.current = false;
      setLoading(false);
      throw err;
    }
  };

  const register = async (email: string, pass: string, name: string, roleId: string) => {
    setLoading(true);
    try {
      isExplicitSessionAuthRef.current = true;
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      const newUser: AppUser = {
        uid: res.user.uid,
        name,
        email,
        roleId: roleId.toLowerCase(),
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastLoginAt: Date.now()
      };
      await setDoc(doc(db, 'users', res.user.uid), newUser);
      setCurrentUser(newUser);
      await loadRole(roleId);
    } catch (err: any) {
      isExplicitSessionAuthRef.current = false;
      setLoading(false);
      throw err;
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      isExplicitSessionAuthRef.current = true;
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      const userRef = doc(db, 'users', res.user.uid);
      try {
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const uData = sanitizeUserForStorage(snap.data() as AppUser);
          setCurrentUser(uData);
          await loadRole(uData.roleId || 'owner');
        } else {
          const newUser: AppUser = {
            uid: res.user.uid,
            name: res.user.displayName || res.user.email?.split('@')[0] || 'Staff Member',
            email: res.user.email || '',
            roleId: 'owner',
            active: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            lastLoginAt: Date.now()
          };
          try {
            await setDoc(userRef, newUser);
          } catch (e) {
            console.warn('Google user doc save notice:', e);
          }
          setCurrentUser(newUser);
          await loadRole('owner');
        }
      } catch (e) {
        console.warn('Google user fetch notice:', e);
        const fallbackUser: AppUser = {
          uid: res.user.uid,
          name: res.user.displayName || res.user.email?.split('@')[0] || 'Admin Owner',
          email: res.user.email || '',
          roleId: 'owner',
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        setCurrentUser(fallbackUser);
        await loadRole('owner');
      }
    } catch (err: any) {
      isExplicitSessionAuthRef.current = false;
      setLoading(false);
      throw err;
    }
  };

  const getKnownStaffList = async (): Promise<AppUser[]> => {
    let deletedIds: string[] = [];
    try {
      const rawDeleted = localStorage.getItem('pos_deleted_user_ids');
      if (rawDeleted) deletedIds = JSON.parse(rawDeleted);
    } catch (e) {}

    const localList: AppUser[] = [];
    try {
      const raw = localStorage.getItem('pos_local_users');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          localList.push(
            ...parsed
              .filter((u: any) => !u.deleted && !deletedIds.includes(u.uid))
              .map((u: AppUser) => sanitizeUserForStorage(u))
          );
        }
      }
    } catch (e) {}

    // Default staff accounts store only cryptographic pinHash (never plain-text PIN)
    const defaultStaff: AppUser[] = [
      {
        uid: 'user_admin',
        username: 'admin',
        pinHash: hashPin('1234', 'admin'),
        name: 'Owner (Admin)',
        email: 'admin@hotelpos.local',
        roleId: 'owner',
        fullAccess: true,
        permissions: DEFAULT_PERMISSIONS.OWNER,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        uid: 'user_owner',
        username: 'owner',
        pinHash: hashPin('1234', 'owner'),
        name: 'Restaurant Owner',
        email: 'owner@hotelpos.local',
        roleId: 'owner',
        fullAccess: true,
        permissions: DEFAULT_PERMISSIONS.OWNER,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        uid: 'user_manager',
        username: 'manager',
        pinHash: hashPin('5678', 'manager'),
        name: 'Store Manager',
        email: 'manager@hotelpos.local',
        roleId: 'manager',
        fullAccess: false,
        permissions: DEFAULT_PERMISSIONS.MANAGER,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        uid: 'user_store_manager',
        username: 'storemanager',
        pinHash: hashPin('5678', 'storemanager'),
        name: 'Store Manager',
        email: 'storemanager@hotelpos.local',
        roleId: 'manager',
        fullAccess: false,
        permissions: DEFAULT_PERMISSIONS.MANAGER,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        uid: 'user_cashier',
        username: 'cashier',
        pinHash: hashPin('1111', 'cashier'),
        name: 'Counter Cashier',
        email: 'cashier@hotelpos.local',
        roleId: 'manager',
        fullAccess: false,
        permissions: DEFAULT_PERMISSIONS.MANAGER,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        uid: 'user_waiter',
        username: 'waiter',
        pinHash: hashPin('0000', 'waiter'),
        name: 'Floor Waiter',
        email: 'waiter@hotelpos.local',
        roleId: 'waiter',
        fullAccess: false,
        permissions: DEFAULT_PERMISSIONS.WAITER,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ].filter((u) => !deletedIds.includes(u.uid));

    try {
      const snap = await getDocs(collection(db, 'users'));
      const firestoreUsers: AppUser[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (!data.deleted && !deletedIds.includes(d.id)) {
          firestoreUsers.push(sanitizeUserForStorage({ uid: d.id, ...data } as AppUser));
        }
      });
      if (firestoreUsers.length > 0) {
        const map = new Map<string, AppUser>();
        [...defaultStaff, ...localList, ...firestoreUsers].forEach((u) => {
          if (u.username) map.set(u.username.toLowerCase(), u);
          else if (u.uid) map.set(u.uid.toLowerCase(), u);
        });
        return Array.from(map.values());
      }
    } catch (e) {
      // Offline fallback
    }

    const map = new Map<string, AppUser>();
    [...defaultStaff, ...localList].forEach((u) => {
      if (u.username) map.set(u.username.toLowerCase(), u);
      else if (u.uid) map.set(u.uid.toLowerCase(), u);
    });
    return Array.from(map.values());
  };

  const loginWithUsernameAndPin = async (username: string, pin: string): Promise<AppUser> => {
    setLoading(true);
    try {
      const cleanUser = username.trim().toLowerCase();
      const cleanPin = pin.trim();

      if (!cleanUser || !cleanPin) {
        throw new Error('Username and PIN are both mandatory to log in.');
      }

      // Check rate limiting & temporary account lockout
      const lockoutStatus = checkAccountLockout(cleanUser);
      if (lockoutStatus.isLocked) {
        const mins = Math.ceil(lockoutStatus.remainingSeconds / 60);
        throw new Error(
          `Account "@${cleanUser}" is temporarily locked due to repeated incorrect PIN attempts. Please try again in ${mins} minute(s) (${lockoutStatus.remainingSeconds}s).`
        );
      }

      const allStaff = await getKnownStaffList();
      const userRecord = allStaff.find(
        (u) =>
          u.username?.toLowerCase() === cleanUser ||
          u.email?.toLowerCase().startsWith(`${cleanUser}@`)
      );

      if (!userRecord) {
        const failState = await recordFailedPinAttempt(cleanUser);
        if (failState.isLocked) {
          throw new Error(
            `Too many failed login attempts. Account "@${cleanUser}" is temporarily locked for 5 minutes.`
          );
        }
        throw new Error(
          `Invalid username or PIN. (${failState.remainingAttempts} attempt(s) remaining before temporary lockout)`
        );
      }

      const isPinValid =
        verifyUserPin(cleanPin, userRecord) ||
        (!userRecord.pinHash && !userRecord.pin && cleanPin === '1234');

      if (!isPinValid) {
        const failState = await recordFailedPinAttempt(cleanUser);
        if (failState.isLocked) {
          throw new Error(
            `Account "@${cleanUser}" has been temporarily locked for 5 minutes after 5 incorrect PIN attempts.`
          );
        }
        throw new Error(
          `Invalid username or PIN. (${failState.remainingAttempts} attempt(s) remaining before temporary lockout)`
        );
      }

      if (userRecord.active === false) {
        throw new Error('This staff account is currently inactive. Please contact the Owner.');
      }

      await clearFailedPinAttempts(cleanUser);

      // Sanitize user so plain-text PIN is never stored in memory, localStorage, or Firestore
      const updatedUser: AppUser = sanitizeUserForStorage(
        {
          ...userRecord,
          lastLoginAt: Date.now(),
          updatedAt: Date.now()
        },
        cleanPin
      );

      try {
        await setDoc(doc(db, 'users', updatedUser.uid), updatedUser, { merge: true });
      } catch (e) {}

      // Requirement 1: Never persist login session or PINs in localStorage/sessionStorage
      purgePersistedLoginSession();
      isExplicitSessionAuthRef.current = true;
      setCurrentUser(updatedUser);
      await loadRole(updatedUser.roleId);

      await recordSecurityAuditLog({
        eventType: 'LOGIN_SUCCESS',
        username: updatedUser.username || cleanUser,
        userId: updatedUser.uid,
        role: updatedUser.roleId,
        status: 'SUCCESS',
        details: `Authenticated login by "${updatedUser.name}" (@${updatedUser.username || cleanUser}) with role ${updatedUser.roleId.toUpperCase()}.`
      });

      return updatedUser;
    } finally {
      setLoading(false);
    }
  };

  const registerWithUsernameAndPin = async (
    username: string,
    pin: string,
    name: string,
    roleId: string,
    options?: { fullAccess?: boolean; permissions?: string[] }
  ): Promise<AppUser> => {
    const callerRole = currentUser?.roleId?.toLowerCase();
    const callerIsOwner =
      callerRole === 'admin' || callerRole === 'owner' || Boolean(currentUser?.fullAccess);
    if (!callerIsOwner) {
      await recordSecurityAuditLog({
        eventType: 'UNAUTHORIZED_ACCESS_BLOCKED',
        username: currentUser?.username || 'unknown',
        userId: currentUser?.uid,
        role: currentUser?.roleId,
        status: 'BLOCKED',
        details: 'Non-owner attempted to register a new staff user.'
      });
      throw new Error('Only the Owner account can register new users or manage security settings.');
    }

    setLoading(true);
    try {
      const cleanUser = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      const cleanPin = pin.trim();
      const cleanName = name.trim() || cleanUser;

      if (!cleanUser || cleanUser.length < 2) {
        throw new Error('Username must be at least 2 alphanumeric characters.');
      }
      if (!cleanPin || cleanPin.length < 4) {
        throw new Error('PIN must be at least 4 digits.');
      }

      const allStaff = await getKnownStaffList();
      const existing = allStaff.find((u) => u.username?.toLowerCase() === cleanUser);
      if (existing) {
        throw new Error(`Username "${cleanUser}" is already taken. Please choose another.`);
      }

      const normRole = roleId.toLowerCase();
      const isNewUserOwner =
        options?.fullAccess !== undefined
          ? options.fullAccess
          : normRole === 'admin' || normRole === 'owner';
      const defaultPerms =
        options?.permissions ||
        DEFAULT_PERMISSIONS[normRole.toUpperCase() as keyof typeof DEFAULT_PERMISSIONS] ||
        DEFAULT_PERMISSIONS.WAITER;

      // Filter out owner-only permissions if the user is not an Owner
      const sanitizedPermissions = isNewUserOwner
        ? DEFAULT_PERMISSIONS.OWNER
        : defaultPerms.filter(
            (p) => p !== 'users.manage' && p !== 'settings.manage' && p !== 'security.manage'
          );

      const newUser: AppUser = sanitizeUserForStorage(
        {
          uid: `user_${cleanUser}`,
          username: cleanUser,
          pinHash: hashPin(cleanPin, cleanUser),
          name: cleanName,
          email: `${cleanUser}@hotelpos.local`,
          roleId: normRole,
          fullAccess: isNewUserOwner,
          permissions: sanitizedPermissions,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        cleanPin
      );

      try {
        await setDoc(doc(db, 'users', newUser.uid), newUser);
      } catch (e) {
        console.warn('Firestore user registration notice (saving locally):', e);
      }

      const currentLocals = allStaff
        .filter((u) => u.uid !== newUser.uid)
        .map((u) => sanitizeUserForStorage(u));
      localStorage.setItem('pos_local_users', JSON.stringify([...currentLocals, newUser]));
      return newUser;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    const prevUser = currentUser;
    isExplicitSessionAuthRef.current = false;
    purgePersistedLoginSession();
    setCurrentUser(null);
    setCurrentRole(null);

    if (prevUser) {
      await recordSecurityAuditLog({
        eventType: 'LOGOUT',
        username: prevUser.username || prevUser.name || prevUser.uid,
        userId: prevUser.uid,
        role: prevUser.roleId,
        status: 'SUCCESS',
        details: `User "${prevUser.name}" (@${prevUser.username || prevUser.uid}) logged out securely.`
      });
    }

    if (firebaseUser) {
      try {
        await fbSignOut(auth);
      } catch {}
    }
  };

  // Requirement 7: Automatically lock the application after inactivity
  useEffect(() => {
    if (!currentUser) return;

    const getTimeoutMs = (): number => {
      try {
        const storedMins = Number(localStorage.getItem('pos_inactivity_timeout_mins'));
        if (!isNaN(storedMins) && storedMins >= 1 && storedMins <= 240) {
          return storedMins * 60 * 1000;
        }
      } catch {}
      return 15 * 60 * 1000; // Default 15 minutes
    };

    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        logout();
      }, getTimeoutMs());
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      events.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [currentUser?.uid]);

  const switchDemoRole = (role: UserRole) => {
    applyDemoUser(role);
  };

  const isOwner =
    currentUser?.roleId?.toLowerCase() === 'owner' ||
    currentUser?.roleId?.toLowerCase() === 'admin' ||
    Boolean(currentUser?.fullAccess);
  const isManager =
    currentUser?.roleId?.toLowerCase() === 'manager' ||
    currentUser?.roleId?.toLowerCase() === 'store_manager' ||
    isOwner;
  const isWaiter = currentUser?.roleId?.toLowerCase() === 'waiter' && !isOwner;

  const hasPermission = (perm: string): boolean => {
    if (!currentUser || currentUser.active === false) return false;
    if (isOwner) return true; // Owner account has full unrestricted access

    // Store Manager and non-owners never have access to Owner-only user management or security settings
    if (
      perm === 'users.manage' ||
      perm === 'settings.manage' ||
      perm === 'security.manage'
    ) {
      return false;
    }

    if (Array.isArray(currentUser.permissions)) {
      if (currentUser.permissions.includes('all') || currentUser.permissions.includes(perm)) {
        return true;
      }
      return false;
    }
    if (!currentRole) return false;
    return currentRole.permissions.includes(perm);
  };

  /**
   * Initializes initial standard restaurant data (Categories, Menu items with codes, settings)
   */
  const bootstrapSystem = async () => {
    try {
      // 1. Roles
      for (const [rKey, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
        await setDoc(doc(db, 'roles', rKey.toLowerCase()), {
          id: rKey.toLowerCase(),
          name: rKey,
          permissions: perms,
          active: true
        });
      }

      // 2. Settings
      await setDoc(doc(db, 'settings', 'restaurant'), {
        restaurantName: 'SRI SARAVANA BHAVAN',
        address: '104 Grand Avenue, Central Complex',
        phone: '+91 78100 66035 / 99769 74098',
        email: 'srisaravanabhavan57.com',
        tagline: 'AUTHENTIC TASTE & QUALITY',
        receiptHeader: 'SRI SARAVANA BHAVAN',
        receiptFooter: 'Thank you for visiting! Please visit again.',
        logoUrl: DEFAULT_RESTAURANT_LOGO,
        logoStoragePath: OFFICIAL_LOGO_STORAGE_PATH,
        logoStorageUrl: OFFICIAL_LOGO_STORAGE_URL,
        logoProtectedBrandAsset: true,
        receiptAlignment: 'center',
        receiptLogoMaxWidth: 90,
        receiptLogoMaxHeight: 90,
        logoDisplay: 'both'
      });

      await setDoc(doc(db, 'settings', 'billing'), {
        businessDayStart: '04:00',
        billNumberStart: 1,
        discountEnabled: true,
        autoPrintAfterSave: true
      });

      // 3. Default Categories
      const categories = [
        { id: 'cat_tiffin', categoryCode: 'TIF', categoryName: 'Tiffin & Breakfast', startTime: '06:00 AM', endTime: '11:30 AM', description: 'South Indian Breakfasts' },
        { id: 'cat_meals', categoryCode: 'MLS', categoryName: 'Meals & Lunch', startTime: '12:00 PM', endTime: '04:00 PM', description: 'Thalis, Biryanis, Combos' },
        { id: 'cat_dinner', categoryCode: 'DIN', categoryName: 'Dinner', startTime: '06:30 PM', endTime: '11:00 PM', description: 'Evening Dinner Specialties' },
        { id: 'cat_snacks', categoryCode: 'SNK', categoryName: 'Snacks & Starters', startTime: '04:00 PM', endTime: '08:00 PM', description: 'Crispy Evening Snacks' },
        { id: 'cat_beverages', categoryCode: 'BEV', categoryName: 'Beverages & Hot Drinks', startTime: '06:00 AM', endTime: '11:00 PM', description: 'Filter Coffee, Tea, Fresh Juices' },
        { id: 'cat_special', categoryCode: 'SPC', categoryName: 'Chef Specials & Desserts', startTime: '11:00 AM', endTime: '11:00 PM', description: 'House Specialties' }
      ];

      for (const cat of categories) {
        await setDoc(doc(db, 'categories', cat.id), {
          ...cat,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      // 4. Default Menu Items with unique item codes, multi-category categoryIds & AC / Non-AC pricing
      const menuItems = [
        { id: 'item_101', itemCode: '101', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin', 'cat_dinner'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast', 'Dinner'], itemName: 'Idly (2 Pcs)', itemNameEnglish: 'Idly (2 Pcs)', itemNameTamil: 'இட்லி (2)', acPrice: 50, nonAcPrice: 40, imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400' },
        { id: 'item_102', itemCode: '102', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin', 'cat_snacks'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast', 'Snacks & Starters'], itemName: 'Medu Vada (1 Pc)', itemNameEnglish: 'Medu Vada (1 Pc)', itemNameTamil: 'மெது வடை', acPrice: 45, nonAcPrice: 35, imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400' },
        { id: 'item_103', itemCode: '103', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin', 'cat_dinner'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast', 'Dinner'], itemName: 'Plain Dosa', itemNameEnglish: 'Plain Dosa', itemNameTamil: 'தோசை', acPrice: 75, nonAcPrice: 60, imageUrl: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=400' },
        { id: 'item_104', itemCode: '104', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin', 'cat_dinner'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast', 'Dinner'], itemName: 'Masala Dosa', itemNameEnglish: 'Masala Dosa', itemNameTamil: 'மசாலா தோசை', acPrice: 95, nonAcPrice: 80, imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400' },
        { id: 'item_105', itemCode: '105', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast'], itemName: 'Poori Bhaji (2 Pcs)', itemNameEnglish: 'Poori Bhaji (2 Pcs)', itemNameTamil: 'பூரி மசாலா', acPrice: 85, nonAcPrice: 70, imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400' },
        { id: 'item_106', itemCode: '106', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin', 'cat_dinner'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast', 'Dinner'], itemName: 'Ghee Podi Idly', itemNameEnglish: 'Ghee Podi Idly', itemNameTamil: 'நெய் பொடி இட்லி', acPrice: 80, nonAcPrice: 65, imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400' },
        { id: 'item_107', itemCode: '107', categoryId: 'cat_tiffin', categoryIds: ['cat_tiffin'], categoryName: 'Tiffin & Breakfast', categoryNames: ['Tiffin & Breakfast'], itemName: 'Rava Upma', itemNameEnglish: 'Rava Upma', itemNameTamil: 'ரவா உப்புமா', acPrice: 60, nonAcPrice: 50, imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400' },
        
        { id: 'item_201', itemCode: '201', categoryId: 'cat_meals', categoryIds: ['cat_meals'], categoryName: 'Meals & Lunch', categoryNames: ['Meals & Lunch'], itemName: 'South Indian Special Meals', itemNameEnglish: 'South Indian Special Meals', itemNameTamil: 'சிறப்பு சாப்பாடு', acPrice: 160, nonAcPrice: 130, imageUrl: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=400' },
        { id: 'item_202', itemCode: '202', categoryId: 'cat_meals', categoryIds: ['cat_meals'], categoryName: 'Meals & Lunch', categoryNames: ['Meals & Lunch'], itemName: 'Curd Rice', itemNameEnglish: 'Curd Rice', itemNameTamil: 'தயிர் சாதம்', acPrice: 80, nonAcPrice: 65, imageUrl: 'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=400' },
        { id: 'item_203', itemCode: '203', categoryId: 'cat_meals', categoryIds: ['cat_meals'], categoryName: 'Meals & Lunch', categoryNames: ['Meals & Lunch'], itemName: 'Sambar Rice with Ghee', itemNameEnglish: 'Sambar Rice with Ghee', itemNameTamil: 'சாம்பார் சாதம்', acPrice: 90, nonAcPrice: 75, imageUrl: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=400' },
        { id: 'item_204', itemCode: '204', categoryId: 'cat_meals', categoryIds: ['cat_meals', 'cat_dinner'], categoryName: 'Meals & Lunch', categoryNames: ['Meals & Lunch', 'Dinner'], itemName: 'Veg Dum Biryani', itemNameEnglish: 'Veg Dum Biryani', itemNameTamil: 'வெஜ் பிரியாணி', acPrice: 180, nonAcPrice: 150, imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400' },
        { id: 'item_205', itemCode: '205', categoryId: 'cat_meals', categoryIds: ['cat_tiffin', 'cat_meals', 'cat_dinner'], categoryName: 'Meals & Lunch', categoryNames: ['Tiffin & Breakfast', 'Meals & Lunch', 'Dinner'], itemName: 'Mini Tiffin Combo', itemNameEnglish: 'Mini Tiffin Combo', itemNameTamil: 'மினி டிபன்', acPrice: 140, nonAcPrice: 120, imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400' },

        { id: 'item_301', itemCode: '301', categoryId: 'cat_beverages', categoryIds: ['cat_beverages', 'cat_tiffin', 'cat_snacks'], categoryName: 'Beverages & Hot Drinks', categoryNames: ['Beverages & Hot Drinks', 'Tiffin & Breakfast', 'Snacks & Starters'], itemName: 'Filter Coffee', itemNameEnglish: 'Filter Coffee', itemNameTamil: 'பில்டர் காபி', acPrice: 35, nonAcPrice: 25, imageUrl: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400' },
        { id: 'item_302', itemCode: '302', categoryId: 'cat_beverages', categoryIds: ['cat_beverages', 'cat_tiffin', 'cat_snacks'], categoryName: 'Beverages & Hot Drinks', categoryNames: ['Beverages & Hot Drinks', 'Tiffin & Breakfast', 'Snacks & Starters'], itemName: 'Masala Tea', itemNameEnglish: 'Masala Tea', itemNameTamil: 'மசாலா டீ', acPrice: 30, nonAcPrice: 20, imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400' },
        { id: 'item_303', itemCode: '303', categoryId: 'cat_beverages', categoryIds: ['cat_beverages'], categoryName: 'Beverages & Hot Drinks', categoryNames: ['Beverages & Hot Drinks'], itemName: 'Fresh Lime Soda', itemNameEnglish: 'Fresh Lime Soda', itemNameTamil: 'எலுமிச்சை சோடா', acPrice: 50, nonAcPrice: 40, imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400' },
        { id: 'item_304', itemCode: '304', categoryId: 'cat_beverages', categoryIds: ['cat_beverages'], categoryName: 'Beverages & Hot Drinks', categoryNames: ['Beverages & Hot Drinks'], itemName: 'Sweet Lassi', itemNameEnglish: 'Sweet Lassi', itemNameTamil: 'இனிப்பு லஸ்ஸி', acPrice: 70, nonAcPrice: 55, imageUrl: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=400' },

        { id: 'item_401', itemCode: '401', categoryId: 'cat_snacks', categoryIds: ['cat_snacks', 'cat_dinner'], categoryName: 'Snacks & Starters', categoryNames: ['Snacks & Starters', 'Dinner'], itemName: 'Gobi 65', itemNameEnglish: 'Gobi 65', itemNameTamil: 'கோபி 65', acPrice: 120, nonAcPrice: 100, imageUrl: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400' },
        { id: 'item_402', itemCode: '402', categoryId: 'cat_snacks', categoryIds: ['cat_snacks', 'cat_dinner'], categoryName: 'Snacks & Starters', categoryNames: ['Snacks & Starters', 'Dinner'], itemName: 'Paneer Butter Tikka', itemNameEnglish: 'Paneer Butter Tikka', itemNameTamil: 'பனீர் டிக்கா', acPrice: 190, nonAcPrice: 160, imageUrl: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=400' },
        { id: 'item_501', itemCode: '501', categoryId: 'cat_special', categoryIds: ['cat_special', 'cat_meals', 'cat_dinner'], categoryName: 'Chef Specials & Desserts', categoryNames: ['Chef Specials & Desserts', 'Meals & Lunch', 'Dinner'], itemName: 'Gulab Jamun (2 Pcs)', itemNameEnglish: 'Gulab Jamun (2 Pcs)', itemNameTamil: 'குலாப் ஜாமூன்', acPrice: 60, nonAcPrice: 50, imageUrl: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=400' },
        { id: 'item_502', itemCode: '502', categoryId: 'cat_special', categoryIds: ['cat_special', 'cat_tiffin', 'cat_dinner'], categoryName: 'Chef Specials & Desserts', categoryNames: ['Chef Specials & Desserts', 'Tiffin & Breakfast', 'Dinner'], itemName: 'Rava Kesari', itemNameEnglish: 'Rava Kesari', itemNameTamil: 'ரவா கேசரி', acPrice: 55, nonAcPrice: 45, imageUrl: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=400' }
      ];

      for (const itm of menuItems) {
        await setDoc(doc(db, 'menu_items', itm.id), {
          ...itm,
          description: itm.itemName,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        // Also create matching inventory tracking item
        await setDoc(doc(db, 'inventory_items', `inv_${itm.itemCode}`), {
          id: `inv_${itm.itemCode}`,
          itemCode: itm.itemCode,
          itemName: itm.itemName,
          unit: 'Portion',
          minimumStock: 15,
          currentStock: 100,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }

      console.log('System bootstrapped successfully with initial menu & roles!');
    } catch (e) {
      console.error('Error bootstrapping system:', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        currentRole,
        loading,
        isOnline,
        login,
        loginWithEmail: login,
        register,
        registerWithEmail: register,
        loginWithUsernameAndPin,
        registerWithUsernameAndPin,
        loginWithGoogle,
        logout,
        switchDemoRole,
        hasPermission,
        isOwner,
        isManager,
        isWaiter,
        bootstrapSystem
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
