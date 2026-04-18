// CRITICAL BOOTSTRAP (Globally Available)
window.closeWelcome = function() {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 500);
    }
    localStorage.setItem('dc_music_welcomed', 'true');
};

window.googleSignIn = async function() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
        window.closeWelcome();
    } catch (error) {
        console.error("Auth Error:", error);
    }
};

// INITIALIZE STATE
const state = {
    isPlaying: false,
    currentTrack: null,
    playlist: [],
    currentIndex: 0,
    user: null,
    library: [],
    artistFreq: {}
};

// HELPERS
const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

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

// Initialize only if Firebase is loaded
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.database();

    auth.onAuthStateChanged(user => {
        state.user = user;
        if(user) {
            if($('userName')) $('userName').textContent = user.displayName;
            if($('userProfile')) $('userProfile').innerHTML = `<img src="${user.photoURL}" style="width:100%; border-radius:50%">`;
            loadUserLibrary(db);
        }
    });
}

// Check for existing welcome state
if(localStorage.getItem('dc_music_welcomed') === 'true') {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) overlay.style.display = 'none';
}

// AUDIO ENGINE
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";

function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 200;
            const source = audioCtx.createMediaElementSource(nativeAudio);
            source.connect(bassFilter);
            bassFilter.connect(gainNode);
            gainNode.connect(audioCtx.destination);
        } catch(e) { console.warn("Audio Context blocked by browser policy"); }
    }
}

function updateAudioParams() {
    if (!audioCtx) return;
    const vol = $('volSlide').value / 100;
    const boost = $('bstSlide').value;
    const bass = $('bssSlide').value;
    gainNode.gain.value = vol * boost;
    bassFilter.gain.value = bass;
    if($('volLvl')) $('volLvl').textContent = Math.round(vol * boost * 100) + '%';
}

// SEARCH - SUPER RELIABLE CLUSTER
const INSTANCES = ['https://invidious.poast.org', 'https://inv.vern.cc', 'https://yewtu.be'];
const PROXIES = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];

async function searchYouTube(q) {
    if (!q) return [];
    for (let p of PROXIES) {
        for (let inst of INSTANCES) {
            try {
                const target = `${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`;
                const res = await fetch(p + encodeURIComponent(target), { signal: AbortSignal.timeout(4000) });
                const data = await res.json();
                if (data && data.length) {
                    return data.slice(0, 15).map(v => ({
                        id: v.videoId, name: v.title, artist: v.author, 
                        art: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
                    }));
                }
            } catch (e) { continue; }
        }
    }
    return [
        { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' },
        { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/v8PAtHlqD3w/mqdefault.jpg' }
    ];
}

// PLAYBACK
let ytPlayer;
async function playTrack(track, fromPlaylist = []) {
    initAudio();
    state.currentTrack = track;
    if (fromPlaylist.length) {
        state.playlist = fromPlaylist;
        state.currentIndex = fromPlaylist.findIndex(t => t.id === track.id);
    }

    if($('currentTitle')) $('currentTitle').textContent = track.name;
    if($('currentArtist')) $('currentArtist').textContent = track.artist;
    if($('currentArt')) $('currentArt').src = track.art;
    updateDynamicBG(track.art);
    
    state.artistFreq[track.artist] = (state.artistFreq[track.artist] || 0) + 1;

    try {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent('https://inv.vern.cc/api/v1/videos/' + track.id)}`);
        const data = await res.json();
        const fmt = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
        if(fmt && fmt.url) {
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            nativeAudio.src = fmt.url;
            nativeAudio.play();
            state.isPlaying = true;
        } else { throw new Error(); }
    } catch (e) {
        if (ytPlayer && ytPlayer.loadVideoById) {
            nativeAudio.pause();
            ytPlayer.loadVideoById(track.id);
            ytPlayer.playVideo();
            state.isPlaying = true;
        }
    }
    syncUI();
}

function syncUI() {
    if($('playPauseBtn')) $('playPauseBtn').innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}"></i>`;
    lucide_refresh();
}

async function renderHome() {
    if($('content-area')) $('content-area').innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div class="grid-container" id="homeGrid"></div>`;
    const hits = await searchYouTube('Top Songs Sidhu Moose Wala');
    renderGrid(hits, 'homeGrid');
}

function renderGrid(tracks, containerId) {
    const container = $(containerId); if(!container) return;
    container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.onclick = () => playTrack(track, tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><h3>${track.name}</h3><p>${track.artist}</p>`;
        container.appendChild(card);
    });
}

// NAVIGATION VIEW LOGIC
document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
        const view = btn.getAttribute('data-view');
        if (view === 'home') renderHome();
        if (view === 'search') renderSearch();
        if (view === 'library') renderLibrary();
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };
});

function renderSearch() {
    $('content-area').innerHTML = `<div class="section-header"><h1>Search</h1></div><div id="searchGrid" class="grid-container"></div>`;
    $('topSearch').oninput = async (e) => {
        if(e.target.value.length < 3) return;
        const res = await searchYouTube(e.target.value);
        renderGrid(res, 'searchGrid');
    };
}

function renderLibrary() {
    $('content-area').innerHTML = `<div class="section-header"><h1>My Playlist</h1></div><div class="grid-container" id="libGrid"></div>`;
    renderGrid(state.library, 'libGrid');
}

// YT IFRAME INIT
window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin },
        events: { 'onReady': () => renderHome() }
    });
};
const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// BINDINGS
if($('playPauseBtn')) $('playPauseBtn').onclick = () => {
    if (nativeAudio.src && nativeAudio.src !== '') {
        state.isPlaying ? nativeAudio.pause() : nativeAudio.play().catch(()=>{});
    } else if (ytPlayer) {
        const ps = ytPlayer.getPlayerState();
        ps === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    state.isPlaying = !state.isPlaying;
    syncUI();
};

if($('volSlide')) $('volSlide').oninput = updateAudioParams;
if($('bssSlide')) $('bssSlide').oninput = updateAudioParams;
if($('bstSlide')) $('bstSlide').oninput = updateAudioParams;

function updateDynamicBG(url) {
    if($('dynamic-bg')) {
        $('dynamic-bg').style.backgroundImage = `url(${url})`;
        $('dynamic-bg').style.backgroundSize = 'cover';
        $('dynamic-bg').style.backgroundPosition = 'center';
    }
}

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur) {
        if($('progBar')) $('progBar').value = (cur / dur) * 100;
        if($('progFill')) $('progFill').style.width = (cur / dur) * 100 + '%';
        if($('curTime')) $('curTime').textContent = formatTime(cur);
        if($('durTime')) $('durTime').textContent = formatTime(dur);
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
lucide_refresh();
