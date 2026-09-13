/**
 * Componente RunHistory - Painel de Histórico e Dashboard de Treinos Salvos
 */
export class RunHistory {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onSelectRun = options.onSelectRun || (() => {});
    this.onToast = options.onToast || console.log;
    
    this.runs = [];
    this.init();
  }

  init() {
    this.render();
    this.bindEvents();
    this.fetchSavedRuns();
  }

  render() {
    const header = document.querySelector('.app-header');
    if (header) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-history';
      btn.id = 'btn-open-history';
      btn.title = 'Ver Histórico de Corridas';
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
        </svg>
        <span>Histórico</span>
      `;
      header.appendChild(btn);
    }

    const drawerHtml = `
      <div class="history-drawer-backdrop hidden" id="history-drawer">
        <div class="history-drawer-panel">
          <div class="drawer-header">
            <h3>Histórico de Treinos</h3>
            <button class="btn-close" id="btn-close-history">&times;</button>
          </div>

          <div class="drawer-body" id="history-list-container">
            <div class="loading-spinner">Buscando histórico...</div>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = drawerHtml;
    document.body.appendChild(div.firstElementChild);
  }

  bindEvents() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-open-history')) {
        this.openDrawer();
      }
      if (e.target.closest('#btn-close-history')) {
        this.closeDrawer();
      }
      if (e.target.closest('.history-item-card')) {
        const id = e.target.closest('.history-item-card').dataset.id;
        this.selectRun(id);
      }
    });
  }

  openDrawer() {
    const drawer = document.getElementById('history-drawer');
    if (drawer) {
      drawer.classList.remove('hidden');
      this.fetchSavedRuns();
    }
  }

  closeDrawer() {
    const drawer = document.getElementById('history-drawer');
    if (drawer) drawer.classList.add('hidden');
  }

  async fetchSavedRuns() {
    try {
      const res = await fetch('/api/runs');
      if (!res.ok) throw new Error('API not available');
      const data = await res.json();
      if (data.success) {
        this.runs = data.runs;
        this.renderHistoryList();
        return;
      }
    } catch (err) {
      // LocalStorage Fallback for static hosts (Lovable / GitHub Pages)
      const localData = localStorage.getItem('garmin_saved_runs');
      if (localData) {
        try {
          this.runs = JSON.parse(localData);
        } catch (e) {
          this.runs = [];
        }
      } else {
        this.runs = [];
      }
      this.renderHistoryList();
    }
  }

  async addRun(runPayload) {
    const id = runPayload.id || 'run_' + Date.now();
    const newRun = { ...runPayload, id, createdAt: new Date().toISOString() };
    
    this.runs.unshift(newRun);
    localStorage.setItem('garmin_saved_runs', JSON.stringify(this.runs));
    this.renderHistoryList();
    this.onToast('Treino salvo no histórico!', 'success');

    try {
      await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runPayload)
      });
    } catch (err) {
      // Background sync silent fallback for static host
    }
  }

  renderHistoryList() {
    const container = document.getElementById('history-list-container');
    if (!container) return;

    if (!this.runs.length) {
      container.innerHTML = `
        <div class="empty-history">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <p>Nenhuma corrida salva ainda.</p>
          <span>Conecte o Garmin e grave suas corridas no mapa!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.runs.map(run => `
      <div class="history-item-card" data-id="${run.id}">
        <div class="history-item-header">
          <h4 class="run-title">${run.name || 'Corrida de Rua'}</h4>
          <span class="run-date">${new Date(run.createdAt || run.date).toLocaleDateString('pt-BR')}</span>
        </div>

        <div class="history-item-stats">
          <div class="stat">
            <span class="lbl">Distância</span>
            <span class="val"><strong>${run.actualDistanceKm}</strong> km</span>
          </div>
          <div class="stat">
            <span class="lbl">Tempo</span>
            <span class="val">⏱️ ${run.durationFormatted}</span>
          </div>
          <div class="stat">
            <span class="lbl">Ritmo</span>
            <span class="val">⚡ ${run.avgPace}</span>
          </div>
        </div>

        ${run.plannedDistanceKm ? `
          <div class="planned-vs-actual">
            <span>Rota Planejada: ${Number(run.plannedDistanceKm).toFixed(2)} km</span>
          </div>
        ` : ''}
      </div>
    `).join('');
  }

  selectRun(id) {
    const run = this.runs.find(r => r.id === id);
    if (run) {
      this.closeDrawer();
      this.onSelectRun(run);
    }
  }
}