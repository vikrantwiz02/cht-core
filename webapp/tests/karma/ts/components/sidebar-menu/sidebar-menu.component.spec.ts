import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { provideMockStore } from '@ngrx/store/testing';
import { TranslateFakeLoader, TranslateLoader, TranslateModule } from '@ngx-translate/core';
import sinon from 'sinon';
import { assert, expect } from 'chai';

import { SidebarMenuComponent } from '@mm-components/sidebar-menu/sidebar-menu.component';
import { LocationService } from '@mm-services/location.service';
import { DBSyncService } from '@mm-services/db-sync.service';
import { ModalService } from '@mm-services/modal.service';
import { PanelHeaderComponent } from '@mm-components/panel-header/panel-header.component';
import { AuthDirective } from '@mm-directives/auth.directive';
import { AuthService } from '@mm-services/auth.service';
import { GlobalActions } from '@mm-actions/global';
import { LogoutConfirmComponent } from '@mm-modals/logout/logout-confirm.component';
import { FeedbackComponent } from '@mm-modals/feedback/feedback.component';
import { UiExtensionsService } from '@mm-services/ui-extensions.service';
import { ResourceIconsService } from '@mm-services/resource-icons.service';
import { ChangesService } from '@mm-services/changes.service';

describe('SidebarMenuComponent', () => {
  let component: SidebarMenuComponent;
  let fixture: ComponentFixture<SidebarMenuComponent>;
  let locationService;
  let dbSyncService;
  let modalService;
  let authService;
  let uiExtensionsService;
  let resourceIconsService;
  let changesService;

  beforeEach(async () => {
    locationService = { adminPath: '/admin/' };
    dbSyncService = { sync: sinon.stub() };
    modalService = { show: sinon.stub() };
    authService = { has: sinon.stub(), online: sinon.stub() };
    uiExtensionsService = {
      isInitialized: sinon.stub().resolves(),
      getPropertiesByType: sinon.stub().returns([]),
    };
    resourceIconsService = { getImg: sinon.stub().returns('') };
    changesService = { subscribe: sinon.stub().returns({ unsubscribe: sinon.stub() }) };

    await TestBed
      .configureTestingModule({
        imports: [
          RouterTestingModule,
          TranslateModule.forRoot({ loader: { provide: TranslateLoader, useClass: TranslateFakeLoader } }),
          MatSidenavModule,
          MatIconModule,
          SidebarMenuComponent,
          PanelHeaderComponent,
          AuthDirective,
        ],
        providers: [
          provideAnimations(),
          provideMockStore(),
          { provide: LocationService, useValue: locationService },
          { provide: DBSyncService, useValue: dbSyncService },
          { provide: ModalService, useValue: modalService },
          { provide: AuthService, useValue: authService },
          { provide: UiExtensionsService, useValue: uiExtensionsService },
          { provide: ResourceIconsService, useValue: resourceIconsService },
          { provide: ChangesService, useValue: changesService },
        ],
      })
      .compileComponents();

    fixture = TestBed.createComponent(SidebarMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => sinon.restore());

  it('should unsubscribe from observables on component destroy', () => {
    const unsubscribeSpy = sinon.spy((component as any).subscriptions, 'unsubscribe');

    component.ngOnDestroy();

    expect(unsubscribeSpy.calledOnce).to.be.true;
  });

  it('should initialise component with menu options', () => {
    expect(component.adminAppPath).to.equal('/admin/');

    expect(component.moduleOptions).have.deep.members([
      {
        routerLink: 'messages',
        icon: 'fa-envelope',
        translationKey: 'Messages',
        hasPermissions: 'can_view_messages,!can_view_messages_tab'
      },
      {
        routerLink: 'tasks',
        icon: 'fa-flag',
        translationKey: 'Tasks',
        hasPermissions: 'can_view_tasks,!can_view_tasks_tab'
      },
      {
        routerLink: 'reports',
        icon: 'fa-list-alt',
        translationKey: 'Reports',
        hasPermissions: 'can_view_reports,!can_view_reports_tab'
      },
      {
        routerLink: 'contacts',
        icon: 'fa-user',
        translationKey: 'Contacts',
        hasPermissions: 'can_view_contacts,!can_view_contacts_tab'
      },
      {
        routerLink: 'analytics',
        icon: 'fa-bar-chart-o',
        translationKey: 'Analytics',
        hasPermissions: 'can_view_analytics,!can_view_analytics_tab',
      },
    ]);

    expect(component.secondaryOptions).excluding('click').have.deep.members([
      {
        routerLink: 'trainings',
        icon: 'fa-graduation-cap',
        translationKey: 'training_materials.page.title',
        canDisplay: true,
      },
      {
        routerLink: 'about',
        icon: 'fa-question',
        translationKey: 'about',
        canDisplay: true,
      },
      {
        routerLink: 'user',
        icon: 'fa-user',
        translationKey: 'edit.user.settings',
        hasPermissions: 'can_edit_profile'
      },
      {
        routerLink: 'privacy-policy',
        icon: 'fa-lock',
        translationKey: 'privacy.policy',
        canDisplay: false,
      },
      {
        icon: 'fa-bug',
        translationKey: 'Report Bug',
        canDisplay: true,
      },
    ]);
  });

  it('should close sidebar menu', () => {
    const closeSidebarMenuStub = sinon.stub(GlobalActions.prototype, 'closeSidebarMenu');

    component.close();

    expect(closeSidebarMenuStub.calledOnce).to.be.true;
  });

  it('should not replicate if sync is disabled', () => {
    component.replicationStatus = { current: { disableSyncButton: true } };

    component.replicate();

    expect(dbSyncService.sync.notCalled).to.be.true;
  });

  it('should replicate if sync is enabled', () => {
    component.replicationStatus = { current: { disableSyncButton: false } };

    component.replicate();

    expect(dbSyncService.sync.calledOnce).to.be.true;
  });

  it('should show confirmation logout modal', () => {
    component.logout();

    expect(modalService.show.calledOnce).to.be.true;
    expect(modalService.show.args[0][0]).to.deep.equal(LogoutConfirmComponent);
  });

  it('should show report bug modal', () => {
    const reportBug = component.secondaryOptions.find(option => option.translationKey === 'Report Bug');

    if (!reportBug?.click) {
      assert.fail('should have report bug option');
      return;
    }

    reportBug.click();

    expect(modalService.show.calledOnce).to.be.true;
    expect(modalService.show.args[0][0]).to.deep.equal(FeedbackComponent);
  });

  describe('UI Extension options (app_drawer_tab)', () => {

    it('should call getPropertiesByType with app_drawer_tab on init', () => {
      expect(uiExtensionsService.getPropertiesByType.calledWith('app_drawer_tab')).to.be.true;
    });

    it('should have empty uiExtensionOptions when no extensions are registered', () => {
      expect(component.uiExtensionOptions).to.be.empty;
    });

    it('should have mergedOptions combining all three option arrays when no extensions', () => {
      const expectedLength =
        component.moduleOptions.length +
        component.uiExtensionOptions.length +
        component.secondaryOptions.length;
      expect(component.mergedOptions).to.have.lengthOf(expectedLength);
    });

    describe('when app_drawer_tab extensions are registered', () => {
      beforeEach(async () => {
        uiExtensionsService.getPropertiesByType.returns([
          { id: 'ext-reports', type: 'app_drawer_tab', title: 'custom.reports', icon: 'reports-icon' },
          { id: 'ext-map', type: 'app_drawer_tab', title: 'custom.map', icon: 'map-icon' },
        ]);

        await TestBed.resetTestingModule();
        await TestBed
          .configureTestingModule({
            imports: [
              RouterTestingModule,
              TranslateModule.forRoot({ loader: { provide: TranslateLoader, useClass: TranslateFakeLoader } }),
              MatSidenavModule,
              MatIconModule,
              SidebarMenuComponent,
              PanelHeaderComponent,
              AuthDirective,
            ],
            providers: [
              provideAnimations(),
              provideMockStore(),
              { provide: LocationService, useValue: locationService },
              { provide: DBSyncService, useValue: dbSyncService },
              { provide: ModalService, useValue: modalService },
              { provide: AuthService, useValue: authService },
              { provide: UiExtensionsService, useValue: uiExtensionsService },
              { provide: ResourceIconsService, useValue: resourceIconsService },
              { provide: ChangesService, useValue: changesService },
            ],
          })
          .compileComponents();

        fixture = TestBed.createComponent(SidebarMenuComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
      });

      it('should populate uiExtensionOptions from registered extensions', () => {
        expect(component.uiExtensionOptions).to.have.lengthOf(2);
      });

      it('should map extension id to routerLink correctly', () => {
        expect(component.uiExtensionOptions[0].routerLink).to.equal('ui-extensions/ext-reports');
        expect(component.uiExtensionOptions[1].routerLink).to.equal('ui-extensions/ext-map');
      });

      it('should map extension properties.title to translationKey', () => {
        expect(component.uiExtensionOptions[0].translationKey).to.equal('custom.reports');
        expect(component.uiExtensionOptions[1].translationKey).to.equal('custom.map');
      });

      it('should map extension properties.icon to resourceIcon', () => {
        expect(component.uiExtensionOptions[0].resourceIcon).to.equal('reports-icon');
        expect(component.uiExtensionOptions[1].resourceIcon).to.equal('map-icon');
      });

      it('should set canDisplay true for all ui extension options', () => {
        expect(component.uiExtensionOptions.every(opt => opt.canDisplay)).to.be.true;
      });

      it('should place ui extensions after moduleOptions in mergedOptions', () => {
        const routes = component.mergedOptions.map(opt => opt.routerLink);
        const lastModuleIdx = routes.lastIndexOf('analytics');
        const firstExtIdx = routes.indexOf('ui-extensions/ext-reports');

        expect(firstExtIdx).to.be.greaterThan(lastModuleIdx);
      });

      it('should place ui extensions before secondaryOptions in mergedOptions', () => {
        const routes = component.mergedOptions.map(opt => opt.routerLink);
        const lastExtIdx = routes.lastIndexOf('ui-extensions/ext-map');
        const firstSecondaryIdx = routes.indexOf('trainings');

        expect(firstSecondaryIdx).to.be.greaterThan(lastExtIdx);
      });

      it('should include all options in mergedOptions with correct total length', () => {
        const expectedLength =
          component.moduleOptions.length +
          component.uiExtensionOptions.length +
          component.secondaryOptions.length;

        expect(component.mergedOptions).to.have.lengthOf(expectedLength);
      });

      it('should rebuild mergedOptions preserving extension positions when privacy policy changes', () => {
        (component as any).setSecondaryOptions(true);

        const routes = component.mergedOptions.map(opt => opt.routerLink);
        const lastModuleIdx = routes.lastIndexOf('analytics');
        const firstExtIdx = routes.indexOf('ui-extensions/ext-reports');
        const firstSecondaryIdx = routes.indexOf('trainings');

        expect(firstExtIdx).to.be.greaterThan(lastModuleIdx);
        expect(firstSecondaryIdx).to.be.greaterThan(firstExtIdx);
      });
    });
  });
});
