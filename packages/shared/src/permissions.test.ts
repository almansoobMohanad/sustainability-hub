import { expect, test } from 'vitest'
import { can, isRole, rolePermissions, statements, type Resource } from './permissions'

/*
  The permission table is THE source of truth for the API (Better Auth + our
  endpoints) and the app (which buttons to show). This snapshot makes any
  change to it a visible, deliberate diff in a pull request.
*/
test('who may do what', () => {
  const table = Object.fromEntries(
    (['admin', 'manager', 'member'] as const).map((role) => [
      role,
      Object.entries(statements).flatMap(([resource, actions]) =>
        actions.filter((action) => can(role, resource as Resource, action as never)).map((action) => `${resource}:${action}`),
      ),
    ]),
  )
  expect(table).toEqual({
    admin: [
      'organization:update',
      'organization:delete',
      'member:create',
      'member:update',
      'member:delete',
      'invitation:create',
      'invitation:cancel',
      'emissions:create',
      'emissions:verify',
      'sources:update',
    ],
    manager: ['emissions:create', 'emissions:verify', 'sources:update'],
    member: ['emissions:create'],
  })
})

test('roles only use actions that exist', () => {
  for (const permissions of Object.values(rolePermissions)) {
    for (const [resource, actions] of Object.entries(permissions)) {
      expect(statements).toHaveProperty(resource)
      for (const action of actions) expect(statements[resource as Resource]).toContain(action)
    }
  }
})

test('people without a role can do nothing', () => {
  expect(can(null, 'emissions', 'create')).toBe(false)
  expect(can(undefined, 'emissions', 'create')).toBe(false)
})

test('isRole', () => {
  expect(isRole('manager')).toBe(true)
  expect(isRole('owner')).toBe(false)
  expect(isRole(undefined)).toBe(false)
})
