import type { CurrencyAmount } from './types.ts'

const MAX_SAFE_CURRENCY = Number.MAX_SAFE_INTEGER

export function validateCurrencyAmount(value: unknown): CurrencyAmount {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid currency amount: ${String(value)}`)
  }
  if (!Number.isInteger(value)) {
    throw new Error(`Currency amount must be an integer: ${value}`)
  }
  if (value < 0) {
    throw new Error(`Currency amount must be non-negative: ${value}`)
  }
  if (value > MAX_SAFE_CURRENCY) {
    throw new Error(`Currency amount exceeds safe integer limit: ${value}`)
  }
  return value
}

export function formatCurrencyAmount(amount: CurrencyAmount): string {
  validateCurrencyAmount(amount)
  return amount.toLocaleString('ja-JP')
}
