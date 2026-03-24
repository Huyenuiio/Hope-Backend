const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { protect } = require('../middleware/auth');

// @desc    Get TURN server credentials
// @route   GET /api/webrtc/turn-credentials
// @access  Public (Temporarily for debugging logout issue)
router.get('/turn-credentials', async (req, res) => {
  try {
    const domain = process.env.METERED_DOMAIN;
    const apiKey = process.env.METERED_SECRET_KEY;

    console.log('[WebRTC] Request received. Config:', {
      hasDomain: !!domain,
      hasApiKey: !!apiKey,
      domain: domain
    });

    if (!domain || !apiKey) {
      console.error('[WebRTC] Missing Metered credentials in ENV');
      return res.status(500).json({
        success: false,
        message: 'Metered credentials not configured on server'
      });
    }

    const response = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[WebRTC] Metered API Error:', response.status, errorData);
      // We return 500 here instead of response.status (which might be 401)
      // to avoid triggering the global logout interceptor on the frontend.
      return res.status(500).json({
        success: false,
        message: `Metered API configuration error: ${response.status}`
      });
    }

    const iceServers = await response.json();
    res.json(iceServers);
  } catch (error) {
    console.error('[WebRTC] Backend Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error fetching TURN credentials' });
  }
});

module.exports = router;
