// 1. GLOBAL BOOTSTRAP (Zero-Latency Core)
window.closeWelcome = function() {
    const ov = document.getElementById('welcomeOverlay');
    if (ov) {
        ov.style.transition = '0.6s cubic-bezier(0.165, 0.84, 0.44, 1)';
        ov.style.opacity = '0';
        ov.style.transform = 'scale(1.05)';
        setTimeout(() => { ov.style.display = 'none'; renderHome(); }, 600);
    }
    localStorage.setItem('dc_music_welcomed', 'true');
};

window.googleSignIn = async function() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
        window.closeWelcome();
    } catch (e) { console.error(e); }
};

window.toggleDrawer = function() {
    const dr = document.getElementById('mobileDrawer');
    if (dr) dr.classList.toggle('active');
};

// 2. STATE ENGINE
const state = {
    isPlaying: false,
    currentTrack: null,
    playlist: [],
    currentIndex: 0,
    user: null,
    library: [],
    history: [],
    view: 'home'
};

const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// 3. FIREBASE & CLOUD SYNC
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
    const auth = firebase.auth();
    const db = firebase.database();

    auth.onAuthStateChanged(user => {
        state.user = user;
        if(user) {
            if($('userName')) $('userName').textContent = user.displayName;
            if($('userProfile')) $('userProfile').querySelector('div').innerHTML = `<img src="${user.photoURL}" style="width:100%; border-radius:50%">`;
            loadUserLibrary(db);
        }
    });

    window.loadUserLibrary = function(database) {
        database.ref(`users/${state.user.uid}/library`).on('value', snap => {
            state.library = snap.val() ? Object.values(snap.val()) : [];
            if(state.view === 'library') renderLibrary();
        });
    };
}

// 4. AUDIO & BASS ENGINE (WEB AUDIO API)
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 180;
        const src = audioCtx.createMediaElementSource(nativeAudio);
        src.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);
    }
}

function updateSoundParams(e) {
    if (!audioCtx) return;
    
    // Sync cross-sliders if event came from one
    if(e) {
        if(e.target.id === 'volSlide') $('mVolSlide').value = e.target.value;
        if(e.target.id === 'mVolSlide') $('volSlide').value = e.target.value;
        if(e.target.id === 'bstSlide') $('mBstSlide').value = e.target.value;
        if(e.target.id === 'mBstSlide') $('bstSlide').value = e.target.value;
        if(e.target.id === 'bssSlide') $('mBssSlide').value = e.target.value;
        if(e.target.id === 'mBssSlide') $('bssSlide').value = e.target.value;
    }

    const vol = $('volSlide').value / 100;
    const boost = parseFloat($('bstSlide').value);
    const bassBinary = parseFloat($('bssSlide').value);
    
    gainNode.gain.value = vol * boost;
    bassFilter.gain.value = bassBinary;
    if($('volLvl')) $('volLvl').textContent = Math.round(vol * boost * 100) + '% Boost';
}

// 5. DATA FETCHING (ULTRA STABLE)
const INSTANCES = ['https://invidious.poast.org', 'https://inv.vern.cc', 'https://yewtu.be'];

async function searchYouTube(q) {
    if (!q) return [];
    for (let inst of INSTANCES) {
        try {
            const res = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: AbortSignal.timeout(4500) });
            const data = await res.json();
            if (data && data.length) {
                return data.slice(0, 20).map(v => ({
                    id: v.videoId, name: v.title, artist: v.author, 
                    art: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`
                }));
            }
        } catch (e) { continue; }
    }
    return [];
}

// 6. MULTI-SYNC PLAYBACK (Drawer + Shell + Strip)
let ytPlayer;
async function playTrack(track, fromPlaylist = []) {
    initAudio();
    state.currentTrack = track;
    if (fromPlaylist.length) {
        state.playlist = fromPlaylist;
        state.currentIndex = fromPlaylist.findIndex(t => t.id === track.id);
    }

    // Sync All Surfaces
    syncTrackInfo(track);
    updateAppAccent(track.art);

    try {
        for(let inst of INSTANCES) {
            const res = await fetch(`${inst}/api/v1/videos/${track.id}`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            const fmt = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
            if(fmt) {
                if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
                nativeAudio.src = fmt.url;
                nativeAudio.play();
                state.isPlaying = true;
                updateSoundParams();
                syncUI();
                return;
            }
        }
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

function syncTrackInfo(t) {
    const ids = ['currentTitle', 'drawerTitle', 'mStripTitle'];
    ids.forEach(id => { if($(id)) $(id).textContent = t.name; });
    const aids = ['currentArtist', 'drawerArtist', 'mStripArtist'];
    aids.forEach(id => { if($(id)) $(id).textContent = t.artist; });
    const arts = ['currentArt', 'drawerArt', 'mStripArt'];
    arts.forEach(id => { if($(id)) $(id).src = t.art; });
}

window.togglePlay = function() {
    if (nativeAudio.src && nativeAudio.src !== '') { state.isPlaying ? nativeAudio.pause() : nativeAudio.play(); }
    else if (ytPlayer) {
        const ps = ytPlayer.getPlayerState();
        ps === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    state.isPlaying = !state.isPlaying;
    syncUI();
};

function syncUI() {
    const playIcons = ['playPauseBtn', 'mStripPlay', 'dPlay'];
    playIcons.forEach(pid => {
        if($(pid)) $(pid).innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}" ${pid === 'mStripPlay' ? 'fill="white"' : 'fill="black"'} size="${pid==='dPlay'?32:20}"></i>`;
    });
    lucide_refresh();
}

// 7. SPA VIEW TRANSITIONS
function switchView(viewName, contentFn) {
    const viewport = $('mainViewport');
    viewport.style.opacity = '0';
    viewport.style.transform = 'translateY(10px)';
    state.view = viewName;
    
    setTimeout(async () => {
        await contentFn();
        viewport.style.opacity = '1';
        viewport.style.transform = 'translateY(0)';
        viewport.scrollTop = 0;
    }, 300);
}

async function renderHome() {
    state.history = state.history.length > 0 ? state.history : await searchYouTube('Top Punjabi Sidhu Moose Wala');
    const area = $('content-area');
    area.innerHTML = `
        <div class="section-title">Good afternoon</div>
        <div class="recent-grid" id="recRecent"></div>
        <div class="section-title">Made For You</div>
        <div class="grid-container" id="recGrid"></div>
    `;
    renderTracks(state.history.slice(0, 6), 'recRecent', true);
    renderTracks(state.history.slice(6, 20), 'recGrid', false);
}

async function renderSearch() {
    $('content-area').innerHTML = `
        <div class="section-title">Search</div>
        <div style="background:#1a1a1a; padding:15px; border-radius:10px; display:flex; gap:15px; margin-bottom:40px;">
            <i data-lucide="search" color="#555"></i>
            <input id="searchInput" placeholder="Artists, songs, or podcasts" style="background:none; border:none; outline:none; color:white; width:100%; font-weight:700;">
        </div>
        <div class="grid-container" id="searchGrid"></div>
    `;
    lucide_refresh();
    $('searchInput').oninput = async (e) => {
        if (e.target.value.length < 3) return;
        const res = await searchYouTube(e.target.value);
        renderTracks(res, 'searchGrid');
    };
}

async function renderLibrary() {
    $('content-area').innerHTML = `<div class="section-title">Your Library</div><div class="grid-container" id="libGrid"></div>`;
    renderTracks(state.library, 'libGrid');
}

function renderTracks(tracks, containerId, isRecent = false) {
    const container = $(containerId); if(!container) return;
    container.innerHTML = '';
    tracks.forEach(t => {
        const card = document.createElement('div');
        card.className = isRecent ? 'recent-item' : 'card';
        card.onclick = () => playTrack(t, tracks);
        card.innerHTML = isRecent ? 
            `<img src="${t.art}"><span>${t.name}</span>` :
            `<div class="card-art"><img src="${t.art}"></div><h3>${t.name}</h3><p>${t.artist}</p>`;
        container.appendChild(card);
    });
}

// 8. VISUAL EXCELLENCE (Dynamic Accent)
function updateAppAccent(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        const accent = `rgb(${r},${g},${b})`;
        $('dynamicBg').style.background = `linear-gradient(to bottom, ${accent} 0%, transparent 70%)`;
        document.documentElement.style.setProperty('--accent', accent);
    };
}

// 9. EVENT REGISTRATION
window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin },
        events: { 'onReady': () => { if(localStorage.getItem('dc_music_welcomed') === 'true') renderHome(); } }
    });
};

document.querySelectorAll('[data-view]').forEach(v => {
    v.onclick = () => {
        const view = v.getAttribute('data-view');
        if (view === 'home') switchView('home', renderHome);
        if (view === 'search') switchView('search', renderSearch);
        if (view === 'library') switchView('library', renderLibrary);
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        v.classList.add('active');
    };
});

// Sync Progress
setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur && !isNaN(dur)) {
        const p = (cur / dur) * 100;
        ['progBar', 'dProgBar'].forEach(id => { if($(id)) $(id).value = p; });
        ['progFill', 'dProgFill'].forEach(id => { if($(id)) $(id).style.width = p + '%'; });
        ['curTime', 'dCurTime'].forEach(id => { if($(id)) $(id).textContent = formatTime(cur); });
        ['durTime', 'dDurTime'].forEach(id => { if($(id)) $(id).textContent = formatTime(dur); });
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
lucide_refresh();
if(localStorage.getItem('dc_music_welcomed') === 'true') {
    setTimeout(renderHome, 500);
}

$('playPauseBtn').onclick = window.togglePlay;
$('dPlay').onclick = window.togglePlay;

// Audio Engine Bindings (Desktop + Mobile Sync)
['volSlide', 'bstSlide', 'bssSlide', 'mVolSlide', 'mBstSlide', 'mBssSlide'].forEach(id => {
    if($(id)) $(id).oninput = updateSoundParams;
});
