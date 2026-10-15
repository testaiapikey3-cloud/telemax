package com.telemax.app.call;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.media.AudioManager;

import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.AudioSource;
import org.webrtc.AudioTrack;
import org.webrtc.Camera2Enumerator;
import org.webrtc.CameraEnumerator;
import org.webrtc.CameraVideoCapturer;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.SurfaceViewRenderer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

import java.util.ArrayList;
import java.util.List;

/** WebRTC voice/video call. Signaling is handled by SignalingClient; media is peer-to-peer. */
public class WebRtcCallManager implements SignalingClient.Listener {
    public interface Listener {
        void state(String state);
        void incoming(String from, boolean video, JSONObject raw);
        void ended();
        void error(String message);
    }

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Listener listener;
    private final SignalingClient signaling;
    private final EglBase eglBase = EglBase.create();
    private PeerConnectionFactory factory;
    private PeerConnection peer;
    private AudioTrack audioTrack;
    private VideoTrack videoTrack;
    private CameraVideoCapturer capturer;
    private SurfaceTextureHelper textureHelper;
    private SurfaceViewRenderer localRenderer;
    private SurfaceViewRenderer remoteRenderer;
    private String me;
    private String other;
    private boolean video;
    private boolean active;
    private String turnUrl;
    private String turnUser;
    private String turnCred;
    private JSONObject pendingOffer;
    private final List<IceCandidate> pendingIce = new ArrayList<>();
    private AudioManager audioManager;
    private boolean remoteDescriptionSet = false;

    public WebRtcCallManager(Context context, Listener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        this.signaling = new SignalingClient(this);
        try {
            synchronized (WebRtcCallManager.class) {
                PeerConnectionFactory.initialize(
                    PeerConnectionFactory.InitializationOptions.builder(this.context).setEnableInternalTracer(false).createInitializationOptions()
                );
            }
            factory = createFactory();
        } catch (Throwable t) {
            factory = null;
            main.post(() -> listener.error("WebRTC недоступен: " + (t.getMessage() == null ? "ошибка инициализации" : t.getMessage())));
        }
    }

    public EglBase.Context eglContext() { return eglBase.getEglBaseContext(); }

    private PeerConnectionFactory createFactory() {
        PeerConnectionFactory.Options options = new PeerConnectionFactory.Options();
        DefaultVideoEncoderFactory encoder = new DefaultVideoEncoderFactory(eglBase.getEglBaseContext(), true, false);
        DefaultVideoDecoderFactory decoder = new DefaultVideoDecoderFactory(eglBase.getEglBaseContext());
        return PeerConnectionFactory.builder().setOptions(options).setVideoEncoderFactory(encoder).setVideoDecoderFactory(decoder).createPeerConnectionFactory();
    }

    public void connect(String signalingUrl, String username) {
        connect(signalingUrl, username, "DIRECT", "", 0);
    }

    public void connect(String signalingUrl, String username, String proxyType, String proxyHost, int proxyPort) {
        connect(signalingUrl, username, proxyType, proxyHost, proxyPort, "", "", "");
    }

    public void connect(String signalingUrl, String username, String proxyType, String proxyHost, int proxyPort, String turnUrl, String turnUser, String turnCred) {
        me = username;
        this.turnUrl = turnUrl == null ? "" : turnUrl.trim();
        this.turnUser = turnUser == null ? "" : turnUser.trim();
        this.turnCred = turnCred == null ? "" : turnCred.trim();
        // Настройка прокси перед подключением (включая "DIRECT" для сброса)
        String pt = proxyType == null ? "DIRECT" : proxyType.trim();
        signaling.setProxy(pt, proxyHost, proxyPort);
        signaling.connect(signalingUrl);
    }

    @Override public void onOpen() {
        try { JSONObject m = new JSONObject().put("type", "register").put("user", me); signaling.send(m); listener.state("Сигналинг подключён"); }
        catch (Exception e) { listener.error("Не удалось зарегистрироваться на сервере"); }
    }
    @Override public void onClosed() { if (!active) listener.state("Сигналинг отключён"); }
    @Override public void onError(String message) { listener.error(message); }

    @Override public void onMessage(JSONObject m) {
        try {
            String type = m.optString("type");
            if ("incoming".equals(type)) {
                listener.incoming(m.optString("from"), m.optBoolean("video"), m);
            } else if ("offer".equals(type)) {
                other = m.optString("from");
                if (!active) { pendingOffer = m; return; }
                handleOffer(m);
            } else if ("answer".equals(type)) {
                setRemote(new SessionDescription(SessionDescription.Type.ANSWER, m.getString("sdp")), null);
            } else if ("ice".equals(type)) {
                IceCandidate c = new IceCandidate(m.getString("sdpMid"), m.getInt("sdpMLineIndex"), m.getString("candidate"));
                if (peer != null && remoteDescriptionSet) peer.addIceCandidate(c); else pendingIce.add(c);
            } else if ("hangup".equals(type)) {
                end(false);
            }
        } catch (Exception e) { listener.error("Ошибка WebRTC-сигнала"); }
    }

    public void call(String target, boolean video, SurfaceViewRenderer local, SurfaceViewRenderer remote) {
        if (factory == null) { listener.error("WebRTC недоступен на этом устройстве"); return; }
        this.other = target; this.video = video; this.localRenderer = local; this.remoteRenderer = remote; active = true; remoteDescriptionSet = false; pendingIce.clear(); prepareAudio();
        try { signaling.send(new JSONObject().put("type", "call").put("from", me).put("to", target).put("video", video)); } catch (Exception ignored) {}
        listener.state("Вызов…");
        ensurePeer();
        if (peer == null) { listener.error("Не удалось создать соединение"); return; }
        createOffer();
    }

    public void acceptIncoming(String from, boolean video, SurfaceViewRenderer local, SurfaceViewRenderer remote) {
        this.other = from; this.video = video; this.localRenderer = local; this.remoteRenderer = remote; active = true; remoteDescriptionSet = false; prepareAudio();
        ensurePeer();
        if (peer == null) { listener.error("Не удалось создать соединение"); return; }
        listener.state("Подключение…");
        if (pendingOffer != null) { JSONObject offer = pendingOffer; pendingOffer = null; handleOffer(offer); }
    }

    private void handleOffer(JSONObject m) {
        try {
            other = m.optString("from", other);
            ensurePeer();
            setRemote(new SessionDescription(SessionDescription.Type.OFFER, m.getString("sdp")), this::createAnswer);
        } catch (Exception e) { listener.error("Не удалось принять звонок"); }
    }

    public void rejectIncoming(String from) { try { signaling.send(new JSONObject().put("type","reject").put("from",me).put("to",from)); } catch (Exception ignored) {} }

    private void ensurePeer() {
        if (factory == null) { listener.error("WebRTC недоступен на этом устройстве"); return; }
        if (peer != null) return;
        List<PeerConnection.IceServer> servers = new ArrayList<>();
        servers.add(PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer());
        if (turnUrl != null && !turnUrl.isEmpty()) {
            PeerConnection.IceServer.Builder tb = PeerConnection.IceServer.builder(turnUrl);
            if (turnUser != null && !turnUser.isEmpty()) tb.setUsername(turnUser);
            if (turnCred != null && !turnCred.isEmpty()) tb.setPassword(turnCred);
            servers.add(tb.createIceServer());
        }
        PeerConnection.RTCConfiguration cfg = new PeerConnection.RTCConfiguration(servers);
        peer = factory.createPeerConnection(cfg, new PeerConnection.Observer() {
            @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
            @Override public void onIceCandidate(IceCandidate c) { try { signaling.send(new JSONObject().put("type","ice").put("from",me).put("to",other).put("candidate",c.sdp).put("sdpMid",c.sdpMid).put("sdpMLineIndex",c.sdpMLineIndex)); } catch (Exception ignored) {} }
            @Override public void onAddStream(MediaStream stream) { if (stream.videoTracks.size() > 0 && remoteRenderer != null) stream.videoTracks.get(0).addSink(remoteRenderer); }
            @Override public void onSignalingChange(PeerConnection.SignalingState state) {}
            @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {
                main.post(() -> listener.state(state.toString()));
                if (state == PeerConnection.IceConnectionState.FAILED || state == PeerConnection.IceConnectionState.CLOSED) main.post(() -> end(false));
            }
            @Override public void onIceConnectionReceivingChange(boolean b) {}
            @Override public void onIceGatheringChange(PeerConnection.IceGatheringState s) {}
            @Override public void onRemoveStream(MediaStream stream) {}
            @Override public void onDataChannel(org.webrtc.DataChannel dc) {}
            @Override public void onRenegotiationNeeded() {}
            @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] mediaStreams) {
                if (receiver != null && receiver.track() instanceof VideoTrack && remoteRenderer != null) {
                    ((VideoTrack) receiver.track()).addSink(remoteRenderer);
                }
            }
        });
        if (peer == null) { listener.error("Не удалось создать WebRTC peer"); return; }
        createLocalTracks();
    }

    private void createLocalTracks() {
        if (audioTrack == null) {
            AudioSource as = factory.createAudioSource(new MediaConstraints());
            audioTrack = factory.createAudioTrack("TMX_AUDIO", as);
        }
        org.webrtc.MediaStream stream = factory.createLocalMediaStream("TMX_STREAM");
        stream.addTrack(audioTrack);
        if (video) {
            if (videoTrack == null) {
                VideoSource source = factory.createVideoSource(false);
                capturer = createCapturer();
                if (capturer != null) {
                    textureHelper = SurfaceTextureHelper.create("TMXCapture", eglBase.getEglBaseContext());
                    capturer.initialize(textureHelper, context, source.getCapturerObserver());
                    try { capturer.startCapture(1280, 720, 30); } catch (Exception ignored) {}
                }
                videoTrack = factory.createVideoTrack("TMX_VIDEO", source);
                videoTrack.setEnabled(true);
            }
            stream.addTrack(videoTrack);
            if (localRenderer != null) { videoTrack.addSink(localRenderer); }
        }
        peer.addStream(stream);
    }

    private CameraVideoCapturer createCapturer() {
        CameraEnumerator en = new Camera2Enumerator(context);
        for (String name : en.getDeviceNames()) if (en.isFrontFacing(name)) return en.createCapturer(name, null);
        for (String name : en.getDeviceNames()) return en.createCapturer(name, null);
        return null;
    }

    private void createOffer() {
        MediaConstraints c = new MediaConstraints();
        peer.createOffer(new SdpObserverAdapter() {
            @Override public void onCreateSuccess(SessionDescription d) { peer.setLocalDescription(new SdpObserverAdapter(), d); try { signaling.send(new JSONObject().put("type","offer").put("from",me).put("to",other).put("sdp",d.description)); } catch (Exception ignored) {} }
        }, c);
    }
    private void createAnswer() {
        peer.createAnswer(new SdpObserverAdapter() {
            @Override public void onCreateSuccess(SessionDescription d) { peer.setLocalDescription(new SdpObserverAdapter(), d); try { signaling.send(new JSONObject().put("type","answer").put("from",me).put("to",other).put("sdp",d.description)); } catch (Exception ignored) {} }
        }, new MediaConstraints());
    }
    private void setRemote(SessionDescription d, Runnable after) {
        if (peer == null) { listener.error("WebRTC peer не создан"); return; }
        peer.setRemoteDescription(new SdpObserverAdapter() {
            @Override public void onSetSuccess() {
                remoteDescriptionSet = true;
                if (!pendingIce.isEmpty()) {
                    for (IceCandidate c : new ArrayList<>(pendingIce)) peer.addIceCandidate(c);
                    pendingIce.clear();
                }
                if (after != null) after.run();
            }
            @Override public void onSetFailure(String error) { listener.error("Не удалось установить удалённое описание: " + error); }
        }, d);
    }

    public void setMuted(boolean muted) { if (audioTrack != null) audioTrack.setEnabled(!muted); }
    public void setVideoEnabled(boolean enabled) { if (videoTrack != null) videoTrack.setEnabled(enabled); }

    public void setSpeaker(boolean enabled) {
        if (audioManager == null) audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) { audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION); audioManager.setSpeakerphoneOn(enabled); }
    }

    private void prepareAudio() {
        if (audioManager == null) audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            audioManager.setSpeakerphoneOn(true);
        }
    }

    public void end(boolean notifyRemote) {
        if (notifyRemote && other != null) try { signaling.send(new JSONObject().put("type","hangup").put("from",me).put("to",other)); } catch (Exception ignored) {}
        active = false;
        pendingOffer = null;
        pendingIce.clear();
        remoteDescriptionSet = false;
        if (audioManager != null) { try { audioManager.setSpeakerphoneOn(false); audioManager.setMode(AudioManager.MODE_NORMAL); } catch (Exception ignored) {} }
        if (capturer != null) { try { capturer.stopCapture(); } catch (Exception ignored) {} try { capturer.dispose(); } catch (Exception ignored) {} capturer = null; }
        if (textureHelper != null) { textureHelper.dispose(); textureHelper = null; }
        if (peer != null) { peer.close(); peer.dispose(); peer = null; }
        if (localRenderer != null) { try { localRenderer.release(); } catch (Exception ignored) {} }
        if (remoteRenderer != null) { try { remoteRenderer.release(); } catch (Exception ignored) {} }
        audioTrack = null; videoTrack = null; other = null;
        main.post(listener::ended);
    }

    public void dispose() { end(false); signaling.close(); if (factory != null) factory.dispose(); eglBase.release(); }

    private static class SdpObserverAdapter implements org.webrtc.SdpObserver {
        @Override public void onCreateSuccess(SessionDescription sessionDescription) {}
        @Override public void onSetSuccess() {}
        @Override public void onCreateFailure(String s) {}
        @Override public void onSetFailure(String s) {}
    }
}
