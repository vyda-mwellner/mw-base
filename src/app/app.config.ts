import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';

import { routes } from './app.routes';
import { ToastErrorHandler } from './ui/toast-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: ToastErrorHandler },
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    { provide: LOCALE_ID, useValue: 'de-DE' },
  ],
};
