import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App shell', () => {
  it('exposes accessible navigation to the developer status route', async () => {
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const statusLink = fixture.nativeElement.querySelector('footer a') as HTMLAnchorElement;
    expect(statusLink.getAttribute('href')).toBe('/dev/status');
    expect(fixture.nativeElement.querySelector('.skip-link').getAttribute('href')).toBe('#main');
  });
});
