import { FormControl } from '@angular/forms';
import { optionalPhone, passwordPolicy, trimmedLength } from './form-validators';

describe('identity input rules', () => {
  it('checks UTF-8 bytes rather than only character count for BCrypt passwords', () => {
    expect(passwordPolicy(new FormControl('a'.repeat(72)))).toBeNull();
    expect(passwordPolicy(new FormControl('a'.repeat(73)))).toEqual({ passwordPolicy: true });
    expect(passwordPolicy(new FormControl('ấ'.repeat(25)))).toEqual({ passwordPolicy: true });
    expect(passwordPolicy(new FormControl(' 12345678 '))).toBeNull();
  });
  it('accepts optional phones and valid Vietnamese mobile numbers', () => {
    expect(optionalPhone(new FormControl(''))).toBeNull(); expect(optionalPhone(new FormControl('0912345678'))).toBeNull();
    expect(optionalPhone(new FormControl('0112345678'))).toEqual({ phone: true });
  });
  it('rejects whitespace-only names', () => { expect(trimmedLength(2, 100)(new FormControl('   '))).toEqual({ trimmedLength: true }); });
});
