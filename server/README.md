# TeleMAX realtime server v0.3.0

The server handles:
- realtime text messages;
- NFT and TelePremium gifts;
- ban/freeze/unban/unfreeze admin actions;
- WebRTC signaling (voice/video calls).

## Windows
Open CMD in this folder and run:

    npm install
    node index.js

Or double-click `start-call-server.bat`. The window must stay open.

## Phone connection
If the phone is a real device, do NOT use `10.0.2.2` unless you are using Android Emulator.
Set TeleMAX → Settings → Call server to the PC's LAN IP, e.g.:

    ws://192.168.1.20:8080

Phone and PC must be on the same Wi-Fi/LAN.


## TURN for reliable calls
The Node server is signaling only. WebRTC media is peer-to-peer unless a TURN server is configured in the Android client. For mobile networks and CGNAT, deploy coturn and put its `turn:`/`turns:` endpoint plus credentials into TeleMAX call settings.
