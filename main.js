// ELEMENTS
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');
const volumeSlider = document.getElementById('volumeSlider');
const volumeLow = document.getElementById('volumeLow');
const volumeHigh = document.getElementById('volumeHigh');
const extraVolumeControl = document.getElementById('extraVolumeControl');
const bassControl = document.getElementById('bassControl');
const startTimeText = document.querySelector('.start-time');
const endTimeText = document.querySelector('.end-time');
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
const infoBtn = document.getElementById('infoBtn');

// APP STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;
let isRepeat = false;
let isShuffle = false;

// 1. DATA STRUCTURES & ALGORITHM (DSA)
/**
 * DC MUSIC ENGINE LOGIC:
 * 1. Hash Mapping: Stores user artist frequency in an O(1) Lookup Table.
 * 2. Weighted Ranking: Sorts API results by comparing metadata against the frequency table.
 * 3. Result Caching: Memoizes search queries to prevent redundant network I/O.
 */

// 2. FIREBASE (User Provided Config)
const firebaseConfig = {
    apiKey: "AIzaSyCohKlqNu0I1sXcLW4D_fv-OEw9x0S50q8",
    authDomain: "dc-infotechpvt-1-d1a4b.firebaseapp.com",
    databaseURL: "https://dc-infotechpvt-1-d1a4b-default-rtdb.firebaseio.com",
    projectId: "dc-infotechpvt-1-d1a4b",
    storageBucket: "dc-infotechpvt-1-d1a4b.firebasestorage.app",
    messagingSenderId: "330752838328",
    appId: "1:330752838328:web:1fe0ca04953934d4638703"
};

try {
    firebase.initializeApp(firebaseConfig);
    var db = firebase.database();
    var auth = firebase.auth();
} catch (e) {
    console.error("Firebase Error", e);
}

// User Auth
let currentUser = null;
userProfile.onclick = () => { if (!currentUser) googleSignIn(); else googleSignOut(); };
async function googleSignIn() { 
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); } catch (e) { console.error(e); } 
}
function googleSignOut() { auth.signOut().then(() => location.reload()); }

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        userProfile.innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%">`;
        fetchUserTaste(user.uid);
    }
});

// 3. CACHING & TASTE
const SearchCache = new Map();
let userTaste = JSON.parse(localStorage.getItem('user_taste')) || { artists: {}, plays: 0 };

async function fetchUserTaste(uid) {
    const snap = await db.ref('users/' + uid + '/taste').once('value');
    if (snap.exists()) { userTaste = snap.val(); localStorage.setItem('user_taste', JSON.stringify(userTaste)); }
}

function trackUserTaste(track) {
    if (!track.artist) return;
    const artist = track.artist.split(',')[0].trim();
    userTaste.artists[artist] = (userTaste.artists[artist] || 0) + 1;
    userTaste.plays++;
    localStorage.setItem('user_taste', JSON.stringify(userTaste));
    if (currentUser) db.ref('users/' + currentUser.uid + '/taste').set(userTaste);
}

function rankRecommendations(tracks) {
    return tracks.sort((a, b) => (userTaste.artists[b.artist] || 0) - (userTaste.artists[a.artist] || 0));
}

// 4. ENGINE
let ytPlayer;
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': 'https://dcmusica.netlify.app' },
        events: {
            'onStateChange': (e) => { 
                if (e.data === YT.PlayerState.ENDED) skipNext(); 
                if (e.data === YT.PlayerState.PLAYING) updateMediaSession();
            },
            'onReady': () => { fetchHomeContent(); ytPlayer.setVolume(100); }
        }
    });
};

// RELIABLE FETCH
async function searchYouTube(q) {
    const cacheKey = q.toLowerCase();
    if (SearchCache.has(cacheKey)) return SearchCache.get(cacheKey);

    const instances = ['https://iv.ggtyler.dev', 'https://inv.vern.cc', 'https://invidious.projectsegfau.lt'];
    const corsProxy = 'https://api.allorigins.win/raw?url=';

    for (const inst of instances) {
        try {
            const url = `${corsProxy}${encodeURIComponent(inst + '/api/v1/search?q=' + q + '&type=video')}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            if (data?.length) {
                const resArray = data.map(v => ({ id: v.videoId, name: v.title, artist: v.author, art: v.videoThumbnails[2]?.url || v.videoThumbnails[0].url }));
                SearchCache.set(cacheKey, resArray); return resArray;
            }
        } catch (e) { continue; }
    }
    return [];
}

// AUDIO PROCESSING
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200;
        const src = audioCtx.createMediaElementSource(nativeAudio);
        src.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);
    }
}

async function playTrack(track, fromPlaylist = []) {
    currentTrack = track;
    if (fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    currentTrackTitle.textContent = track.name;
    currentTrackArtist.textContent = track.artist;
    currentAlbumArt.src = track.art;
    updateDynamicBackground(track.art);
    trackUserTaste(track);

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://iv.ggtyler.dev/api/v1/videos/' + track.id)}`;
    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        const format = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
        if (format) {
            ytPlayer.pauseVideo(); initAudioContext();
            nativeAudio.src = format.url; nativeAudio.play();
            nativeAudio.onended = skipNext;
            isPlaying = true; updateUISync(); updateMediaSession(); return;
        }
    } catch (e) { console.warn("Stream error", e); }

    if (ytPlayer && ytPlayer.loadVideoById) { nativeAudio.pause(); ytPlayer.loadVideoById(track.id); ytPlayer.playVideo(); isPlaying = true; updateMediaSession(); }
    updateUISync();
}

function updateMediaSession() {
    if ('mediaSession' in navigator && currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: currentTrack.name, artist: currentTrack.artist, artwork: [{ src: currentTrack.art, sizes: '512x512', type: 'image/jpeg' }] });
        navigator.mediaSession.setActionHandler('play', togglePlay);
        navigator.mediaSession.setActionHandler('pause', togglePlay);
        navigator.mediaSession.setActionHandler('nexttrack', skipNext);
    }
}

// VIEWS
async function fetchHomeContent() {
    contentArea.innerHTML = `<div class="skeleton-card" style="height:350px;"></div>`;
    let hits = await searchYouTube('Top New Music Sidhu Moose Wala');
    hits = rankRecommendations(hits);
    contentArea.innerHTML = `
        <div class="section-header"><h1>For You</h1></div>
        <div class="hero-section">
            <div class="hero-content">
                <span class="badge">PROPER DSA RANKED</span>
                <h2>${hits[0].name}</h2>
                <button class="play-btn-large" id="heroPlay"><i data-lucide="play"></i> Play Heavy</button>
            </div>
            <img src="${hits[0].art}" class="hero-img">
        </div>
        <div id="hitsGrid" class="grid-container"></div>
    `;
    renderTracks(hits.slice(0, 10), 'hitsGrid', hits);
    document.getElementById('heroPlay').onclick = () => playTrack(hits[0], hits);
}

function renderTracks(tracks, containerId, contextPlaylist = []) {
    const container = document.getElementById(containerId); if (!container) return; container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(track, contextPlaylist || tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"><div class="play-overlay"><i data-lucide="play-circle"></i></div></div><div class="track-title-card">${track.name}</div><div class="track-artist-card">${track.artist}</div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

function renderBrowse() {
    contentArea.innerHTML = `
        <div class="section-header"><h1>Browse DC Music</h1></div>
        <div class="genre-grid">
            <div class="genre-card" style="background:#fa2d48" onclick="handleSearch('Punjabi', 'content-area')">Punjabi</div>
            <div class="genre-card" style="background:#2d6afa" onclick="handleSearch('Arijit', 'content-area')">Arijit</div>
            <div class="genre-card" style="background:#2dfa9a" onclick="handleSearch('Lofi', 'content-area')">Lofi</div>
            <div class="genre-card" style="background:#fa9a2d" onclick="handleSearch('Bollywood', 'content-area')">Bollywood</div>
        </div>
        <div id="browseRes" class="grid-container"></div>
    `;
    handleSearch('Top Music', 'browseRes');
}

function renderInfo() {
    contentArea.innerHTML = `
        <div class="section-header"><h1>About DC Music</h1></div>
        <div class="info-card" style="background:rgba(255,255,255,0.05); padding:30px; border-radius:20px; line-height:1.6;">
            <h2>🚀 Advanced Cloud Integration</h2>
            <p>DC Music is powered by <b>Firebase Realtime Database</b>. Your music taste is analyzed in real-time and saved to the cloud under your Google Profile.</p>
            <br>
            <h2>🧠 Background Algorithms (DSA)</h2>
            <p>We use a <b>Hash-Map Weighted Ranking</b> algorithm:</p>
            <ul>
                <li><b>Data Structure:</b> A frequency table (Object/Map) stores artist play counts.</li>
                <li><b>Logic:</b> When you search, a custom <i>weighted sort</i> re-orders results based on your favorite artists.</li>
                <li><b>Complexity:</b> Lookups are O(1), and sorting is O(n log n).</li>
            </ul>
            <br>
            <h2>🎧 Audio Super Engineering</h2>
            <p>Our player uses <b>Web Audio API</b> Gain and Biquad Filter nodes to provide 25dB Bass Boost and 500% Volume amplification.</p>
            <br>
            <p style="color:var(--text-secondary)">Version: 2.0.0 (Master) | Created by Dhiraj Chaudhari</p>
        </div>
    `;
}

// LOGIC
function togglePlay() { 
    if (nativeAudio.src) isPlaying ? nativeAudio.pause() : nativeAudio.play();
    else if (ytPlayer) isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    isPlaying = !isPlaying; updateUISync();
}
function updateUISync() {
    playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
    isPlaying ? currentAlbumArt.classList.add('playing') : currentAlbumArt.classList.remove('playing');
}
function skipNext() { if (playlist.length) { currentIndex = (currentIndex + 1) % playlist.length; playTrack(playlist[currentIndex]); } }
function updateBoosts() { if (audioCtx) { gainNode.gain.value = parseFloat(extraVolumeControl.value) * (volumeSlider.value / 100); bassFilter.gain.value = parseFloat(bassControl.value); } }
function formatTime(s) { const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec.toString().padStart(2, '0')}`; }

// INIT
window.addEventListener('DOMContentLoaded', () => { 
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(i => i.onclick = (e) => {
        const v = i.getAttribute('data-view'); if (v === 'listen now') fetchHomeContent(); else if (v === 'browse') renderBrowse(); else if (v === 'search-mobile') { searchOverlay.style.display='flex'; mobileSearchInput.focus(); }
    });
    infoBtn.onclick = renderInfo;
    document.querySelector('.mobile-search-trigger').onclick = () => { searchOverlay.style.display = 'flex'; mobileSearchInput.focus(); };
    document.querySelector('.close-overlay').onclick = () => searchOverlay.style.display = 'none';
});

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur) {
        const p = (cur / dur) * 100;
        if (progressBar) progressBar.value = p;
        if (mobileProgressFill) mobileProgressFill.style.width = p + '%';
        if (startTimeText) startTimeText.textContent = formatTime(cur);
        if (endTimeText) endTimeText.textContent = formatTime(dur);
    }
}, 1000);

[extraVolumeControl, bassControl, volumeSlider].forEach(c => {
    if (c) c.oninput = () => { updateBoosts(); if (ytPlayer) ytPlayer.setVolume(volumeSlider.value); };
});
[searchInput, mobileSearchInput].forEach(i => {
    if (i) i.oninput = (e) => { if (e.target.value.length > 1) handleSearch(e.target.value, i.id === 'mobileSearchInput' ? 'mobileSearchResults' : 'content-area'); };
});

async function handleSearch(q, cId) { 
    const r = await searchYouTube(q); 
    if (cId === 'content-area') { contentArea.innerHTML = `<h1>Results</h1><div id="resultsGrid" class="grid-container"></div>`; renderTracks(r, 'resultsGrid', r); }
    else renderTracks(r, cId, r); 
}

document.getElementById('nextBtn').onclick = skipNext;
playPauseBtn.onclick = togglePlay;
function updateDynamicBackground(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        dynamicBg.style.background = `radial-gradient(circle at 50% -20%, rgb(${r},${g},${b}) 0%, #000 100%)`;
        document.documentElement.style.setProperty('--accent-color', `rgb(${r},${g},${b})`);
    };
}
