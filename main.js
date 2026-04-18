// ELEMENTS
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');
const volumeSlider = document.getElementById('volumeSlider');
const extraVolumeControl = document.getElementById('extraVolumeControl');
const bassControl = document.getElementById('bassControl');
const currentTrackTitle = document.getElementById('currentTrackTitle');
const currentTrackArtist = document.getElementById('currentTrackArtist');
const currentAlbumArt = document.getElementById('currentAlbumArt');
const searchInput = document.getElementById('searchInput');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const searchOverlay = document.getElementById('searchOverlay');
const contentArea = document.getElementById('content-area');
const dynamicBg = document.querySelector('.dynamic-bg');
const mobileProgressFill = document.getElementById('mobileProgressFill');
const userProfile = document.querySelector('.user-profile');
const welcomeOverlay = document.getElementById('welcomeOverlay');

// APP STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;
let recentSearches = JSON.parse(localStorage.getItem('recent_searches')) || [];

// 1. DATA FETCHING (CORS FIX & RELIABILITY)
const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://thingproxy.freeboard.io/fetch/'
];

async function fetchWithBypass(url) {
    for (const proxy of PROXIES) {
        try {
            const res = await fetch(proxy + encodeURIComponent(url), { signal: AbortSignal.timeout(6000) });
            if (res.ok) return await res.json();
        } catch (e) { console.warn(`Proxy ${proxy} failed, trying next...`); }
    }
    return null;
}

async function searchYouTube(q) {
    if (!q) return [];
    const instances = ['https://iv.ggtyler.dev', 'https://inv.vern.cc', 'https://invidious.projectsegfau.lt'];
    for (const inst of instances) {
        const data = await fetchWithBypass(`${inst}/api/v1/search?q=${q}&type=video`);
        if (data && data.length) {
            return data.map(v => ({ id: v.videoId, name: v.title, artist: v.author, art: v.videoThumbnails ? (v.videoThumbnails[2]?.url || v.videoThumbnails[0].url) : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17' }));
        }
    }
    return [];
}

// 2. SEARCH UI (APPLE MUSIC STYLE)
function renderSearchView() {
    contentArea.innerHTML = `
        <div class="apple-search-container">
            <div class="search-header">
                <h1>Search</h1>
                <div class="user-profile-circle"><i data-lucide="user"></i></div>
            </div>
            
            <div class="search-tabs">
                <button class="search-tab-btn active">Apple Music</button>
                <button class="search-tab-btn">Library</button>
            </div>

            <div id="searchContent" class="search-scroll-content">
                ${recentSearches.length ? `
                    <div class="recent-section">
                        <div class="recent-header">
                            <span>Recently Searched</span>
                            <button onclick="clearRecentSearches()">Clear</button>
                        </div>
                        <div class="recent-list" id="recentList"></div>
                    </div>
                ` : ''}
                
                <div class="browse-categories">
                    <h2>Browse Categories</h2>
                    <div class="category-grid">
                        <div class="cat-card pbc" onclick="handleSearch('Punjabi Hits')"><span>Punjabi</span></div>
                        <div class="cat-card bwc" onclick="handleSearch('Bollywood')"><span>Bollywood</span></div>
                        <div class="cat-card smc" onclick="handleSearch('Shaadi Mubarak')"><span>Shaadi Mubarak</span></div>
                        <div class="cat-card pop" onclick="handleSearch('Pop Hits')"><span>Pop</span></div>
                        <div class="cat-card lfi" onclick="handleSearch('Lofi Hip Hop')"><span>Lofi</span></div>
                        <div class="cat-card rap" onclick="handleSearch('Hip-Hop/Rap')"><span>Rap</span></div>
                    </div>
                </div>
            </div>

            <!-- Floating Search Bar -->
            <div class="floating-search-bar">
                <i data-lucide="search"></i>
                <input type="text" id="appleSearchInput" placeholder="Artists, Songs, Lyrics and More">
                <i data-lucide="mic"></i>
            </div>
        </div>
    `;
    
    if (window.lucide) lucide.createIcons();
    setupAppleSearch();
}

function setupAppleSearch() {
    const inp = document.getElementById('appleSearchInput');
    const content = document.getElementById('searchContent');
    inp.oninput = async (e) => {
        const q = e.target.value;
        if (q.length < 2) return;
        content.innerHTML = `<div class="skeleton-list"></div>`;
        const results = await searchYouTube(q);
        renderSearchResults(results, content);
        addToRecent(q);
    };
}

function renderSearchResults(results, container) {
    container.innerHTML = `<div class="search-results-list"></div>`;
    const list = container.querySelector('.search-results-list');
    results.forEach(track => {
        const div = document.createElement('div'); div.className = 'search-result-item';
        div.onclick = () => playTrack(track, results);
        div.innerHTML = `<img src="${track.art}"><div class="res-info"><h3>${track.name}</h3><p>Song • ${track.artist}</p></div><i data-lucide="more-horizontal"></i>`;
        list.appendChild(div);
    });
    if (window.lucide) lucide.createIcons();
}

function addToRecent(q) {
    if (!recentSearches.includes(q)) {
        recentSearches.unshift(q);
        if (recentSearches.length > 5) recentSearches.pop();
        localStorage.setItem('recent_searches', JSON.stringify(recentSearches));
    }
}

// 3. ENGINE (YOUTUBE / FIREBASE)
const firebaseConfig = {
    apiKey: "AIzaSyCohKlqNu0I1sXcLW4D_fv-OEw9x0S50q8",
    authDomain: "dc-infotechpvt-1-d1a4b.firebaseapp.com",
    databaseURL: "https://dc-infotechpvt-1-d1a4b-default-rtdb.firebaseio.com",
    projectId: "dc-infotechpvt-1-d1a4b",
    storageBucket: "dc-infotechpvt-1-d1a4b.firebasestorage.app",
    messagingSenderId: "330752838328",
    appId: "1:330752838328:web:1fe0ca04953934d4638703"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let ytPlayer;
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0 },
        events: { 'onStateChange': (e) => { if(e.data === 0) skipNext(); } }
    });
    fetchHomeContent();
};

let nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";
let audioCtx, gainNode, bassFilter;

async function playTrack(track, fromPlaylist = []) {
    currentTrack = track;
    if (fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    currentTrackTitle.textContent = track.name;
    currentTrackArtist.textContent = track.artist;
    currentAlbumArt.src = track.art;
    updateDynamicBackground(track.art);

    const data = await fetchWithBypass(`https://iv.ggtyler.dev/api/v1/videos/${track.id}`);
    const format = data?.adaptiveFormats?.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
    
    if (format) {
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
        if (!audioCtx) {
            audioCtx = new AudioContext();
            gainNode = audioCtx.createGain();
            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200;
            const src = audioCtx.createMediaElementSource(nativeAudio);
            src.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);
        }
        nativeAudio.src = format.url; nativeAudio.play(); isPlaying = true;
    } else {
        nativeAudio.pause();
        ytPlayer.loadVideoById(track.id);
        ytPlayer.playVideo(); isPlaying = true;
    }
    updateUISync();
}

function togglePlay() { 
    if (nativeAudio.src && !nativeAudio.paused) { nativeAudio.pause(); isPlaying = false; }
    else if (ytPlayer) { isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); isPlaying = !isPlaying; }
    updateUISync();
}
function skipNext() { if(playlist.length) { currentIndex = (currentIndex+1)%playlist.length; playTrack(playlist[currentIndex]); } }
function updateUISync() {
    playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
    isPlaying ? currentAlbumArt.classList.add('playing') : currentAlbumArt.classList.remove('playing');
}

async function fetchHomeContent() {
    const hits = await searchYouTube('Sidhu Moose Wala New');
    contentArea.innerHTML = `<h1>Top Results</h1><div id="hitsGrid" class="grid-container"></div>`;
    renderGrid(hits, 'hitsGrid');
}

function renderGrid(tracks, containerId) {
    const container = document.getElementById(containerId); container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(track, tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><div class="track-info"><h3>${track.name}</h3><p>${track.artist}</p></div>`;
        container.appendChild(card);
    });
}

// 4. INIT
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-view]').forEach(i => i.onclick = () => {
        const v = i.getAttribute('data-view');
        if (v === 'search' || v === 'search-mobile') renderSearchView();
        else fetchHomeContent();
    });
});
playPauseBtn.onclick = togglePlay;
document.getElementById('nextBtn').onclick = skipNext;
function updateDynamicBackground(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        dynamicBg.style.background = `radial-gradient(circle at 50% -20%, rgb(${r},${g},${b}) 0%, #000 100%)`;
    };
}
