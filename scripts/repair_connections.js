const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require(path.resolve(__dirname, '../src/models/User'));
const Notification = require(path.resolve(__dirname, '../src/models/Notification'));

dotenv.config({ path: path.join(__dirname, '../.env') });

async function repair() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for connection repair...');

    const notifications = await Notification.find({ type: 'connection_request' });
    console.log(`Found ${notifications.length} connection request notifications.`);

    let repairedCount = 0;
    let skippedCount = 0;

    for (const notif of notifications) {
      const recipientId = notif.recipient;
      const senderId = notif.sender;

      if (!senderId) {
        console.log(`Skipping notification ${notif._id} (no sender).`);
        continue;
      }

      const recipient = await User.findById(recipientId);
      if (!recipient) {
        console.log(`Skipping notification ${notif._id} (recipient not found).`);
        continue;
      }

      // Check if connection already exists
      const isConnected = (recipient.connections || []).some(id => id && id.toString() === senderId.toString());
      if (isConnected) {
        console.log(`- Already connected with ${senderId}. Cleaning up notifications.`);
        await Notification.updateMany(
          { recipient: recipientId, sender: senderId, type: 'connection_request' },
          { isRead: true, readAt: new Date(), message: 'Bạn đã kết nối với người này', type: 'system' }
        );
        skippedCount++;
        continue;
      }

      // Check if request already exists in array
      const requestExists = (recipient.connectionRequests || []).some(
        r => r.from && r.from.toString() === senderId.toString() && r.status === 'pending'
      );

      if (!requestExists) {
        console.log(`- Repairing: Adding pending request from ${senderId} to user ${recipient.email}`);
        await User.findByIdAndUpdate(recipientId, {
          $push: { connectionRequests: { from: senderId, status: 'pending' } }
        });
        repairedCount++;
      } else {
        console.log(`- Request already exists in pending state for ${senderId}. Skipping.`);
        skippedCount++;
      }
    }

    console.log(`\nRepair complete!`);
    console.log(`Successfully repaired: ${repairedCount} requests`);
    console.log(`Skipped (already valid or connected): ${skippedCount} requests`);
    
    process.exit(0);
  } catch (err) {
    console.error('Repair failed:', err);
    process.exit(1);
  }
}

repair();
