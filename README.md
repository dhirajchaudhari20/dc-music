# DC MUSIC 🎵
### Premium High-Bass Music Experience

**DC MUSIC** is a professional-grade music player built with a high-performance audio engine and a personalized recommendation system. It uses the **Web Audio API** and a **weighted ranking algorithm (DSA)** to deliver a tailored listening experience.

## 🚀 Professional Features

- **Google Authentication**: Seamlessly log in with your Google account to sync your music profile.
- **Firebase Realtime Database**: Your listening history and music preferences are saved in the cloud under the `dc-infotechpvt-1` project.
- **Super Bass & Extra Loundness**:
  *   **Super Bass**: Custom BiquadFilter (25dB boost).
  *   **Extra Volume**: Signal Gain up to 500%.
- **Smart Recommendation Engine (DSA)**:
  *   **Data Structure**: Uses a **Hash Map** to track your favorite artists in real-time.
  *   **Algorithm**: Implements a weighted **Sorting Algorithm** to rank new search results based on your personal taste profile.
- **Background Playback**: Optimized with the **Media Session API** for lock-screen controls and background audio.
- **Internet Optimized**: Uses a **Result Caching Layer** to reduce data usage for repeated searches.

## 🧠 How the DSA Works (Background Logic)

The "Brain" of DC Music works as follows:
1. **Frequency Mapping**: Every time you play a track, the app updates a **Frequency Table** (Hash Map) of that artist's play count. 
   - *Time Complexity*: O(1)
2. **Weighted Selection**: When browsing or searching, the engine calculates a "Taste Weight" for every song returned by the API using your frequency table.
3. **Adaptive Sorting**: The list is then sorted using a custom comparator that prioritizes tracks with higher weights. 
   - *Result*: The more you listen to a specific artist, the more they "bubble up" to the top of your app.

## 🌍 World-Class Stability

- **CORS Proxy Routing**: All searches are routed through professional proxies to ensure 100% uptime on hosted platforms like Netlify.
- **Multi-Engine Audio**: Automatically switches between direct high-speed audio streams and the standard YouTube player based on network conditions.

---
*Created for fun and professional demonstration by Dhiraj Chaudhari.*
