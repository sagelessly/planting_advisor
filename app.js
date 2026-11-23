const API_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'rpa_weather_cache_v1';
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
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
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
  state.districts = await distRes.json();
  state.crops = await cropRes.json();
}

function populateControls() {
  // provinces
  const provinces = [...new Set(state.districts.map((d) => d.province))].sort();
  provinces.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p; opt.textContent = p;
    el.provinceSelect.appendChild(opt);
  });

  // crops
  state.crops.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.name; opt.textContent = c.name;
    el.cropSelect.appendChild(opt);
  });

  state.selectedCrop = state.crops[0];
  el.cropSelect.value = state.selectedCrop.name;
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

  const cleanRain = rain.map((r) => (r == null ? 0 : r));
  const cleanTemp = temp.map((t) => (t == null ? null : t));

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
    const out = {};
    let list = data;

    if (!Array.isArray(list)) {
    list = [list];
    }

    if(list.length !== state.districts.length){
        throw new Error(
            'API returned ' + list.length + ' locations but ' +
            state.districts.length + ' were requested.'
        );
    }

    state.districts.forEach((district, i) => {
    out[district.name] = parseOneLocation(list[i]);
    });

    return out;
}

async function fetchForecasts() {
        const url = buildBatchUrl();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

        try {
            const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('API returned status ' + res.status);
        const data = await res.json();

        let parsed;
        try {
            parsed = parseForecastResponse(data);
        } catch (parseErr) {
          throw parseErr;
        }

        state.forecasts = parsed;
        state.lastUpdated = new Date().toISOString();
        state.usingCache = false;
        cacheForecasts(parsed, state.lastUpdated);
        setApiStatus('ok', 'API online');
        } catch (err) {
            handleFetchError(err);
        } finally {
            clearTimeout(timer);
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
            msg = 'The request times out.';
            setApiStatus('error', 'API timed out');
        } else if (err instanceof TypeError){
            msg = 'No internt connection.';
            setApiStatus('error', 'Offline');
        } else if (err && err.message && err.message.startsWith('API returned')){
            msg = 'The weather service returned an error';
            setApiStatus('error', 'API error');
        } else if (err && err.message && err.message.includes('locations')){
            msg = 'The weather service returned an unexpected response';
            setApiStatus('error','API response invalid');
        } else{
            setApiStatus('error', 'API erro');
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
            if (parsed && parsed.data && parsed.timestamp) return parsed;
            return null;
            } catch (e) {
            return null;
        }
} 

// suitability and scoring

function scoreCondition(value, min, max) {
  if (value == null) return 25; 
  if (value >= min && value <= max) return 50;
  const span = Math.max(max - min, 1);
  if (value < min) {
    const deficit = min - value;
    return Math.max(0, 50 - (deficit / span) * 50);
  }
  const excess = value - max;
  return Math.max(0, 50 - (excess / span) * 50);
}

function calculateSuitability(forecast, crop){  //heuristic values or normal ones
    const h = crop.heuristic;

    if (!forecast) {
        return {
      outcome: 'wait',
      score: 0,
      label: 'Wait',
      badgeClass: 'badge-wait',
      recommendation: 'No forecast data is available for this district, so a recommendation cannot be made.',
        };
    }

    const { totalRain, avgTemp } = forecast;
    const rainScore = scoreCondition(totalRain, h.minRain, h.maxRain);
    const tempScore = scoreCondition(avgTemp, h.minTemp, h.maxTemp);
    const score = Math.round(rainScore + tempScore);
    const rainOk = totalRain != null && totalRain >= h.minRain && totalRain <= h.maxRain;
    const tempOk = avgTemp != null && avgTemp >= h.minTemp && avgTemp <= h.maxTemp;
    const extremeRain = totalRain != null && totalRain > h.maxRain * h.maxRainExtremeFactor;

    let outcome, label, badgeClass, recommendation;

    if (extremeRain) {
        outcome = 'wait';
        label = 'Wait';
        badgeClass = 'badge-wait';
        recommendation = 'Heavy rainfall is forecast, increasing the risk of waterlogging and erosion.';
    
    } else if (rainOk && tempOk) {
        outcome = 'good';
        label = 'Good to plant';
        badgeClass = 'badge-good';
        recommendation = 'Rainfall is within the preferred range and temperatures are favourable.';
    
    } else if (!rainOk && !tempOk) {
        outcome = 'wait';
        label = 'Wait';
        badgeClass = 'badge-wait';
        if (totalRain < h.minRain && avgTemp < h.minTemp) {
        recommendation = 'Limited rainfall is expected and temperatures are below the preferred range for this crop.';
        } else if (totalRain < h.minRain) {
        recommendation = 'Limited rainfall is expected and temperatures are above the preferred range.';
        } else if (totalRain > h.maxRain) {
        recommendation = 'Excess rainfall is expected and temperatures are outside the preferred range.';
        } else {
        recommendation = 'Both rainfall and temperature are outside the preferred range for this crop.';
        }
    
    } else {
        outcome = 'precaution';
        label = 'Take precautions';
        badgeClass = 'badge-precaution';
    if (!rainOk && totalRain < h.minRain) {
      recommendation = 'Only limited rainfall is expected, which may affect seed establishment.';
    } else if (!rainOk && totalRain > h.maxRain) {
      recommendation = 'Rainfall is above the preferred range; monitor for waterlogging.';
    } else if (!tempOk && avgTemp < h.minTemp) {
      recommendation = 'Temperatures are below the preferred range for this crop.';
    } else {
      recommendation = 'Temperatures are above the preferred range for this crop.';
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



 

