const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { protect } = require('../middleware/auth');

// @desc    Get TURN server credentials
// @route   GET /api/webrtc/turn-credentials
// @access  Private
router.get('/turn-credentials', protect, async (req, res) => {
  try {
    const domain = process.env.METERED_DOMAIN;
    const apiKey = process.env.METERED_SECRET_KEY;

    if (!domain || !apiKey) {
      return res.status(500).json({
        success: false,
        message: 'Metered credentials not configured on server'
      });
    }

    const response = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[WebRTC] Metered API Error:', response.status, errorData);
      return res.status(response.status).json({
        success: false,
        message: `Metered API error: ${response.status}`
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
