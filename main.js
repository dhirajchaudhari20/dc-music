// ELEMENTS
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.querySelector('.play-btn i');
const progressBar = document.getElementById('progBar');
const volumeSlider = document.getElementById('volSlide');
const extraVolumeControl = document.getElementById('bstSlide');
const bassControl = document.getElementById('bssSlide');
const startTimeText = document.getElementById('curTime');
const endTimeText = document.getElementById('durTime');
const currentTrackTitle = document.getElementById('currentTitle');
const currentTrackArtist = document.getElementById('currentArtist');
const currentAlbumArt = document.getElementById('currentArt');
const contentArea = document.getElementById('content-area');
const dynamicBg = document.querySelector('.dynamic-bg');

// APP STATE
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;

// SOUND SYSTEM (ULTRA LOUD MODE)
let audioCtx, gainNode, bassFilter, nativeAudio = new Audio();
nativeAudio.crossOrigin = "anonymous";

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 150; // Lower freq for punchier bass
        const src = audioCtx.createMediaElementSource(nativeAudio);
        src.connect(bassFilter); 
        bassFilter.connect(gainNode); 
        gainNode.connect(audioCtx.destination);
    }
}

function updateSoundEngine() {
    if (!audioCtx) return;
    const vol = parseInt(volumeSlider.value) / 100;
    const boost = parseFloat(extraVolumeControl.value); // Up to 15x
    const bass = parseFloat(bassControl.value); // Up to 40dB

    gainNode.gain.value = vol * boost;
    bassFilter.gain.value = bass;
    if(document.getElementById('volLvl')) document.getElementById('volLvl').textContent = Math.round(vol * boost * 100) + '%';
}

[volumeSlider, extraVolumeControl, bassControl].forEach(el => {
    el?.addEventListener('input', () => {
        initAudioContext();
        updateSoundEngine();
        if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(volumeSlider.value);
    });
});

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

// SEARCH & DATA
const PROPER_LIBRARY = [
    { id: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' },
    { id: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/v8PAtHlqD3w/mqdefault.jpg' },
    { id: 'ssN-C6XNnNM', name: 'Levels', artist: 'Sidhu Moose Wala', art: 'https://i.ytimg.com/vi/ssN-C6XNnNM/mqdefault.jpg' }
];

async function searchYouTube(q) {
    if(!q) return [];
    const instances = ['https://invidious.flokinet.to', 'https://invidious.poast.org', 'https://inv.vern.cc'];
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

    // TRY DIRECT STREAM FOR ULTRA LOUD BOOST
    const streamInstances = ['https://invidious.flokinet.to', 'https://inv.vern.cc'];
    let streamUrl = null;
    for (const inst of streamInstances) {
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
        updateSoundEngine();
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
    else if (ytPlayer) { 
        const state = ytPlayer.getPlayerState();
        state === 1 ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
    }
    isPlaying = !isPlaying; updateUISync();
}
function skipNext() { if (playlist.length) { currentIndex = (currentIndex + 1) % playlist.length; playTrack(playlist[currentIndex]); } }
function skipPrev() { if (playlist.length) { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; playTrack(playlist[currentIndex]); } }

function updateUISync() {
    const icon = document.querySelector('.play-btn i');
    if(icon) icon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
    isPlaying ? currentAlbumArt.classList.add('playing') : currentAlbumArt.classList.remove('playing');
}

async function renderHome() {
    contentArea.innerHTML = `<div class="section-header"><h1>Listen Now</h1></div><div id="hitsGrid" class="grid-container"></div>`;
    const hits = await searchYouTube('Sidhu Moose Wala Hits');
    renderTracks(hits, 'hitsGrid', hits);
}

function renderTracks(tracks, containerId, contextPlaylist = []) {
    const container = document.getElementById(containerId);
    if (!container) return; container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(track, contextPlaylist);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"></div><h3>${track.name}</h3><p>${track.artist}</p>`;
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
const $ = (id) => document.getElementById(id);
if($('playPauseBtn')) $('playPauseBtn').onclick = togglePlay;
if($('nextBtn')) $('nextBtn').onclick = skipNext;
if($('prevBtn')) $('prevBtn').onclick = skipPrev;
