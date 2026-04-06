import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function generateFilename(type: 'resume' | 'cover-letter', jobTitle: string, company: string): string {
  const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const timestamp = Date.now();
  
  if (type === 'resume') {
    return `resume_${sanitize(company)}_${sanitize(jobTitle)}_${timestamp}`;
  } else {
    return `cover_letter_${sanitize(company)}_${sanitize(jobTitle)}_${timestamp}`;
  }
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const CREDIT_PACKS = [
  {
    id: 'basic',
    name: 'Basic Pack',
    baseCredits: 10,
    bonusCredits: 2,
    totalCredits: 12,
    price: 4.99,
    popular: false,
    bestValue: false,
  },
  {
    id: 'pro',
    name: 'Pro Pack',
    baseCredits: 25,
    bonusCredits: 5,
    totalCredits: 30,
    price: 9.99,
    popular: true,
    bestValue: false,
  },
  {
    id: 'power',
    name: 'Power Pack',
    baseCredits: 60,
    bonusCredits: 15,
    totalCredits: 75,
    price: 19.99,
    popular: false,
    bestValue: true,
  },
];

