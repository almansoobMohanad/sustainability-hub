import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

/*
  GET /api/v1/auth-options
  Which sign-in methods this installation offers, so the sign-in and sign-up
  pages only show buttons that work. Public: it reveals nothing about users.
*/

const AuthOptionsSchema = z
  .object({
    emailPassword: z.boolean().openapi({ example: true }),
    google: z.boolean().openapi({ description: 'Whether "Continue with Google" is configured', example: true }),
  })
  .openapi('AuthOptions')

const route = createRoute({
  method: 'get',
  path: '/v1/auth-options',
  tags: ['Auth'],
  summary: 'Sign-in methods available on this installation',
  responses: {
    200: {
      description: 'Available sign-in methods',
      content: { 'application/json': { schema: AuthOptionsSchema } },
    },
  },
})

export function authOptionsRoutes({ google }: { google: boolean }) {
  return new OpenAPIHono().openapi(route, (c) => c.json({ emailPassword: true, google }, 200))
}
