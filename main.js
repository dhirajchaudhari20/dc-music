// STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;

// HELPERS
const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// SEARCH (YOUTUBE DIRECT METHOD - ROBUST)
async function searchYouTube(q) {
    if(!q) return [];
    
    // We'll use a high-reliability YouTube metadata proxy
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=' + q)}`;
    
    try {
        const res = await fetch(proxyUrl);
        const data = await res.json();
        const suggestions = data[1] || [];
        
        // If we have suggestions, we'll fetch the top 10 videos by scraping a search proxy
        // This is the "YouTube way" that doesn't rely on Invidious instances
        const searchUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.youtube.com/results?search_query=' + q)}`;
        const searchRes = await fetch(searchUrl);
        const html = await searchRes.text();
        
        // Extract Video IDs and Titles using regex (Very stable method)
        const videoIds = [...html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)].map(m => m[1]);
        const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"(.*?)"\}\]/g)].map(m => m[1]);
        
        const uniqueIds = [...new Set(videoIds)].slice(0, 15);
        return uniqueIds.map((id, index) => ({
            id: id,
            name: titles[index] || q,
            artist: "YouTube",
            art: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        }));
    } catch (e) {
        console.warn("Search failed, using library fallback", e);
        return PROPER_LIBRARY;
    }
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

// LIBRARY
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/v8PAtHlqD3w/hqdefault.jpg' },
    { id: 'BBAyRbtle7c', name: 'Kesariya', artist: 'Arijit Singh', art: 'https://i.ytimg.com/vi/BBAyRbtle7c/hqdefault.jpg' }
];

// AUDIO ENGINE (100% YOUTUBE DIRECT)
let ytPlayer;

async function playTrack(track, fromPlaylist = []) {
    currentTrack = track;
    if(fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    if($('currentTitle')) $('currentTitle').textContent = track.name;
    if($('currentArtist')) $('currentArtist').textContent = track.artist;
    if($('currentArt')) $('currentArt').src = track.art;
    
    if(ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById(track.id);
        ytPlayer.playVideo();
        isPlaying = true;
        syncUI();
    }
}

function syncUI() {
    const icon = document.querySelector('.play-btn i');
    if(icon) icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    lucide_refresh();
    const art = $('currentArt');
    if(art) isPlaying ? art.classList.add('playing') : art.classList.remove('playing');
}

function togglePlay() {
    if (ytPlayer && ytPlayer.getPlayerState) {
        const state = ytPlayer.getPlayerState();
        if (state === 1) ytPlayer.pauseVideo();
        else ytPlayer.playVideo();
        isPlaying = (state !== 1);
    }
    syncUI();
}

// VIEWS
async function renderHome() {
    if($('content-area')) $('content-area').innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div id="hits" class="grid-container"></div>`;
    const hits = await searchYouTube('Sidhu Moose Wala New');
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
    ytPlayer = new YT.Player('yt-hidden-player', {
        height: '0', width: '0',
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin },
        events: {
            'onReady': () => { renderHome(); },
            'onStateChange': (e) => {
                if(e.data === 0) skipNext();
                if(e.data === 1) isPlaying = true;
                if(e.data === 2) isPlaying = false;
                syncUI();
            }
        }
    });
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
    if(ytPlayer) ytPlayer.setVolume(v);
};
setInterval(() => {
    if(ytPlayer && ytPlayer.getCurrentTime) {
        const curr = ytPlayer.getCurrentTime();
        const dur = ytPlayer.getDuration();
        if(dur) {
            if($('progBar')) $('progBar').value = (curr / dur) * 100;
            if($('curTime')) $('curTime').textContent = formatTime(curr);
            if($('durTime')) $('durTime').textContent = formatTime(dur);
        }
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
function skipNext() { if(playlist.length) { currentIndex = (currentIndex+1)%playlist.length; playTrack(playlist[currentIndex]); } }
function skipPrev() { if(playlist.length) { currentIndex = (currentIndex-1+playlist.length)%playlist.length; playTrack(playlist[currentIndex]); } }
if($('nextBtn')) $('nextBtn').onclick = skipNext;
if($('prevBtn')) $('prevBtn').onclick = skipPrev;
