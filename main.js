// 1. BOOTSTRAP & GLOBALS
window.closeWelcome = function() {
    const overlay = document.getElementById('welcomeOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(1.1)';
        setTimeout(() => { overlay.style.display = 'none'; }, 600);
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

// 2. STATE ENGINE
const state = {
    isPlaying: false,
    currentTrack: null,
    playlist: [],
    currentIndex: 0,
    user: null,
    library: [],
    artistFreq: {}
};

const $ = (id) => document.getElementById(id);
const lucide_refresh = () => window.lucide && lucide.createIcons();

// 3. FIREBASE INTEGRATION
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
            if($('userProfile')) $('userProfile').innerHTML = `<img src="${user.photoURL}" style="width:100%; border-radius:50%">`;
            loadUserLibrary(db);
        }
    });

    window.loadUserLibrary = function(database) {
        database.ref(`users/${state.user.uid}/library`).on('value', snap => {
            state.library = snap.val() ? Object.values(snap.val()) : [];
            if($('libGrid')) renderGrid(state.library, 'libGrid');
        });
    };

    window.toggleLike = function() {
        if (!state.user || !state.currentTrack) return;
        const ref = db.ref(`users/${state.user.uid}/library/${state.currentTrack.id}`);
        ref.once('value').then(snap => {
            if (snap.exists()) {
                ref.remove();
                $('likeBtn').querySelector('i').style.fill = 'none';
            } else {
                ref.set(state.currentTrack);
                $('likeBtn').querySelector('i').style.fill = 'var(--accent-color)';
            }
        });
    };
}

// 4. AUDIO & LOUDNESS ENGINE
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";

function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioCtx.createGain();
            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 180;
            const src = audioCtx.createMediaElementSource(nativeAudio);
            src.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);
        } catch(e) { console.warn("Loudness engine blocked by browser"); }
    }
}

function updateSound() {
    if (!audioCtx) return;
    const vol = $('volSlide').value / 100;
    const boost = $('bstSlide').value;
    const bass = $('bssSlide').value;
    gainNode.gain.value = vol * boost;
    bassFilter.gain.value = bass;
    if($('volLvl')) $('volLvl').textContent = Math.round(vol * boost * 100) + '%';
}

// 5. SEARCH & STABILITY CLUSTER
const INSTANCES = ['https://invidious.poast.org', 'https://inv.vern.cc', 'https://yewtu.be'];
const PROXIES = ['https://corsproxy.io/?', 'https://api.allorigins.win/raw?url='];

async function searchYouTube(q) {
    if (!q) return [];
    for (let p of PROXIES) {
        for (let inst of INSTANCES) {
            try {
                const target = `${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`;
                const res = await fetch(p + encodeURIComponent(target), { signal: AbortSignal.timeout(4500) });
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
    return [{ id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' }];
}

// 6. CORE PLAYBACK
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
    updatePremiumBG(track.art);
    
    state.artistFreq[track.artist] = (state.artistFreq[track.artist] || 0) + 1;

    try {
        for(let inst of INSTANCES) {
            try {
                const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(inst + '/api/v1/videos/' + track.id)}`, { signal: AbortSignal.timeout(4000) });
                const data = await res.json();
                const fmt = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
                if(fmt && fmt.url) {
                    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
                    nativeAudio.src = fmt.url;
                    nativeAudio.play();
                    state.isPlaying = true;
                    updateSound();
                    syncUI();
                    return;
                }
            } catch(e) { continue; }
        }
        throw new Error();
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
    if($('currentArt')) state.isPlaying ? $('currentArt').classList.add('playing') : $('currentArt').classList.remove('playing');
    lucide_refresh();
}

function renderGrid(tracks, containerId) {
    const container = $(containerId); if(!container) return;
    container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div');
        card.className = 'track-card';
        card.onclick = () => {
            playTrack(track, tracks);
            // Scroll to top on click in mobile
            if(window.innerWidth < 768) document.querySelector('.main-content').scrollTop = 0;
        };
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><h3>${track.name}</h3><p>${track.artist}</p>`;
        container.appendChild(card);
    });
}

// 7. MULTI-VIEW NAVIGATION
async function renderHome() {
    if($('content-area')) $('content-area').innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div class="grid-container" id="homeGrid"></div>`;
    const hits = await searchYouTube('Punjabi Top Hits 2026');
    renderGrid(hits, 'homeGrid');
}

document.querySelectorAll('[data-view]').forEach(btn => {
    btn.onclick = () => {
        const view = btn.getAttribute('data-view');
        if (view === 'home') renderHome();
        if (view === 'library') {
            $('content-area').innerHTML = `<div class="section-header"><h1>Library</h1></div><div class="grid-container" id="libGrid"></div>`;
            renderGrid(state.library, 'libGrid');
        }
        document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };
});

// SEARCH INTEGRATION
if($('topSearch')) {
    $('topSearch').oninput = async (e) => {
        if(e.target.value.length < 3) return;
        if($('content-area')) $('content-area').innerHTML = `<div class="section-header"><h1>Searching for "${e.target.value}"</h1></div><div id="searchGrid" class="grid-container"></div>`;
        const res = await searchYouTube(e.target.value);
        renderGrid(res, 'searchGrid');
    };
}

// 8. VISUAL EXCELLENCE (Dynamic BG)
function updatePremiumBG(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        const mainColor = `rgb(${r},${g},${b})`;
        const overlayColor = `rgba(${r},${g},${b}, 0.3)`;
        
        if($('dynamicBg')) $('dynamicBg').style.background = `radial-gradient(circle at 50% -20%, ${mainColor} 0%, #000 100%)`;
        document.documentElement.style.setProperty('--accent-color', mainColor);
        document.body.style.backgroundColor = '#000';
    };
}

// 9. EVENT REGISTRATION
window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin, 'enablejsapi': 1 },
        events: { 'onReady': () => { if(localStorage.getItem('dc_music_welcomed') === 'true') renderHome(); } }
    });
};
const tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

if($('playPauseBtn')) $('playPauseBtn').onclick = () => {
    if (nativeAudio.src && nativeAudio.src !== '') {
        state.isPlaying ? nativeAudio.pause() : nativeAudio.play();
    } else if (ytPlayer) {
        const ps = ytPlayer.getPlayerState();
        ps === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    state.isPlaying = !state.isPlaying;
    syncUI();
};

if($('likeBtn')) $('likeBtn').onclick = () => window.toggleLike();
if($('volSlide')) $('volSlide').oninput = updateSound;
if($('bssSlide')) $('bssSlide').oninput = updateSound;
if($('bstSlide')) $('bstSlide').oninput = updateSound;

if($('nextBtn')) $('nextBtn').onclick = () => {
    if(state.playlist.length) {
        state.currentIndex = (state.currentIndex + 1) % state.playlist.length;
        playTrack(state.playlist[state.currentIndex], state.playlist);
    }
};

setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) { cur = nativeAudio.currentTime; dur = nativeAudio.duration; }
    else if (ytPlayer && ytPlayer.getCurrentTime) { cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration(); }
    if (dur && !isNaN(dur)) {
        if($('progBar')) $('progBar').value = (cur / dur) * 100;
        if($('progFill')) $('progFill').style.width = (cur / dur) * 100 + '%';
        if($('curTime')) $('curTime').textContent = formatTime(cur);
        if($('durTime')) $('durTime').textContent = formatTime(dur);
    }
}, 1000);

function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc.toString().padStart(2, '0')}`; }
lucide_refresh();
if(localStorage.getItem('dc_music_welcomed') === 'true') renderHome();
