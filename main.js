// STATE MANAGEMENT
const state = {
    isPlaying: false,
    currentTrack: null,
    playlist: [],
    currentIndex: 0,
    user: null,
    library: [], // Tracks saved to Firebase
    history: [], // For Automix AI logic
    artistFreq: {} // DSA Frequency Map for Recommendations
};

// HELPERS
const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// FIREBASE INITIALIZATION
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

// AUTH & WELCOME FLOW
async function googleSignIn() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        closeWelcome();
    } catch (error) {
        console.error("Auth Error:", error);
    }
}

function closeWelcome() {
    $('welcomeOverlay').style.opacity = '0';
    setTimeout(() => {
        $('welcomeOverlay').style.display = 'none';
    }, 500);
    localStorage.setItem('dc_music_welcomed', 'true');
}

if(localStorage.getItem('dc_music_welcomed') === 'true') {
    $('welcomeOverlay').style.display = 'none';
}

auth.onAuthStateChanged(user => {
    state.user = user;
    if(user) {
        $('userName').textContent = user.displayName;
        $('userProfile').innerHTML = `<img src="${user.photoURL}" style="width:100%; border-radius:50%">`;
        loadUserLibrary();
    }
});

// AUDIO ENGINE (WEB AUDIO API)
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        bassFilter = audioCtx.createBiquadFilter();
        
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 200;
        
        const source = audioCtx.createMediaElementSource(nativeAudio);
        source.connect(bassFilter);
        bassFilter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
    }
}

function updateAudioParams() {
    if (!audioCtx) return;
    const vol = $('volSlide').value / 100;
    const boost = $('bstSlide').value;
    const bass = $('bssSlide').value;
    
    gainNode.gain.value = vol * boost;
    bassFilter.gain.value = bass;
    $('volLvl').textContent = Math.round(vol * boost * 100) + '%';
}

// SEARCH & DATA (RELIABLE BYPASS)
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/v8PAtHlqD3w/mqdefault.jpg' },
    { id: 'BhW6knhgwfQ', name: 'Stay', artist: 'Justin Bieber', art: 'https://i.ytimg.com/vi/BhW6knhgwfQ/mqdefault.jpg' }
];

async function searchYouTube(q) {
    if (!q) return [];
    
    // Multi-proxy strategy to solve CORS failing issues
    const proxies = [
        'https://corsproxy.io/?',
        'https://api.allorigins.win/raw?url=',
        'https://thingproxy.freeboard.io/fetch/'
    ];
    
    const instances = [
        'https://invidious.poast.org',
        'https://inv.vern.cc',
        'https://yewtu.be'
    ];

    for (let p of proxies) {
        for (let inst of instances) {
            try {
                const url = p + encodeURIComponent(`${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`);
                const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
                const data = await res.json();
                if (data && data.length) {
                    return data.slice(0, 15).map(v => ({
                        id: v.videoId,
                        name: v.title,
                        artist: v.author,
                        art: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
                    }));
                }
            } catch (e) { continue; }
        }
    }
    return PROPER_LIBRARY;
}

// PLAYBACK LOGIC
let ytPlayer;
async function playTrack(track, fromPlaylist = []) {
    initAudio();
    state.currentTrack = track;
    if (fromPlaylist.length) {
        state.playlist = fromPlaylist;
        state.currentIndex = playlist.findIndex(t => t.id === track.id);
    }

    $('currentTitle').textContent = track.name;
    $('currentArtist').textContent = track.artist;
    $('currentArt').src = track.art;
    updateDynamicBG(track.art);
    
    // Update DSA Frequency Map for Automix
    state.artistFreq[track.artist] = (state.artistFreq[track.artist] || 0) + 1;

    try {
        const instances = ['https://invidious.poast.org', 'https://inv.vern.cc'];
        let streamUrl = null;
        for(let inst of instances) {
             const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(inst + '/api/v1/videos/' + track.id)}`);
             const data = await res.json();
             const fmt = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
             if(fmt) { streamUrl = fmt.url; break; }
        }

        if (streamUrl) {
            if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
            nativeAudio.src = streamUrl;
            nativeAudio.play();
            state.isPlaying = true;
        } else {
            throw new Error("No stream found");
        }
    } catch (e) {
        // Fallback to YT IFrame
        if (ytPlayer && ytPlayer.loadVideoById) {
            nativeAudio.pause();
            ytPlayer.loadVideoById(track.id);
            ytPlayer.playVideo();
            state.isPlaying = true;
        }
    }
    syncUI();
}

function togglePlay() {
    if (nativeAudio.src && nativeAudio.src !== '') {
        state.isPlaying ? nativeAudio.pause() : nativeAudio.play();
    } else if (ytPlayer) {
        const ps = ytPlayer.getPlayerState();
        ps === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    state.isPlaying = !state.isPlaying;
    syncUI();
}

function syncUI() {
    $('playPauseBtn').innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}"></i>`;
    lucide_refresh();
}

// AUTOMIX AI (DSA Logic)
$('automixBtn').onclick = async () => {
    if (!state.currentTrack) return;
    
    // Weighted selection: Prefer highly played artists
    const artists = Object.keys(state.artistFreq).sort((a,b) => state.artistFreq[b] - state.artistFreq[a]);
    const topArtist = artists[0] || state.currentTrack.artist;
    
    $('content-area').innerHTML = `<div class="section-header"><h1>Automixing for you...</h1></div><div class="grid-container" id="automixGrid"></div>`;
    const mix = await searchYouTube(`${topArtist} mix 2026`);
    renderGrid(mix, 'automixGrid');
};

// LIBRARY (FIREBASE)
async function loadUserLibrary() {
    if (!state.user) return;
    db.ref(`users/${state.user.uid}/library`).on('value', snap => {
        state.library = snap.val() ? Object.values(snap.val()) : [];
    });
}

$('likeBtn').onclick = () => {
    if (!state.user || !state.currentTrack) return;
    db.ref(`users/${state.user.uid}/library/${state.currentTrack.id}`).set(state.currentTrack);
    $('likeBtn').style.color = 'var(--accent-color)';
};

// NAVIGATION
async function renderHome() {
    $('content-area').innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div class="grid-container" id="homeGrid"></div>`;
    const hits = await searchYouTube('Top Songs Sidhu Moose Wala');
    renderGrid(hits, 'homeGrid');
}

function renderGrid(tracks, containerId) {
    const container = $(containerId);
    container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.onclick = () => playTrack(track, tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><h3>${track.name}</h3><p>${track.artist}</p>`;
        container.appendChild(card);
    });
}

document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
        const view = btn.getAttribute('data-view');
        if (view === 'home') renderHome();
        if (view === 'search') renderSearch();
        if (view === 'library') {
             $('content-area').innerHTML = `<div class="section-header"><h1>My Playlist</h1></div><div class="grid-container" id="libGrid"></div>`;
             renderGrid(state.library, 'libGrid');
        }
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

// INIT
window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        events: { 'onReady': () => renderHome() }
    });
};
const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

$('playPauseBtn').onclick = togglePlay;
$('volSlide').oninput = updateAudioParams;
$('bssSlide').oninput = updateAudioParams;
$('bstSlide').oninput = updateAudioParams;

function updateDynamicBG(url) {
    $('dynamic-bg').style.backgroundImage = `url(${url})`;
    $('dynamic-bg').style.backgroundSize = 'cover';
    $('dynamic-bg').style.backgroundPosition = 'center';
}

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur) {
        $('progBar').value = (cur / dur) * 100;
        $('progFill').style.width = (cur / dur) * 100 + '%';
        $('curTime').textContent = formatTime(cur);
        $('durTime').textContent = formatTime(dur);
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
lucide_refresh();
