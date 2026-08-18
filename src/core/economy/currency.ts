import type { CurrencyAmount, SignedCurrencyAmount } from './types.ts'

const MAX_SAFE_CURRENCY = Number.MAX_SAFE_INTEGER
const MIN_SAFE_CURRENCY = Number.MIN_SAFE_INTEGER

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

export function validateSignedCurrencyAmount(
  value: unknown,
): SignedCurrencyAmount {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid signed currency amount: ${String(value)}`)
  }
  if (!Number.isInteger(value)) {
    throw new Error(`Signed currency amount must be an integer: ${value}`)
  }
  if (value < MIN_SAFE_CURRENCY || value > MAX_SAFE_CURRENCY) {
    throw new Error(
      `Signed currency amount exceeds safe integer range: ${value}`,
    )
  }
  return value
}

function formatWithOptionalSign(amount: number, includePlus: boolean): string {
  validateSignedCurrencyAmount(amount)
  if (amount === 0) {
    return '0'
  }
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('ja-JP')
  if (amount > 0) {
    return includePlus ? `+${formatted}` : formatted
  }
  return `-${formatted}`
}

export function formatCurrencyAmount(amount: CurrencyAmount): string {
  validateCurrencyAmount(amount)
  return amount.toLocaleString('ja-JP')
}

export function formatSignedCurrencyAmount(
  amount: SignedCurrencyAmount,
): string {
  return formatWithOptionalSign(amount, false)
}

export function formatLedgerAmount(amount: SignedCurrencyAmount): string {
  return formatWithOptionalSign(amount, true)
}
