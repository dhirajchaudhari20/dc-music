// 1. BOOTSTRAP & GLOBALS
window.closeWelcome = function() {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 500);
    }
    localStorage.setItem('dc_music_welcomed', 'true');
};

window.googleSignIn = async function() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().signInWithPopup(provider);
        window.closeWelcome();
        location.reload();
    } catch (e) { console.error(e); }
};

// 2. STATE ENGINE
const state = {
    isPlaying: false,
    currentTrack: null,
    playlist: [],
    currentIndex: 0,
    user: null,
    library: [],
    history: [] // Last 6 songs for the "Recent" grid
};

const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// 3. FIREBASE
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
        });
    };
}

// 4. AUDIO ENGINE
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

function updateSound() {
    if (!audioCtx) return;
    const vol = $('volSlide').value / 100;
    const boost = $('bstSlide').value;
    const bass = $('bssSlide').value;
    gainNode.gain.value = vol * boost;
    bassFilter.gain.value = bass;
    if($('volLvl')) $('volLvl').textContent = Math.round(vol * boost * 100) + '% Boost';
    if($('volFill')) $('volFill').style.width = $('volSlide').value + '%';
}

// 5. DATA ENGINE
const INSTANCES = ['https://invidious.poast.org', 'https://inv.vern.cc', 'https://yewtu.be'];

async function searchYouTube(q) {
    if (!q) return [];
    for (let inst of INSTANCES) {
        try {
            // Using direct fetch with timeout as per user's old main.js logic for stability
            const res = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: AbortSignal.timeout(4000) });
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

// 6. PLAYBACK
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
    
    // Add to Recent History
    if (!state.history.find(s => s.id === track.id)) {
        state.history.unshift(track);
        if (state.history.length > 6) state.history.pop();
    }

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
                updateSound(); 
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

function syncUI() {
    $('playPauseBtn').innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}" style="fill:black"></i>`;
    lucide_refresh();
}

// 7. RENDERING (SPOTIFY STYLE)
async function renderHome() {
    const area = $('content-area');
    area.innerHTML = `
        <div class="section-title">Good afternoon</div>
        <div class="recent-grid" id="recentGrid">
            <div class="recent-card"><img src="https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg"><span>Liked Songs</span></div>
        </div>
        <div class="section-title">Recommended for you</div>
        <div class="grid-container" id="recommendGrid"></div>
    `;
    
    // Render History
    const recentGrid = $('recentGrid');
    if (state.history.length) {
        recentGrid.innerHTML = '';
        state.history.forEach(s => {
            const card = document.createElement('div');
            card.className = 'recent-card';
            card.onclick = () => playTrack(s, state.history);
            card.innerHTML = `<img src="${s.art}"><span>${s.name}</span>`;
            recentGrid.appendChild(card);
        });
    }

    const tracks = await searchYouTube('Top Punjabi Sidhu Moose Wala');
    const container = $('recommendGrid');
    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.onclick = () => playTrack(track, tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><h3>${track.name}</h3><p>${track.artist}</p>`;
        container.appendChild(card);
    });
}

function updateDynamicBG(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        const color = `rgb(${r},${g},${b})`;
        $('dynamicBg').style.background = `linear-gradient(to bottom, ${color} 0%, transparent 60%)`;
        document.documentElement.style.setProperty('--accent', color);
    };
}

// 8. BOOTSTRAP
window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin },
        events: { 'onReady': () => { if(localStorage.getItem('dc_music_welcomed') === 'true') renderHome(); } }
    });
};

const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

$('playPauseBtn').onclick = () => {
    if (nativeAudio.src && nativeAudio.src !== '') { state.isPlaying ? nativeAudio.pause() : nativeAudio.play(); }
    else if (ytPlayer) {
        const ps = ytPlayer.getPlayerState();
        ps === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    state.isPlaying = !state.isPlaying;
    syncUI();
};

if($('volSlide')) $('volSlide').oninput = updateSound;

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur && !isNaN(dur)) {
        $('progBar').value = (cur / dur) * 100;
        $('progFill').style.width = (cur / dur) * 100 + '%';
        $('curTime').textContent = formatTime(cur);
        $('durTime').textContent = formatTime(dur);
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
lucide_refresh();
if(localStorage.getItem('dc_music_welcomed') === 'true') renderHome();
