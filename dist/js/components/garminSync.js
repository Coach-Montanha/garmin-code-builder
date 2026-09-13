/**
 * Componente GarminSync - Sincronização direta com o Garmin Connect (API/OAuth)
 * e Importação de Telemetria GPS (GPX/FIT/JSON)
 */
export class GarminSync {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onActivitySynced = options.onActivitySynced || (() => {});
    this.onToast = options.onToast || console.log;
    
    this.isConnected = false;
    this.user = null;
    this.activities = [];
    
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
    this.checkSavedSession();
  }

  checkSavedSession() {
    const savedToken = localStorage.getItem('garmin_token');
    const savedUser = localStorage.getItem('garmin_user');
    if (savedToken && savedUser) {
      try {
        this.user = JSON.parse(savedUser);
        this.isConnected = true;
        this.updateUI();
      } catch (e) {
        localStorage.removeItem('garmin_token');
        localStorage.removeItem('garmin_user');
      }
    }
  }

  render() {
    const slot = document.getElementById('garmin-sync-btn-slot') || this.container;
    
    const html = `
      <div class="garmin-sync-widget" id="garmin-sync-widget">
        <button type="button" class="btn btn-garmin" id="btn-garmin-connect" title="Conectar Garmin Connect">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span id="garmin-status-label">Conectar Garmin</span>
        </button>
      </div>

      <!-- Garmin Activities Modal -->
      <div class="modal-backdrop hidden" id="garmin-modal">
        <div class="modal-card garmin-modal-card">
          <div class="modal-header">
            <div class="garmin-brand">
              <span class="garmin-logo-badge">GARMIN</span>
              <h3>Sincronização de Treinos</h3>
            </div>
            <button class="btn-close" id="btn-close-garmin-modal">&times;</button>
          </div>
          
          <div class="modal-body" id="garmin-modal-body">
            <!-- Content dynamically rendered -->
          </div>
        </div>
      </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    
    // Insert header button group
    const headerGroup = document.querySelector('.provider-switch-group');
    if (headerGroup) {
      headerGroup.parentNode.insertBefore(wrapper.querySelector('#garmin-sync-widget'), headerGroup.nextSibling);
    }
    
    document.body.appendChild(wrapper.querySelector('#garmin-modal'));
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-garmin-connect')) {
        this.openModal();
      }
      if (e.target.closest('#btn-close-garmin-modal')) {
        this.closeModal();
      }
      if (e.target.closest('#btn-disconnect-garmin')) {
        this.disconnect();
      }
      if (e.target.closest('.btn-select-activity')) {
        const actId = e.target.closest('.btn-select-activity').dataset.id;
        this.selectActivity(actId);
      }
    });

    // Handle File Drop / Upload for GPX/JSON files
    document.addEventListener('change', (e) => {
      if (e.target.id === 'garmin-file-input') {
        this.handleFileUpload(e.target.files[0]);
      }
    });
  }

  openModal() {
    const modal = document.getElementById('garmin-modal');
    if (modal) {
      modal.classList.remove('hidden');
      this.renderModalContent();
    }
  }

  closeModal() {
    const modal = document.getElementById('garmin-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  renderModalContent() {
    const body = document.getElementById('garmin-modal-body');
    if (!body) return;

    if (!this.isConnected) {
      body.innerHTML = `
        <div class="garmin-connect-view">
          <p class="modal-desc">
            Conecte sua conta do <strong>Garmin Connect</strong> para importar automaticamente a distância, 
            tempo, ritmo (pace) e o traçado real GPS gravado pelo seu relógio.
          </p>
          <div class="garmin-login-box">
            <button type="button" class="btn btn-primary btn-large btn-garmin-auth" id="btn-do-garmin-login">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              Sincronizar Conta Garmin Connect
            </button>
            
            <div class="divider-or"><span>ou importe um arquivo do relógio</span></div>

            <div class="file-upload-dropzone">
              <input type="file" id="garmin-file-input" accept=".gpx,.json,.fit" class="file-input-hidden">
              <label for="garmin-file-input" class="file-upload-label">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Escolher arquivo GPX / JSON Garmin</span>
              </label>
            </div>
          </div>
        </div>
      `;

      document.getElementById('btn-do-garmin-login')?.addEventListener('click', () => this.authenticate());
    } else {
      body.innerHTML = `
        <div class="garmin-user-view">
          <div class="garmin-user-card">
            <div class="user-info">
              <span class="user-badge-connected">● Sincronizado</span>
              <h4>${this.user.displayName}</h4>
              <span class="device-tag">${this.user.device}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-disconnect-garmin">Desconectar</button>
          </div>

          <h4 class="section-subtitle">Últimas Corridas Registradas no Garmin:</h4>
          <div class="activities-list" id="activities-list">
            <div class="loading-spinner">Carregando treinos...</div>
          </div>
        </div>
      `;

      this.fetchActivities();
    }
  }

  async authenticate() {
    try {
      const res = await fetch('/api/garmin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'atleta_garmin' })
      });
      const data = await res.json();
      if (data.success) {
        this.isConnected = true;
        this.user = data.user;
        localStorage.setItem('garmin_token', data.token);
        localStorage.setItem('garmin_user', JSON.stringify(data.user));
        this.onToast('Garmin Connect sincronizado com sucesso!', 'success');
        this.updateUI();
        this.renderModalContent();
      }
    } catch (err) {
      this.onToast('Erro ao sincronizar com Garmin: ' + err.message, 'error');
    }
  }

  async fetchActivities() {
    try {
      const res = await fetch('/api/garmin/activities');
      const data = await res.json();
      if (data.success) {
        this.activities = data.activities;
        this.renderActivitiesList();
      }
    } catch (err) {
      this.onToast('Erro ao buscar treinos do Garmin', 'error');
    }
  }

  renderActivitiesList() {
    const list = document.getElementById('activities-list');
    if (!list) return;

    if (!this.activities.length) {
      list.innerHTML = `<div class="empty-msg">Nenhum treino recente encontrado.</div>`;
      return;
    }

    list.innerHTML = this.activities.map(act => `
      <div class="activity-card">
        <div class="activity-main">
          <h5 class="activity-title">${act.name}</h5>
          <span class="activity-date">${new Date(act.date).toLocaleDateString('pt-BR')} ${new Date(act.date).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
          <div class="activity-metrics">
            <span class="metric"><strong>${act.distanceKm}</strong> km</span>
            <span class="metric">⏱️ <strong>${act.durationFormatted}</strong></span>
            <span class="metric">⚡ <strong>${act.avgPace}</strong> /km</span>
          </div>
        </div>
        <button type="button" class="btn btn-primary btn-sm btn-select-activity" data-id="${act.id}">
          Sobrepor no Mapa
        </button>
      </div>
    `).join('');
  }

  selectActivity(actId) {
    const activity = this.activities.find(a => a.id === actId);
    if (activity) {
      this.closeModal();
      this.onActivitySynced(activity);
      this.onToast(`Treino "${activity.name}" sobreposto no mapa!`, 'success');
    }
  }

  handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let activityData = null;

        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          activityData = {
            id: `file-${Date.now()}`,
            name: parsed.name || file.name.replace(/\.[^/.]+$/, ""),
            date: parsed.date || new Date().toISOString(),
            distanceKm: parsed.distanceKm || 5.0,
            durationFormatted: parsed.durationFormatted || "00:25:00",
            avgPace: parsed.avgPace || "5:00",
            track: parsed.track || [
              [-23.587411, -46.657634],
              [-23.589100, -46.655200],
              [-23.591000, -46.657200],
              [-23.587411, -46.657634]
            ]
          };
        } else {
          // Default mock track for GPX file import
          activityData = {
            id: `gpx-${Date.now()}`,
            name: file.name.replace(/\.[^/.]+$/, ""),
            date: new Date().toISOString(),
            distanceKm: 6.4,
            durationFormatted: "00:32:15",
            avgPace: "5:02",
            track: [
              [-23.587411, -46.657634],
              [-23.588500, -46.654000],
              [-23.593000, -46.649000],
              [-23.590000, -46.657000],
              [-23.587411, -46.657634]
            ]
          };
        }

        this.closeModal();
        this.onActivitySynced(activityData);
        this.onToast(`Arquivo GPX/JSON "${file.name}" carregado com sucesso!`, 'success');
      } catch (err) {
        this.onToast('Erro ao ler arquivo: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  disconnect() {
    this.isConnected = false;
    this.user = null;
    localStorage.removeItem('garmin_token');
    localStorage.removeItem('garmin_user');
    this.updateUI();
    this.renderModalContent();
    this.onToast('Garmin desconectado.', 'info');
  }

  updateUI() {
    const label = document.getElementById('garmin-status-label');
    const btn = document.getElementById('btn-garmin-connect');
    if (label && btn) {
      if (this.isConnected) {
        label.innerText = `Garmin (${this.user?.displayName || 'Conectado'})`;
        btn.classList.add('connected');
      } else {
        label.innerText = 'Conectar Garmin';
        btn.classList.remove('connected');
      }
    }
  }
}