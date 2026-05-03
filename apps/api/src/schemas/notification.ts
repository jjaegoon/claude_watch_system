import { z } from 'zod'

export const notificationIdParamSchema = z.object({
  id: z.string().uuid(),
})

export const listNotificationsQuerySchema = z.object({
  unread: z.coerce.number().int().optional(),
})

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>
