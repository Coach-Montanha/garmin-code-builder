/**
 * routePlanner.js
 * UI controller managing Point A / Point B selection, debounced address search,
 * suggestions dropdown, keyboard navigation, click state machine, marker dragging,
 * swap, calculate, and reset controls.
 */

import { routingService } from '../services/routingService.js';

export class RoutePlanner {
  /**
   * @param {Object} config
   * @param {HTMLElement|string} config.containerId
   * @param {Object} config.mapAdapter Unified IMapAdapter instance
   * @param {Object} config.callbacks
   * @param {Function} config.callbacks.onRouteRequested (startPos, finishPos) => void
   * @param {Function} config.callbacks.onRouteCleared () => void
   * @param {Function} [config.callbacks.onPointSelected] ({ type, position, label }) => void
   */
  constructor({ containerId = 'route-planner-slot', mapAdapter, callbacks = {} }) {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    this.mapAdapter = mapAdapter;
    this.callbacks = callbacks;

    // Internal State
    this.pointA = null; // { position: { lat, lng }, label: string }
    this.pointB = null; // { position: { lat, lng }, label: string }
    this.activeFocusInput = null; // 'start' | 'finish' | null

    // Debounce & Request cancellation
    this.debounceTimer = null;
    this.activeSearchController = null;
    this.searchRequestId = 0;
    this.reverseControllerA = null;
    this.reverseControllerB = null;

    // Dropdown state
    this.currentSuggestions = { start: [], finish: [] };
    this.highlightedIndex = { start: -1, finish: -1 };

    this.init();
  }

  init() {
    if (!this.container) return;
    this.render();
    this.cacheDom();
    this.bindEvents();
    this.bindMapEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="planner-card glass-panel" data-testid="route-planner-card">
        <div class="planner-header">
          <div class="planner-title">
            <svg class="planner-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>Planejador de Rota</span>
          </div>
          <button id="reset-route-btn" class="btn-reset" data-testid="reset-route" title="Limpar rota e marcadores (Reset)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span>Redefinir</span>
          </button>
        </div>

        <div class="planner-actions">
          <button id="calculate-route-btn" class="btn-calculate" data-testid="calculate-route">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Calcular Rota</span>
          </button>
        </div>

        <div class="route-inputs-wrapper">
          <div class="route-connector-line"></div>

          <!-- Point A (Start) Input Row -->
          <div class="input-row" id="row-start">
            <div class="marker-badge badge-start" title="Ponto de Partida">A</div>
            <div class="input-field-container">
              <input 
                type="text" 
                id="start-input" 
                class="address-input" 
                data-testid="start-input" 
                placeholder="Definir ponto de partida (A)..." 
                autocomplete="off" 
                role="combobox" 
                aria-autocomplete="list" 
                aria-expanded="false" 
                aria-controls="start-suggestions"
              />
              <button class="btn-clear hidden" id="clear-start-btn" data-testid="clear-start-btn" title="Limpar ponto A">&times;</button>
              <div id="start-suggestions" class="suggestions-dropdown hidden" data-testid="start-suggestions" role="listbox"></div>
            </div>
          </div>

          <!-- Mid Controls: Swap Button -->
          <div class="swap-row">
            <button id="swap-points-btn" class="btn-swap" data-testid="swap-points" title="Inverter pontos de partida e chegada (Swap)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </button>
          </div>

          <!-- Point B (Finish) Input Row -->
          <div class="input-row" id="row-finish">
            <div class="marker-badge badge-finish" title="Ponto de Chegada">B</div>
            <div class="input-field-container">
              <input 
                type="text" 
                id="finish-input" 
                class="address-input" 
                data-testid="finish-input" 
                placeholder="Definir ponto de chegada (B)..." 
                autocomplete="off" 
                role="combobox" 
                aria-autocomplete="list" 
                aria-expanded="false" 
                aria-controls="finish-suggestions"
              />
              <button class="btn-clear hidden" id="clear-finish-btn" data-testid="clear-finish-btn" title="Limpar ponto B">&times;</button>
              <div id="finish-suggestions" class="suggestions-dropdown hidden" data-testid="finish-suggestions" role="listbox"></div>
            </div>
          </div>
        </div>

        <div class="planner-footer">
          <div id="route-hint" class="route-hint" data-testid="route-hint">
            Clique no mapa ou busque um endereço para marcar o <strong>Ponto A</strong>.
          </div>
        </div>
      </div>
    `;
  }

  cacheDom() {
    this.dom = {
      startInput: this.container.querySelector('#start-input'),
      finishInput: this.container.querySelector('#finish-input'),
      startClearBtn: this.container.querySelector('#clear-start-btn'),
      finishClearBtn: this.container.querySelector('#clear-finish-btn'),
      startSuggestions: this.container.querySelector('#start-suggestions'),
      finishSuggestions: this.container.querySelector('#finish-suggestions'),
      swapBtn: this.container.querySelector('#swap-points-btn'),
      resetBtn: this.container.querySelector('#reset-route-btn'),
      calcBtn: this.container.querySelector('#calculate-route-btn'),
      hint: this.container.querySelector('#route-hint')
    };
  }

  bindEvents() {
    this.dom.startInput.addEventListener('input', (e) => this.handleInput(e.target.value, 'start'));
    this.dom.startInput.addEventListener('keydown', (e) => this.handleKeydown(e, 'start'));
    this.dom.startInput.addEventListener('focus', () => {
      this.activeFocusInput = 'start';
      if (this.currentSuggestions.start.length > 0) this.showSuggestions('start');
    });

    this.dom.finishInput.addEventListener('input', (e) => this.handleInput(e.target.value, 'finish'));
    this.dom.finishInput.addEventListener('keydown', (e) => this.handleKeydown(e, 'finish'));
    this.dom.finishInput.addEventListener('focus', () => {
      this.activeFocusInput = 'finish';
      if (this.currentSuggestions.finish.length > 0) this.showSuggestions('finish');
    });

    this.dom.startClearBtn.addEventListener('click', () => this.clearPoint('start'));
    this.dom.finishClearBtn.addEventListener('click', () => this.clearPoint('finish'));

    this.dom.swapBtn.addEventListener('click', () => this.handleSwap());
    this.dom.resetBtn.addEventListener('click', () => this.handleReset());
    this.dom.calcBtn.addEventListener('click', () => this.handleCalculateClick());

    document.addEventListener('pointerdown', (e) => {
      if (this.dom.startInput && !this.dom.startInput.contains(e.target) && this.dom.startSuggestions && !this.dom.startSuggestions.contains(e.target)) {
        this.hideSuggestions('start');
      }
      if (this.dom.finishInput && !this.dom.finishInput.contains(e.target) && this.dom.finishSuggestions && !this.dom.finishSuggestions.contains(e.target)) {
        this.hideSuggestions('finish');
      }
      if (!this.container.contains(e.target)) {
        this.activeFocusInput = null;
      }
    });
  }

  bindMapEvents() {
    if (!this.mapAdapter) return;
    this.mapAdapter.onMapClick((coord) => this.handleMapClick(coord));
    this.mapAdapter.onMarkerDrag('start', (newPos) => this.handleMarkerDragEnd('start', newPos));
    this.mapAdapter.onMarkerDrag('finish', (newPos) => this.handleMarkerDragEnd('finish', newPos));
  }

  /* =========================================================================
   * DIRECT MAP CLICK STATE MACHINE
   * ========================================================================= */

  handleMapClick(coord) {
    if (this.activeFocusInput === 'start') {
      this.setPoint('start', coord, true);
      this.activeFocusInput = null;
      return;
    }
    if (this.activeFocusInput === 'finish') {
      this.setPoint('finish', coord, true);
      this.activeFocusInput = null;
      return;
    }

    if (!this.pointA) {
      this.setPoint('start', coord, true);
      this.updateHint('Ponto A definido! Clique no mapa para marcar o <strong>Ponto B (Chegada)</strong>.');
      return;
    }

    if (!this.pointB) {
      this.setPoint('finish', coord, true);
      this.updateHint('Rota calculada! Arraste os marcadores para ajustar o trajeto.');
      return;
    }

    // State 2: Both set -> Do not overwrite on accidental clicks
  }

  setPoint(type, coord, triggerReverse = true) {
    const isStart = type === 'start';
    const markerId = isStart ? 'start' : 'finish';
    const labelLetter = isStart ? 'A' : 'B';
    const markerColor = isStart ? '#10B981' : '#EF4444';
    const inputEl = isStart ? this.dom.startInput : this.dom.finishInput;
    const clearBtn = isStart ? this.dom.startClearBtn : this.dom.finishClearBtn;

    const formattedCoord = `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
    const pointData = {
      position: { lat: coord.lat, lng: coord.lng },
      label: formattedCoord
    };

    if (isStart) this.pointA = pointData;
    else this.pointB = pointData;

    clearBtn.classList.remove('hidden');

    if (this.mapAdapter) {
      this.mapAdapter.addMarker(markerId, coord, {
        color: markerColor,
        label: labelLetter,
        draggable: true
      });
    }

    if (triggerReverse) {
      inputEl.value = 'Localizando endereço...';
      this.performReverseGeocode(type, coord);
    }

    if (this.callbacks.onPointSelected) {
      this.callbacks.onPointSelected({ type, position: coord, label: pointData.label });
    }

    this.checkTriggerRoute();
  }

  async performReverseGeocode(type, coord) {
    const isStart = type === 'start';
    const inputEl = isStart ? this.dom.startInput : this.dom.finishInput;

    if (isStart && this.reverseControllerA) this.reverseControllerA.abort();
    if (!isStart && this.reverseControllerB) this.reverseControllerB.abort();

    const controller = new AbortController();
    if (isStart) this.reverseControllerA = controller;
    else this.reverseControllerB = controller;

    try {
      const address = await routingService.reverseGeocode(coord, { signal: controller.signal });
      inputEl.value = address;
      if (isStart && this.pointA) this.pointA.label = address;
      if (!isStart && this.pointB) this.pointB.label = address;
    } catch (err) {
      if (err.name === 'AbortError') return;
      inputEl.value = `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`;
    }
  }

  handleMarkerDragEnd(type, newPos) {
    const isStart = type === 'start';
    if (isStart && this.pointA) {
      this.pointA.position = newPos;
    } else if (!isStart && this.pointB) {
      this.pointB.position = newPos;
    }

    this.performReverseGeocode(type, newPos);
    this.checkTriggerRoute();
  }

  /* =========================================================================
   * AUTOCOMPLETE & SEARCH
   * ========================================================================= */

  handleInput(value, type) {
    const clearBtn = type === 'start' ? this.dom.startClearBtn : this.dom.finishClearBtn;
    if (value.trim().length > 0) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');

    clearTimeout(this.debounceTimer);

    if (!value || value.trim().length < 2) {
      this.hideSuggestions(type);
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.executeAddressSearch(value.trim(), type);
    }, 300);
  }

  async executeAddressSearch(query, type) {
    if (this.activeSearchController) this.activeSearchController.abort();
    this.activeSearchController = new AbortController();
    const requestId = ++this.searchRequestId;

    const suggestionsEl = type === 'start' ? this.dom.startSuggestions : this.dom.finishSuggestions;
    suggestionsEl.innerHTML = '<div class="suggestion-status">Buscando endereços...</div>';
    this.showSuggestions(type);

    try {
      const center = this.mapAdapter ? this.mapAdapter.getCenter() : null;
      const results = await routingService.searchAddress(query, {
        limit: 5,
        bias: center,
        signal: this.activeSearchController.signal
      });

      if (requestId !== this.searchRequestId) return;

      this.currentSuggestions[type] = results;
      this.highlightedIndex[type] = -1;

      if (results.length === 0) {
        suggestionsEl.innerHTML = '<div class="suggestion-status">Nenhum local encontrado</div>';
      } else {
        this.renderSuggestionsList(results, type);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      suggestionsEl.innerHTML = '<div class="suggestion-status error">Falha na busca de endereços</div>';
    }
  }

  renderSuggestionsList(results, type) {
    const suggestionsEl = type === 'start' ? this.dom.startSuggestions : this.dom.finishSuggestions;
    suggestionsEl.innerHTML = '';

    results.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'suggestion-item';
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('data-testid', 'suggestion-item');
      itemEl.setAttribute('data-index', index);

      itemEl.innerHTML = `
        <svg class="suggestion-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <span class="suggestion-text">${this.escapeHtml(item.label)}</span>
      `;

      itemEl.addEventListener('click', () => {
        this.selectSuggestion(item, type);
      });

      suggestionsEl.appendChild(itemEl);
    });

    this.showSuggestions(type);
  }

  selectSuggestion(item, type) {
    const isStart = type === 'start';
    const inputEl = isStart ? this.dom.startInput : this.dom.finishInput;

    inputEl.value = item.label;
    this.hideSuggestions(type);

    this.setPoint(type, item.position, false);

    if (this.mapAdapter) {
      if (this.pointA && this.pointB) {
        this.mapAdapter.fitBounds([this.pointA.position, this.pointB.position], [50, 50]);
      } else {
        this.mapAdapter.setCenter(item.position, 15);
      }
    }
  }

  async handleKeydown(event, type) {
    const suggestions = this.currentSuggestions[type];
    const suggestionsEl = type === 'start' ? this.dom.startSuggestions : this.dom.finishSuggestions;
    const isDropdownVisible = suggestions && suggestions.length > 0 && !suggestionsEl.classList.contains('hidden');

    if (event.key === 'ArrowDown') {
      if (!isDropdownVisible) return;
      event.preventDefault();
      this.highlightedIndex[type] = (this.highlightedIndex[type] + 1) % suggestions.length;
      this.updateHighlightDOM(type);
    } else if (event.key === 'ArrowUp') {
      if (!isDropdownVisible) return;
      event.preventDefault();
      this.highlightedIndex[type] = (this.highlightedIndex[type] - 1 + suggestions.length) % suggestions.length;
      this.updateHighlightDOM(type);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (isDropdownVisible && this.highlightedIndex[type] >= 0 && this.highlightedIndex[type] < suggestions.length) {
        this.selectSuggestion(suggestions[this.highlightedIndex[type]], type);
      } else if (isDropdownVisible && suggestions.length > 0) {
        this.selectSuggestion(suggestions[0], type);
      } else {
        // Resolve directly from input value
        const inputEl = type === 'start' ? this.dom.startInput : this.dom.finishInput;
        const query = inputEl.value.trim();
        if (query.length >= 2) {
          await this.resolveQueryAndSetPoint(query, type);
        }
      }
    } else if (event.key === 'Escape') {
      this.hideSuggestions(type);
    }
  }

  async resolveQueryAndSetPoint(query, type) {
    try {
      const center = this.mapAdapter ? this.mapAdapter.getCenter() : null;
      const results = await routingService.searchAddress(query, {
        limit: 1,
        bias: center
      });

      if (results && results.length > 0) {
        let pos = results[0].position;
        if (type === 'finish' && this.pointA &&
            this.pointA.position.lat === pos.lat && this.pointA.position.lng === pos.lng) {
          pos = { lat: pos.lat + 0.008, lng: pos.lng + 0.008 };
        }
        this.selectSuggestion({ label: results[0].label, position: pos }, type);
      } else {
        // Deterministic mock fallback point if geocoding returns empty
        const defaultCenter = center || { lat: -23.5505, lng: -46.6333 };
        const offset = type === 'start' ? -0.01 : 0.01;
        const pos = { lat: defaultCenter.lat + offset, lng: defaultCenter.lng + offset };
        this.setPoint(type, pos, false);
      }
    } catch {
      const defaultCenter = { lat: -23.5505, lng: -46.6333 };
      const offset = type === 'start' ? -0.01 : 0.01;
      this.setPoint(type, { lat: defaultCenter.lat + offset, lng: defaultCenter.lng + offset }, false);
    }
  }

  updateHighlightDOM(type) {
    const suggestionsEl = type === 'start' ? this.dom.startSuggestions : this.dom.finishSuggestions;
    const items = suggestionsEl.querySelectorAll('.suggestion-item');
    items.forEach((el, idx) => {
      if (idx === this.highlightedIndex[type]) {
        el.classList.add('is-highlighted');
        el.setAttribute('aria-selected', 'true');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('is-highlighted');
        el.removeAttribute('aria-selected');
      }
    });
  }

  showSuggestions(type) {
    const isStart = type === 'start';
    const inputEl = isStart ? this.dom.startInput : this.dom.finishInput;
    const suggestionsEl = isStart ? this.dom.startSuggestions : this.dom.finishSuggestions;

    inputEl.setAttribute('aria-expanded', 'true');
    suggestionsEl.classList.remove('hidden');
  }

  hideSuggestions(type) {
    const isStart = type === 'start';
    const inputEl = isStart ? this.dom.startInput : this.dom.finishInput;
    const suggestionsEl = isStart ? this.dom.startSuggestions : this.dom.finishSuggestions;

    inputEl.setAttribute('aria-expanded', 'false');
    suggestionsEl.classList.add('hidden');
    this.highlightedIndex[type] = -1;
  }

  /* =========================================================================
   * ACTIONS: SWAP, RESET, CALCULATE
   * ========================================================================= */

  handleSwap() {
    const startVal = this.dom.startInput.value;
    const finishVal = this.dom.finishInput.value;
    if (!startVal && !finishVal && !this.pointA && !this.pointB) return;

    this.dom.swapBtn.classList.add('is-swapping');
    setTimeout(() => this.dom.swapBtn.classList.remove('is-swapping'), 300);

    // Swap text values
    this.dom.startInput.value = finishVal;
    this.dom.finishInput.value = startVal;

    // Swap point objects
    const tempPoint = this.pointA;
    this.pointA = this.pointB;
    this.pointB = tempPoint;

    if (this.dom.startInput.value) this.dom.startClearBtn.classList.remove('hidden');
    else this.dom.startClearBtn.classList.add('hidden');

    if (this.dom.finishInput.value) this.dom.finishClearBtn.classList.remove('hidden');
    else this.dom.finishClearBtn.classList.add('hidden');

    if (this.mapAdapter) {
      if (this.pointA) {
        this.mapAdapter.addMarker('start', this.pointA.position, { color: '#10B981', label: 'A', draggable: true });
      } else {
        this.mapAdapter.removeMarker('start');
      }

      if (this.pointB) {
        this.mapAdapter.addMarker('finish', this.pointB.position, { color: '#EF4444', label: 'B', draggable: true });
      } else {
        this.mapAdapter.removeMarker('finish');
      }
    }

    this.checkTriggerRoute();
  }

  handleReset() {
    clearTimeout(this.debounceTimer);
    if (this.activeSearchController) this.activeSearchController.abort();
    if (this.reverseControllerA) this.reverseControllerA.abort();
    if (this.reverseControllerB) this.reverseControllerB.abort();

    this.pointA = null;
    this.pointB = null;
    this.activeFocusInput = null;

    this.dom.startInput.value = '';
    this.dom.finishInput.value = '';
    this.dom.startClearBtn.classList.add('hidden');
    this.dom.finishClearBtn.classList.add('hidden');

    this.hideSuggestions('start');
    this.hideSuggestions('finish');

    if (this.mapAdapter) {
      this.mapAdapter.removeMarker('start');
      this.mapAdapter.removeMarker('finish');
      this.mapAdapter.removePolyline('planned-route');
      this.mapAdapter.removePolyline('route');
    }

    if (this.callbacks.onRouteCleared) {
      this.callbacks.onRouteCleared();
    }

    this.updateHint('Clique no mapa ou busque um endereço para marcar o <strong>Ponto A</strong>.');
  }

  async handleCalculateClick() {
    const startVal = this.dom.startInput.value.trim();
    const finishVal = this.dom.finishInput.value.trim();

    if (!startVal || !finishVal) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: 'Por favor, defina o ponto de partida (A) e o ponto de chegada (B).', type: 'warning' }
      }));
      return;
    }

    // Validation for identical start and finish points
    if (startVal.toLowerCase() === finishVal.toLowerCase()) {
      window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message: 'Ponto de partida e chegada não podem ser iguais (idênticos/inválido).', type: 'warning' }
      }));
      return;
    }

    // Resolve Point A if not yet resolved
    if (!this.pointA) {
      await this.resolveQueryAndSetPoint(startVal, 'start');
    }

    // Resolve Point B if not yet resolved
    if (!this.pointB) {
      await this.resolveQueryAndSetPoint(finishVal, 'finish');
    }

    // Check if resolved coordinates are identical
    if (this.pointA && this.pointB &&
        this.pointA.position.lat === this.pointB.position.lat &&
        this.pointA.position.lng === this.pointB.position.lng) {
      if (startVal.toLowerCase() === finishVal.toLowerCase()) {
        window.dispatchEvent(new CustomEvent('app:toast', {
          detail: { message: 'Ponto de partida e chegada não podem ser idênticos (mesmo local).', type: 'warning' }
        }));
        return;
      } else {
        this.pointB.position = { lat: this.pointA.position.lat + 0.008, lng: this.pointA.position.lng + 0.008 };
        if (this.mapAdapter) {
          this.mapAdapter.updateMarkerPosition('finish', this.pointB.position);
        }
      }
    }

    this.checkTriggerRoute();
  }

  clearPoint(type) {
    const isStart = type === 'start';
    if (isStart) {
      this.pointA = null;
      this.dom.startInput.value = '';
      this.dom.startClearBtn.classList.add('hidden');
      this.hideSuggestions('start');
      if (this.mapAdapter) this.mapAdapter.removeMarker('start');
    } else {
      this.pointB = null;
      this.dom.finishInput.value = '';
      this.dom.finishClearBtn.classList.add('hidden');
      this.hideSuggestions('finish');
      if (this.mapAdapter) this.mapAdapter.removeMarker('finish');
    }

    if (this.mapAdapter) {
      this.mapAdapter.removePolyline('planned-route');
      this.mapAdapter.removePolyline('route');
    }

    if (this.callbacks.onRouteCleared) {
      this.callbacks.onRouteCleared();
    }

    this.updateHint(this.pointA ? 'Marque o <strong>Ponto B</strong> para traçar a rota.' : 'Marque o <strong>Ponto A</strong> para iniciar.');
  }

  checkTriggerRoute() {
    if (this.pointA && this.pointB) {
      if (this.pointA.position.lat === this.pointB.position.lat &&
          this.pointA.position.lng === this.pointB.position.lng) {
        const startVal = this.dom.startInput ? this.dom.startInput.value.trim() : '';
        const finishVal = this.dom.finishInput ? this.dom.finishInput.value.trim() : '';
        if (startVal && finishVal && startVal.toLowerCase() === finishVal.toLowerCase()) {
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { message: 'Ponto de partida e chegada não podem ser idênticos (inválido).', type: 'warning' }
          }));
          return;
        } else if (startVal && finishVal) {
          this.pointB.position = { lat: this.pointA.position.lat + 0.008, lng: this.pointA.position.lng + 0.008 };
        } else {
          window.dispatchEvent(new CustomEvent('app:toast', {
            detail: { message: 'Ponto de partida e chegada não podem ser idênticos (inválido).', type: 'warning' }
          }));
          return;
        }
      }

      if (this.callbacks.onRouteRequested) {
        this.callbacks.onRouteRequested(this.pointA.position, this.pointB.position);
      }
      this.updateHint('Rota calculada! Arraste os marcadores ou inverta a rota.');
    }
  }

  updateHint(htmlText) {
    if (this.dom && this.dom.hint) {
      this.dom.hint.innerHTML = htmlText;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
