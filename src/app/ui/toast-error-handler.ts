import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';

import { errorText } from './task';
import { Toasts } from './toasts';

/** Nobody keeps the console open, so every uncaught error becomes a toast as well. */
@Injectable()
export class ToastErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    console.error(error);
    this.injector.get(Toasts).error(errorText(error), 'Unerwarteter Fehler');
  }
}
