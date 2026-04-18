// Elements
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const progressBar = document.getElementById('progressBar');
const volumeSlider = document.getElementById('volumeSlider');
const volumeLow = document.getElementById('volumeLow');
const volumeHigh = document.getElementById('volumeHigh');
const extraVolumeControl = document.getElementById('extraVolumeControl');
const bassControl = document.getElementById('bassControl');
const startTimeText = document.querySelector('.start-time');
const endTimeText = document.querySelector('.end-time');
const currentTrackTitle = document.getElementById('currentTrackTitle');
const currentTrackArtist = document.getElementById('currentTrackArtist');
const currentAlbumArt = document.getElementById('currentAlbumArt');
const searchInput = document.getElementById('searchInput');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const searchOverlay = document.getElementById('searchOverlay');
const contentArea = document.getElementById('content-area');
const dynamicBg = document.querySelector('.dynamic-bg');
const mobileProgressFill = document.getElementById('mobileProgressFill');

// State
let isPlaying = false;
let currentTrack = null;
let playlist = [];
let currentIndex = 0;
let isRepeat = false;
let isShuffle = false;

// WEB AUDIO API FOR BASS & EXTRA LOUDNESS
let audioCtx;
let source;
let bassFilter;
let gainNode;
let nativeAudio = new Audio();

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioCtx.createGain();
        bassFilter = audioCtx.createBiquadFilter();
        
        bassFilter.type = "lowshelf";
        bassFilter.frequency.value = 200;
        
        source = audioCtx.createMediaElementSource(nativeAudio);
        source.connect(bassFilter);
        bassFilter.connect(gainNode);
        gainNode.connect(audioCtx.destination);
    }
}

// PROPER LIBRARY (REAL IDs)
const PROPER_LIBRARY = [
    { ytId: '4NRXx6U8ABQ', name: 'Blinding Lights', artist: 'The Weeknd', art: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400' },
    { ytId: 'jgW4as808No', name: 'Stay', artist: 'The Kid LAROI & Justin Bieber', art: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=400' },
    { ytId: 'BBAyRbtle7c', name: 'Kesariya', artist: 'Arijit Singh', art: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?q=80&w=400' },
    { ytId: 'hOhKkvT_f6E', name: 'Brown Munde', artist: 'AP Dhillon', art: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=400' },
    { ytId: 'v8PAtHlqD3w', name: 'The Last Ride', artist: 'Sidhu Moose Wala', art: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=400' },
    { ytId: 'ssN-C6XNnNM', name: 'Levels', artist: 'Sidhu Moose Wala', art: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=400' }
];

const MOCK_TRAKS = PROPER_LIBRARY.map(t => ({ id: t.ytId, name: t.name, artist: t.artist, art: t.art }));

// YOUTUBE ENGINE
let ytPlayer;
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-hidden-player', {
        playerVars: { 'autoplay': 0, 'controls': 0, 'origin': window.location.origin },
        events: {
            'onStateChange': (e) => { if (e.data === YT.PlayerState.ENDED) skipNext(); },
            'onReady': () => { fetchHomeContent(); ytPlayer.setVolume(100); }
        }
    });
};

// MULTI-SERVER SEARCH
async function searchYouTube(q) {
    const instances = ['https://iv.ggtyler.dev', 'https://inv.vern.cc', 'https://invidious.projectsegfau.lt'];
    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/api/v1/search?q=${encodeURIComponent(q)}&type=video`, { signal: AbortSignal.timeout(4000) });
            const data = await res.json();
            if (data?.length) return data.map(v => ({ id: v.videoId, name: v.title, artist: v.author, art: v.videoThumbnails[2]?.url || v.videoThumbnails[0].url }));
        } catch (e) { continue; }
    }
    return MOCK_TRAKS.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
}

// PLAYER LOGIC (With Bass & Vol Boost)
async function getDirectAudioUrl(videoId) {
    const instances = ['https://iv.ggtyler.dev', 'https://inv.vern.cc', 'https://vid.plus7.org'];
    for (const inst of instances) {
        try {
            const res = await fetch(`${inst}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            const format = data.adaptiveFormats.find(f => f.type.includes('audio/webm') || f.type.includes('audio/mp4'));
            if (format) return format.url;
        } catch (e) { continue; }
    }
    return null;
}

async function playTrack(track, fromPlaylist = []) {
    currentTrack = track;
    if (fromPlaylist.length) { playlist = fromPlaylist; currentIndex = playlist.findIndex(t => t.id === track.id); }
    
    currentTrackTitle.textContent = track.name;
    currentTrackArtist.textContent = track.artist;
    currentAlbumArt.src = track.art;
    updateDynamicBackground(track.art);

    // Try Direct Audio for Super Boost
    const directUrl = await getDirectAudioUrl(track.id);
    if (directUrl) {
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
        initAudioContext();
        nativeAudio.src = directUrl;
        nativeAudio.play().catch(e => console.error("Direct play failed", e));
        nativeAudio.onended = skipNext;
        isPlaying = true;
    } else if (ytPlayer && ytPlayer.loadVideoById) {
        if (!nativeAudio.paused) nativeAudio.pause();
        ytPlayer.loadVideoById(track.id);
        ytPlayer.playVideo();
        isPlaying = true;
    }
    
    updateUISync();
}

function togglePlay() {
    if (nativeAudio.src && !nativeAudio.paused) { nativeAudio.pause(); isPlaying = false; }
    else if (nativeAudio.src && nativeAudio.paused) { nativeAudio.play(); isPlaying = true; }
    else if (ytPlayer) {
        isPlaying ? ytPlayer.pauseVideo() : ytPlayer.playVideo();
        isPlaying = !isPlaying;
    }
    updateUISync();
}

function skipNext() {
    if (!playlist.length) return;
    currentIndex = (currentIndex + 1) % playlist.length;
    playTrack(playlist[currentIndex]);
}

// BOOST UPDATE LOGIC
function updateBoosts() {
    if (!audioCtx) return;
    const extraVol = parseFloat(extraVolumeControl.value);
    const bass = parseFloat(bassControl.value);
    
    gainNode.gain.value = extraVol * (volumeSlider.value / 100);
    bassFilter.gain.value = bass;
}

[extraVolumeControl, bassControl, volumeSlider].forEach(ctrl => {
    ctrl?.addEventListener('input', () => {
        updateBoosts();
        if (ytPlayer && ytPlayer.setVolume) ytPlayer.setVolume(volumeSlider.value);
    });
});

volumeLow?.addEventListener('click', () => { volumeSlider.value = parseInt(volumeSlider.value) - 20; updateBoosts(); });
volumeHigh?.addEventListener('click', () => { volumeSlider.value = parseInt(volumeSlider.value) + 20; updateBoosts(); });

function updateUISync() {
    playIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    if (window.lucide) lucide.createIcons();
    isPlaying ? currentAlbumArt.classList.add('playing') : currentAlbumArt.classList.remove('playing');
}

// Sync Progress
setInterval(() => {
    let cur = 0, dur = 0;
    if (nativeAudio.src && !nativeAudio.paused) {
        cur = nativeAudio.currentTime; dur = nativeAudio.duration;
    } else if (ytPlayer && ytPlayer.getCurrentTime) {
        cur = ytPlayer.getCurrentTime(); dur = ytPlayer.getDuration();
    }
    if (dur) {
        const p = (cur / dur) * 100;
        if (progressBar) progressBar.value = p;
        if (mobileProgressFill) mobileProgressFill.style.width = p + '%';
        if (startTimeText) startTimeText.textContent = formatTime(cur);
        if (endTimeText) endTimeText.textContent = formatTime(dur);
    }
}, 1000);

if (progressBar) {
    progressBar.addEventListener('input', () => {
        const p = progressBar.value / 100;
        if (nativeAudio.src) nativeAudio.currentTime = p * nativeAudio.duration;
        else if (ytPlayer) ytPlayer.seekTo(p * ytPlayer.getDuration());
    });
}

function formatTime(s) {
    const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

async function fetchHomeContent() {
    contentArea.innerHTML = `<div class="skeleton-card" style="height:350px;"></div>`;
    const hits = await searchYouTube('Top Songs 2026');
    contentArea.innerHTML = `
        <div class="section-header"><h1>Listen Now</h1></div>
        <div class="hero-section">
            <div class="hero-content">
                <span class="badge">PROPER BASS BOOST</span>
                <h2>${hits[0].name}</h2><p>by ${hits[0].artist}</p>
                <button class="play-btn-large" id="heroPlay"><i data-lucide="play"></i> Play Heavy</button>
            </div>
            <img src="${hits[0].art}" class="hero-img">
        </div>
        <div id="hitsGrid" class="grid-container"></div>
    `;
    renderTracks(hits.slice(0, 10), 'hitsGrid', hits);
    document.getElementById('heroPlay').onclick = () => playTrack(hits[0], hits);
}

function renderTracks(tracks, containerId, contextPlaylist = []) {
    const container = document.getElementById(containerId);
    if (!container) return; container.innerHTML = '';
    tracks.forEach(track => {
        const card = document.createElement('div'); card.className = 'track-card';
        card.onclick = () => playTrack(track, contextPlaylist.length ? contextPlaylist : tracks);
        card.innerHTML = `<div class="art-wrapper"><img src="${track.art}"><div class="play-overlay"><i data-lucide="play-circle"></i></div></div><div class="track-title-card">${track.name}</div><div class="track-artist-card">${track.artist}</div>`;
        container.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
}

// SETUP
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            if (view === 'listen now') fetchHomeContent();
        });
    });
});

async function handleSearch(q, containerId) {
    const results = await searchYouTube(q);
    const container = document.getElementById(containerId);
    if (containerId === 'content-area') {
        contentArea.innerHTML = `<h1>Results</h1><div id="searchGrid" class="grid-container"></div>`;
        renderTracks(results, 'searchGrid', results);
    } else renderTracks(results, containerId, results);
}

[searchInput, mobileSearchInput].forEach(inp => {
    inp?.addEventListener('input', (e) => {
        const q = e.target.value;
        if (q.length < 2) return;
        handleSearch(q, inp.id === 'mobileSearchInput' ? 'mobileSearchResults' : 'content-area');
    });
});

function updateDynamicBackground(url) {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = url;
    img.onload = () => {
        const c = document.createElement('canvas'); const ctx = c.getContext('2d');
        c.width = 1; c.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        dynamicBg.style.background = `radial-gradient(circle at 50% -20%, rgb(${r},${g},${b}) 0%, #000 100%)`;
        document.documentElement.style.setProperty('--accent-color', `rgb(${r},${g},${b})`);
    };
}

document.getElementById('nextBtn').onclick = skipNext;
playPauseBtn.onclick = togglePlay;
