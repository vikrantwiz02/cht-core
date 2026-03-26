import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

import { SessionService } from '@mm-services/session.service';

interface UiExtensionProperties {
  readonly id: string;
  readonly type: string;
  readonly roles?: string[];
  readonly icon?: string;
  readonly title?: string;
  readonly config?: Record<string, unknown>;
}

interface UiExtension {
  readonly properties: UiExtensionProperties;
  readonly Element: HtmlElement;
}

@Injectable({
  providedIn: 'root'
})
export class UiExtensionsService {
  private extensionProperties: UiExtensionProperties[] = [];
  private extensionScripts: Record<string, any> = {};
  private initialized;

  constructor(
    private readonly http: HttpClient,
    private readonly sessionService: SessionService,
  ) { }

  isInitialized() {
    if (!this.initialized) {
      this.initialized = this.init();
    }
    return this.initialized;
  }

  private async init() {
    await this.loadExtensionProperties();
  }

  private async loadExtensionProperties() {
    try {
      const request = this.http.get<UiExtensionProperties[]>('/api/v1/ui-extension', { responseType: 'json' });
      const extensions = await lastValueFrom(request);
      if (!extensions?.length) {
        return;
      }
      
      this.extensionProperties = extensions.filter(extension => {
        if (!extension.roles?.length) {
          return true;
        }
        return extension.roles.some(role => this.sessionService.hasRole(role));
      });
    } catch (e) {
      console.error('Error loading UI extension properties', e);
    }
  }

  private async loadExtensionScript(id: string) {
    try {
      const request = this.http.get('/ui-extension/' + id, { responseType: 'text' });
      const result = await lastValueFrom(request);
      const module = { exports: null };
      new Function('module', result)(module);
      this.extensionScripts[id] = module.exports;
    } catch (e) {
      console.error(`Error loading UI extension script: "${id}"`, e);
    }
  }

  getPropertiesByType(type: string): UiExtensionProperties[] {
    return this.extensionProperties.filter(extension => extension.type === type);
  }

  
  getProperties(id: string): UiExtensionProperties | undefined {
    return this.extensionProperties.find(extension => extension.id === id);
  }

  async getExtension(id: string): Promise<UiExtension | undefined> {
    await this.isInitialized();

    const properties = this.getProperties(id);
    if (!properties) {
      return undefined;
    }

    if (!this.extensionScripts[id]) {
      await this.loadExtensionScript(id);
    }

    return {
      properties,
      Element: this.extensionScripts[id],
    };
  }
}
