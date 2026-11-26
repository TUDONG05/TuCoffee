import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  Pipe,
  PipeTransform,
  signal,
} from '@angular/core';
const currency = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
@Pipe({ name: 'vnd' })
export class VndPipe implements PipeTransform {
  transform(value: number): string {
    return currency.format(value);
  }
}
@Component({
  selector: 'app-product-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (src && !failed()) {
      <img
        [src]="src"
        [alt]="alt"
        [loading]="eager ? 'eager' : 'lazy'"
        (error)="failed.set(true)"
      />
    } @else {
      <div class="fallback" role="img" [attr.aria-label]="alt + ' — chưa có ảnh'">
        <span>Tu’s Coffee</span><small>Hình ảnh đang cập nhật</small>
      </div>
    }`,
  styles: `
    :host {
      display: block;
      aspect-ratio: 1;
      overflow: hidden;
      background: #f5f1ee;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .fallback {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      text-align: center;
      color: #705c50;
    }
    .fallback span {
      font-size: 1.25rem;
      font-weight: 700;
    }
    .fallback small {
      font-size: 0.75rem;
      margin-top: 0.4rem;
    }
  `,
})
export class ProductImage implements OnChanges {
  @Input() src: string | null = null;
  @Input() alt = 'Sản phẩm';
  @Input() eager = false;
  readonly failed = signal(false);
  ngOnChanges(): void {
    this.failed.set(false);
  }
}
