const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const User = require('./src/models/User');

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const receiver = await User.findOne({ email: 'client1@gmail.com' }); // Employer
        const sender = await User.findOne({ email: 'freelancer1@gmail.com' }); // Freelancer

        if (!receiver || !sender) {
            console.log('Users not found');
            process.exit(1);
        }

        const token = jwt.sign({ id: sender._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        const axios = require('axios');
        try {
            await axios.post('http://localhost:5000/api/messages', {
                receiverId: receiver._id,
                content: 'Chào bạn, mình đang test tính năng Chat Bubble!',
                type: 'text'
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('Message sent successfully!');
        } catch (err) {
            console.error('Error sending msg:', err.response?.data || err.message);
        }
        process.exit(0);
    });
