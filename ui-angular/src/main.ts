import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  standalone: true,
  template: '<main><h1>Route Health</h1><p>Angular migration workspace.</p></main>',
})
class AppComponent {}

bootstrapApplication(AppComponent).catch((error: unknown) => console.error(error));
