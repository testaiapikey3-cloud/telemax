package com.telemax.app.call;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

import java.net.InetSocketAddress;
import java.net.Proxy;

/** Small WebSocket signaling client. The server only relays SDP/ICE messages; media stays P2P via WebRTC. */
public class SignalingClient {
    public interface Listener {
        void onOpen();
        void onMessage(JSONObject message);
        void onClosed();
        void onError(String message);
    }

    private OkHttpClient client = new OkHttpClient();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Listener listener;
    private WebSocket socket;
    private boolean opened = false;
    private final java.util.concurrent.ConcurrentLinkedQueue<JSONObject> outbox = new java.util.concurrent.ConcurrentLinkedQueue<>();

    public SignalingClient(Listener listener) { this.listener = listener; }

    public void setProxy(String type, String host, int port) {
        try {
            OkHttpClient.Builder b=client.newBuilder();
            // Для "DIRECT" или пустого типа - не используем прокси
            if (type==null || "DIRECT".equalsIgnoreCase(type) || type.trim().isEmpty()) {
                b.proxy(Proxy.NO_PROXY);
            } else if (("SOCKS5".equalsIgnoreCase(type)||"HTTP".equalsIgnoreCase(type)) && host!=null && !host.trim().isEmpty() && port>0) {
                Proxy.Type pt="SOCKS5".equalsIgnoreCase(type)?Proxy.Type.SOCKS:Proxy.Type.HTTP;
                b.proxy(new Proxy(pt,new InetSocketAddress(host.trim(),port)));
            } else {
                // Некорректные настройки прокси - используем прямое подключение
                b.proxy(Proxy.NO_PROXY);
            }
            client=b.build();
        } catch(Exception e) {
            // При ошибке создаём новый клиент без прокси
            client=new OkHttpClient.Builder().proxy(Proxy.NO_PROXY).build();
        }
    }

    public void connect(String url) {
        close();
        Request request = new Request.Builder().url(url).build();
        socket = client.newWebSocket(request, new WebSocketListener() {
            @Override public void onOpen(WebSocket webSocket, Response response) {
                opened = true;
                JSONObject queued;
                while ((queued = outbox.poll()) != null) webSocket.send(queued.toString());
                main.post(listener::onOpen);
            }
            @Override public void onMessage(WebSocket webSocket, String text) {
                try { JSONObject o = new JSONObject(text); main.post(() -> listener.onMessage(o)); }
                catch (Exception e) { main.post(() -> listener.onError("Некорректный сигнал сервера")); }
            }
            @Override public void onClosing(WebSocket webSocket, int code, String reason) { webSocket.close(1000, null); main.post(listener::onClosed); }
            @Override public void onClosed(WebSocket webSocket, int code, String reason) { opened = false; main.post(listener::onClosed); }
            @Override public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                opened = false;
                main.post(() -> listener.onError(t.getMessage() == null ? "Ошибка соединения" : t.getMessage()));
            }
        });
    }

    public void send(JSONObject message) {
        if (message == null) return;
        WebSocket s = socket;
        if (s != null && opened) s.send(message.toString());
        else outbox.offer(message);
    }
    public void close() {
        opened = false;
        outbox.clear();
        if (socket != null) { socket.close(1000, "bye"); socket = null; }
    }
}
