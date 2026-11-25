const API_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'rpa_weather_cache_v2';
const API_TIMEOUT_MS = 12000;

const state = {
    districts: [],
    crops: [],
    forecasts: {},    
    selectedCrop: null,  
    results: [],  
    filtered: [],      
    lastUpdated: null,    
    usingCache: false,
};

const el = {
    currentDate: document.getElementById('currentDate'),
    apiStatusDot: document.getElementById('apiStatusDot'),
    apiStatusText: document.getElementById('apiStatusText'),
    searchInput: document.getElementById('searchInput'),
    provinceSelect: document.getElementById('provinceSelect'),
    cropSelect: document.getElementById('cropSelect'),
    sortSelect: document.getElementById('sortSelect'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    cacheNotice: document.getElementById('cacheNotice'),
    cacheTime: document.getElementById('cacheTime'),
    summaryTotal: document.getElementById('summaryTotal'),
    summaryGood: document.getElementById('summaryGood'),
    summaryPrecaution: document.getElementById('summaryPrecaution'),
    summaryWait: document.getElementById('summaryWait'),
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    retryBtn: document.getElementById('retryBtn'),
    emptyState: document.getElementById('emptyState'),
    emptyClearBtn: document.getElementById('emptyClearBtn'),
    tableWrap: document.getElementById('tableWrap'),
    resultsBody: document.getElementById('resultsBody'),
    cardsWrap: document.getElementById('cardsWrap'),
    resultsSection: document.querySelector('.results'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalSummary: document.getElementById('modalSummary'),
    modalDaily: document.getElementById('modalDaily'),
    modalExplanation: document.getElementById('modalExplanation'),   
};

const fmt = (n, digits = 1) =>
  Number.isFinite(n) ? Number(n.toFixed(digits)) : null;

function setApiStatus(status, text) {
  el.apiStatusDot.className = 'status-dot status-' + status;
  el.apiStatusText.textContent = text;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Kigali',
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
  });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Kigali',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function showOnly(id) {
  ['loadingState', 'errorState', 'emptyState', 'tableWrap', 'cardsWrap'].forEach((k) => {
    el[k].hidden = true;
  });
  if (id) el[id].hidden = false;
}
// loading data
async function loadStaticData() {
  const [distRes, cropRes] = await Promise.all([
    fetch('data/districts.json'),
    fetch('data/crops.json'),
  ]);

  if (!distRes.ok || !cropRes.ok) {
    throw new Error('Could not load local district or crop data.');
  }

  const districts = await distRes.json();
  const crops = await cropRes.json();

  if (!Array.isArray(districts) || districts.length === 0) {
    throw new Error('The district dataset is empty or invalid.');
  }

  if (!Array.isArray(crops) || crops.length === 0) {
    throw new Error('The crop dataset is empty or invalid.');
  }

  const districtNames = new Set();

  for (const d of districts) {
    const districtName =
      typeof d?.name === 'string'
        ? d.name.trim().toLowerCase()
        : '';
    if (
      !d ||
      !districtName ||
      typeof d.province !== 'string' ||
      !d.province.trim() ||
      !isFiniteNum(d.latitude) ||
      !isFiniteNum(d.longitude) ||
      d.latitude < -90 ||
      d.latitude > 90 ||
      d.longitude < -180 ||
      d.longitude > 180 ||
      districtNames.has(districtName)
    ){
      throw new Error(
        'The district dataset contains invalid or duplicate district records.'
      );
    }
    districtNames.add(districtName);
  }
  const invalidCrop = crops.some((crop) =>
    !crop ||
    typeof crop.name !== 'string' ||
    !crop.name.trim() ||
    !isValidCrop(crop)
  );

  if (invalidCrop) {
    throw new Error(
      'The crop dataset contains invalid crop names or reference values.'
    );
  }

  state.districts = districts;
  state.crops = crops;
}


function populateControls() {
  // provinces
  el.provinceSelect.innerHTML = '';

  const allProvinces = document.createElement('option');
  allProvinces.value = '';
  allProvinces.textContent = 'All provinces';
  el.provinceSelect.appendChild(allProvinces);

  const provinces = [...new Set(state.districts.map((d) => d.province))].sort();

  provinces.forEach((province) => {
    const opt = document.createElement('option');
    opt.value = province; 
    opt.textContent = province;
    el.provinceSelect.appendChild(opt);
  });

  // crops

  el.cropSelect.innerHTML = '';
  if(state.crops.length === 0){
    throw new Error('No crops are available in the crop dataset');
  }

  state.crops.forEach((crop) => {
    const opt = document.createElement('option');
    opt.value = crop.name; 
    opt.textContent = crop.name;
    el.cropSelect.appendChild(opt);
  });

  state.selectedCrop = state.crops[0];
  el.cropSelect.value = state.selectedCrop.name;
  el.cropSelect.required = true;
}

// fetching from OpenMeteo API

function buildBatchUrl() {
  const lats = state.districts.map((d) => d.latitude).join(',');
  const lons = state.districts.map((d) => d.longitude).join(',');
  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    daily: 'precipitation_sum,temperature_2m_mean',
    forecast_days: '7',
    timezone: 'Africa/Kigali',
  });
  return `${API_URL}?${params.toString()}`;
}

function isFiniteNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseOneLocation(w) {
  if (!w || typeof w !== 'object' || !w.daily) return null;

  const rain = w.daily.precipitation_sum;
  const temp = w.daily.temperature_2m_mean;
  const dates = w.daily.time;

  if (!Array.isArray(rain) || !Array.isArray(temp) || !Array.isArray(dates)) {
    return null;
  }

  const expectedDays = 7;
  if (rain.length !== expectedDays || temp.length !== expectedDays || dates.length !== expectedDays){
    return null;
  }

  if(rain.some((r) => r == null || !isFiniteNum(r) || r < 0)){
    return null;
  }

  if(dates.some((date) =>
    typeof date !== 'string' || Number.isNaN(Date.parse(date))
  )) {
    return null;
  }

  const cleanRain = rain;

  const cleanTemp = temp.map((t) => isFiniteNum(t) ? t : null);

  if (cleanRain.some((r) => !isFiniteNum(r))) return null;

  const totalRain = cleanRain.reduce((a, b) => a + b, 0);
  const knownTemps = cleanTemp.filter((t) => t != null && isFiniteNum(t));
  const avgTemp = knownTemps.length >= 4
    ? knownTemps.reduce((a, b) => a + b, 0) / knownTemps.length
    : null;

    return {
    totalRain: fmt(totalRain, 1),
    avgTemp: fmt(avgTemp, 1),
    daily: dates.map((date, j) => ({
      date,
      rain: cleanRain[j],
      temp: cleanTemp[j] != null && isFiniteNum(cleanTemp[j]) ? cleanTemp[j] : null,
    })),
  };
}

function parseForecastResponse(data) {
    let list = Array.isArray(data) ? data : [data];

    if(!Array.isArray(state.districts) || state.districts.length === 0){
      throw new Error('Unexpected response: no districts were loaded.');
    }

    if(list.length !== state.districts.length){
        throw new Error(
            'Unexpected response: API returned ' + list.length + ' locations but ' +
            state.districts.length + ' were requested.'
        );
    }

    const out = {};

    list.forEach((weather, index) => {
      const district = state.districts[index];
      
      if(!district || !district.name){
        throw new Error('Unexpected response: a district is missing its name.');
      }

      out[district.name] = parseOneLocation(weather);

    });
    
    const validForecasts = Object.values(out).filter(
      (forecast) => forecast !==null
    );

    if(validForecasts.length === 0){
      throw new Error(
        'Unexpected response: no valid forecast data was received.'
      );
    }

    return out;
}

async function fetchForecasts() {
      let timer;

      el.resultsSection.setAttribute('aria-busy', 'true');
      
      try {
          const url = buildBatchUrl();
          const controller = new AbortController();

          timer = setTimeout(
            () => controller.abort(),
            API_TIMEOUT_MS
          );

          const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          throw new Error('API returned status ' + res.status);
        }

        const data = await res.json();
        const parsed = parseForecastResponse(data);

        state.forecasts = parsed;
        state.lastUpdated = new Date().toISOString();
        state.usingCache = false;

        cacheForecasts(parsed, state.lastUpdated);
        setApiStatus('ok', 'API online');
        } catch (err) {
          handleFetchError(err);
        } finally {
          clearTimeout(timer);
          el.resultsSection.setAttribute('aria-busy', 'false')
        }
}

function handleFetchError(err){
  
        const cached = loadCachedForecasts();
        if (cached && cached.data){
            state.forecasts = cached.data;
            state.lastUpdated = cached.timestamp;
            state.usingCache = true;
            setApiStatus('error', 'API unavailable – using saved data');
            return;
        }

        state.forecasts = {};
        let msg = 'Could not load weather forecasts.';

        if(err && err.name === 'AbortError'){
          msg = 'The request timed out.';
          setApiStatus('error', 'API timed out');
        } else if (err instanceof TypeError){
          msg = 'No internet connection.';
          setApiStatus('error', 'Offline');
        } else if (
          err && err.message && err.message.includes('status 429')
        ){
          msg = 'Too many requests, please try again in a minute.';
          setApiStatus('error', 'Rate limit reached');
        } else if (
          err && err.message && err.message.startsWith('Unexpected response')
        ){
          msg = 'The weather service returned an unexpected response';
          setApiStatus('error','API response invalid');
        } else if (
          err && err.message && err.message.startsWith('API returned')
        ) {
          msg = 'The weather service returned an error.';
          setApiStatus('error', 'API error');
        } else {
          setApiStatus('error', 'API error');
        }
        showApiError(msg);
}

// localstorage cache

function cacheForecasts(data, timestamp) {
        try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp }));
        } catch (e) {
            // storage maybe full
        }    
}

function loadCachedForecasts() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            
            const parsed = JSON.parse(raw);

            const timestampIsValid = parsed && typeof parsed.timestamp === 'string' && Number.isFinite(Date.parse(parsed.timestamp));

            if(
              !timestampIsValid ||
              !parsed.data ||
              typeof parsed.data !== 'object' ||
              Array.isArray(parsed.data)
            ){
              return null
            }

            const validDistrictNames = new Set(
              state.districts.map(d => d.name)
            );
            const hasValidForecast = Object.entries(parsed.data).some(
              ([name, forecast]) =>
                validDistrictNames.has(name) &&
                forecast &&
                typeof forecast === 'object' &&
                (
                  forecast.totalRain === null ||
                  (
                 isFiniteNum(forecast.totalRain) &&
                 forecast.totalRain >= 0
                  )
                ) &&
                (
                  forecast.avgTemp === null ||
                  isFiniteNum(forecast.avgTemp)
                ) &&
                 Array.isArray(forecast.daily) &&
                 forecast.daily.length === 7
            );
            return hasValidForecast ? parsed : null;
            } catch (error) {
            return null;
        }
} 

// suitability and scoring

function scoreCondition(value, min, max) {

  if (!isFiniteNum(value)) return null; 
  if (value >= min && value <= max) return 50;
  const span = Math.max(max - min, 1);
  if (value < min) {
    const deficit = min - value;
    return Math.max(0, 50 - (deficit / span) * 50);
  }
  const excess = value - max;
  return Math.max(0, 50 - (excess / span) * 50);
}

function isValidCrop(crop){
  if(!crop || !crop.heuristic) return false;

  const h = crop.heuristic;

  return(
    isFiniteNum(h.minRain) &&
    isFiniteNum(h.maxRain) &&
    isFiniteNum(h.minTemp) &&
    isFiniteNum(h.maxTemp) &&
    h.minRain >= 0 &&
    h.maxRain > h.minRain &&
    h.maxTemp > h.minTemp &&
    isFiniteNum(h.maxRainExtremeFactor) &&
    h.maxRainExtremeFactor > 1
  );
}

function calculateSuitability(forecast, crop){  //heuristic values or normal ones

    if(!isValidCrop(crop)){
      return{
        outcome: 'no-data',
        score: null,
        label: 'No data',
        badgeClass: 'badge-no-data',
        recommendation: 'Crop reference data is unavailable.',
      };
    }

    const h = crop.heuristic;

    if (!forecast) {
      return {
      outcome: 'no-data',
      score: null,
      label: 'No data',
      badgeClass: 'badge-no-data',
      recommendation: 'No forecast data is available for this district, so a recommendation cannot be made.',
        };
    }

    const { totalRain, avgTemp } = forecast;

    const rainAvailable = isFiniteNum(totalRain);
    const tempAvailable = isFiniteNum(avgTemp);
    
    const rainScore = rainAvailable ? scoreCondition(totalRain, h.minRain, h.maxRain) : null;
    const tempScore = tempAvailable ? scoreCondition(avgTemp, h.minTemp, h.maxTemp) : null;

    const score = rainAvailable && tempAvailable ? Math.round (
      rainScore + tempScore
    ) : null;


    const rainOk = rainAvailable && totalRain >= h.minRain && totalRain <= h.maxRain;
    const tempOk = tempAvailable && avgTemp >= h.minTemp && avgTemp <= h.maxTemp;
    const extremeRain = rainAvailable && totalRain > h.maxRain * h.maxRainExtremeFactor;

    let outcome, label, badgeClass, recommendation;

    if (extremeRain) {
        outcome = 'wait';
        label = 'Wait';
        badgeClass = 'badge-wait';
        recommendation = 'Heavy rainfall is forecast, increasing the risk of waterlogging and erosion.';
    
    } else if(!rainAvailable && !tempAvailable){
        outcome = 'no-data';
        label = 'No data';
        badgeClass = 'badge-no-data';
        recommendation = 'Rainfall and temperatture are unavailable. A planting assessment cannot be made.';

    } else if(!rainAvailable || !tempAvailable){
        outcome = 'precaution';
        label = 'Take precautions';
        badgeClass = 'badge-precaution';

        if (!rainAvailable){
          recommendation = 'Rainfall data is unavailable. Temperature conditions can be assessed, but a complete planting recommendation can not be made.';
        } else {
          recommendation = 'Temperature data is unavailable. Rainfall conditions can be assessed, but a complete planting recommendation cannot be made';
        }

    } else if (rainOk && tempOk) {
        outcome = 'good';
        label = 'Good to plant';
        badgeClass = 'badge-good';
        recommendation = 'Rainfall is within the preferred range and temperatures are favourable.';
    
    } else if (!rainOk && !tempOk) {
        outcome = 'wait';
        label = 'Wait';
        badgeClass = 'badge-wait';
        if (totalRain < h.minRain && avgTemp < h.minTemp){
          recommendation = 'Limited rainfall is expected and temperatures are below the preferred range for this crop.';
        } else if (totalRain < h.minRain) {

          recommendation = avgTemp > h.maxTemp

          ? 'Limited rainfall is expected and temperatures are above the preferred range.'
          : 'Limited rainfall is expected, while temperatures are outside the preferred range.';
              
        } else if (totalRain > h.maxRain) {

          recommendation = avgTemp < h.minTemp
            ? 'Excess rainfall is expected and temperatures are below the preferred range.'
            : 'Excess rainfall is expected and temperatures are above the preferred range.';
  
        } else {
          recommendation = 'Both rainfall and temperature are outside the preferred range for this crop.';
        }
    
    } else {
      outcome = 'precaution';
      label = 'Take precautions';
      badgeClass = 'badge-precaution';

      if (totalRain < h.minRain) {
        recommendation = 'Only limited rainfall is expected, which may affect seed establishment.';

      } else if (totalRain > h.maxRain) {
        recommendation = 'Rainfall is above the preferred range; monitor for waterlogging.';
      } else if (avgTemp < h.minTemp) {
        recommendation = 'Temperatures are below the preferred range for this crop.';
      } else if (avgTemp > h.maxTemp) {
        recommendation = 'Temperatures are above the preferred range for this crop.';
      } else {
      recommendation = 'Weather conditions require further assessment.';
      }
    }
    return { outcome, score, label, badgeClass, recommendation};
}

function computeResults() {
  state.results = state.districts.map((district) => {
    const forecast = state.forecasts[district.name] || null;
    const suit = calculateSuitability(forecast, state.selectedCrop);
    return { district, forecast, ...suit };
  });
}

// filtering

function applyFilters() {
  const term = el.searchInput.value.trim().toLowerCase();
  const province = el.provinceSelect.value;
  const sort = el.sortSelect.value;

  let rows = state.results.filter((r) => {
    if (province && r.district.province !== province) return false;
    if (term && !r.district.name.toLowerCase().includes(term)) return false;
    return true;
  });

  switch (sort) {
    case 'suitability-desc': rows.sort((a, b) => {
      if(a.score === null && b.score === null) return 0;
      if(a.score === null) return 1;
      if(b.score === null) return -1;
      return b.score - a.score;
    });
      break;

    case 'suitability-asc':  rows.sort((a, b) => {
      if(a.score === null && b.score === null) return 0;
      if(a.score === null) return 1;
      if(b.score === null) return -1;
      return a.score - b.score;
    });
      break;
    case 'district-asc':     rows.sort((a, b) => a.district.name.localeCompare(b.district.name)); break;
    case 'district-desc':    rows.sort((a, b) => b.district.name.localeCompare(a.district.name)); break;
  }

  state.filtered = rows;
}

// rendering

function renderAll() {
  applyFilters();
  renderSummary();
  renderResults();
  renderCacheNotice();
}

function renderSummary() {
  el.summaryTotal.textContent = state.filtered.length;
  el.summaryGood.textContent = state.filtered.filter((r) => r.outcome === 'good').length;
  el.summaryPrecaution.textContent = state.filtered.filter((r) => r.outcome === 'precaution').length;
  el.summaryWait.textContent = state.filtered.filter((r) => r.outcome === 'wait').length;
}

function renderResults(){
    const anyData = Object.values(state.forecasts).some(forecast => forecast !==null);

    if (!anyData && state.filtered.length === 0) {
    showOnly('errorState');
    return;
    }

    if (state.filtered.length === 0) {
    showOnly('emptyState');
    return;
    }

    renderTable(state.filtered);
    renderCards(state.filtered);

    if (window.matchMedia('(max-width: 720px)').matches) {
        showOnly('cardsWrap');
    } else {
        showOnly('tableWrap');
    }
}

function rainText(r) { return r == null ? '—' : r + ' mm'; }
function tempText(t) { return t == null ? '—' : t + ' °C'; }

function renderTable(rows) {
  const tbody = el.resultsBody;
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.district.name}</strong></td>
      <td>${r.district.province}</td>
      <td>${r.forecast ? rainText(r.forecast.totalRain) : '—'}</td>
      <td>${r.forecast ? tempText(r.forecast.avgTemp) : '—'}</td>
      <td><span class="badge ${r.badgeClass}">${r.label}</span></td>
      <td>${r.recommendation}</td>
      <td><button type="button" class="btn btn-secondary details-btn" data-district="${r.district.name}">View details</button></td>
    `;
    frag.appendChild(tr);
  });

  tbody.appendChild(frag);
}

function renderCards(rows) {
  const wrap = el.cardsWrap;
  wrap.innerHTML = '';
  const frag = document.createDocumentFragment();

  rows.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'district-card';
    card.innerHTML = `
      <h3>${r.district.name}</h3>
      <p class="card-province">${r.district.province}</p>
      <div class="card-rows">
        <div class="card-row"><strong>Rainfall (7d)</strong>${r.forecast ? rainText(r.forecast.totalRain) : '—'}</div>
        <div class="card-row"><strong>Avg temp</strong>${r.forecast ? tempText(r.forecast.avgTemp) : '—'}</div>
      </div>
      <span class="badge ${r.badgeClass}">${r.label}</span>
      <p class="card-rec">${r.recommendation}</p>
      <button type="button" class="btn btn-secondary details-btn" data-district="${r.district.name}">View details</button>
    `;
    frag.appendChild(card);
  });

  wrap.appendChild(frag);
}

function renderCacheNotice() {
  if (state.usingCache && state.lastUpdated) {
    el.cacheTime.textContent = formatDateTime(state.lastUpdated);
    el.cacheNotice.hidden = false;
  } else {
    el.cacheNotice.hidden = true;
  }
}

function showApiError(msg){
    el.errorMessage.textContent = msg;
    showOnly('errorState');
}

// modal

let lastFocused = null;

function openModal(districtName) {
  const r = state.results.find((x) => x.district.name === districtName);
  if (!r) return;

  lastFocused = document.activeElement;
  el.modalTitle.textContent = `${r.district.name} District`;
  el.modalSubtitle.textContent = `${r.district.province} · Crop: ${state.selectedCrop.name}`;

  const f = r.forecast;
  el.modalSummary.innerHTML = `
    <div class="ms-item"><div class="ms-label">7-day rainfall</div><div class="ms-value">${f ? rainText(f.totalRain) : '—'}</div></div>
    <div class="ms-item"><div class="ms-label">Avg temperature</div><div class="ms-value">${f ? tempText(f.avgTemp) : '—'}</div></div>
    <div class="ms-item"><div class="ms-label">Suitability</div><div class="ms-value"><span class="badge ${r.badgeClass}">${r.label}</span></div></div>
    <div class="ms-item"><div class="ms-label">Weather Suitability score</div><div class="ms-value">${r.score === null ? 'Unavailable' : r.score + '/100'}</div></div>
  `;

  if (f && f.daily) {
    el.modalDaily.innerHTML = f.daily.map((d) => `
      <div class="day-cell">
        <div class="day-date">${formatDate(d.date)}</div>
        <div class="day-rain">${d.rain == null ? '—' : d.rain + ' mm'}</div>
        <div class="day-temp">${d.temp == null ? '—' : d.temp + ' °C'}</div>
      </div>
    `).join('');
  } else {
    el.modalDaily.innerHTML = '<p>No daily forecast available.</p>';
  }

  el.modalExplanation.textContent = r.recommendation +
    ' ' + (state.selectedCrop.heuristic.basis || '');

  el.modal.hidden = false;
  document.body.style.overflow = 'hidden';
  const closeBtn = el.modal.querySelector('.modal-close');
  closeBtn.focus();
}

function closeModal(){
    el.modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
}

// event wiring

function wireEvents(){
    el.searchInput.addEventListener('input', renderAll);
    el.provinceSelect.addEventListener('change', renderAll);
    el.sortSelect.addEventListener('change', renderAll);

    el.cropSelect.addEventListener('change', () => {
    const crop = state.crops.find((c) => c.name === el.cropSelect.value);
    if (crop) {
      state.selectedCrop = crop;
      computeResults();
      renderAll();
    }
    });

    el.clearFiltersBtn.addEventListener('click', clearFilters);
    el.emptyClearBtn.addEventListener('click', clearFilters);
    el.retryBtn.addEventListener('click', retry);

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.details-btn');
        if (btn) openModal(btn.dataset.district);
        if (e.target.closest('[data-close]')) closeModal();
    });  // for the view details
    
    document.addEventListener('keydown', (e) => {
      if(el.modal.hidden) return;


      if (e.key === 'Escape') {
        closeModal();
        return;
      }

      if(e.key === 'Tab'){
        const focusable = el.modal.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if(focusable.length === 0) return;

        if(e.shiftKey && document.activeElement === first){
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last){
          e.preventDefault();
          first.focus();
        }
      }

    });  // for the escape button

    let resizeTimer;
    window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!el.tableWrap.hidden || !el.cardsWrap.hidden) renderResults();
    }, 150);
    });
}

function clearFilters() {
  el.searchInput.value = '';
  el.provinceSelect.value = '';
  el.sortSelect.value = 'suitability-desc';
  renderAll();
}

async function retry() {
  showOnly('loadingState');
  await fetchForecasts();
  if (Object.values(state.forecasts).some(forecast => forecast !== null)) {
    computeResults();
    renderAll();
  }
}

// bootstrapping

async function init(){
    el.currentDate.textContent = formatDate(new Date().toISOString());

    try {
    await loadStaticData();
    populateControls();
    wireEvents();

    showOnly('loadingState');
    await fetchForecasts();

    if (Object.values(state.forecasts).some(forecast => forecast !== null)) {
      computeResults();
      renderAll();
    }
    } catch (err) {
      console.error('Application initialization failed:', err);
      setApiStatus('error', 'Setup failed');
      showApiError(err.message || 'Could not start the application');
    }
}

document.addEventListener('DOMContentLoaded', async () =>{
  init();
  displayServerIdentity();
});

// server identity

async function displayServerIdentity() {
    try {
        const response = await fetch('/server-id.txt', {
            cache: 'no-store'
        });

        if (!response.ok) return;

        const serverId = (await response.text()).trim();

        if (!serverId) return;

        const serverElement = document.getElementById('server-identity');

        if (serverElement) {
            serverElement.textContent = `Served by: ${serverId}`;
        }
     } catch (error) {
        // Silently ignore errors during local development.
    }
}









 

