// STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;

// HELPERS
const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// PROXIES & INSTANCES
const PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/'
];
const INSTANCES = [
    'https://invidious.poast.org',
    'https://inv.tux.digital',
    'https://invidious.no-logs.com',
    'https://yewtu.be'
];

async function fetchReliably(path) {
    for (let p of PROXIES) {
        for (let inst of INSTANCES) {
            try {
                const url = p + encodeURIComponent(inst + path);
                const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
                if (res.ok) return await res.json();
            } catch(e) { continue; }
        }
    }
    return null;
}

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
    var auth = firebase.auth();
    var db = firebase.database();
}

// WELCOME
function closeWelcome() {
    $('welcomeOverlay').style.display = 'none';
    localStorage.setItem('dc_welcomed', 'true');
}
if(localStorage.getItem('dc_welcomed') === 'true') $('welcomeOverlay').style.display = 'none';

async function googleSignIn() {
    try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
        closeWelcome();
    } catch(e) { console.error(e); }
}

if(typeof auth !== 'undefined') {
    auth.onAuthStateChanged(user => {
        if(user && $('user-profile')) {
            document.querySelector('.user-profile').innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%">`;
        }
    });
}

// DATA
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9' }
];

async function searchYouTube(q) {
    if(!q) return [];
    const data = await fetchReliably(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
    if(data && data.length) {
        return data.slice(0, 15).map(v => ({
            id: v.videoId, name: v.title, artist: v.author,
            art: v.videoThumbnails ? v.videoThumbnails[2].url : 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17'
        }));
    }
    return PROPER_LIBRARY;
}

// AUDIO
let ytPlayer;
let nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";
let audioCtx, gainNode, bassFilter;

function initAudio() {
    if(!audioCtx) {
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
    if(fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    $('currentTitle').textContent = track.name;
    $('currentArtist').textContent = track.artist;
    $('currentArt').src = track.art;
    
    syncUI();
    const data = await fetchReliably(`/api/v1/videos/${track.id}`);
    if(data && data.adaptiveFormats) {
        const fmt = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
        if(fmt) {
            initAudio();
            if(ytPlayer) ytPlayer.pauseVideo();
            nativeAudio.src = fmt.url;
            nativeAudio.play().catch(() => {});
            isPlaying = true; syncUI(); return;
        }
    }
    
    if(ytPlayer) { nativeAudio.pause(); ytPlayer.loadVideoById(track.id); ytPlayer.playVideo(); isPlaying = true; }
    syncUI();
}

function syncUI() {
    const icon = document.querySelector('.play-btn i');
    if(icon) icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide_refresh();
    const art = $('currentArt');
    if(art) isPlaying ? art.classList.add('playing') : art.classList.remove('playing');
}

function togglePlay() {
    if(nativeAudio.src && nativeAudio.src !== '') { isPlaying ? nativeAudio.pause() : nativeAudio.play(); }
    else if(ytPlayer) { isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo(); }
    isPlaying = !isPlaying; syncUI();
}

// VIEWS
async function renderHome() {
    $('content-area').innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div id="hits" class="grid-container"></div>`;
    const hits = await searchYouTube('Top global hits 2026');
    renderGrid(hits, 'hits');
}

function renderGrid(tracks, containerId) {
    const container = $(containerId); if(!container) return;
    tracks.forEach(t => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(t, tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${t.art}"></div><h3>${t.name}</h3><p>${t.artist}</p>`;
        container.appendChild(card);
    });
}

function renderSearch() {
    $('content-area').innerHTML = `
        <div class="section-header"><h1>Search</h1></div>
        <div style="background:#1c1c1e; padding:15px; border-radius:15px; display:flex; gap:10px; margin-bottom:30px;">
            <i data-lucide="search" style="color:#8e8e93"></i>
            <input id="mainSearch" placeholder="Artists, Songs, Lyrics" style="background:none; border:none; outline:none; color:white; width:100%; font-size:16px;">
        </div>
        <div id="searchRes" class="grid-container"></div>
    `;
    lucide_refresh();
    $('mainSearch').oninput = async (e) => {
        if(e.target.value.length < 3) return;
        const res = await searchYouTube(e.target.value);
        $('searchRes').innerHTML = '';
        renderGrid(res, 'searchRes');
    };
}

// INIT
window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', { height: '0', width: '0', events: { onReady: renderHome } });
};
const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
        const v = btn.getAttribute('data-view');
        if(v === 'home') renderHome();
        else if(v === 'search') renderSearch();
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };
});

if($('playPauseBtn')) $('playPauseBtn').onclick = togglePlay;
if($('volSlide')) $('volSlide').oninput = (e) => {
    const v = e.target.value;
    if($('volLvl')) $('volLvl').textContent = v + '%';
    if(nativeAudio) nativeAudio.volume = v / 100;
    if(ytPlayer) ytPlayer.setVolume(v);
};
if($('bssSlide')) $('bssSlide').oninput=(e)=>{ if(bassFilter) bassFilter.gain.value=e.target.value; };
if($('bstSlide')) $('bstSlide').oninput=(e)=>{ if(gainNode) gainNode.gain.value=e.target.value*($('volSlide').value/100); };

setInterval(() => {
    let curr = 0, dur = 0;
    if(nativeAudio.src && !nativeAudio.paused) { curr = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if(ytPlayer && ytPlayer.getCurrentTime) { curr = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if(dur && !isNaN(dur)) {
        if($('progBar')) $('progBar').value = (curr / dur) * 100;
        if($('curTime')) $('curTime').textContent = formatTime(curr);
        if($('durTime')) $('durTime').textContent = formatTime(dur);
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
function skipNext() { if(playlist.length) { currentIndex = (currentIndex+1)%playlist.length; playTrack(playlist[currentIndex]); } }
function skipPrev() { if(playlist.length) { currentIndex = (currentIndex-1+playlist.length)%playlist.length; playTrack(playlist[currentIndex]); } }
if($('nextBtn')) $('nextBtn').onclick = skipNext;
if($('prevBtn')) $('prevBtn').onclick = skipPrev;
