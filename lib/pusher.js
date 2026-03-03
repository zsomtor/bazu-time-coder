const Pusher = require('pusher');

let pusherInstance = null;

function getPusher() {
  if (!pusherInstance) {
    pusherInstance = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true
    });
  }
  return pusherInstance;
}

module.exports = { getPusher };
