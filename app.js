// Configurazione Supabase
const SUPABASE_URL = 'https://exlxayhnvglugcdpfdlg.supabase.co';
const SUPABASE_ANON = 'sb_publishable_zEyuXaWRYbDvh9HqPhYDTA_5XggY_mn';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const ALLOWED_EMAILS = ['marco.pastore87@gmail.com', 'catebuffa@gmail.com'];
const CSV_FILE = 'California 2026 - Calendario.csv';

let map, tripData = [], directionsService, directionsRenderer, dayDirectionsRenderer;
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

    let contentHTML = '';
    if (day['Cosa Vedere'] && day['Cosa Vedere'] !== '-') {
      contentHTML = day['Cosa Vedere'].replace(/\n/g, '<br>');
    } else {
      contentHTML = '<span style="color:var(--text-muted)">Nessuna attività programmata o in viaggio.</span>';
    }

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

async function focusDayTour(day) {
  poiMarkers.forEach(m => m.setMap(null));
  poiMarkers = [];
  if (dayDirectionsRenderer) dayDirectionsRenderer.setDirections({ routes: [] });

  const text = day['Cosa Vedere'];
  if (!text || text === '-') {
    let city = day.Arrivo;
    if (city.includes('-')) city = city.split('-')[1].trim();
    geocoder.geocode({ address: city + ', CA, USA' }, (results, status) => {
      if (status === 'OK' && results[0]) { map.setZoom(12); map.panTo(results[0].geometry.location); }
    });
    return;
  }

  let lines = text.split('\n');
  let queries = [];
  lines.forEach(line => {
    let cleanLine = line.replace(/Mattina:|Pomeriggio:|Sera:|Opzionale:/g, '').trim();
    if (cleanLine.length > 3) {
      let place = cleanLine.split('(')[0].split(',')[0].split('—')[0].trim();
      if (place.length > 2) queries.push(place);
    }
  });
  if (queries.length === 0) return;

  let city = day.Arrivo.includes('-') ? day.Arrivo.split('-')[1].trim() : day.Arrivo;
  const bounds = new google.maps.LatLngBounds();
  const foundLocations = [];

  const promises = queries.map((query, i) => {
    return new Promise(resolve => {
      placesService.textSearch({ query: query + ', ' + city + ', CA' }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];
          const photoUrl = place.photos && place.photos.length > 0
            ? place.photos[0].getUrl({ maxWidth: 300 }) : null;

          const marker = new google.maps.Marker({
            map: map,
            position: place.geometry.location,
            title: place.name,
            label: { text: String(i + 1), color: '#0f172a', fontWeight: 'bold', fontSize: '11px' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#f59e0b', fillOpacity: 1,
              strokeColor: '#fff', strokeWeight: 2, scale: 13
            }
          });

          let infoContent = `<div style="color:#0f172a;padding:5px;max-width:220px;">`;
          if (photoUrl) infoContent += `<img src="${photoUrl}" style="width:100%;border-radius:6px;margin-bottom:6px;display:block;">`;
          infoContent += `<strong>${place.name}</strong><br><small style="color:#64748b;">${query}</small></div>`;

          const iw = new google.maps.InfoWindow({ content: infoContent });
          marker.addListener('click', () => iw.open(map, marker));
          poiMarkers.push(marker);
          bounds.extend(place.geometry.location);
          foundLocations[i] = place.geometry.location;
        }
        resolve();
      });
    });
  });

  await Promise.all(promises);

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds);
    if (map.getZoom() > 15) map.setZoom(15);
  }

  // Traccia percorso ordinato tra i POI trovati
  const validLocations = foundLocations.filter(Boolean);
  if (validLocations.length >= 2) {
    const routeRequest = {
      origin: validLocations[0],
      destination: validLocations[validLocations.length - 1],
      waypoints: validLocations.slice(1, -1).map(loc => ({ location: loc, stopover: true })),
      travelMode: google.maps.TravelMode.DRIVING
    };
    directionsService.route(routeRequest, (result, status) => {
      if (status === 'OK') dayDirectionsRenderer.setDirections(result);
    });
  }
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
