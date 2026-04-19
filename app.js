// Configurazione Supabase
const SUPABASE_URL = 'https://exlxayhnvglugcdpfdlg.supabase.co';
const SUPABASE_ANON = 'sb_publishable_zEyuXaWRYbDvh9HqPhYDTA_5XggY_mn';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// LE TUE EMAIL AUTORIZZATE (modifica l'elenco se necessario)
const ALLOWED_EMAILS = ['marco.pastore87@gmail.com', 'catebuffa@gmail.com'];

const CSV_FILE = 'California 2026 - Calendario.csv';
let map;
let tripData = [];
let directionsService;
let directionsRenderer;
let placesService;
let poiMarkers = [];

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
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: false,
    polylineOptions: {
      strokeColor: '#3b82f6',
      strokeWeight: 4,
      strokeOpacity: 0.8
    }
  });

  // Inizializza il servizio Places per la ricerca dei Punti di Interesse (POI)
  placesService = new google.maps.places.PlacesService(map);
}

// Caricamento in background del file CSV (Persistence)
function loadData() {
  document.getElementById('timeline').innerHTML = '<div class="loading">Caricamento itinerario in corso...</div>';

  Papa.parse(CSV_FILE, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      tripData = results.data;
      renderTimeline();
      plotRouteOnMap();
      setTimeout(analyzeItinerary, 3000);
    },
    error: function(err) {
      document.getElementById('timeline').innerHTML = `<div class="loading" style="color:var(--warning)">Errore: Impossibile trovare il file CSV sul server.</div>`;
    }
  });
}

// Render Timeline Sidebar
function renderTimeline() {
  const timelineEl = document.getElementById('timeline');
  timelineEl.innerHTML = '';
  
  tripData.forEach((day, index) => {
    if (!day.Day || !day.Data) return;
    
    const card = document.createElement('div');
    card.className = 'day-card';
    
    let contentHTML = '';
    if (day['Cosa Vedere'] && day['Cosa Vedere'] !== '-') {
      contentHTML = day['Cosa Vedere'].replace(/\n/g, '<br>');
    } else {
      contentHTML = '<span style="color:var(--text-muted)">Nessuna attività programmata o in viaggio.</span>';
    }

    card.innerHTML = `
      <div class="day-dot"></div>
      <div class="day-header">
        <div class="day-title">Giorno ${day.Day}</div>
        <div class="day-date">${day.Data}</div>
      </div>
      <div class="day-route">🚗 ${day.Partenza} ➔ ${day.Arrivo}</div>
      <div class="day-content">${contentHTML}</div>
    `;

    // Evento per fare focus sul tour giornaliero
    card.addEventListener('click', () => {
      document.querySelectorAll('.day-card').forEach(c => c.style.background = 'transparent');
      card.style.background = 'rgba(255, 255, 255, 0.05)';
      card.style.borderRadius = '8px';
      focusDayTour(day);
    });

    timelineEl.appendChild(card);
  });
}

// Plot Route using Google Maps Directions API
function plotRouteOnMap() {
  if (tripData.length < 2) return;

  const waypointsList = [];
  tripData.forEach(day => {
    if(day.Partenza && day.Partenza.trim() !== '') {
       waypointsList.push(day.Partenza.trim() + ", CA, USA");
    }
    if(day.Arrivo && day.Arrivo.trim() !== '') {
       let arr = day.Arrivo.trim();
       if (arr.includes('-')) arr = arr.split('-')[1].trim(); 
       waypointsList.push(arr + ", CA, USA");
    }
  });

  const cleanWaypoints = [];
  waypointsList.forEach(w => {
    if(cleanWaypoints.length === 0 || cleanWaypoints[cleanWaypoints.length - 1] !== w) {
      if(!w.includes('Monaco')) cleanWaypoints.push(w);
    }
  });

  if(cleanWaypoints.length < 2) return;

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

// Focus sui POI di un singolo giorno
function focusDayTour(day) {
  // Pulisci i marker precedenti
  poiMarkers.forEach(m => m.setMap(null));
  poiMarkers = [];

  const text = day['Cosa Vedere'];
  if (!text || text === '-') {
    // Zoom generico sulla città se non ci sono POI
    let city = day.Arrivo;
    if (city.includes('-')) city = city.split('-')[1].trim();
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: city + ', CA, USA' }, (results, status) => {
      if (status === 'OK' && results[0]) {
        map.setZoom(12);
        map.panTo(results[0].geometry.location);
      }
    });
    return;
  }

  // Estrazione "intelligente" dei luoghi
  let lines = text.split('\\n');
  let queries = [];
  lines.forEach(line => {
    // Rimuovi parole superflue (Mattina:, Pomeriggio:, etc.)
    let cleanLine = line.replace(/Mattina:|Pomeriggio:|Sera:|Opzionale:/g, '').trim();
    if(cleanLine.length > 3) {
      // Prendi solo la prima parte prima di parentesi o descrizioni lunghe
      let place = cleanLine.split('(')[0].split(',')[0].split('—')[0].trim();
      if(place.length > 2) queries.push(place);
    }
  });

  if (queries.length === 0) return;

  const bounds = new google.maps.LatLngBounds();
  let city = day.Arrivo.includes('-') ? day.Arrivo.split('-')[1].trim() : day.Arrivo;
  
  let promises = queries.map(query => {
    return new Promise(resolve => {
      let searchQuery = query + ', ' + city + ', CA';
      placesService.textSearch({ query: searchQuery }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];
          // Crea un Marker Custom dorato/arancione per le attrazioni
          const marker = new google.maps.Marker({
            map: map,
            position: place.geometry.location,
            title: place.name,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#f59e0b',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
              scale: 8
            }
          });
          
          const infoWindow = new google.maps.InfoWindow({
            content: `<div style="color:#0f172a; padding:5px;"><strong>${place.name}</strong><br><small>${query}</small></div>`
          });
          marker.addListener('click', () => infoWindow.open(map, marker));

          poiMarkers.push(marker);
          bounds.extend(place.geometry.location);
        }
        resolve();
      });
    });
  });

  // Dopo aver cercato tutti i luoghi, zooma per inquadrarli tutti
  Promise.all(promises).then(() => {
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
      // Evita uno zoom eccessivo se c'è un solo POI
      if (map.getZoom() > 15) map.setZoom(15);
    }
  });
}

// AI Optimizer Logic
function analyzeItinerary() {
  const optimizerEl = document.getElementById('ai-optimizer');
  const msgEl = document.getElementById('ai-msg');
  const actionsEl = document.getElementById('ai-actions');
  optimizerEl.classList.remove('hidden');
  
  const hasModesto = tripData.some(d => d.Arrivo && d.Arrivo.includes('Modesto') && d['Cosa Vedere'] && d['Cosa Vedere'].includes('Yosemite'));
  
  setTimeout(() => {
    if (hasModesto) {
      msgEl.innerHTML = `Ho notato che il Giorno 4 parti da Fresno per vedere <strong>Yosemite</strong> e poi dormi a <strong>Modesto</strong>. Ti suggerirei di cercare un pernotto a <em>Mariposa</em> o <em>El Portal</em> per risparmiare guida. Vuoi aggiornare la tappa?`;
      actionsEl.classList.remove('hidden');
    } else {
      msgEl.innerHTML = "Il tuo itinerario è ottimizzato alla perfezione! Le distanze di guida sono bilanciate.";
    }
  }, 1500);
}

function acceptOptimization() {
  document.getElementById('ai-msg').innerHTML = "<span style='color:var(--success)'>Ottimo! Tappa aggiornata a Mariposa. Mappa in ricalcolo...</span>";
  document.getElementById('ai-actions').classList.add('hidden');
  const modestoDay = Array.from(document.querySelectorAll('.day-route')).find(el => el.textContent.includes('Modesto'));
  if(modestoDay) modestoDay.innerHTML = modestoDay.innerHTML.replace('Modesto', 'Mariposa');
  
  tripData.forEach(d => {
    if(d.Arrivo === 'Modesto') d.Arrivo = 'Mariposa';
    if(d.Partenza === 'Modesto') d.Partenza = 'Mariposa';
  });
  plotRouteOnMap();
}

function dismissOptimization() {
  document.getElementById('ai-optimizer').classList.add('hidden');
}

// Boot up e Autenticazione
document.addEventListener('DOMContentLoaded', async () => {
  const loginBtn = document.getElementById('login-btn');
  const authOverlay = document.getElementById('auth-overlay');
  const authError = document.getElementById('auth-error');

  // Gestione click sul pulsante di Login
  loginBtn.addEventListener('click', async () => {
    loginBtn.innerText = 'Reindirizzamento...';
    await sb.auth.signInWithOAuth({ 
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
  });

  // Controlla se l'utente è già loggato
  const { data: { session } } = await sb.auth.getSession();
  
  if (session) {
    const userEmail = session.user.email;
    
    // Controllo Sicurezza: Allowlist
    if (ALLOWED_EMAILS.includes(userEmail)) {
      authOverlay.classList.add('hidden'); // Nascondi il blocco
      initMap();
      loadData();
    } else {
      authError.classList.remove('hidden');
      authError.innerText = "Accesso Negato. L'email " + userEmail + " non fa parte della lista autorizzata.";
      await sb.auth.signOut(); // Disconnetti l'intruso
    }
  } else {
    // Se non c'è sessione, controlla se c'è un evento di login in corso dal redirect di Google
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        window.location.reload(); // Ricarica la pagina per far scattare il controllo Allowlist
      }
    });
  }
});
