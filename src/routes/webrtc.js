const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// Free, reliable public TURN servers from openrelay.metered.ca
// These don't require authentication and are publicly accessible.
const FREE_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// @desc    Get TURN server credentials
// @route   GET /api/webrtc/turn-credentials
// @access  Public
router.get('/turn-credentials', async (req, res) => {
  const domain = process.env.METERED_DOMAIN;
  const apiKey = process.env.METERED_SECRET_KEY;

  // Try to get fresh credentials from Metered if configured
  if (domain && apiKey) {
    try {
      console.log('[WebRTC] Trying Metered.ca for TURN credentials...');
      const response = await fetch(
        `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`,
        { timeout: 5000 }
      );

      if (response.ok) {
        const iceServers = await response.json();
        if (Array.isArray(iceServers) && iceServers.length > 0) {
          console.log(`[WebRTC] Using ${iceServers.length} ICE servers from Metered.ca`);
          return res.json(iceServers);
        }
      } else {
        console.warn(`[WebRTC] Metered.ca returned ${response.status}, falling back to free servers`);
      }
    } catch (err) {
      console.warn('[WebRTC] Metered.ca request failed, falling back to free servers:', err.message);
    }
  }

  // Fallback: return reliable free TURN servers
  console.log('[WebRTC] Using free public TURN servers (openrelay.metered.ca)');
  return res.json(FREE_ICE_SERVERS);
});

module.exports = router;
