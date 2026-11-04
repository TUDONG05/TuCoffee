import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-home',
  imports:[RouterLink,NzButtonModule],
  template: `
    <section class="welcome" aria-labelledby="welcome-title">
      <p class="eyebrow">TU’S COFFEE</p>
      <h1 id="welcome-title">Một tách cà phê.<br />Một khoảng bình yên.</h1>
      <p class="intro">Chào bạn đến với Tu’s Coffee.</p>
      <a nz-button nzType="primary" nzSize="large" routerLink="/menu">Khám phá thực đơn</a>
    </section>
  `,
  styles: `
    .welcome {
      padding-block: clamp(3.5rem, 10vw, 7rem);
      position: relative;
      background: radial-gradient(ellipse at 95% 30%, var(--brand-soft), transparent 65%);
    }
    h1 {
      max-width: 18ch;
      color: var(--espresso);
    }
    .intro {
      font-size: 1.25rem;
      margin-top: 2rem;
    }
    .opening-note {
      max-width: 43ch;
      color: var(--muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {}
