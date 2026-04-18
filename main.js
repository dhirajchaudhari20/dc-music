// ELEMENTS
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progBar'); // Fixed ID
const volumeSlider = document.getElementById('volSlide'); // Fixed ID
const extraVolumeControl = document.getElementById('bstSlide'); // Fixed ID
const bassControl = document.getElementById('bssSlide'); // Fixed ID
const startTimeText = document.getElementById('curTime'); // Fixed ID
const endTimeText = document.getElementById('durTime'); // Fixed ID
const currentTrackTitle = document.getElementById('currentTitle'); // Fixed ID
const currentTrackArtist = document.getElementById('currentArtist'); // Fixed ID
const currentAlbumArt = document.getElementById('currentArt'); // Fixed ID
const contentArea = document.getElementById('content-area');
const dynamicBg = document.querySelector('.dynamic-bg');
const userProfile = document.querySelector('.user-profile');
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

// WELCOME
function closeWelcome() {
    if(welcomeOverlay) welcomeOverlay.style.display = 'none';
    localStorage.setItem('dc_welcomed', 'true');
}
if(localStorage.getItem('dc_welcomed') === 'true') {
    if(welcomeOverlay) welcomeOverlay.style.display = 'none';
}
async function googleSignIn() {
    try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        closeWelcome();
        location.reload();
    } catch(e) { console.error(e); }
}
if(typeof auth !== 'undefined') {
    auth.onAuthStateChanged(user => {
        if(user && userProfile) {
            userProfile.innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%">`;
            closeWelcome();
        }
    });
}

// WEB AUDIO API
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 200;
        const src = audioCtx.createMediaElementSource(nativeAudio);
        src.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);
    }
}

// PROPER LIBRARY (Verified IDs)
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' },
    { id: 'jgW4as808No', name: 'Stay', artist: 'The Kid LAROI & Justin Bieber', art: 'https://i.ytimg.com/vi/jgW4as808No/mqdefault.jpg' },
    { id: 'BBAyRbtle7c', name: 'Kesariya', artist: 'Arijit Singh', art: 'https://i.ytimg.com/vi/BBAyRbtle7c/mqdefault.jpg' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/v8PAtHlqD3w/mqdefault.jpg' },
    { id: 'ssN-C6XNnNM', name: 'Levels', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/ssN-C6XNnNM/mqdefault.jpg' }
];

// YOUTUBE ENGINE
let ytPlayer;
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        height: '0', width: '0',
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin, 'enablejsapi': 1 },
        events: {
            'onStateChange': (e) => { if (e.data === 0) skipNext(); },
            'onReady': () => { renderHome(); }
        }
    });
};

// DIRECT API SEARCH (No CORS Proxy where possible)
async function searchYouTube(q) {
    if(!q) return [];
    // Verified Invidious instances with CORS enabled
    const instances = [
        'https://invidious.flokinet.to',
        'https://invidious.darkness.services',
        'https://inv.vern.cc',
        'https://invidious.poast.org'
    ];
    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: AbortSignal.timeout(4000) });
            const data = await res.json();
            if (data?.length) {
                return data.slice(0, 15).map(v => ({
                    id: v.videoId, name: v.title, artist: v.author, 
                    art: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
                }));
            }
        } catch (e) { continue; }
    }
    return PROPER_LIBRARY.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
}

async function playTrack(track, fromPlaylist = []) {
    currentTrack = track;
    if (fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    currentTrackTitle.textContent = track.name;
    currentTrackArtist.textContent = track.artist;
    currentAlbumArt.src = track.art;
    updateDynamicBackground(track.art);

    // Try Direct Audio for Super Boost
    const instances = ['https://invidious.flokinet.to', 'https://invidious.darkness.services', 'https://inv.vern.cc'];
    let streamUrl = null;
    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/api/v1/videos/${track.id}`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            const format = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
            if (format) { streamUrl = format.url; break; }
        } catch (e) { continue; }
    }

    if (streamUrl) {
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
        initAudioContext();
        nativeAudio.src = streamUrl;
        nativeAudio.play().catch(()=>{});
        nativeAudio.onended = skipNext;
        isPlaying = true;
    } else if (ytPlayer && ytPlayer.loadVideoById) {
        nativeAudio.pause();
        ytPlayer.loadVideoById(track.id);
        ytPlayer.playVideo();
        isPlaying = true;
    }
    updateUISync();
}

function togglePlay() {
    if (nativeAudio.src && nativeAudio.src !== '') { isPlaying ? nativeAudio.pause() : nativeAudio.play().catch(()=>{}); }
    else if (ytPlayer) { isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); }
    isPlaying = !isPlaying; updateUISync();
}
function skipNext() { if (playlist.length) { currentIndex = (currentIndex + 1) % playlist.length; playTrack(playlist[currentIndex]); } }
function skipPrev() { if (playlist.length) { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; playTrack(playlist[currentIndex]); } }

function updateUISync() {
    playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
    isPlaying ? currentAlbumArt.classList.add('playing') : currentAlbumArt.classList.remove('playing');
}

function updateBoosts() {
    if (!audioCtx) return;
    const vol = parseInt(volumeSlider.value);
    const extraVol = parseFloat(extraVolumeControl.value);
    const bass = parseFloat(bassControl.value);
    
    if($('volLvl')) $('volLvl').textContent = vol + '%';
    gainNode.gain.value = extraVol * (vol / 100);
    bassFilter.gain.value = bass;
}

[volumeSlider, extraVolumeControl, bassControl].forEach(el => {
    el?.addEventListener('input', () => {
        updateBoosts();
        if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(volumeSlider.value);
    });
});

async function renderHome() {
    contentArea.innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div id="hitsGrid" class="grid-container"></div>`;
    const hits = await searchYouTube('Top Punjabi Sidhu Moose Wala');
    renderTracks(hits, 'hitsGrid', hits);
}

function renderTracks(tracks, containerId, contextPlaylist = []) {
    const container = document.getElementById(containerId);
    if (!container) return; container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(track, contextPlaylist);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><div class="track-info"><h3>${track.name}</h3><p>${track.artist}</p></div>`;
        container.appendChild(card);
    });
}

function renderSearch() {
    contentArea.innerHTML = `<div class="section-header"><h1>Search</h1></div><div style="background:#1c1c1e; padding:15px; border-radius:15px; display:flex; gap:10px; margin-bottom:30px;"><i data-lucide="search" style="color:#8e8e93"></i><input id="mainSearch" placeholder="Artists, Songs, Lyrics" style="background:none; border:none; outline:none; color:white; width:100%; font-size:16px;"></div><div id="searchRes" class="grid-container"></div>`;
    if (window.lucide) lucide.createIcons();
    document.getElementById('mainSearch').oninput = async (e) => {
        if(e.target.value.length < 3) return;
        const res = await searchYouTube(e.target.value);
        renderTracks(res, 'searchRes', res);
    };
}

document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
        const v = btn.getAttribute('data-view');
        if(v === 'home') renderHome();
        else if(v === 'search') renderSearch();
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };
});

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur && !isNaN(dur)) {
        if(progressBar) progressBar.value = (cur / dur) * 100;
        if(startTimeText) startTimeText.textContent = formatTime(cur);
        if(endTimeText) endTimeText.textContent = formatTime(dur);
    }
}, 1000);

if(progressBar) {
    progressBar.oninput = () => {
        const p = progressBar.value / 100;
        if (nativeAudio.src) nativeAudio.currentTime = p * nativeAudio.duration;
        else if (ytPlayer) ytPlayer.seekTo(p * ytPlayer.getDuration());
    };
}

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
if($('playPauseBtn')) $('playPauseBtn').onclick = togglePlay;
if($('nextBtn')) $('nextBtn').onclick = skipNext;
if($('prevBtn')) $('prevBtn').onclick = skipPrev;

function updateDynamicBackground(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        dynamicBg.style.background = `radial-gradient(circle at 50% -20%, rgb(${r},${g},${b}) 0%, #000 100%)`;
    };
}
