import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const trimmedLength = (min: number, max: number): ValidatorFn => (control: AbstractControl): ValidationErrors | null => {
  const length = String(control.value ?? '').trim().length;
  return length < min || length > max ? { trimmedLength: true } : null;
};
export const passwordPolicy: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '');
  return Array.from(value).length < 10 || new TextEncoder().encode(value).length > 72 ? { passwordPolicy: true } : null;
};
export const optionalPhone: ValidatorFn = (control): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  return value && !/^0[35789]\d{8}$/.test(value) ? { phone: true } : null;
};
