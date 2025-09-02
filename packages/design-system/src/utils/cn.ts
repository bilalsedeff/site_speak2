import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function to merge Tailwind CSS classes with proper deduplication
 * Uses clsx for conditional classes and tailwind-merge for conflicting classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}