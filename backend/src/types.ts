import type { Static } from '@sinclair/typebox/type'
import * as t from '@sinclair/typebox/type'

export type GeneratePromptJob = Static<typeof GeneratePromptJob>
export const GeneratePromptJob = t.Object({
  id: t.String(),
  productName: t.String(),
  attempt: t.Number({ default: 1 }),
  productId: t.Optional(t.String()),
  miniGamePrompt: t.Optional(t.String()),
})

export type GenerateImageJob = Static<typeof GenerateImageJob>
export const GenerateImageJob = t.Object({
  id: t.String(),
  productName: t.String(),
  prompt: t.String(),
  attempt: t.Number({ default: 1 }),
  productId: t.Optional(t.String()),
})

export type GenerateDescJob = Static<typeof GenerateDescJob>
export const GenerateDescJob = t.Object({
  id: t.String(),
  productName: t.String(),
  attempt: t.Number({ default: 1 }),
})

export type GetImageJob = Static<typeof GetImageJob>
export const GetImageJob = t.Object({
  id: t.String(),
  requestId: t.String(),
  attempt: t.Number({ default: 1 }),
  productName: t.String(),
})

export type PaymentPayload = Static<typeof PaymentPayload>
export const PaymentPayload = t.Object({
  purchaseId: t.String(),
  orderId: t.String(),
})
