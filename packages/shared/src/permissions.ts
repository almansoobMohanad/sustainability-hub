/*
  Who can do what inside a company. The ONE place roles and permissions are
  defined; the API enforces them (Better Auth's organization plugin + our own
  endpoints) and the app reads them to show only the buttons that will work.

  Changing a rule here changes it everywhere. For example, letting Managers
  invite and remove people later is adding 'create'/'delete' to manager.member
  and 'create'/'cancel' to manager.invitation.
*/

export const ROLES = ['admin', 'manager', 'member'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  member: 'Member',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Manages the company, its people and their roles, and can do everything a Manager can.',
  manager: 'Adds emissions data, verifies or rejects entries, and chooses which emission sources the company tracks.',
  member: 'Adds emissions data and views the company dashboard.',
}

/**
 * Every action that can be allowed. The first three groups are checked by
 * Better Auth itself (company settings, memberships, invitations); the rest
 * by our own endpoints. "sources" = which emission sources the company tracks.
 */
export const statements = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  emissions: ['create', 'verify'],
  sources: ['update'],
} as const

type Statements = typeof statements
export type Resource = keyof Statements
export type Permissions = { [R in Resource]?: Statements[R][number][] }

export const rolePermissions = {
  admin: {
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    emissions: ['create', 'verify'],
    sources: ['update'],
  },
  manager: {
    emissions: ['create', 'verify'],
    sources: ['update'],
  },
  member: {
    emissions: ['create'],
  },
} satisfies Record<Role, Permissions>

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

/** Whether a role may perform an action, e.g. can('manager', 'emissions', 'verify'). */
export function can<R extends Resource>(role: Role | null | undefined, resource: R, action: Statements[R][number]) {
  if (!role) return false
  const allowed = (rolePermissions[role] as Permissions)[resource] as readonly string[] | undefined
  return allowed?.includes(action) ?? false
}

/**
 * The role a company's creator gets, and the role Better Auth protects: a
 * company always keeps at least one, only holders can grant it, and the last
 * one can't leave or be removed.
 */
export const CREATOR_ROLE: Role = 'admin'
