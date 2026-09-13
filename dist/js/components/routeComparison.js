/**
 * Componente RouteComparison - Renderização e Comparação da Rota Planejada vs Traçado Real Garmin
 */
export class RouteComparison {
  constructor(options = {}) {
    this.mapAdapter = options.mapAdapter;
    this.container = options.container || document.getElementById('comparison-stats-slot');
    this.onSaveRun = options.onSaveRun || (() => {});
    
    this.currentGarminTrackLayer = null;
    this.currentGarminActivity = null;
    this.plannedDistanceKm = 0;
    
    this.init();
  }

  init() {
    this.render();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div id="comparison-card" class="comparison-card glass-panel hidden" data-testid="comparison-card">
        <div class="comparison-header">
          <div class="badge-garmin-active">
            <span class="pulse-dot"></span>
            <span id="garmin-run-title">Garmin Run Synchronized</span>
          </div>
          <button type="button" class="btn-close-sm" id="btn-close-comparison">&times;</button>
        </div>

        <div class="comparison-grid">
          <div class="comp-col">
            <span class="comp-label">Planejado</span>
            <span class="comp-val" id="comp-planned-dist">-- km</span>
          </div>
          <div class="comp-divider"></div>
          <div class="comp-col">
            <span class="comp-label">Real (Garmin)</span>
            <span class="comp-val highlight-garmin" id="comp-actual-dist">-- km</span>
          </div>
          <div class="comp-divider"></div>
          <div class="comp-col">
            <span class="comp-label">Ritmo / Pace</span>
            <span class="comp-val" id="comp-pace">-- min/km</span>
          </div>
          <div class="comp-divider"></div>
          <div class="comp-col">
            <span class="comp-label">Tempo</span>
            <span class="comp-val" id="comp-duration">--:--</span>
          </div>
        </div>

        <div class="comparison-actions">
          <button type="button" class="btn btn-success btn-block" id="btn-save-run-history">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Salvar no Histórico de Treinos
          </button>
        </div>
      </div>
    `;

    document.getElementById('btn-close-comparison')?.addEventListener('click', () => this.clearComparison());
    document.getElementById('btn-save-run-history')?.addEventListener('click', () => this.saveRun());
  }

  showActivity(activity, plannedDistKm = 0) {
    this.currentGarminActivity = activity;
    this.plannedDistanceKm = plannedDistKm;

    const card = document.getElementById('comparison-card');
    if (card) {
      card.classList.remove('hidden');
    }

    document.getElementById('garmin-run-title').innerText = activity.name || 'Treino Garmin';
    document.getElementById('comp-planned-dist').innerText = plannedDistKm ? `${plannedDistKm.toFixed(2)} km` : '--';
    document.getElementById('comp-actual-dist').innerText = `${activity.distanceKm} km`;
    document.getElementById('comp-pace').innerText = activity.avgPace;
    document.getElementById('comp-duration').innerText = activity.durationFormatted;

    // Draw Garmin Track on Map
    if (this.mapAdapter && activity.track && activity.track.length) {
      this.drawGarminTrackOnMap(activity.track);
    }
  }

  drawGarminTrackOnMap(coords) {
    if (this.currentGarminTrackLayer) {
      if (typeof this.currentGarminTrackLayer.remove === 'function') {
        this.currentGarminTrackLayer.remove();
      }
    }

    if (this.mapAdapter && this.mapAdapter.drawGarminPolyline) {
      this.currentGarminTrackLayer = this.mapAdapter.drawGarminPolyline(coords);
    } else if (this.mapAdapter && this.mapAdapter.instance) {
      const L = window.L;
      if (L) {
        this.currentGarminTrackLayer = L.polyline(coords, {
          color: '#00f0ff',
          weight: 5,
          opacity: 0.9,
          dashArray: '8, 6'
        }).addTo(this.mapAdapter.instance);

        this.mapAdapter.instance.fitBounds(this.currentGarminTrackLayer.getBounds(), { padding: [50, 50] });
      }
    }
  }

  clearComparison() {
    const card = document.getElementById('comparison-card');
    if (card) card.classList.add('hidden');

    if (this.currentGarminTrackLayer && typeof this.currentGarminTrackLayer.remove === 'function') {
      this.currentGarminTrackLayer.remove();
      this.currentGarminTrackLayer = null;
    }
    this.currentGarminActivity = null;
  }

  saveRun() {
    if (!this.currentGarminActivity) return;

    const runPayload = {
      name: this.currentGarminActivity.name,
      plannedDistanceKm: this.plannedDistanceKm,
      actualDistanceKm: this.currentGarminActivity.distanceKm,
      avgPace: this.currentGarminActivity.avgPace,
      durationFormatted: this.currentGarminActivity.durationFormatted,
      date: this.currentGarminActivity.date || new Date().toISOString(),
      actualTrack: this.currentGarminActivity.track
    };

    this.onSaveRun(runPayload);
    this.clearComparison();
  }
}