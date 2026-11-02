import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('App shell', () => {
  it('exposes accessible footer navigation to the home page', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const statusLink = fixture.nativeElement.querySelector(
      'footer .footer-links a',
    ) as HTMLAnchorElement;
    expect(statusLink.getAttribute('href')).toBe('/');
    expect(fixture.nativeElement.querySelector('.skip-link').getAttribute('href')).toBe('#main');
  });
});
