// ELEMENTS
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');
const volumeSlider = document.getElementById('volumeSlider');
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
const welcomeOverlay = document.getElementById('welcomeOverlay');

// APP STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;

// FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyCohKlqNu0I1sXcLW4D_fv-OEw9x0S50q8",
    authDomain: "dc-infotechpvt-1-d1a4b.firebaseapp.com",
    databaseURL: "https://dc-infotechpvt-1-d1a4b-default-rtdb.firebaseio.com",
    projectId: "dc-infotechpvt-1-d1a4b",
    storageBucket: "dc-infotechpvt-1-d1a4b.firebasestorage.app",
    messagingSenderId: "330752838328",
    appId: "1:330752838328:web:1fe0ca04953934d4638703"
};

if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    var db = firebase.database();
    var auth = firebase.auth();
}

// User Auth & Welcome Flow
let currentUser = null;

function closeWelcome() {
    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
    localStorage.setItem('dc_music_welcomed', 'true');
}

if (localStorage.getItem('dc_music_welcomed') === 'true') {
    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
}

async function googleSignIn() { 
    try { 
        const result = await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); 
        if (result.user) closeWelcome();
    } catch (e) { console.error(e); } 
}
function googleSignOut() { auth.signOut().then(() => { localStorage.removeItem('dc_music_welcomed'); location.reload(); }); }

if (typeof auth !== 'undefined') {
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            if (userProfile) userProfile.innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%">`;
            closeWelcome();
            fetchUserTaste(user.uid);
        }
    });
}

// CACHING & TASTE
const SearchCache = new Map();
let userTaste = JSON.parse(localStorage.getItem('user_taste')) || { artists: {}, plays: 0 };
async function fetchUserTaste(uid) {
    if (!db) return;
    const snap = await db.ref('users/' + uid + '/taste').once('value');
    if (snap.exists()) { userTaste = snap.val(); localStorage.setItem('user_taste', JSON.stringify(userTaste)); }
}
function trackUserTaste(track) {
    if (!track.artist) return;
    const artist = track.artist.split(',')[0].trim();
    userTaste.artists[artist] = (userTaste.artists[artist] || 0) + 1;
    userTaste.plays++;
    localStorage.setItem('user_taste', JSON.stringify(userTaste));
    if (currentUser && db) db.ref('users/' + currentUser.uid + '/taste').set(userTaste);
}
function rankRecommendations(tracks) {
    if (!tracks || !tracks.length) return [];
    return tracks.sort((a, b) => (userTaste.artists[b.artist] || 0) - (userTaste.artists[a.artist] || 0));
}

// MOCK DATA
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400' },
    { id: 'jgW4as808No', name: 'Stay', artist: 'The Kid LAROI & Justin Bieber', art: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=400' },
    { id: 'BBAyRbtle7c', name: 'Kesariya', artist: 'Arijit Singh', art: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?q=80&w=400' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=400' }
];

// ENGINE
let ytPlayer;
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin },
        events: {
            'onStateChange': (e) => { 
                if (e.data === YT.PlayerState.ENDED) skipNext(); 
                if (e.data === YT.PlayerState.PLAYING) updateMediaSession();
            },
            'onReady': () => { fetchHomeContent(); }
        }
    });
};

async function searchYouTube(q) {
    if (!q) return [];
    const cacheKey = q.toLowerCase();
    if (SearchCache.has(cacheKey)) return SearchCache.get(cacheKey);
    const instances = ['https://iv.ggtyler.dev', 'https://inv.vern.cc', 'https://invidious.projectsegfau.lt'];
    const corsProxy = 'https://api.allorigins.win/raw?url=';
    for (const inst of instances) {
        try {
            const url = `${corsProxy}${encodeURIComponent(inst + '/api/v1/search?q=' + q + '&type=video')}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.length) {
                const resArray = data.map(v => ({ id: v.videoId, name: v.title, artist: v.author, art: v.videoThumbnails ? (v.videoThumbnails[2]?.url || v.videoThumbnails[0].url) : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17' }));
                SearchCache.set(cacheKey, resArray); return resArray;
            }
        } catch (e) { continue; }
    }
    return PROPER_LIBRARY;
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
    if (fromPlaylist && fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    if (currentTrackTitle) currentTrackTitle.textContent = track.name;
    if (currentTrackArtist) currentTrackArtist.textContent = track.artist;
    if (currentAlbumArt) currentAlbumArt.src = track.art;
    updateDynamicBackground(track.art);
    trackUserTaste(track);

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://iv.ggtyler.dev/api/v1/videos/' + track.id)}`;
    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        const format = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
        if (format) {
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); 
            initAudioContext();
            nativeAudio.src = format.url; nativeAudio.play().catch(() => {});
            nativeAudio.onended = skipNext;
            isPlaying = true; updateUISync(); updateMediaSession(); return;
        }
    } catch (e) { console.warn("Stream error", e); }

    if (ytPlayer && ytPlayer.loadVideoById) { nativeAudio.pause(); ytPlayer.loadVideoById(track.id); ytPlayer.playVideo(); isPlaying = true; updateMediaSession(); }
    updateUISync();
}

function updateMediaSession() {
    if ('mediaSession' in navigator && currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: currentTrack.name, artist: currentTrack.artist,
            artwork: [{ src: currentTrack.art, sizes: '512x512', type: 'image/jpeg' }]
        });
        navigator.mediaSession.setActionHandler('play', togglePlay);
        navigator.mediaSession.setActionHandler('pause', togglePlay);
        navigator.mediaSession.setActionHandler('nexttrack', skipNext);
        navigator.mediaSession.setActionHandler('previoustrack', skipPrev);
    }
}

async function fetchHomeContent() {
    contentArea.innerHTML = `<div class="skeleton-card" style="height:350px;"></div>`;
    let hits = await searchYouTube('Sidhu Moose Wala Top');
    hits = rankRecommendations(hits);
    const greeting = currentUser ? `Hey, ${currentUser.displayName.split(' ')[0]}!` : "Listen Now";
    contentArea.innerHTML = `<div class="section-header"><h1>${greeting}</h1></div><div class="hero-section"><div class="hero-content"><span class="badge">DC ALGO RECOMMEND</span><h2>${hits[0].name}</h2><button class="play-btn-large" id="heroPlay"><i data-lucide="play"></i> Play Heavy</button></div><img src="${hits[0].art}" class="hero-img"></div><div id="hitsGrid" class="grid-container"></div>`;
    renderTracks(hits.slice(0, 10), 'hitsGrid', hits);
    document.getElementById('heroPlay').onclick = () => playTrack(hits[0], hits);
}

function renderTracks(tracks, containerId, contextPlaylist = []) {
    const container = document.getElementById(containerId); if (!container) return; container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(track, contextPlaylist);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"><div class="play-overlay"><i data-lucide="play-circle"></i></div></div><div class="track-title-card">${track.name}</div><div class="track-artist-card">${track.artist}</div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

function renderBrowse() {
    contentArea.innerHTML = `<div class="section-header"><h1>Browse</h1></div><div class="genre-grid"><div class="genre-card" style="background:#fa2d48" onclick="handleSearch('Punjabi', 'content-area')">Punjabi</div><div class="genre-card" style="background:#2d6afa" onclick="handleSearch('Arijit', 'content-area')">Arijit</div></div><div id="browseRes" class="grid-container"></div>`;
    handleSearch('Top Music', 'browseRes');
}

function updateBoosts() {
    if (!audioCtx) return;
    const sysVol = parseInt(document.getElementById('volumeSlider').value);
    const extraVol = parseFloat(document.getElementById('extraVolumeControl').value);
    const bass = parseFloat(document.getElementById('bassControl').value);
    if (document.getElementById('volLevel')) document.getElementById('volLevel').textContent = sysVol + '%';
    if (document.getElementById('extraVolLevel')) document.getElementById('extraVolLevel').textContent = extraVol + 'x';
    if (document.getElementById('bassLevel')) document.getElementById('bassLevel').textContent = bass + 'dB';
    gainNode.gain.value = extraVol * (sysVol / 100);
    bassFilter.gain.value = bass;
}

if (progressBar) {
    progressBar.addEventListener('input', () => {
        const p = progressBar.value / 100;
        if (nativeAudio.src && !isNaN(nativeAudio.duration)) nativeAudio.currentTime = p * nativeAudio.duration;
        else if (ytPlayer && ytPlayer.getDuration) ytPlayer.seekTo(p * ytPlayer.getDuration());
    });
}

function togglePlay() { 
    if (nativeAudio.src && nativeAudio.src !== '') isPlaying ? nativeAudio.pause() : nativeAudio.play();
    else if (ytPlayer) isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    isPlaying = !isPlaying; updateUISync();
}
function updateUISync() {
    if (playIcon) playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
    if (currentAlbumArt) isPlaying ? currentAlbumArt.classList.add('playing') : currentAlbumArt.classList.remove('playing');
}
function skipNext() { if (playlist.length) { currentIndex = (currentIndex + 1) % playlist.length; playTrack(playlist[currentIndex]); } }
function skipPrev() { if (playlist.length) { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; playTrack(playlist[currentIndex]); } }
function formatTime(s) { if (isNaN(s)) return "0:00"; const m = Math.floor(s/60); const sec = Math.floor(s%60); return `${m}:${sec.toString().padStart(2, '0')}`; }

window.addEventListener('DOMContentLoaded', () => { 
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(i => i.onclick = () => {
        const v = i.getAttribute('data-view'); 
        if (v === 'listen now') fetchHomeContent(); 
        else if (v === 'browse') renderBrowse(); 
        else if (v === 'search-mobile') { searchOverlay.style.display='flex'; mobileSearchInput.focus(); }
    });
    const trigger = document.querySelector('.mobile-search-trigger');
    if (trigger) trigger.onclick = () => { searchOverlay.style.display = 'flex'; mobileSearchInput.focus(); };
    const closeBtn = document.querySelector('.close-overlay');
    if (closeBtn) closeBtn.onclick = () => searchOverlay.style.display = 'none';
});

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && nativeAudio.src !== '' && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur && !isNaN(dur)) {
        const p = (cur / dur) * 100;
        if (progressBar) progressBar.value = p;
        if (mobileProgressFill) mobileProgressFill.style.width = p + '%';
        if (startTimeText) startTimeText.textContent = formatTime(cur);
        if (endTimeText) endTimeText.textContent = formatTime(dur);
    }
}, 1000);

[volumeSlider, extraVolumeControl, bassControl].forEach(c => {
    if (c) c.oninput = () => { updateBoosts(); if (ytPlayer) ytPlayer.setVolume(volumeSlider.value); };
});

[searchInput, mobileSearchInput].forEach(i => {
    if (i) i.oninput = (e) => { if (e.target.value.length > 2) handleSearch(e.target.value, i.id === 'mobileSearchInput' ? 'mobileSearchResults' : 'content-area'); };
});

async function handleSearch(q, cId) { 
    const r = await searchYouTube(q); 
    if (cId === 'content-area') { contentArea.innerHTML = `<h1>Results</h1><div id="resultsGrid" class="grid-container"></div>`; renderTracks(r, 'resultsGrid', r); }
    else renderTracks(r, cId, r); 
}

if (document.getElementById('prevBtn')) document.getElementById('prevBtn').onclick = skipPrev;
if (document.getElementById('nextBtn')) document.getElementById('nextBtn').onclick = skipNext;
if (playPauseBtn) playPauseBtn.onclick = togglePlay;

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
