// STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;

// HELPERS
const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// PROXIES & INSTANCES (EXPANDED CLUSTER)
const PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.codetabs.com/v1/proxy?quest='
];
const INSTANCES = [
    'https://invidious.poast.org',
    'https://inv.tux.digital',
    'https://invidious.no-logs.com',
    'https://yewtu.be',
    'https://inv.river.group'
];

async function fetchReliably(path) {
    for (let p of PROXIES) {
        for (let inst of INSTANCES) {
            try {
                const url = p + encodeURIComponent(inst + path);
                const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
                if (res.ok) {
                    const data = await res.json();
                    if (data) return data;
                }
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
    if($('welcomeOverlay')) $('welcomeOverlay').style.display = 'none';
    localStorage.setItem('dc_welcomed', 'true');
}
if(localStorage.getItem('dc_welcomed') === 'true') {
    if($('welcomeOverlay')) $('welcomeOverlay').style.display = 'none';
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
        if(user && document.querySelector('.user-profile')) {
            document.querySelector('.user-profile').innerHTML = `<img src="${user.photoURL}" style="width:100%; height:100%; border-radius:50%">`;
            closeWelcome();
        }
    });
}

// DATA & THUMBNAIL FIX
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/maxresdefault.jpg' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/v8PAtHlqD3w/maxresdefault.jpg' },
    { id: 'BBAyRbtle7c', name: 'Kesariya', artist: 'Arijit Singh', art: 'https://i.ytimg.com/vi/BBAyRbtle7c/maxresdefault.jpg' }
];

function fixArtUrl(url, id) {
    if (!url) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return url;
}

async function searchYouTube(q) {
    if(!q) return [];
    const data = await fetchReliably(`/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
    if(data && data.length) {
        return data.slice(0, 15).map(v => ({
            id: v.videoId, name: v.title, artist: v.author,
            art: fixArtUrl(v.videoThumbnails ? v.videoThumbnails[2].url : '', v.videoId)
        }));
    }
    console.warn("API empty, showing library.");
    return PROPER_LIBRARY;
}

// AUDIO ENGINE
let ytPlayer;
let nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";
let audioCtx, gainNode, bassFilter;

function initAudio() {
    if(!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = "lowshelf"; bassFilter.frequency.value = 200;
            const src = audioCtx.createMediaElementSource(nativeAudio);
            src.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);
        } catch(e) { console.error("Audio API error", e); }
    }
}

async function playTrack(track, fromPlaylist = []) {
    currentTrack = track;
    if(fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    if($('currentTitle')) $('currentTitle').textContent = track.name;
    if($('currentArtist')) $('currentArtist').textContent = track.artist;
    if($('currentArt')) $('currentArt').src = track.art;
    
    syncUI();
    const data = await fetchReliably(`/api/v1/videos/${track.id}`);
    if(data && data.adaptiveFormats) {
        const fmt = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
        if(fmt && fmt.url) {
            initAudio();
            if(ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            nativeAudio.src = fmt.url;
            nativeAudio.play().catch(e => {
                console.warn("Native play blocked, using YT", e);
                useYtFallback(track.id);
            });
            isPlaying = true; syncUI(); return;
        }
    }
    useYtFallback(track.id);
}

function useYtFallback(id) {
    if(ytPlayer && ytPlayer.loadVideoById) { 
        nativeAudio.pause(); 
        ytPlayer.loadVideoById(id); 
        ytPlayer.playVideo(); 
        isPlaying = true; 
        syncUI(); 
    }
}

function syncUI() {
    const icon = document.querySelector('.play-btn i');
    if(icon) icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide_refresh();
}

function togglePlay() {
    if(nativeAudio.src && nativeAudio.src !== '' && !nativeAudio.error) { 
        isPlaying ? nativeAudio.pause() : nativeAudio.play().catch(()=>{}); 
    } else if (ytPlayer) {
        isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    isPlaying = !isPlaying; syncUI();
}

// VIEWS
async function renderHome() {
    if($('content-area')) $('content-area').innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div id="hits" class="grid-container"></div>`;
    const hits = await searchYouTube('Top global hits 2026');
    renderGrid(hits, 'hits');
}

function renderGrid(tracks, containerId) {
    const container = $(containerId); if(!container) return;
    container.innerHTML = '';
    tracks.forEach(t => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(t, tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${t.art}"></div><h3>${t.name}</h3><p>${t.artist}</p>`;
        container.appendChild(card);
    });
}

function renderSearch() {
    if($('content-area')) {
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
            renderGrid(res, 'searchRes');
        };
    }
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
