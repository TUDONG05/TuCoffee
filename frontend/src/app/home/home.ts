import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <section class="welcome" aria-labelledby="welcome-title">
      <p class="eyebrow">TU’S COFFEE</p>
      <h1 id="welcome-title">Một tách cà phê.<br />Một khoảng bình yên.</h1>
      <p class="intro">Chào bạn đến với Tu’s Coffee.</p>
      <p class="opening-note">Website đang được xây dựng. Hẹn gặp bạn khi thực đơn sẵn sàng.</p>
      <div class="coffee-mark" aria-hidden="true"><span></span></div>
    </section>
  `,
  styles: `
    .welcome { padding-block: clamp(3.5rem, 10vw, 7rem); position: relative; }
    h1 { max-width: 18ch; }
    .intro { font-size: 1.25rem; margin-top: 2rem; }
    .opening-note { max-width: 43ch; color: var(--muted); }
    .coffee-mark { width: 6rem; height: 6rem; margin-top: 3rem; border: 1px solid var(--line); border-radius: 50%; display: grid; place-items: center; }
    .coffee-mark span { display: block; width: 1.7rem; height: 2.5rem; border: 2px solid var(--brand); border-radius: 50%; transform: rotate(35deg); position: relative; }
    .coffee-mark span::after { content: ''; position: absolute; inset: 0 45%; border-left: 2px solid var(--brand); transform: rotate(12deg); }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
