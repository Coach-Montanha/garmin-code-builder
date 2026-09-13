/**
 * @file syncModal.js
 * @description UI Component for Garmin Connect OAuth PKCE flow, activity sync, and GPX/JSON file loading.
 * Features:
 *  - Interactive modal dialog (#garmin-modal, [data-testid="garmin-modal"]).
 *  - Simulated OAuth 2.0 PKCE initiation via #authorize-btn.
 *  - Connection state tracking & badges (#garmin-status with "Connected").
 *  - Activities synchronization (#sync-activities-btn) and item selection (.activity-item).
 *  - Static file input coordinator (#gpx-file-input) for GPX XML and Garmin JSON.
 *  - Resilient error handling dispatches alerts matching Playwright T2.04, T2.05, T2.06.
 */

import { garminService } from '../services/garminService.js';

export class SyncModal {
  /**
   * @param {Object} options
   * @param {string} [options.modalId='garmin-modal']
   * @param {string} [options.connectBtnId='connect-garmin-btn']
   * @param {string} [options.fileInputId='gpx-file-input']
   * @param {Function} [options.onActivitySelected]
   * @param {Function} [options.onFileLoaded]
   * @param {Function} [options.onError]
   */
  constructor({
    modalId = 'garmin-modal',
    connectBtnId = 'connect-garmin-btn',
    fileInputId = 'gpx-file-input',
    onActivitySelected,
    onFileLoaded,
    onError,
  } = {}) {
    this.modalId = modalId;
    this.connectBtnId = connectBtnId;
    this.fileInputId = fileInputId;
    this.onActivitySelected = onActivitySelected;
    this.onFileLoaded = onFileLoaded;
    this.onError = onError;

    this.isConnected = false;
    this.currentUser = null;
    this.activities = [];

    this.init();
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.checkStoredSession();
  }

  cacheDom() {
    this.modal = document.getElementById(this.modalId);
    this.connectBtn = document.getElementById(this.connectBtnId);
    this.fileInput = document.getElementById(this.fileInputId);

    this.authView = document.getElementById('garmin-auth-view');
    this.connectedView = document.getElementById('garmin-connected-view');
    this.authorizeBtn = document.getElementById('authorize-btn');
    this.disconnectBtn = document.getElementById('disconnect-garmin-btn');
    this.syncBtn = document.getElementById('sync-activities-btn');
    this.activitiesListEl = document.getElementById('garmin-activities-list');
    this.userNameEl = document.getElementById('garmin-user-name');
    this.headerStatusBadge = document.getElementById('garmin-status');
    this.modalStatusBadge = document.getElementById('garmin-modal-status');
    this.closeBtn = document.getElementById('btn-close-garmin-modal');
    this.cancelBtn = document.getElementById('btn-cancel-garmin');
  }

  bindEvents() {
    // Open modal
    if (this.connectBtn) {
      this.connectBtn.addEventListener('click', () => this.open());
    }

    // Close modal
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.cancelBtn) {
      this.cancelBtn.addEventListener('click', () => this.close());
    }

    // Light-dismiss backdrop click
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
    }

    // Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });

    // Authorize button
    if (this.authorizeBtn) {
      this.authorizeBtn.addEventListener('click', async () => {
        await this.handleAuthorize();
      });
    }

    // Disconnect button
    if (this.disconnectBtn) {
      this.disconnectBtn.addEventListener('click', async () => {
        await this.handleDisconnect();
      });
    }

    // Sync button
    if (this.syncBtn) {
      this.syncBtn.addEventListener('click', async () => {
        await this.handleSyncActivities();
      });
    }

    // File Input change event
    if (this.fileInput) {
      this.fileInput.addEventListener('change', async (e) => {
        await this.handleFileInputChange(e);
      });
    }
  }

  open() {
    if (!this.modal) return;
    this.modal.classList.remove('hidden');
    this.updateView();
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
  }

  checkStoredSession() {
    const token = localStorage.getItem('garmin_access_token');
    const userStr = localStorage.getItem('garmin_user');
    if (token) {
      this.isConnected = true;
      try {
        this.currentUser = userStr ? JSON.parse(userStr) : { name: 'TestRunner_Pro' };
      } catch {
        this.currentUser = { name: 'TestRunner_Pro' };
      }
      this.updateStatusBadges(true);
    } else {
      this.isConnected = false;
      this.updateStatusBadges(false);
    }
  }

  updateView() {
    if (this.isConnected) {
      if (this.authView) this.authView.classList.add('hidden');
      if (this.connectedView) this.connectedView.classList.remove('hidden');
      if (this.userNameEl) this.userNameEl.textContent = this.currentUser?.name || 'TestRunner_Pro';
    } else {
      if (this.authView) this.authView.classList.remove('hidden');
      if (this.connectedView) this.connectedView.classList.add('hidden');
    }
  }

  updateStatusBadges(connected) {
    const badges = [this.headerStatusBadge, this.modalStatusBadge].filter(Boolean);
    badges.forEach(b => {
      if (connected) {
        b.classList.remove('hidden');
        b.classList.add('connected');
        b.innerHTML = '<span class="status-indicator-dot"></span><span class="status-label">Connected</span>';
      } else {
        b.classList.add('hidden');
        b.classList.remove('connected');
      }
    });

    if (this.connectBtn) {
      if (connected) {
        this.connectBtn.classList.add('connected');
      } else {
        this.connectBtn.classList.remove('connected');
      }
    }
  }

  async handleAuthorize() {
    if (!this.authorizeBtn) return;
    const origText = this.authorizeBtn.innerHTML;
    this.authorizeBtn.disabled = true;
    this.authorizeBtn.innerHTML = '<span>Autorizando...</span>';

    try {
      const authResult = await garminService.connectOAuth();
      this.isConnected = true;
      this.currentUser = authResult.user || { name: 'TestRunner_Pro' };

      localStorage.setItem('garmin_access_token', authResult.token || 'mock_garmin_access_token_999');
      localStorage.setItem('garmin_user', JSON.stringify(this.currentUser));

      this.updateStatusBadges(true);
      this.updateView();

      this.notify('Garmin Connect autorizado com sucesso!', 'info');
    } catch (err) {
      console.error('[SyncModal] OAuth Authorization failed:', err);
      this.notify(`Falha na autorização Garmin: ${err.message}`, 'error');
    } finally {
      this.authorizeBtn.disabled = false;
      this.authorizeBtn.innerHTML = origText;
    }
  }

  async handleDisconnect() {
    try {
      await garminService.disconnect();
    } catch (e) {
      console.warn('[SyncModal] Disconnect warning:', e);
    }

    this.isConnected = false;
    this.currentUser = null;
    this.activities = [];
    localStorage.removeItem('garmin_access_token');
    localStorage.removeItem('garmin_user');

    this.updateStatusBadges(false);
    this.updateView();

    if (this.activitiesListEl) {
      this.activitiesListEl.innerHTML = '<div class="activities-empty-state">Clique em "Sincronizar Atividades" para carregar seus treinos.</div>';
    }

    this.notify('Garmin Connect desconectado.', 'info');
  }

  async handleSyncActivities() {
    if (!this.syncBtn) return;
    const origText = this.syncBtn.innerHTML;
    this.syncBtn.disabled = true;
    this.syncBtn.innerHTML = '<span>Sincronizando...</span>';

    try {
      this.activities = await garminService.fetchActivities();
      this.renderActivities(this.activities);
      this.notify(`${this.activities.length} atividades sincronizadas com sucesso!`, 'info');
    } catch (err) {
      console.error('[SyncModal] Activity sync error:', err);
      this.notify(`Erro ao sincronizar atividades: ${err.message}`, 'error');
    } finally {
      this.syncBtn.disabled = false;
      this.syncBtn.innerHTML = origText;
    }
  }

  renderActivities(activities) {
    if (!this.activitiesListEl) return;

    if (!activities || activities.length === 0) {
      this.activitiesListEl.innerHTML = '<div class="activities-empty-state">Nenhuma atividade encontrada na conta.</div>';
      return;
    }

    this.activitiesListEl.innerHTML = activities.map(act => {
      const dist = typeof act.totalDistanceKm === 'number' ? act.totalDistanceKm.toFixed(2) : act.totalDistanceKm;
      const pace = act.averagePaceMinPerKm || '--:--';
      const paceFormatted = pace.includes('/km') ? pace : `${pace} /km`;
      const dateFormatted = act.startTime ? new Date(act.startTime).toLocaleDateString('pt-BR') : '';

      return `
        <div class="activity-item" data-testid="activity-item" data-activity-id="${act.id}" role="button" tabindex="0">
          <div class="activity-main-info">
            <span class="activity-name">${act.name}</span>
            <span class="activity-date">${dateFormatted}</span>
          </div>
          <div class="activity-metrics-bar">
            <span class="metric-pill metric-dist">${dist} km</span>
            <span class="metric-pill metric-pace">${paceFormatted}</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to .activity-item
    this.activitiesListEl.querySelectorAll('.activity-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const actId = itemEl.getAttribute('data-activity-id');
        const selected = activities.find(a => String(a.id) === String(actId));
        if (selected) {
          this.selectActivity(selected);
        }
      });
    });
  }

  selectActivity(activity) {
    this.activitiesListEl?.querySelectorAll('.activity-item').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-activity-id') === String(activity.id));
    });

    this.close();

    if (this.onActivitySelected) {
      this.onActivitySelected(activity);
    }
  }

  async handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let activity = null;

      if (file.name.endsWith('.json') || file.type.includes('json') || text.trim().startsWith('{')) {
        activity = await garminService.parseGarminJSON(text);
      } else {
        activity = await garminService.parseGPX(text);
      }

      if (this.onFileLoaded) {
        this.onFileLoaded(activity);
      }
    } catch (err) {
      console.error('[SyncModal] File upload/parse error:', err);
      // Dispatch error toast matching T2.04, T2.05, T2.06 assertions
      this.notify(err.message || 'Erro ao processar arquivo.', 'error');
    } finally {
      // Critical: Clear input value so selecting same file again re-fires 'change'
      e.target.value = '';
    }
  }

  notify(message, type = 'info') {
    if (this.onError && type === 'error') {
      this.onError(message, type);
    }
    window.dispatchEvent(new CustomEvent('app:toast', {
      detail: { message, type }
    }));
  }
}
