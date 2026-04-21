// Configurazione Supabase
const SUPABASE_URL = 'https://exlxayhnvglugcdpfdlg.supabase.co';
const SUPABASE_ANON = 'sb_publishable_zEyuXaWRYbDvh9HqPhYDTA_5XggY_mn';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const ALLOWED_EMAILS = ['marco.pastore87@gmail.com', 'catebuffa@gmail.com'];
const CSV_FILE = 'https://docs.google.com/spreadsheets/d/1SMHpzRTFtoo7qhWWKOH-2yMME4Y1ulUJ5NXS7y0nRtM/export?format=csv';

let map, tripData = [], directionsService, directionsRenderer, dayDirectionsRenderer;
let currentDayPolylines = [];
let placesService, geocoder;
let poiMarkers = [], hotelMarkers = [];

// Mappa mesi italiani per parsing date
const MONTH_MAP = {
  'gennaio':'01','febbraio':'02','marzo':'03','aprile':'04',
  'maggio':'05','giugno':'06','luglio':'07','agosto':'08',
  'settembre':'09','ottobre':'10','novembre':'11','dicembre':'12'
};

function parseItalianDate(dateStr) {
  const parts = dateStr.toLowerCase().split(' ');
  let day, month;
  parts.forEach(p => {
    if (!isNaN(p) && p.length <= 2) day = p.padStart(2, '0');
    if (MONTH_MAP[p]) month = MONTH_MAP[p];
  });
  if (!day || !month) return null;
  return `2024-${month}-${day}`; // 2024 come proxy storico
}

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌦️';
  if (code <= 99) return '⛈️';
  return '🌡️';
}

// Custom Dark Theme for Google Maps
const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
];

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 36.7783, lng: -119.4179 },
    zoom: 6,
    styles: darkMapStyle,
    disableDefaultUI: true,
    zoomControl: true,
  });

  directionsService = new google.maps.DirectionsService();
  geocoder = new google.maps.Geocoder();

  // Percorso principale (blu)
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: false,
    polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 4, strokeOpacity: 0.8 }
  });

  // Percorso giornaliero POI (ambra)
  dayDirectionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: { strokeColor: '#f59e0b', strokeWeight: 3, strokeOpacity: 0.95 }
  });

  placesService = new google.maps.places.PlacesService(map);
}

function loadData() {
  document.getElementById('timeline').innerHTML = '<div class="loading">Caricamento itinerario in corso...</div>';
  Papa.parse(CSV_FILE, {
    download: true, header: true, skipEmptyLines: true,
    complete: function(results) {
      tripData = results.data;
      renderTimeline();
      plotRouteOnMap();
      plotHotelMarkers();
      setTimeout(analyzeItinerary, 3000);
    },
    error: function() {
      document.getElementById('timeline').innerHTML = `<div class="loading" style="color:var(--warning)">Errore: Impossibile trovare il file CSV.</div>`;
    }
  });
}

function renderTimeline() {
  const timelineEl = document.getElementById('timeline');
  timelineEl.innerHTML = '';
  tripData.forEach((day) => {
    if (!day.Day || !day.Data) return;
    const card = document.createElement('div');
    card.className = 'day-card';
    card.id = `day-card-${day.Day}`;

    // Costruisci il contenuto dai 4 slot orari
    const timeSlots = [
      { label: '🌅 Mattina', key: 'Mattina' },
      { label: '☀️ Pomeriggio', key: 'Pomeriggio' },
      { label: '🌙 Sera', key: 'Sera' },
      { label: '📌 Opzionale', key: 'Opzionale' },
    ];
    let contentHTML = '';
    timeSlots.forEach(slot => {
      if (day[slot.key] && day[slot.key].trim() !== '' && day[slot.key] !== '-') {
        contentHTML += `<div class="time-slot"><span class="time-label">${slot.label}:</span> ${day[slot.key]}</div>`;
      }
    });
    if (!contentHTML) contentHTML = '<span style="color:var(--text-muted)">Nessuna attività programmata.</span>';

    const hotelHTML = day.Pernotto && day.Pernotto.trim() !== ''
      ? `<div class="hotel-badge">🏨 ${day.Pernotto}</div>` : '';

    card.innerHTML = `
      <div class="day-dot"></div>
      <div class="day-header">
        <div class="day-title">Giorno ${day.Day}</div>
        <div class="day-date">${day.Data}</div>
      </div>
      <div class="day-route">🚗 ${day.Partenza} ➔ ${day.Arrivo}</div>
      ${hotelHTML}
      <div class="weather-widget" id="weather-${day.Day}">
        <span style="color:var(--text-muted);font-size:11px;">☁ Meteo tipico disponibile al click</span>
      </div>
      <div class="day-content">${contentHTML}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.day-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      focusDayTour(day);
      fetchWeather(day, document.getElementById(`weather-${day.Day}`));
    });
    timelineEl.appendChild(card);
  });
}

function plotRouteOnMap() {
  if (tripData.length < 2) return;
  const waypointsList = [];
  tripData.forEach(day => {
    if (day.Partenza && day.Partenza.trim() !== '') waypointsList.push(day.Partenza.trim() + ", CA, USA");
    if (day.Arrivo && day.Arrivo.trim() !== '') {
      let arr = day.Arrivo.trim();
      if (arr.includes('-')) arr = arr.split('-')[1].trim();
      waypointsList.push(arr + ", CA, USA");
    }
  });
  const cleanWaypoints = [];
  waypointsList.forEach(w => {
    if (cleanWaypoints.length === 0 || cleanWaypoints[cleanWaypoints.length - 1] !== w) {
      if (!w.includes('Monaco')) cleanWaypoints.push(w);
    }
  });
  if (cleanWaypoints.length < 2) return;
  const request = {
    origin: cleanWaypoints[0],
    destination: cleanWaypoints[cleanWaypoints.length - 1],
    waypoints: cleanWaypoints.slice(1, cleanWaypoints.length - 1).map(loc => ({ location: loc, stopover: true })),
    travelMode: google.maps.TravelMode.DRIVING,
    optimizeWaypoints: false
  };
  directionsService.route(request, function(result, status) {
    if (status == 'OK') directionsRenderer.setDirections(result);
  });
}

function plotHotelMarkers() {
  hotelMarkers.forEach(m => m.setMap(null));
  hotelMarkers = [];
  const processed = new Set();
  tripData.forEach(day => {
    if (!day.Pernotto || day.Pernotto.trim() === '' || processed.has(day.Pernotto)) return;
    processed.add(day.Pernotto);
    let city = day.Arrivo || '';
    if (city.includes('-')) city = city.split('-')[1].trim();
    geocoder.geocode({ address: day.Pernotto + ', ' + city + ', CA' }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const marker = new google.maps.Marker({
          map: map,
          position: results[0].geometry.location,
          title: day.Pernotto,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#8b5cf6', fillOpacity: 1,
            strokeColor: '#fff', strokeWeight: 2, scale: 7
          }
        });
        const iw = new google.maps.InfoWindow({
          content: `<div style="color:#0f172a;padding:5px;"><strong>🏨 ${day.Pernotto}</strong><br><small>Pernotto Giorno ${day.Day}</small></div>`
        });
        marker.addListener('click', () => iw.open(map, marker));
        hotelMarkers.push(marker);
      }
    });
  });
}

async function fetchWeather(day, el) {
  if (!day.Arrivo || !el) return;
  el.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">⏳ Caricamento meteo...</span>';
  let city = day.Arrivo;
  if (city.includes('-')) city = city.split('-')[1].trim();
  if (city === 'Monaco') { el.innerHTML = ''; return; }

  geocoder.geocode({ address: city + ', CA, USA' }, async (results, status) => {
    if (status !== 'OK' || !results[0]) { el.innerHTML = ''; return; }
    const lat = results[0].geometry.location.lat();
    const lng = results[0].geometry.location.lng();
    const histDate = parseItalianDate(day.Data);
    if (!histDate) { el.innerHTML = ''; return; }

    try {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${histDate}&end_date=${histDate}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=America%2FLos_Angeles`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.daily && data.daily.temperature_2m_max) {
        const max = Math.round(data.daily.temperature_2m_max[0]);
        const min = Math.round(data.daily.temperature_2m_min[0]);
        const code = data.daily.weathercode[0];
        const icon = getWeatherIcon(code);
        el.innerHTML = `<div class="weather-info">${icon} <span class="weather-temp">${max}° / ${min}°</span> <span class="weather-label">tipico luglio</span></div>`;
      } else {
        el.innerHTML = '';
      }
    } catch(e) { el.innerHTML = ''; }
  });
}

// Geocode un indirizzo e restituisce una LatLng Promise
function geocodeAddress(address) {
  return new Promise(resolve => {
    geocoder.geocode({ address }, (results, status) => {
      resolve(status === 'OK' && results[0] ? results[0].geometry.location : null);
    });
  });
}

// Cerca un POI con Places e restituisce { name, location } o null
function searchPlace(query, city) {
  return new Promise(resolve => {
    placesService.textSearch({ query: query + ', ' + city + ', CA' }, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
        resolve({ name: results[0].name, location: results[0].geometry.location, photos: results[0].photos });
      } else {
        resolve(null);
      }
    });
  });
}

// Calcola distanza/tempo tra due waypoints con DirectionsService
function calcLeg(origin, destination) {
  return new Promise(resolve => {
    directionsService.route({
      origin, destination,
      travelMode: google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === 'OK' && result.routes[0] && result.routes[0].legs[0]) {
        const leg = result.routes[0].legs[0];
        resolve({ distance: leg.distance, duration: leg.duration });
      } else {
        resolve(null);
      }
    });
  });
}

async function focusDayTour(day) {
  // Pulisci stato precedente
  poiMarkers.forEach(m => m.setMap(null));
  poiMarkers = [];
  currentDayPolylines.forEach(p => p.setMap(null));
  currentDayPolylines = [];
  if (dayDirectionsRenderer) dayDirectionsRenderer.setDirections({ routes: [] });

  const dayIndex = tripData.findIndex(d => d.Day === day.Day);
  
  // 1. Identifica Hotel di Partenza e Arrivo
  let startAddr = day.Partenza || '';
  if (dayIndex > 0 && tripData[dayIndex - 1].Pernotto) {
    startAddr = tripData[dayIndex - 1].Pernotto;
  }
  const startLoc = await geocodeAddress(startAddr + (startAddr.includes('CA') ? '' : ', CA, USA'));

  let endAddr = day.Pernotto || day.Arrivo || '';
  const endLoc = await geocodeAddress(endAddr + (endAddr.includes('CA') ? '' : ', CA, USA'));

  if (!startLoc || !endLoc) return;

  // 2. Raccogli tappe intermedie dai 4 slot orari
  const intermediateQueries = [];
  ['Mattina', 'Pomeriggio', 'Sera', 'Opzionale'].forEach(slot => {
    if (day[slot] && day[slot].trim() !== '' && day[slot] !== '-') {
      day[slot].split(',').forEach(poi => {
        const clean = poi.trim();
        // Filtra note, descrizioni lunghe o istruzioni di viaggio
        if (clean.length > 2 && clean.length < 60 && 
            !clean.toLowerCase().startsWith('viaggio') && 
            !clean.toLowerCase().startsWith('giornata') &&
            !clean.toLowerCase().startsWith('ritorno')) {
          intermediateQueries.push(clean.split('(')[0].trim());
        }
      });
    }
  });

  const city = (day.Arrivo || '').includes('-') ? day.Arrivo.split('-')[1].trim() : (day.Arrivo || '');

  // Risolvi le tappe
  const intermediateResults = [];
  for (const query of [...new Set(intermediateQueries)]) {
    const res = await searchPlace(query, city);
    if (res) {
      // Evita tappe che coincidono quasi esattamente con l'inizio o la fine
      const distStart = google.maps.geometry.spherical.computeDistanceBetween(res.location, startLoc);
      const distEnd = google.maps.geometry.spherical.computeDistanceBetween(res.location, endLoc);
      if (distStart > 500 && distEnd > 500) {
        intermediateResults.push({ ...res, query });
      }
    }
  }

  // 3. Ottimizza il percorso
  const routeRequest = {
    origin: startLoc,
    destination: endLoc,
    waypoints: intermediateResults.map(res => ({ location: res.location, stopover: true })),
    optimizeWaypoints: true,
    travelMode: google.maps.TravelMode.DRIVING,
    unitSystem: google.maps.UnitSystem.METRIC
  };

  directionsService.route(routeRequest, async (result, status) => {
    if (status !== 'OK') return;

    const route = result.routes[0];
    const order = route.waypoint_order;

    const sequence = [];
    sequence.push({ label: '🏨 ' + startAddr, location: startLoc, isHotel: true });
    
    order.forEach(idx => {
      const poi = intermediateResults[idx];
      sequence.push({ label: '📍 ' + poi.name, location: poi.location, isHotel: false, photos: poi.photos });
    });

    sequence.push({ label: '🏨 ' + endAddr, location: endLoc, isHotel: true });

    // 4. Markers e Visualizzazione
    const bounds = new google.maps.LatLngBounds();
    sequence.forEach((stop, i) => {
      const isEndpoint = i === 0 || i === sequence.length - 1;
      const marker = new google.maps.Marker({
        map, position: stop.location,
        label: isEndpoint ? undefined : { text: String(i), color: '#0f172a', fontWeight: 'bold' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: isEndpoint ? '#8b5cf6' : '#f59e0b', fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 2, scale: isEndpoint ? 9 : 13
        }
      });
      poiMarkers.push(marker);
      bounds.extend(stop.location);
    });

    map.fitBounds(bounds);
    if (map.getZoom() > 14) map.setZoom(14);

    let totalMeters = 0;
    let totalSeconds = 0;
    const finalLegs = [];

    route.legs.forEach((leg, i) => {
      totalMeters += leg.distance.value;
      totalSeconds += leg.duration.value;
      finalLegs.push({
        from: sequence[i].label, to: sequence[i+1].label,
        distText: leg.distance.text, durText: leg.duration.text
      });

      const poly = new google.maps.Polyline({
        path: leg.steps.flatMap(s => s.path), map,
        strokeColor: ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'][i % 7],
        strokeWeight: 4, strokeOpacity: 0.9, geodesic: true
      });
      poly.addListener('click', () => highlightLegPanel(i));
      currentDayPolylines.push(poly);
    });

    renderRoutePanel(day.Day, finalLegs, totalMeters, totalSeconds);
  });
}

function highlightLegPanel(index) {
  document.querySelectorAll('.route-leg').forEach((el, i) => {
    el.classList.toggle('active-leg', i === index);
  });
}

function renderRoutePanel(dayNum, legs, totalMeters, totalSeconds) {
  const card = document.getElementById(`day-card-${dayNum}`);
  if (!card) return;

  // Rimuovi pannello precedente se esiste
  const existing = card.querySelector('.route-panel');
  if (existing) existing.remove();

  const totalKm = (totalMeters / 1000).toFixed(1);
  const totalH = Math.floor(totalSeconds / 3600);
  const totalMin = Math.round((totalSeconds % 3600) / 60);
  const totalTimeStr = totalH > 0 ? `${totalH}h ${totalMin}min` : `${totalMin}min`;

  let legsHTML = legs.map((leg, i) => {
    const fromShort = leg.from.replace('Partenza: ', '').replace('Arrivo: ', '').split(',')[0];
    const toShort = leg.to.replace('Partenza: ', '').replace('Arrivo: ', '').split(',')[0];
    const isStart = leg.from.includes('Partenza');
    const isEnd = leg.to.includes('Arrivo');

    return `
      <div class="route-leg" id="leg-${dayNum}-${i}" onclick="highlightLegPanel(${i})">
        <div class="leg-stops">
          <span class="leg-from">${isStart ? '🏨' : '📍'} ${fromShort}</span>
          <span class="leg-arrow">→</span>
          <span class="leg-to">${isEnd ? '🏨' : '📍'} ${toShort}</span>
        </div>
        <div class="leg-meta">
          <span class="leg-dist">🛣 ${leg.distText}</span>
          <span class="leg-dur">⏱ ${leg.durText}</span>
        </div>
      </div>`;
  }).join('');

  const panel = document.createElement('div');
  panel.className = 'route-panel';
  panel.innerHTML = `
    <div class="route-panel-header">🗺 Itinerario Ottimizzato</div>
    ${legsHTML}
    <div class="route-total">
      <div class="total-km">📏 Km Giornalieri: ${totalKm} km</div>
      <div class="total-time">⏱ Guida Totale: ~${totalTimeStr}</div>
    </div>
  `;

  card.appendChild(panel);
}

// AI Optimizer Logic tramite Gemini API
async function analyzeItinerary() {
  const optimizerEl = document.getElementById('ai-optimizer');
  const msgEl = document.getElementById('ai-msg');
  const actionsEl = document.getElementById('ai-actions');
  optimizerEl.classList.remove('hidden');
  msgEl.innerHTML = '<div class="loading" style="font-size:13px;">Gemini sta analizzando la logistica del tuo percorso... 🧠</div>';
  actionsEl.classList.add('hidden');
  try {
    const { data, error } = await sb.functions.invoke('gemini-optimizer', { body: { tripData } });
    if (error) throw error;
    if (data && data.suggestion) {
      msgEl.innerHTML = `<strong style="color:var(--accent)">Consiglio di Gemini:</strong><br>${data.suggestion}`;
    } else {
      msgEl.innerHTML = "L'intelligenza artificiale non ha trovato ottimizzazioni particolari. Itinerario perfetto!";
    }
  } catch (err) {
    console.error("Errore AI:", err);
    msgEl.innerHTML = "<span style='color:var(--warning)'>Ops, l'IA è momentaneamente offline.</span>";
  }
}

function dismissOptimization() {
  document.getElementById('ai-optimizer').classList.add('hidden');
}

// Chat con Gemini
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';

  const messagesEl = document.getElementById('chat-messages');
  messagesEl.innerHTML += `<div class="chat-msg user">${msg}</div>`;
  messagesEl.innerHTML += `<div class="chat-msg assistant" id="chat-typing">⏳ Gemini sta pensando...</div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const { data, error } = await sb.functions.invoke('gemini-chat', { body: { message: msg, tripData } });
    document.getElementById('chat-typing').remove();
    if (error || !data) throw new Error('Errore risposta');
    messagesEl.innerHTML += `<div class="chat-msg assistant">${data.reply}</div>`;
  } catch(e) {
    document.getElementById('chat-typing').remove();
    messagesEl.innerHTML += `<div class="chat-msg assistant" style="color:#ef4444">Errore di connessione. Riprova.</div>`;
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function initChat() {
  const input = document.getElementById('chat-input');
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

  const toggle = document.getElementById('chat-toggle');
  const chatSection = document.getElementById('chat-section');
  toggle.addEventListener('click', () => {
    chatSection.classList.toggle('collapsed');
  });
}

// Boot up e Autenticazione
document.addEventListener('DOMContentLoaded', async () => {
  const loginBtn = document.getElementById('login-btn');
  const authOverlay = document.getElementById('auth-overlay');
  const authError = document.getElementById('auth-error');

  loginBtn.addEventListener('click', async () => {
    loginBtn.innerText = 'Reindirizzamento...';
    await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
  });

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    const userEmail = session.user.email;
    if (ALLOWED_EMAILS.includes(userEmail)) {
      authOverlay.classList.add('hidden');
      document.getElementById('user-email-display').innerText = userEmail;
      initMap();
      loadData();
      initChat();
    } else {
      authError.classList.remove('hidden');
      authError.innerText = "Accesso Negato. L'email " + userEmail + " non è autorizzata.";
      await sb.auth.signOut();
    }
  } else {
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) window.location.reload();
    });
  }

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.reload();
  });
});
