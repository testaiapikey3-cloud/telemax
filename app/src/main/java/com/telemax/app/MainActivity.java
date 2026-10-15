package com.telemax.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.view.Window;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.graphics.drawable.Drawable;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaRecorder;
import android.media.MediaPlayer;
import android.media.AudioManager;
import android.hardware.Camera;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.pm.ActivityInfo;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;

import com.telemax.app.call.WebRtcCallManager;
import com.telemax.app.call.ChatRealtimeClient;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import org.webrtc.SurfaceViewRenderer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import java.net.URI;
import java.net.URL;
import java.net.HttpURLConnection;
import java.io.BufferedReader;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.RequestBody;
import okhttp3.MediaType;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import android.database.Cursor;
import android.provider.ContactsContract;
import java.io.InputStreamReader;

public class MainActivity extends Activity {
    // iOS-стиль цветовая палитра с желтым акцентом
    private static final int YELLOW = Color.rgb(255, 193, 7);
    private static final int YELLOW_DARK = Color.rgb(255, 179, 0);
    private static final int BLACK = Color.rgb(10, 10, 12);
    private static final int SURFACE = Color.rgb(22, 22, 25);
    private static final int SURFACE2 = Color.rgb(32, 32, 36);
    private static final int SURFACE3 = Color.rgb(42, 42, 48);
    private static final int WHITE = Color.rgb(255, 255, 255);
    private static final int GRAY = Color.rgb(156, 163, 175);
    private static final int GRAY_LIGHT = Color.rgb(209, 213, 219);
    private static final int GRAY_DARK = Color.rgb(99, 102, 107);
    private static final int BLUE = Color.rgb(59, 130, 246);
    private static final int PURPLE = Color.rgb(139, 92, 246);
    private static final int VERIFY_BLUE = Color.rgb(37, 99, 235);
    private static final int GREEN = Color.rgb(34, 197, 94);
    private static final int RED = Color.rgb(239, 68, 68);
    private static final int ORANGE = Color.rgb(255, 159, 10);

    private static final int PICK_MEDIA = 101;
    private static final int PICK_AVATAR = 102;
    private static final int RECORD_AUDIO = 103;
    private static final int NOTIFICATION = 104;
    private static final int PERMISSIONS = 105;
    private static final int PICK_FILE = 106;
    private static final int GOOGLE_SIGN_IN = 107;

    private LinearLayout root, content, bottom;
    private final ArrayList<View> navCells = new ArrayList<>();
    private SharedPreferences prefs;
    private String currentChatId = null;
    private MediaRecorder recorder;
    private File recordingFile;
    private boolean recording = false;
    private MediaPlayer player;
    private Camera localCamera;
    private int accent = YELLOW;
    private WebRtcCallManager callManager;
    private ChatRealtimeClient chatRealtime;
    private String pendingCaller;
    private boolean pendingVideo;
    private GoogleSignInClient googleClient;
    private BluetoothChatManager bluetoothChat;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("telemax", MODE_PRIVATE);
        migrateBotChats();
        accent = prefs.getInt("accent", YELLOW);
        getWindow().setStatusBarColor(BLACK);
        getWindow().setNavigationBarColor(BLACK);
        if (!prefs.getBoolean("registered", false) || prefs.getString("currentAccount","").isEmpty()) showAuth(); else verifyStartup();
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + 0.5f); }

    private TextView tv(String text, float size, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(size);
        v.setTextColor(color);
        v.setGravity(Gravity.CENTER_VERTICAL);
        v.setTypeface(Typeface.create("sans", bold ? Typeface.BOLD : Typeface.NORMAL));
        return v;
    }

    private GradientDrawable bg(int color, float radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    // Улучшенный фон с тенью
    private GradientDrawable bgWithShadow(int color, float radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    // Градиентный фон для акцентных элементов
    private GradientDrawable gradientBg(int startColor, int endColor, float radius) {
        GradientDrawable g = new GradientDrawable(
            GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{startColor, endColor}
        );
        g.setCornerRadius(dp(radius));
        return g;
    }

    private View spacer(int h) {
        Space s = new Space(this);
        s.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h)));
        return s;
    }

    private Button button(String label, int fill, int textColor) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(textColor);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setBackground(bg(fill, 12));
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        b.setElevation(dp(2));
        b.setStateListAnimator(null);
        return b;
    }

    // Улучшенная кнопка с градиентом
    private Button gradientButton(String label, int startColor, int endColor, int textColor) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(textColor);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setBackground(gradientBg(startColor, endColor, 12));
        b.setPadding(dp(16), dp(12), dp(16), dp(12));
        b.setElevation(dp(3));
        b.setStateListAnimator(null);
        return b;
    }

    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(12), dp(9), dp(12), dp(9));
        return r;
    }

    private void buildShell(boolean refresh) {
        currentChatId = null;
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BLACK);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(18), dp(12), dp(14), dp(8));

        ImageView avatar = new ImageView(this);
        avatar.setScaleType(ImageView.ScaleType.CENTER_CROP);
        avatar.setBackground(bg(SURFACE2, 30));
        String av = prefs.getString("avatar_" + currentAccount(), "");
        if (!av.isEmpty()) { try { avatar.setImageURI(Uri.parse(av)); } catch (Exception ignored) {} }
        if (avatar.getDrawable() == null) avatar.setImageResource(com.telemax.app.R.drawable.telemax_logo);
        top.addView(avatar, new LinearLayout.LayoutParams(dp(52), dp(52)));
        avatar.setOnClickListener(v -> showProfile());

        LinearLayout identity = new LinearLayout(this);
        identity.setOrientation(LinearLayout.VERTICAL);
        identity.setPadding(dp(12), 0, 0, 0);
        identity.addView(tv(accountName(currentAccount()), 19, WHITE, true));
        identity.addView(tv("@" + accountUsername(currentAccount()), 13, GRAY, false));
        top.addView(identity, new LinearLayout.LayoutParams(0, -2, 1));

        Button cloud = iconButton("cloud", SURFACE2, WHITE);
        cloud.setOnClickListener(v -> cloudStorage());
        top.addView(cloud, new LinearLayout.LayoutParams(dp(46), dp(46)));
        Button more = iconButton("more", SURFACE2, WHITE);
        more.setOnClickListener(v -> showDeveloperMenu());
        top.addView(more, new LinearLayout.LayoutParams(dp(46), dp(46)));
        root.addView(top);

        LinearLayout search = new LinearLayout(this);
        search.setGravity(Gravity.CENTER_VERTICAL);
        search.setPadding(dp(16), 0, dp(16), dp(10));
        search.setBackground(bg(BLACK, 0));
        TextView si = iconText("search", 24, GRAY);
        search.addView(si, new LinearLayout.LayoutParams(dp(32), dp(50)));
        EditText input = new EditText(this);
        input.setHint("Поиск"); input.setHintTextColor(Color.rgb(150,145,150));
        input.setTextColor(WHITE); input.setTextSize(16); input.setSingleLine(true);
        input.setBackground(bg(SURFACE2, 28)); input.setPadding(dp(12),0,dp(14),0);
        search.addView(input, new LinearLayout.LayoutParams(0, dp(50), 1));
        root.addView(search);

        LinearLayout filters = new LinearLayout(this);
        filters.setOrientation(LinearLayout.HORIZONTAL); filters.setPadding(dp(16),0,dp(16),dp(8));
        addFilter(filters, "Все", true); addFilter(filters, "Непрочитанные", false); addFilter(filters, "Каналы", false);
        HorizontalScrollView hsv = new HorizontalScrollView(this); hsv.setHorizontalScrollBarEnabled(false); hsv.addView(filters);
        root.addView(hsv, new LinearLayout.LayoutParams(-1, dp(54)));

        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(14), dp(4), dp(14), dp(10));
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        navCells.clear();
        bottom = new LinearLayout(this); bottom.setOrientation(LinearLayout.HORIZONTAL); bottom.setGravity(Gravity.CENTER_VERTICAL);
        bottom.setPadding(dp(10), dp(7), dp(10), dp(7)); bottom.setBackground(bg(SURFACE, 30));
        addMaxNav("chat", "Чаты", true, v -> showChats());
        addMaxNav("call", "", false, v -> showCalls());
        addMaxNav("contacts", "", false, v -> showContacts());
        addMaxNav("settings", "Настройки", false, v -> showSettings());
        root.addView(bottom, new LinearLayout.LayoutParams(-1, dp(78)));
        setContentView(root);
        animatePage(root);
        startChatRealtime(); showChats();
    }

    private void animatePage(View v) { v.setAlpha(0f); v.setTranslationY(dp(10)); v.animate().alpha(1f).translationY(0).setDuration(260).start(); }

    private int iconRes(String key) {
        if (key == null) return 0;
        switch (key) {
            case "search": return R.drawable.ic_search; case "cloud": return R.drawable.ic_cloud; case "more": return R.drawable.ic_more;
            case "chat": return R.drawable.ic_chat; case "call": return R.drawable.ic_call; case "contacts": return R.drawable.ic_contacts; case "settings": return R.drawable.ic_settings;
            case "id": return R.drawable.ic_id; case "globe": return R.drawable.ic_globe; case "info": return R.drawable.ic_info; case "palette": return R.drawable.ic_palette;
            case "notifications": return R.drawable.ic_notifications; case "proxy": return R.drawable.ic_proxy; case "privacy": return R.drawable.ic_privacy; case "data": return R.drawable.ic_data;
            case "wallet": return R.drawable.ic_wallet; case "gift": return R.drawable.ic_gift; case "developer": return R.drawable.ic_developer; case "permissions": return R.drawable.ic_permissions;
            case "edit": return R.drawable.ic_edit; case "back": return R.drawable.ic_back; case "mic": return R.drawable.ic_mic; case "attach": return R.drawable.ic_attach; case "send": return R.drawable.ic_send;
            case "video": return R.drawable.ic_video; case "play": return R.drawable.ic_play; case "stop": return R.drawable.ic_stop; case "verified": return R.drawable.ic_verified;
            case "phone": return R.drawable.ic_phone; default: return 0;
        }
    }
    private TextView iconText(String key, float size, int color) {
        TextView t = tv("", size, color, true); int res = iconRes(key); if (res != 0) t.setCompoundDrawablesWithIntrinsicBounds(res,0,0,0); t.setGravity(Gravity.CENTER); return t;
    }
    private Button iconButton(String icon, int fill, int color) {
        Button b = button("", fill, color); b.setTextSize(1); b.setPadding(dp(10),dp(10),dp(10),dp(10)); int res=iconRes(icon); if(res!=0) b.setCompoundDrawablesWithIntrinsicBounds(res,0,0,0); return b;
    }

    private void addFilter(LinearLayout parent, String label, boolean selected) {
        TextView t = tv(label, 13, selected ? Color.rgb(45,20,35) : Color.rgb(220,205,215), true);
        t.setGravity(Gravity.CENTER); t.setBackground(bg(selected ? accent : SURFACE2, 24));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(label.equals("Непрочитанные") ? 148 : 124), dp(44)); p.setMargins(dp(3),0,dp(3),0);
        parent.addView(t,p);
    }

    private void addMaxNav(String icon, String name, boolean selected, View.OnClickListener l) {
        LinearLayout cell = new LinearLayout(this); cell.setGravity(Gravity.CENTER); cell.setOrientation(LinearLayout.VERTICAL);
        TextView i = iconText(icon, 24, selected ? Color.rgb(75,28,52) : Color.rgb(225,210,220));
        TextView n = tv(name, 12, selected ? Color.rgb(75,28,52) : Color.rgb(210,198,207), true); n.setGravity(Gravity.CENTER);
        if (selected) { cell.setBackground(bg(accent, 30)); }
        cell.addView(i, new LinearLayout.LayoutParams(-1, dp(28))); if (!name.isEmpty()) cell.addView(n, new LinearLayout.LayoutParams(-1, dp(24)));
        cell.setOnClickListener(l); navCells.add(cell); bottom.addView(cell, new LinearLayout.LayoutParams(0, dp(64), name.isEmpty() ? .8f : 1.6f));
    }

    private void selectNav(int index) { for(int i=0;i<navCells.size();i++){ View v=navCells.get(i); v.setBackground(bg(i==index?accent:SURFACE,30)); } }

    private void clear() { if (content != null) content.removeAllViews(); }

    private TextView section(String s) { TextView t = tv(s, 13, accent, true); t.setPadding(dp(8),dp(12),dp(8),dp(6)); return t; }

    // ---------- AUTH ----------
    private void showAuth() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER); root.setPadding(dp(28),dp(30),dp(28),dp(28)); root.setBackgroundColor(BLACK);
        ImageView logo = new ImageView(this); logo.setImageResource(com.telemax.app.R.drawable.telemax_logo); logo.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        root.addView(logo, new LinearLayout.LayoutParams(-1,dp(180)));
        TextView h=tv("Добро пожаловать в TeleMAX",28,WHITE,true); h.setGravity(Gravity.CENTER); root.addView(h);
        TextView sub=tv("Быстрый и современный мессенджер\nдля общения, звонков и файлов",15,GRAY,false); sub.setGravity(Gravity.CENTER); root.addView(sub);
        root.addView(spacer(28));
        Button start=button("Начать",accent,Color.rgb(60,22,43)); start.setTextSize(16); start.setOnClickListener(v->showRegistration()); root.addView(start,new LinearLayout.LayoutParams(-1,dp(56)));
        root.addView(spacer(10));
        Button login=button("Войти",SURFACE2,WHITE); login.setTextSize(16); login.setOnClickListener(v->showLogin()); root.addView(login,new LinearLayout.LayoutParams(-1,dp(56)));
        root.addView(spacer(18));
        TextView note=tv("Ваши данные хранятся в аккаунте TeleMAX.\nДля защиты можно включить PIN/2FA.",12,GRAY_DARK,false); note.setGravity(Gravity.CENTER); root.addView(note);
        setContentView(root);
        animatePage(root);
    }

    private void showRegistration() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(22),dp(24),dp(22),dp(22)); root.setBackgroundColor(BLACK);
        TextView h=tv("Создание аккаунта",27,WHITE,true); root.addView(h); root.addView(tv("Как в Telegram: имя, username и номер телефона.",14,GRAY,false)); root.addView(spacer(18));
        EditText name=input("Имя"); EditText username=input("@username");
        Spinner country=new Spinner(this); String[] countries={"Германия +49","Россия +7","Украина +380","Казахстан +7","Беларусь +375","США +1","Великобритания +44","Франция +33","Италия +39","Испания +34","Польша +48","Турция +90","ОАЭ +971","Китай +86","Япония +81","Другое"}; country.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,countries));
        EditText phone=input("Номер телефона"); phone.setInputType(2); EditText pin=input("PIN 4–6 цифр (необязательно)"); pin.setInputType(2);
        root.addView(name);root.addView(spacer(8));root.addView(username);root.addView(spacer(8));root.addView(country,new LinearLayout.LayoutParams(-1,dp(54)));root.addView(spacer(8));root.addView(phone);root.addView(spacer(8));root.addView(pin);root.addView(spacer(8));
        Button reg=button("Продолжить",accent,Color.rgb(60,22,43)); reg.setOnClickListener(v->{String n=name.getText().toString().trim(),u=nameSafe(username.getText().toString()),ph=phone.getText().toString().trim(),p2=pin.getText().toString().trim(); if(n.isEmpty()||u.isEmpty()||ph.isEmpty()){info("Регистрация","Заполни имя, username и номер телефона.");return;} if(usernameTaken(u,"")){info("Username занят","Выбери другой username.");return;} if(!p2.isEmpty()&&(p2.length()<4||p2.length()>6||!p2.matches("\\d+"))){info("PIN","PIN должен содержать 4–6 цифр.");return;} String code=country.getSelectedItem().toString().replaceAll(".*?([+][0-9]+)$","$1");String full=code+" "+ph;String id=UUID.randomUUID().toString();prefs.edit().putBoolean("registered",true).putString("currentAccount",id).putString("account_"+id+"_name",n).putString("account_"+id+"_username",u).putString("account_"+id+"_phone",full).putString("2fa_"+id,p2.isEmpty()?"":hash(p2)) .putBoolean("aiEnabled_"+id,true).putString("registeredAt_"+id,new SimpleDateFormat("dd.MM.yyyy HH:mm",Locale.getDefault()).format(new Date())).putBoolean("securityEventSent_"+id,false).putString("accounts",id).apply();buildShell(true);requestPermissionsIfNeeded();startCallSignaling();securityBotLoginEvent("Регистрация");}); root.addView(reg,new LinearLayout.LayoutParams(-1,dp(56)));
        Button back=button("Назад",SURFACE2,WHITE);back.setOnClickListener(v->showAuth());root.addView(back,new LinearLayout.LayoutParams(-1,dp(52))); setContentView(root); animatePage(root);
    }

    private EditText input(String hint) {
        EditText e = new EditText(this);
        e.setHint(hint); e.setHintTextColor(GRAY); e.setTextColor(WHITE); e.setTextSize(16);
        e.setSingleLine(true); e.setPadding(dp(15), 0, dp(15), 0); e.setBackground(bg(SURFACE, 18));
        e.setLayoutParams(new LinearLayout.LayoutParams(-1, dp(54)));
        return e;
    }

    private void startGoogleSignIn() {
        try {
            GoogleSignInOptions.Builder builder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile();
            String webClientId = getString(com.telemax.app.R.string.google_web_client_id);
            if (webClientId != null && !webClientId.startsWith("REPLACE_") && !webClientId.trim().isEmpty()) {
                builder.requestIdToken(webClientId.trim());
            }
            GoogleSignInOptions options = builder.build();
            googleClient = GoogleSignIn.getClient(this, options);
            startActivityForResult(googleClient.getSignInIntent(), GOOGLE_SIGN_IN);
        } catch (Throwable t) {
            info("Google", "Не удалось открыть вход через Google: " + (t.getMessage() == null ? "ошибка" : t.getMessage()));
        }
    }

    private void finishGoogleSignIn(Intent data) {
        try {
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account == null) { info("Google", "Google не вернул аккаунт."); return; }
            String name = account.getDisplayName();
            if (name == null || name.trim().isEmpty()) name = "Google пользователь";
            String base = nameSafe(name).toLowerCase(Locale.ROOT);
            if (base.isEmpty()) base = "google";
            String username = base + "_" + Math.abs((account.getId() == null ? UUID.randomUUID().toString() : account.getId()).hashCode() % 100000);
            String id = "google_" + (account.getId() == null ? UUID.randomUUID().toString() : account.getId());
            ArrayList<String> accounts = getAccounts();
            if (!accounts.contains(id)) accounts.add(id);
            SharedPreferences.Editor e = prefs.edit();
            e.putBoolean("registered", true).putString("currentAccount", id)
                    .putString("account_" + id + "_name", name)
                    .putString("account_" + id + "_username", username)
                    .putString("account_" + id + "_phone", "")
                    .putString("googleEmail_" + id, account.getEmail() == null ? "" : account.getEmail())
                    .putString("googleId_" + id, account.getId() == null ? "" : account.getId())
                     .putBoolean("aiEnabled_" + id, true).putString("registeredAt_"+id,new SimpleDateFormat("dd.MM.yyyy HH:mm",Locale.getDefault()).format(new Date())).putBoolean("securityEventSent_"+id,false).apply();
            saveAccounts(accounts);
            // Новый аккаунт стартует с полностью пустым списком чатов.\n            // BotRast и TeleMany остаются доступны в разделе «Настройки → Боты».\n            buildShell(true);
            requestPermissionsIfNeeded();
            startCallSignaling();
            securityBotLoginEvent("Google");
            toast("Вход через Google выполнен");
        } catch (ApiException ex) {
            if(ex.getStatusCode()==10) info("Google", "Ошибка 10 — Google OAuth не настроен для этого APK. Добавь Android OAuth-клиент для package com.telemax.app и SHA-1 сертификат debug/release в Google Cloud, затем замени google_web_client_id."); else info("Google", "Вход отменён или не настроен (код " + ex.getStatusCode() + ").");
        } catch (Throwable t) {
            info("Google", "Ошибка входа: " + (t.getMessage() == null ? "неизвестная ошибка" : t.getMessage()));
        }
    }

    private void showLogin() {
        final ArrayList<String> ids = getAccounts();
        if (ids.isEmpty()) { info("Вход", "На этом устройстве ещё нет аккаунтов."); return; }
        String[] labels = new String[ids.size()];
        for (int i=0;i<ids.size();i++) labels[i] = accountName(ids.get(i)) + "  @" + accountUsername(ids.get(i));
        new AlertDialog.Builder(this).setTitle("Выбери аккаунт").setItems(labels, (d,w) -> {
            String id=ids.get(w);prefs.edit().putString("currentAccount", id).apply();String h=prefs.getString("2fa_"+id,"");if(h.isEmpty()){buildShell(true);startCallSignaling();securityBotLoginEvent("Локальный аккаунт");return;}final EditText pin=input("2FA PIN");pin.setInputType(2);new AlertDialog.Builder(this).setTitle("2FA").setView(pin).setPositiveButton("Войти",(dd,ww)->{if(hash(pin.getText().toString().trim()).equals(h)){buildShell(true);startCallSignaling();securityBotLoginEvent("PIN");}else info("2FA","Неверный PIN.");}).setNegativeButton("Отмена",null).show();
        }).setNegativeButton("Отмена", null).show();
    }


    private void securityBotLoginEvent(String method){
        String id=currentAccount(); if(id.isEmpty()) return; if(prefs.getBoolean("securityEventSent_"+id,false)) return;
        JSONObject c=ensureChat("security_"+id,"TeleMAX"); try{c.put("username","telemax");c.put("bot",true);}catch(Exception ignored){}
        String device=Build.MANUFACTURER+" "+Build.MODEL; String country=Locale.getDefault().getDisplayCountry(Locale.getDefault()); if(country==null||country.isEmpty())country="не определена"; String city=prefs.getString("loginCity","не определён");
        String code=String.format(Locale.US,"%06d",Math.abs(UUID.randomUUID().hashCode())%1000000);
        String msg="Новый вход в TeleMAX\n\nСпособ: "+method+"\nУстройство: "+device+"\nAndroid: "+Build.VERSION.RELEASE+"\nСтрана: "+country+"\nГород: "+city+"\n\nTeleMAX\nКто-то пытается войти в ваш профиль TeleMAX\n\nВНИМАНИЕ: Никому не сообщайте код и не вводите его на сторонних сайтах, чтобы никто не получил доступ к вашей переписке\n\nКод: "+code;
        appendMessage(id,"security",msg,"",false); prefs.edit().putBoolean("securityEventSent_"+id,true).apply();
        JSONArray all=chats(); for(int i=0;i<all.length();i++)if(c.optString("id").equals(all.optJSONObject(i).optString("id"))){all.put(i,c);break;} saveChats(all);
    }
    private void broadcastProfile(){
        if(chatRealtime==null)return; String u=cleanKey(accountUsername(currentAccount())); String avatar=prefs.getString("avatarData_"+currentAccount(),"");
        try{chatRealtime.send(new JSONObject().put("type","profile_update").put("user",u).put("name",accountName(currentAccount())).put("verified",isVerified(u)).put("avatarData",avatar).put("registeredAt",prefs.getString("registeredAt_"+currentAccount(),"")));}catch(Exception ignored){}
    }
    private String avatarDataFromUri(Uri uri){try{Bitmap b=BitmapFactory.decodeStream(getContentResolver().openInputStream(uri));if(b==null)return "";int max=256;float scale=Math.min(1f,max/(float)Math.max(b.getWidth(),b.getHeight()));Bitmap small=Bitmap.createScaledBitmap(b,Math.max(1,(int)(b.getWidth()*scale)),Math.max(1,(int)(b.getHeight()*scale)),true);ByteArrayOutputStream out=new ByteArrayOutputStream();small.compress(Bitmap.CompressFormat.JPEG,72,out);small.recycle();return android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP);}catch(Exception e){return "";}}

    private String lang(String ru, String en) { return prefs.getBoolean("english", false) ? en : ru; }

    private String currentAccount() { return prefs.getString("currentAccount", ""); }
    private String accountName(String id) { return prefs.getString("account_"+id+"_name", prefs.getString("remote_name_"+cleanKey(id), "Пользователь")); }
    private String accountUsername(String id) {
        String forced = prefs.getString("publicUsername_"+id, "");
        return forced.isEmpty() ? prefs.getString("account_"+id+"_username", "user") : forced;
    }
    private String privateUsername(String id) { return prefs.getString("account_"+id+"_username", "user"); }
    private String publicPhone(String id) {
        String forced = prefs.getString("publicPhone_"+id, "");
        return forced.isEmpty() ? prefs.getString("account_"+id+"_phone", "Не указан") : forced;
    }
    private boolean isVerified(String key) { return prefs.getBoolean("verified_"+cleanKey(key), false); }
    private boolean isVerifiedIdentity(String name, String username) {
        String u=cleanKey(username);
        if(u.isEmpty() || name==null || name.trim().isEmpty()) return false;
        if(!prefs.getBoolean("verified_"+u,false)) return false;
        String verifiedName=prefs.getString("verified_name_"+u,"").trim();
        String verifiedUser=prefs.getString("verified_username_"+u,"").trim();
        return verifiedUser.equalsIgnoreCase(u) && verifiedName.equals(name.trim());
    }
    private boolean usernameTaken(String username, String exceptId) {
        String key=cleanKey(username); if(key.isEmpty()) return false;
        for(String id:getAccounts()){
            if(id.equals(exceptId)) continue;
            String u=cleanKey(accountUsername(id));
            String priv=cleanKey(privateUsername(id));
            if(key.equals(u) || key.equals(priv)) return true;
        }
        return false;
    }
    private String resolveAccountId(String value){
        String key=cleanKey(value); if(key.isEmpty()) return "";
        for(String id:getAccounts()) if(key.equals(cleanKey(accountUsername(id))) || key.equals(cleanKey(privateUsername(id)))) return id;
        return "";
    }
    private boolean isRestricted(String key, String type) { return prefs.getBoolean(type+"_"+key.toLowerCase(Locale.ROOT).replace("@", ""), false); }
    private String cleanKey(String key) { return key == null ? "" : key.trim().replace("@", "").toLowerCase(Locale.ROOT); }
    private ArrayList<String> getAccounts() {
        ArrayList<String> out = new ArrayList<>(); String raw = prefs.getString("accounts", "");
        if (!raw.isEmpty()) for (String x : raw.split(",")) if (!x.trim().isEmpty()) out.add(x.trim());
        return out;
    }
    private void saveAccounts(ArrayList<String> ids) {
        StringBuilder b = new StringBuilder(); for (String x:ids) { if(b.length()>0)b.append(','); b.append(x); }
        prefs.edit().putString("accounts", b.toString()).apply();
    }

    // ---------- CHATS ----------
    private JSONArray chats() {
        try { return new JSONArray(prefs.getString("chats_"+currentAccount(), "[]")); } catch(Exception e) { return new JSONArray(); }
    }
    private void saveChats(JSONArray a) { prefs.edit().putString("chats_"+currentAccount(), a.toString()).apply(); }
    private JSONObject getChat(String id) {
        JSONArray a=chats(); for(int i=0;i<a.length();i++) { JSONObject o=a.optJSONObject(i); if(o!=null && id.equals(o.optString("id"))) return o; }
        return null;
    }
    private JSONObject ensureChat(String id, String name) {
        JSONObject o=getChat(id); if(o!=null) return o;
        o=new JSONObject(); try{o.put("id",id);o.put("name",name);o.put("messages",new JSONArray()); JSONArray a=chats();a.put(o);saveChats(a);}catch(Exception ignored){}
        return o;
    }

    private void showChats() {
        selectNav(0);
        clear();
        content.addView(section(lang("ЧАТЫ","CHATS")));
        JSONArray a=chats(); boolean any=false;
        for(int i=0;i<a.length();i++){ JSONObject o=a.optJSONObject(i); if(o==null)continue; any=true; String id=o.optString("id"),name=o.optString("name","Чат"); String preview=getLastPreview(o); addChat(name,preview,"",0,v->showChat(id)); }
        if(!any){ TextView empty=tv(lang("Здесь пока пусто\n\nСоздай первый чат через кнопку ниже или добавь контакт.","No chats yet\n\nCreate your first chat below or add a contact."),17,GRAY,false);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(20),dp(55),dp(20),dp(55));content.addView(empty); }
        Button plus=button(lang("＋  Новый чат","＋  New chat"),accent,BLACK);plus.setOnClickListener(v->newChatDialog());content.addView(plus,new LinearLayout.LayoutParams(-1,dp(54)));
    }

    private String getLastPreview(JSONObject chat){JSONArray m=chat.optJSONArray("messages");if(m==null||m.length()==0)return "Новый чат";JSONObject x=m.optJSONObject(m.length()-1);if(x==null)return "Новый чат";String t=x.optString("type");if("image".equals(t))return " Фото";if("audio".equals(t))return "Mic Голосовое";if("file".equals(t))return " Файл";return x.optString("text","");}

    private String getChatUsernameForDisplay(String name){
        String id=resolveAccountId(name);
        if(!id.isEmpty()) return accountUsername(id);
        return name;
    }

    private void addChat(String name,String preview,String time,int unread,View.OnClickListener click){
        LinearLayout r=row();ImageView av=new ImageView(this); av.setScaleType(ImageView.ScaleType.CENTER_CROP); String ru=prefs.getString("remote_avatar_"+cleanKey(name),""); if(!ru.isEmpty()) try{byte[] data=android.util.Base64.decode(ru,android.util.Base64.DEFAULT);av.setImageBitmap(BitmapFactory.decodeByteArray(data,0,data.length));}catch(Exception ignored){} if(av.getDrawable()==null){TextView fallback=tv(name.substring(0,1).toUpperCase(Locale.ROOT),20,BLACK,true);fallback.setGravity(Gravity.CENTER);fallback.setBackground(bg(accent,30));r.addView(fallback,new LinearLayout.LayoutParams(dp(52),dp(52)));} else r.addView(av,new LinearLayout.LayoutParams(dp(52),dp(52)));
        LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.setPadding(dp(12),0,dp(6),0);
        String chatKey = name.startsWith("@") ? cleanKey(name) : cleanKey(name);
        LinearLayout nameRow = new LinearLayout(this); nameRow.setGravity(Gravity.CENTER_VERTICAL);
        nameRow.addView(tv(name,17,WHITE,true),new LinearLayout.LayoutParams(-2,dp(28)));
        String chatUsername = cleanKey(getChatUsernameForDisplay(name));
        if(isVerifiedIdentity(name, chatUsername)){ TextView check=tv("✓",13,WHITE,true); check.setGravity(Gravity.CENTER); check.setBackground(bg(VERIFY_BLUE,20)); nameRow.addView(check,new LinearLayout.LayoutParams(dp(20),dp(20))); }
        mid.addView(nameRow,new LinearLayout.LayoutParams(-1,dp(28)));mid.addView(tv(preview,13,GRAY,false),new LinearLayout.LayoutParams(-1,dp(24)));r.addView(mid,new LinearLayout.LayoutParams(0,dp(64),1));
        if(!time.isEmpty())r.addView(tv(time,11,GRAY,false),new LinearLayout.LayoutParams(dp(52),dp(30)));r.setBackground(bg(SURFACE,18));r.setOnClickListener(click);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(76));lp.setMargins(0,0,0,dp(8));content.addView(r,lp);
    }

    private void newChatDialog(){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        EditText e=input("Имя или @username"); EditText phone=input("Телефон для звонка (необязательно)"); box.addView(e); box.addView(spacer(8)); box.addView(phone);
        new AlertDialog.Builder(this).setTitle("Новый чат").setView(box).setPositiveButton("Создать",(d,w)->{String n=e.getText().toString().trim();if(n.isEmpty())return;String id=UUID.randomUUID().toString();JSONObject c=ensureChat(id,n);try{c.put("username",cleanKey(n));c.put("phone",phone.getText().toString().trim());JSONArray all=chats();for(int i=0;i<all.length();i++)if(id.equals(all.optJSONObject(i).optString("id"))){all.put(i,c);break;}saveChats(all);}catch(Exception ignored){}showChat(id);}).setNegativeButton("Отмена",null).show();
    }

    private void showContactInfo(JSONObject chat){
        if(chat==null)return; String user=cleanKey(chat.optString("username",chat.optString("name"))); String name=prefs.getString("remote_name_"+user,chat.optString("name","Пользователь")); String reg=prefs.getString("remote_registeredAt_"+user,"Неизвестно"); if(user.equals(cleanKey(accountUsername(currentAccount())))){name=accountName(currentAccount());reg=prefs.getString("registeredAt_"+currentAccount(),"Неизвестно");}
        Dialog d=new Dialog(this);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(24),dp(24),dp(24),dp(24));box.setGravity(Gravity.CENTER_HORIZONTAL);box.setBackground(bg(SURFACE,26));
        ImageView avatar=new ImageView(this);avatar.setScaleType(ImageView.ScaleType.CENTER_CROP);String local=prefs.getString("avatar_"+currentAccount(),"");String remote=prefs.getString("remote_avatar_"+user,"");try{if(user.equals(cleanKey(accountUsername(currentAccount())))&&!local.isEmpty())avatar.setImageURI(Uri.parse(local));else if(!remote.isEmpty()){byte[] b=android.util.Base64.decode(remote,android.util.Base64.DEFAULT);avatar.setImageBitmap(BitmapFactory.decodeByteArray(b,0,b.length));}}catch(Exception ignored){}if(avatar.getDrawable()==null)avatar.setImageResource(R.drawable.telemax_logo);box.addView(avatar,new LinearLayout.LayoutParams(dp(112),dp(112)));box.addView(tv(name,22,WHITE,true));box.addView(tv("@"+user,14,GRAY,false));if(isVerified(user))box.addView(iconText("verified",20,VERIFY_BLUE),new LinearLayout.LayoutParams(dp(28),dp(28)));box.addView(spacer(8));box.addView(tv("Дата регистрации: "+reg,14,GRAY_LIGHT,false));box.addView(tv("Статус: "+(prefs.getBoolean("online_"+user,false)?"в сети":"не в сети"),14,GRAY_LIGHT,false));Button close=button("Закрыть",accent,BLACK);close.setOnClickListener(v->d.dismiss());box.addView(spacer(10));box.addView(close,new LinearLayout.LayoutParams(-1,dp(52)));d.setContentView(box);d.show();Window w=d.getWindow();if(w!=null){w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));w.setLayout(dp(330),-2);}}

    // ---------- CHAT ----------
    private void showChat(String id){
        currentChatId=id; JSONObject chat=getChat(id); if(chat==null){showChats();return;}
        root.removeAllViews();
        LinearLayout chatRoot=new LinearLayout(this);chatRoot.setOrientation(LinearLayout.VERTICAL);chatRoot.setBackgroundColor(BLACK);
        LinearLayout head=row();
        Button back=iconButton("back",SURFACE2,WHITE);back.setOnClickListener(v->buildShell(true));head.addView(back,new LinearLayout.LayoutParams(dp(48),dp(48)));
        LinearLayout hmid=new LinearLayout(this);hmid.setOrientation(LinearLayout.VERTICAL);
        LinearLayout titleRow=new LinearLayout(this); titleRow.setGravity(Gravity.CENTER_VERTICAL);
        String chatUserForName=cleanKey(chat.optString("username",chat.optString("name"))); String chatName=prefs.getString("remote_name_"+chatUserForName,chat.optString("name"));
        String chatUser=cleanKey(chat.optString("username",chatName));
        titleRow.addView(tv(chatName,18,WHITE,true),new LinearLayout.LayoutParams(-2,dp(28)));
        if(isVerifiedIdentity(chatName, chatUser)){ TextView check=iconText("verified",16,VERIFY_BLUE); titleRow.addView(check,new LinearLayout.LayoutParams(dp(22),dp(22))); }
        hmid.addView(titleRow,new LinearLayout.LayoutParams(-1,dp(28)));
        boolean online=prefs.getBoolean("online_"+chatUser,false); String onlineText=prefs.getBoolean("hideOnline",false)?"● скрыт":(online?"● в сети":"● не в сети"); hmid.addView(tv(onlineText,11,online?accent:GRAY,true),new LinearLayout.LayoutParams(-1,dp(22)));hmid.setOnClickListener(v->showContactInfo(chat));head.addView(hmid,new LinearLayout.LayoutParams(0,dp(60),1));
        Button call=iconButton("call",SURFACE2,accent); call.setOnClickListener(v->callPerson(chat)); head.addView(call,new LinearLayout.LayoutParams(dp(48),dp(48)));
        Button video=iconButton("video",SURFACE2,accent); video.setOnClickListener(v->videoCall(chat)); head.addView(video,new LinearLayout.LayoutParams(dp(48),dp(48)));
        Button more=iconButton("more",SURFACE2,WHITE);more.setOnClickListener(v->chatOptions(id));head.addView(more,new LinearLayout.LayoutParams(dp(48),dp(48)));chatRoot.addView(head);
        ScrollView sv=new ScrollView(this);
        LinearLayout messages=new LinearLayout(this);
        messages.setOrientation(LinearLayout.VERTICAL);
        messages.setPadding(dp(5),dp(8),dp(5),dp(12));
        applyChatWallpaper(messages, id);
        JSONArray arr=chat.optJSONArray("messages"); if(arr!=null)for(int i=0;i<arr.length();i++)addStoredMessage(messages,arr.optJSONObject(i));
        sv.addView(messages);chatRoot.addView(sv,new LinearLayout.LayoutParams(-1,0,1));
        if(chat.optBoolean("bot",false)) addBotKeyboard(chatRoot,id);
        LinearLayout composer=row();
        Button attach=iconButton("attach",SURFACE2,accent);attach.setOnClickListener(v->mediaMenu(id));composer.addView(attach,new LinearLayout.LayoutParams(dp(48),dp(52)));
        EditText input=new EditText(this);input.setHint("Сообщение…");input.setHintTextColor(GRAY);input.setTextColor(WHITE);input.setTextSize(16);input.setSingleLine(false);input.setMaxLines(4);input.setBackground(bg(SURFACE2,22));input.setPadding(dp(13),0,dp(10),0);composer.addView(input,new LinearLayout.LayoutParams(0,dp(52),1));
        Button mic=iconButton("mic",SURFACE2,accent);mic.setOnClickListener(v->toggleRecording(id,mic));composer.addView(mic,new LinearLayout.LayoutParams(dp(52),dp(52))); Button send=iconButton("send",accent,BLACK);send.setOnClickListener(v->{String text=input.getText().toString().trim();if(!text.isEmpty()){String target=cleanKey(chat.optString("username",chat.optString("name")));if(isCurrentAccountRestricted()){info("Аккаунт ограничен","Ваш аккаунт заблокирован или заморожен администратором.");return;}if(isRestricted(target,"banned")){info("Доступ запрещён","Пользователь заблокирован администратором.");return;}String mid=appendMessage(id,"text",text,"",true);sendChatMessage(target,"text",text,"",mid);if(chat.optBoolean("bot",false))botReply(currentAccount(),chat,text);input.setText("");renderMessages(messages,id);sv.post(()->sv.fullScroll(View.FOCUS_DOWN));}});composer.addView(send,new LinearLayout.LayoutParams(dp(52),dp(52)));
        chatRoot.addView(composer,new LinearLayout.LayoutParams(-1,dp(70)));
        if(prefs.getBoolean("aiEnabled_"+currentAccount(),true)) { Button ai=button("AI",SURFACE2,accent);ai.setOnClickListener(v->aiDialog(input));chatRoot.addView(ai,new LinearLayout.LayoutParams(-1,dp(44))); }
        root.addView(chatRoot,new LinearLayout.LayoutParams(-1,-1));
    }

    private void addStoredMessage(LinearLayout parent,JSONObject m){
        if(m==null)return;String type=m.optString("type"),text=m.optString("text"),uri=m.optString("uri");boolean mine=m.optBoolean("mine",true);int bubbleColor=m.optInt("bubbleColor",accent);
        LinearLayout wrap=new LinearLayout(this);wrap.setOrientation(LinearLayout.VERTICAL);wrap.setGravity(mine?Gravity.RIGHT:Gravity.LEFT);
        TextView meta=tv(mine?"Вы":"Собеседник",10,GRAY,false);meta.setGravity(mine?Gravity.RIGHT:Gravity.LEFT);wrap.addView(meta);
        if("image".equals(type)){ImageView im=new ImageView(this);im.setScaleType(ImageView.ScaleType.FIT_CENTER);im.setAdjustViewBounds(true);im.setBackground(bg(mine?bubbleColor:SURFACE2,18));try{im.setImageURI(Uri.parse(uri));}catch(Exception ignored){}im.setOnClickListener(v->showFullImage(uri));LinearLayout.LayoutParams ip=new LinearLayout.LayoutParams(dp(310),dp(240));ip.setMargins(dp(3),dp(3),dp(3),dp(3));wrap.addView(im,ip);}
        else if("video".equals(type)){
            LinearLayout videoContainer = new LinearLayout(this);
            videoContainer.setOrientation(LinearLayout.VERTICAL);
            videoContainer.setBackground(bg(mine?bubbleColor:SURFACE2,18));
            videoContainer.setPadding(dp(8),dp(8),dp(8),dp(8));

            VideoView vv=new VideoView(this);
            vv.setVideoURI(Uri.parse(uri));
            vv.setOnClickListener(v->showFullVideo(uri));
            videoContainer.addView(vv,new LinearLayout.LayoutParams(dp(310),dp(220)));

            LinearLayout controls = new LinearLayout(this);
            controls.setOrientation(LinearLayout.HORIZONTAL);
            controls.setGravity(Gravity.CENTER_VERTICAL);
            controls.setPadding(dp(8),dp(4),dp(8),dp(4));

            Button playPause = iconButton("play",SURFACE2,accent);
            TextView currentTime = tv("0:00",12,mine?BLACK:WHITE,false);
            TextView totalTime = tv("0:00",12,mine?BLACK:WHITE,false);

            android.os.Handler videoHandler = new android.os.Handler();
            Runnable updateTime = new Runnable(){
                public void run(){
                    if(vv.isPlaying()){
                        int current = vv.getCurrentPosition()/1000;
                        int total = vv.getDuration()/1000;
                        currentTime.setText(String.format(Locale.US,"%d:%02d",current/60,current%60));
                        totalTime.setText(String.format(Locale.US,"%d:%02d",total/60,total%60));
                        videoHandler.postDelayed(this,500);
                    }
                }
            };

            playPause.setOnClickListener(v->{
                if(vv.isPlaying()){
                    vv.pause();
                    playPause.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_play,0,0,0);
                    videoHandler.removeCallbacks(updateTime);
                } else {
                    vv.start();
                    playPause.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_pause,0,0,0);
                    videoHandler.post(updateTime);
                }
            });

            vv.setOnPreparedListener(mp -> {
                int total = vv.getDuration()/1000;
                totalTime.setText(String.format(Locale.US,"%d:%02d",total/60,total%60));
            });

            controls.addView(playPause,new LinearLayout.LayoutParams(dp(60),dp(44)));
            currentTime.setPadding(dp(8),0,dp(4),0);
            controls.addView(currentTime,new LinearLayout.LayoutParams(-2,dp(44)));
            TextView slash = tv("/",12,mine?BLACK:WHITE,false);
            controls.addView(slash,new LinearLayout.LayoutParams(-2,dp(44)));
            totalTime.setPadding(dp(4),0,dp(8),0);
            controls.addView(totalTime,new LinearLayout.LayoutParams(-2,dp(44)));

            videoContainer.addView(controls);
            wrap.addView(videoContainer,new LinearLayout.LayoutParams(dp(326),dp(280)));
        }
        else if("audio".equals(type)){
            LinearLayout audioContainer = new LinearLayout(this);
            audioContainer.setOrientation(LinearLayout.VERTICAL);
            audioContainer.setBackground(bg(mine?bubbleColor:SURFACE2,18));
            audioContainer.setPadding(dp(12),dp(10),dp(12),dp(10));

            LinearLayout controls = new LinearLayout(this);
            controls.setOrientation(LinearLayout.HORIZONTAL);
            controls.setGravity(Gravity.CENTER_VERTICAL);
            controls.setPadding(0,0,0,0);

            Button playPause = iconButton("play",SURFACE2,accent);
            playPause.setLayoutParams(new LinearLayout.LayoutParams(dp(48),dp(48)));

            TextView currentAudioTime = tv("0:00",12,mine?BLACK:WHITE,false);
            TextView totalAudioTime = tv("0:00",12,mine?BLACK:WHITE,false);

            android.os.Handler audioHandler = new android.os.Handler();
            Runnable updateAudioTime = new Runnable(){
                public void run(){
                    if(player != null && player.isPlaying()){
                        int current = player.getCurrentPosition()/1000;
                        int total = player.getDuration()/1000;
                        currentAudioTime.setText(String.format(Locale.US,"%d:%02d",current/60,current%60));
                        totalAudioTime.setText(String.format(Locale.US,"%d:%02d",total/60,total%60));
                        audioHandler.postDelayed(this,500);
                    }
                }
            };

            playPause.setOnClickListener(v->{
                if(player != null && player.isPlaying()){ player.pause(); playPause.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_play,0,0,0); audioHandler.removeCallbacks(updateAudioTime); return; }
                try{
                    if(player!=null){try{player.stop();}catch(Exception ignored){}try{player.release();}catch(Exception ignored){}player=null;}
                    player=new MediaPlayer(); player.setDataSource(this,Uri.parse(uri));
                    player.setOnCompletionListener(mp->{try{mp.release();}catch(Exception ignored){}if(player==mp)player=null;playPause.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_play,0,0,0);audioHandler.removeCallbacks(updateAudioTime);});
                    player.setOnPreparedListener(mp->{int total=Math.max(0,mp.getDuration()/1000);totalAudioTime.setText(String.format(Locale.US,"%d:%02d",total/60,total%60));mp.start();playPause.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_pause,0,0,0);audioHandler.post(updateAudioTime);});
                    player.prepareAsync();
                }catch(Exception e){if(player!=null){try{player.release();}catch(Exception ignored){}}player=null;toast("Не удалось воспроизвести голосовое");}
            });
            controls.addView(playPause);

            TextView voiceLabel = iconText("mic",18,mine?BLACK:WHITE);
            voiceLabel.setPadding(dp(8),0,dp(4),0);
            controls.addView(voiceLabel,new LinearLayout.LayoutParams(-2,-2));

            currentAudioTime.setPadding(dp(4),0,dp(2),0);
            controls.addView(currentAudioTime,new LinearLayout.LayoutParams(-2,-2));
            TextView slash = tv("/",12,mine?BLACK:WHITE,false);
            controls.addView(slash,new LinearLayout.LayoutParams(-2,-2));
            totalAudioTime.setPadding(dp(2),0,dp(8),0);
            controls.addView(totalAudioTime,new LinearLayout.LayoutParams(0,-2,1));

            Button stop = iconButton("stop",SURFACE2,mine?BLACK:WHITE);
            stop.setLayoutParams(new LinearLayout.LayoutParams(dp(48),dp(48)));
            stop.setOnClickListener(v->{
                if(player != null){
                    player.stop();
                    player.release();
                    player = null;
                    playPause.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_play,0,0,0);
                    currentAudioTime.setText("0:00");
                    audioHandler.removeCallbacks(updateAudioTime);
                }
            });
            controls.addView(stop);

            audioContainer.addView(controls);
            wrap.addView(audioContainer,new LinearLayout.LayoutParams(dp(310),dp(68)));
        }
        else if("file".equals(type)){Button f=button(text,mine?bubbleColor:SURFACE2,mine?BLACK:WHITE);f.setOnClickListener(v->openFile(uri,text));wrap.addView(f,new LinearLayout.LayoutParams(dp(310),dp(52)));}
        else if("gift".equals(type)){TextView g=tv(text,16,mine?BLACK:WHITE,true);g.setGravity(Gravity.CENTER);g.setPadding(dp(12),dp(12),dp(12),dp(12));g.setBackground(bg(mine?bubbleColor:SURFACE2,20));wrap.addView(g,new LinearLayout.LayoutParams(dp(310),dp(72)));}
        else {TextView b=tv(text,15,mine?BLACK:WHITE,false);b.setPadding(dp(14),dp(10),dp(14),dp(10));b.setBackground(bg(mine?bubbleColor:SURFACE2,18));wrap.addView(b,new LinearLayout.LayoutParams(dp(310),-2));}
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.setMargins(dp(4),dp(6),dp(4),dp(6));parent.addView(wrap,lp);
    }

    private void renderMessages(LinearLayout messages,String id){messages.removeAllViews();JSONObject chat=getChat(id);if(chat==null)return;JSONArray arr=chat.optJSONArray("messages");if(arr!=null)for(int i=0;i<arr.length();i++)addStoredMessage(messages,arr.optJSONObject(i));}
    private String appendMessage(String id,String type,String text,String uri,boolean mine){JSONObject chat=getChat(id);if(chat==null)return "";String messageId=UUID.randomUUID().toString();try{JSONArray a=chat.optJSONArray("messages");if(a==null)a=new JSONArray();JSONObject m=new JSONObject();m.put("id",messageId);m.put("type",type);m.put("text",text);m.put("uri",uri);m.put("mine",mine);m.put("bubbleColor",prefs.getInt("chatColor_"+id,accent));m.put("time",System.currentTimeMillis());a.put(m);chat.put("messages",a);JSONArray all=chats();for(int i=0;i<all.length();i++)if(id.equals(all.optJSONObject(i).optString("id"))){all.put(i,chat);break;}saveChats(all);}catch(Exception ignored){}return messageId;}

    private void showFullImage(String uri){Dialog d=new Dialog(this);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setBackgroundColor(BLACK);ImageView im=new ImageView(this);im.setScaleType(ImageView.ScaleType.FIT_CENTER);im.setBackgroundColor(BLACK);try{im.setImageURI(Uri.parse(uri));}catch(Exception ignored){}box.addView(im,new LinearLayout.LayoutParams(-1,0,1));Button close=button("Закрыть",SURFACE2,WHITE);close.setOnClickListener(v->d.dismiss());box.addView(close,new LinearLayout.LayoutParams(-1,dp(56)));d.setContentView(box);Window w=d.getWindow();d.show();if(w!=null){w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(BLACK));w.setLayout(-1,-1);}}
    private void showFullVideo(String uri){Dialog d=new Dialog(this);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setBackgroundColor(BLACK);VideoView vv=new VideoView(this);vv.setVideoURI(Uri.parse(uri));box.addView(vv,new LinearLayout.LayoutParams(-1,0,1));LinearLayout controls=row();Button play=iconButton("play",SURFACE2,WHITE);play.setOnClickListener(v->{if(vv.isPlaying()){vv.pause();play.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_play,0,0,0);}else{vv.start();play.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_pause,0,0,0);}});controls.addView(play,new LinearLayout.LayoutParams(dp(56),dp(56)));Button close=button("Закрыть",SURFACE2,WHITE);close.setOnClickListener(v->d.dismiss());controls.addView(close,new LinearLayout.LayoutParams(0,dp(56),1));box.addView(controls);d.setContentView(box);d.show();Window w=d.getWindow();if(w!=null){w.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(BLACK));w.setLayout(-1,-1);}}
    private void openFile(String uri,String name){try{Intent i=new Intent(Intent.ACTION_VIEW);Uri u=Uri.parse(uri);String mime=getContentResolver().getType(u);i.setDataAndType(u,mime==null?"application/octet-stream":mime);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(i);}catch(Exception e){downloadUri(uri,name);}}
    private void playAudio(String uri){try{if(player!=null){player.release();player=null;}player=new MediaPlayer();player.setDataSource(this,Uri.parse(uri));player.setOnCompletionListener(mp->{mp.release();if(player==mp)player=null;});player.prepare();player.start();toast("Воспроизведение голосового");}catch(Exception e){info("Голосовое","Не удалось воспроизвести запись.");}}

    private void chatOptions(String id){new AlertDialog.Builder(this).setTitle("Чат").setItems(new String[]{"Уведомления","Цвет чата","Фон чата","Подарить NFT","Подарить TelePremium","Очистить историю","Удалить чат"},(d,w)->{if(w==0)toggleSetting("chatNotif_"+id,"Уведомления чата");else if(w==1)chooseAccentForChat(id);else if(w==2)chooseChatWallpaper(id);else if(w==3)sendNftGift(id);else if(w==4)sendPremiumGift(id);else if(w==5){JSONObject c=getChat(id);try{c.put("messages",new JSONArray());}catch(Exception ignored){}saveChats(chats());showChat(id);}else{deleteChat(id);buildShell(true);}}).show();}
    private void deleteChat(String id){JSONArray a=chats();JSONArray b=new JSONArray();for(int i=0;i<a.length();i++)if(!id.equals(a.optJSONObject(i).optString("id")))b.put(a.optJSONObject(i));saveChats(b);}

    private int wallpaperForChat(String id){
        return prefs.getInt("chatWallpaper_"+id, 1);
    }

    private void applyChatWallpaper(View target, String id){
        int[] bgRes = {
            R.drawable.chat_bg_01,R.drawable.chat_bg_02,R.drawable.chat_bg_03,
            R.drawable.chat_bg_04,R.drawable.chat_bg_05,R.drawable.chat_bg_06,
            R.drawable.chat_bg_07,R.drawable.chat_bg_08,R.drawable.chat_bg_09,
            R.drawable.chat_bg_10
        };
        int index = wallpaperForChat(id);
        if(index < 0 || index >= bgRes.length) index = 0;
        try {
            target.setBackgroundResource(bgRes[index]);
        } catch(Exception ignored) {
            target.setBackgroundColor(BLACK);
        }
    }

    private void chooseChatWallpaper(String id){
        final String[] names = {
            "Ночная классика","Космос","Неон","Синий градиент",
            "Лес","Горы","Hex","Фиолетовый","Сердца","Осень"
        };
        new AlertDialog.Builder(this)
            .setTitle("Фон чата • 10 вариантов")
            .setSingleChoiceItems(names, wallpaperForChat(id), (d, which) -> {
                prefs.edit().putInt("chatWallpaper_"+id, which).apply();
                d.dismiss();
                showChat(id);
            })
            .setNegativeButton("Отмена", null)
            .show();
    }

    private void chooseAccentForChat(String id) {
        String[] colorNames = {"Красный","Оранжевый","Жёлтый","Зелёный","Синий","Фиолетовый","Коричневый","Чёрный","Белый","Розовый","Персиковый","Золотой","Изумрудный","Голубой","Сиреневый","Бежевый","Серый","Кремовый","❤️ Алый","Янтарный"};
        int[] colorValues = {
            Color.rgb(239,68,68),Color.rgb(249,115,22),Color.rgb(251,191,36),Color.rgb(34,197,94),
            Color.rgb(59,130,246),Color.rgb(168,85,247),Color.rgb(120,53,15),Color.rgb(23,23,23),
            Color.rgb(245,245,245),Color.rgb(244,114,182),Color.rgb(251,146,60),Color.rgb(234,179,8),
            Color.rgb(16,185,129),Color.rgb(125,211,252),Color.rgb(196,181,253),Color.rgb(217,119,6),
            Color.rgb(107,114,128),Color.rgb(254,243,199),Color.rgb(220,38,38),Color.rgb(245,158,11)
        };

        LinearLayout colorPickerLayout = new LinearLayout(this);
        colorPickerLayout.setOrientation(LinearLayout.VERTICAL);
        colorPickerLayout.setPadding(dp(16),dp(12),dp(16),dp(12));

        for(int i=0; i<colorNames.length; i++) {
            final int colorValue = colorValues[i];
            final int index = i;

            LinearLayout colorRow = new LinearLayout(this);
            colorRow.setOrientation(LinearLayout.HORIZONTAL);
            colorRow.setGravity(Gravity.CENTER_VERTICAL);
            colorRow.setPadding(dp(8),dp(8),dp(8),dp(8));
            colorRow.setBackground(bg(SURFACE2,12));

            View colorPreview = new View(this);
            colorPreview.setBackground(bg(colorValue,24));
            colorRow.addView(colorPreview, new LinearLayout.LayoutParams(dp(48),dp(48)));

            TextView colorLabel = tv(colorNames[i],16,WHITE,false);
            colorLabel.setPadding(dp(16),0,0,0);
            colorRow.addView(colorLabel, new LinearLayout.LayoutParams(0,-2,1));

            colorRow.setOnClickListener(v -> {
                prefs.edit().putInt("chatColor_"+id,colorValue).apply();
                showChat(id);
            });

            colorPickerLayout.addView(colorRow, new LinearLayout.LayoutParams(-1,dp(64)));
            if(i < colorNames.length-1) colorPickerLayout.addView(spacer(6));
        }

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(colorPickerLayout);

        new AlertDialog.Builder(this)
            .setTitle("Выбор цвета сообщений")
            .setView(scrollView)
            .setNegativeButton("Отмена",null)
            .show();
    }

    private void sendNftGift(String id){String raw=prefs.getString("nft_"+currentAccount(),"");if(raw.isEmpty()){info("NFT","У тебя нет NFT-подарков. Выдай их в Admin Mode.");return;}String[] gifts=raw.split("\n");JSONObject chat=getChat(id);String target=chat==null?"":cleanKey(chat.optString("username",chat.optString("name")));new AlertDialog.Builder(this).setTitle("Подарить NFT").setItems(gifts,(d,w)->{String gift=gifts[w];String mid=appendMessage(id,"gift","NFT: "+gift,"",true);sendChatMessage(target,"gift","NFT: "+gift,"",mid,"nft",gift);removeOneNft(gift);showChat(id);toast("NFT-подарок отправлен");}).setNegativeButton("Отмена",null).show();}
    private void removeOneNft(String gift){String raw=prefs.getString("nft_"+currentAccount(),"");String[] a=raw.split("\n",-1);StringBuilder b=new StringBuilder();boolean removed=false;for(String x:a){if(!removed&&x.equals(gift)){removed=true;continue;}if(b.length()>0)b.append("\n");b.append(x);}prefs.edit().putString("nft_"+currentAccount(),b.toString()).apply();}
    private void sendPremiumGift(String id){if(balance()<499){info("TelePremium","Нужно 499 TeleCoin для подарка.");return;}JSONObject chat=getChat(id);String target=chat==null?"":cleanKey(chat.optString("username",chat.optString("name")));new AlertDialog.Builder(this).setTitle("Подарить TelePremium").setMessage("Подарок на 30 дней. С твоего баланса будет списано 499 TeleCoin.").setPositiveButton("Подарить",(d,w)->{setBalance(balance()-499);String mid=appendMessage(id,"gift","TelePremium — 30 дней","",true);sendChatMessage(target,"gift","TelePremium — 30 дней","",mid,"premium","30");addTransaction("−499 TeleCoin • подарок Premium");showChat(id);}).setNegativeButton("Отмена",null).show();}

    private void mediaMenu(String id){String[] x={"Фото / видео","Файл","Голосовое"};new AlertDialog.Builder(this).setTitle("Вложение").setItems(x,(d,w)->{if(w==0)pickMedia();else if(w==1)pickFile();else startRecording(id);}).show();}
    private void pickMedia(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","video/*"});i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_MEDIA);}
    private void pickFile(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("*/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_FILE);}
    private void toggleRecording(String id,Button mic){
        if(recording){
            stopRecording(id);
            mic.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_mic,0,0,0);
            mic.setBackground(bg(SURFACE2,22));
        } else {
            startRecording(id);
            mic.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_stop,0,0,0);
            mic.setBackground(bg(Color.rgb(244,67,54),22));
        }
    }
    private void startRecording(String id){
        if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},RECORD_AUDIO);
            return;
        }
        try{
            recordingFile=new File(getExternalFilesDir(Environment.DIRECTORY_MUSIC),"voice_"+System.currentTimeMillis()+".m4a");
            recorder=new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setOutputFile(recordingFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            recording=true;
            toast("Запись началась");
        }catch(Exception e){
            info("Голосовое","Не удалось начать запись: "+e.getMessage());
        }
    }
    private void stopRecording(String id){try{recorder.stop();recorder.release();recorder=null;recording=false;Uri u=Uri.fromFile(recordingFile);appendMessage(id,"audio","",u.toString(),true);copyFileToDownloads(recordingFile,"TeleMAX_voice_"+recordingFile.getName());showChat(id);toast("Голосовое отправлено");}catch(Exception e){recording=false;if(recorder!=null){try{recorder.release();}catch(Exception ignored){}}recorder=null;info("Голосовое","Запись слишком короткая или микрофон недоступен.");}}
    private String httpBase(){String u=signalingUrl();if(u.startsWith("wss://"))return "https://"+u.substring(6);if(u.startsWith("ws://"))return "http://"+u.substring(5);return u;}
    private boolean captureTeleManyCommandMedia(String chatId,String type,String uri,String displayName){
        JSONObject c=getChat(chatId); if(c==null || !"telemany".equals(cleanKey(c.optString("username")))) return false;
        if(!"command_reply".equals(prefs.getString("manyState",""))) return false;
        String old=prefs.getString("manyDraftReply","");
        String item="["+type+"] "+(displayName==null?uri:displayName)+"\n"+uri;
        prefs.edit().putString("manyDraftReply",old+(old.isEmpty()?"":"\n")+item).apply();
        appendBot(c,"Added media. Send another item or press 'Save'.","Save","Go back");
        return true;
    }
    private void uploadAndSend(Uri uri,String type,String displayName){
        if(currentChatId==null)return; final String chatId=currentChatId; new Thread(()->{try{long len=0;android.database.Cursor c=getContentResolver().query(uri,new String[]{android.provider.OpenableColumns.SIZE},null,null,null);if(c!=null){if(c.moveToFirst())len=c.getLong(0);c.close();}if(len>50L*1024*1024){runOnUiThread(()->info("Файл","Максимальный размер файла — 50 МБ."));return;}
            String safe=displayName==null?"file":displayName.replaceAll("[^a-zA-Z0-9._-]","_"); InputStream in=getContentResolver().openInputStream(uri); if(in==null)throw new IOException("open failed");
            final long contentLength=len; final String mimeType=getContentResolver().getType(uri)==null?"application/octet-stream":getContentResolver().getType(uri); RequestBody body=new RequestBody(){public MediaType contentType(){return MediaType.parse(mimeType);}public long contentLength(){return contentLength;}public void writeTo(okio.BufferedSink sink)throws IOException{byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)sink.write(b,0,n);in.close();}};
            Request req=new Request.Builder().url(httpBase()+"/upload?user="+android.net.Uri.encode(cleanKey(accountUsername(currentAccount())))+"&name="+android.net.Uri.encode(safe)).post(body).build(); Response resp=new OkHttpClient().newCall(req).execute(); if(!resp.isSuccessful())throw new IOException("HTTP "+resp.code()); String response=resp.body()==null?"":resp.body().string(); JSONObject o=new JSONObject(response);String remote=o.optString("url",""); if(remote.startsWith("/"))remote=httpBase()+remote; final String finalRemote=remote;
            runOnUiThread(()->{
                if(captureTeleManyCommandMedia(chatId,type,finalRemote,displayName)){showChat(chatId);return;}
                appendMessage(chatId,type,type.equals("file")?displayName:"",finalRemote,true); JSONObject ch=getChat(chatId);String target=cleanKey(ch==null?"":ch.optString("username",ch.optString("name")));String mid=lastMessageId(chatId);sendChatMessage(target,type,type.equals("file")?displayName:"",finalRemote,mid);showChat(chatId);
            });
        }catch(Exception e){runOnUiThread(()->info("Отправка файла","Не удалось загрузить файл. Проверь сервер TeleMAX и соединение."));}}).start();
    }
    private String lastMessageId(String id){JSONObject c=getChat(id);if(c==null)return UUID.randomUUID().toString();JSONArray a=c.optJSONArray("messages");if(a==null||a.length()==0)return UUID.randomUUID().toString();return a.optJSONObject(a.length()-1).optString("id",UUID.randomUUID().toString());}
    private void cacheRemoteMedia(JSONObject msg){String uri=msg.optString("uri","");if(!(uri.startsWith("http://")||uri.startsWith("https://")))return;new Thread(()->{try{Response r=new OkHttpClient().newCall(new Request.Builder().url(uri).build()).execute();if(!r.isSuccessful()||r.body()==null)return;String ext=".bin";String ct=r.header("Content-Type","");if(ct.contains("jpeg"))ext=".jpg";else if(ct.contains("png"))ext=".png";else if(ct.contains("mp4"))ext=".mp4";else if(ct.contains("mpeg"))ext=".mp3";File f=new File(getCacheDir(),"tmx_"+UUID.randomUUID()+ext);java.io.OutputStream out=new java.io.FileOutputStream(f);okio.BufferedSource src=r.body().source();src.writeAll(okio.Okio.sink(out));out.close();String id=currentChatId;runOnUiThread(()->{try{msg.put("uri",Uri.fromFile(f).toString());saveChats(chats());if(id!=null)showChat(id);}catch(Exception ignored){}});}catch(Exception ignored){}}).start();}

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==GOOGLE_SIGN_IN){ if(data!=null) finishGoogleSignIn(data); return; }
        if(resultCode!=RESULT_OK||data==null)return;
        Uri u=data.getData();if(u==null)return;if(Build.VERSION.SDK_INT>=19){try{getContentResolver().takePersistableUriPermission(u,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){}}if(requestCode==PICK_MEDIA){String mime=getContentResolver().getType(u);String type=(mime!=null&&mime.startsWith("video"))?"video":"image";uploadAndSend(u,type,type.equals("video")?"Видео":"media");}else if(requestCode==PICK_FILE){String name=u.getLastPathSegment();if(name==null||name.contains("/"))name="Файл";uploadAndSend(u,"file",name);}else if(requestCode==PICK_AVATAR){String av=avatarDataFromUri(u);prefs.edit().putString("avatar_"+currentAccount(),u.toString()).putString("avatarData_"+currentAccount(),av).apply();broadcastProfile();showProfile();}}

    private void downloadUri(String uri,String name){try{InputStream in=getContentResolver().openInputStream(Uri.parse(uri));if(in==null)return;String safe=(name==null||name.isEmpty())?"TeleMAX_file":"TeleMAX_"+name.replaceAll("[^a-zA-Z0-9._-]","_");if(Build.VERSION.SDK_INT>=29){ContentValues cv=new ContentValues();cv.put(MediaStore.Downloads.DISPLAY_NAME,safe);cv.put(MediaStore.Downloads.MIME_TYPE,"application/octet-stream");cv.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS+"/TeleMAX");Uri out=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,cv);if(out==null){in.close();return;}OutputStream os=getContentResolver().openOutputStream(out);copy(in,os);os.close();}else{File dir=Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);if(!dir.exists())dir.mkdirs();File f=new File(dir,safe);OutputStream os=new java.io.FileOutputStream(f);copy(in,os);os.close();}in.close();toast("Сохранено в Downloads/TeleMAX");}catch(Exception e){toast("Не удалось сохранить файл");}}
    private void copy(InputStream in,OutputStream out)throws IOException{byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
    private void copyFileToDownloads(File f,String name){downloadUri(Uri.fromFile(f).toString(),name);}

    // ---------- CONTACTS ----------
    private void showContacts(){
        selectNav(2); clear(); content.addView(section("КОНТАКТЫ ТЕЛЕФОНА"));
        if(Build.VERSION.SDK_INT>=23 && checkSelfPermission(Manifest.permission.READ_CONTACTS)!=PackageManager.PERMISSION_GRANTED){
            Button grant=button("Разрешить доступ к контактам",accent,BLACK); grant.setOnClickListener(v->requestPermissions(new String[]{Manifest.permission.READ_CONTACTS},PERMISSIONS)); content.addView(grant);
        } else { loadPhoneContacts(); }
        content.addView(spacer(10)); Button add=button("Новый контакт",accent,BLACK); add.setOnClickListener(v->newChatDialog()); content.addView(add,new LinearLayout.LayoutParams(-1,dp(54)));
    }
    private void loadPhoneContacts(){
        Cursor c=null; try { c=getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,new String[]{ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,ContactsContract.CommonDataKinds.Phone.NUMBER},null,null,ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME+" COLLATE LOCALIZED ASC");
            if(c==null)return; int count=0; while(c.moveToNext() && count<300){String name=c.getString(0);String phone=c.getString(1);if(name==null)name="Контакт"; LinearLayout r=row(); r.setBackground(bg(SURFACE,18)); TextView av=tv(name.substring(0,1).toUpperCase(Locale.ROOT),18,BLACK,true);av.setGravity(Gravity.CENTER);av.setBackground(bg(accent,28));r.addView(av,new LinearLayout.LayoutParams(dp(50),dp(50))); LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.setPadding(dp(12),0,0,0);mid.addView(tv(name,16,WHITE,true));mid.addView(tv(phone,12,GRAY,false));r.addView(mid,new LinearLayout.LayoutParams(0,dp(62),1));r.setOnClickListener(v->{String id=UUID.randomUUID().toString();JSONObject chat=ensureChat(id,name);try{chat.put("phone",phone);chat.put("name",name);}catch(Exception ignored){}showChat(id);});content.addView(r,new LinearLayout.LayoutParams(-1,dp(70)));count++;}
            if(count==0)content.addView(tv("В телефонной книге нет контактов.",15,GRAY,false));
        } catch(Exception e){info("Контакты","Не удалось прочитать телефонную книгу.");} finally {if(c!=null)c.close();}
    }

    // ---------- CALL HISTORY ----------
    private void showCalls(){
        selectNav(1); clear(); content.addView(tv("Звонки",28,WHITE,true));
        JSONArray a; try{a=new JSONArray(prefs.getString("call_history_"+currentAccount(),"[]"));}catch(Exception e){a=new JSONArray();}
        if(a.length()==0) content.addView(tv("История звонков пока пустая.",15,GRAY,false));
        for(int i=a.length()-1;i>=0;i--){JSONObject x=a.optJSONObject(i);if(x==null)continue;String name=x.optString("name",x.optString("user","Неизвестный"));String dir=x.optString("direction","out");String kind=x.optString("kind","audio");String time=x.optString("time","");LinearLayout r=row();r.setBackground(bg(SURFACE,18));TextView av=tv(name.substring(0,1).toUpperCase(Locale.ROOT),18,BLACK,true);av.setGravity(Gravity.CENTER);av.setBackground(bg(accent,28));r.addView(av,new LinearLayout.LayoutParams(dp(50),dp(50)));LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.setPadding(dp(12),0,0,0);mid.addView(tv(name,16,WHITE,true));mid.addView(tv((dir.equals("in")?"Входящий":"Исходящий")+" • "+(kind.equals("video")?"Видео":"Аудио"),12,GRAY,false));r.addView(mid,new LinearLayout.LayoutParams(0,dp(62),1));r.addView(tv(time,11,GRAY,false));content.addView(r,new LinearLayout.LayoutParams(-1,dp(70)));}
    }
    private void addCallHistory(String user,String name,String direction,String kind){try{String key="call_history_"+currentAccount();JSONArray a=new JSONArray(prefs.getString(key,"[]"));JSONObject x=new JSONObject().put("user",user).put("name",name).put("direction",direction).put("kind",kind).put("time",new SimpleDateFormat("HH:mm",Locale.getDefault()).format(new Date()));a.put(x);while(a.length()>100)a.remove(0);prefs.edit().putString(key,a.toString()).apply();}catch(Exception ignored){}}

    // ---------- SETTINGS ----------
    private void showSettings(){
        selectNav(3);
        clear();
        LinearLayout profile = new LinearLayout(this); profile.setGravity(Gravity.CENTER_VERTICAL); profile.setPadding(dp(10),dp(8),dp(10),dp(14));
        ImageView av=new ImageView(this);av.setScaleType(ImageView.ScaleType.CENTER_CROP);String ownAv=prefs.getString("avatar_"+currentAccount(),"");if(!ownAv.isEmpty())try{av.setImageURI(Uri.parse(ownAv));}catch(Exception ignored){}if(av.getDrawable()==null)av.setImageResource(com.telemax.app.R.drawable.telemax_logo);profile.addView(av,new LinearLayout.LayoutParams(dp(72),dp(72)));
        LinearLayout pi=new LinearLayout(this);pi.setOrientation(LinearLayout.VERTICAL);pi.setPadding(dp(14),0,0,0);pi.addView(tv(accountName(currentAccount()),22,WHITE,true));pi.addView(tv("@"+accountUsername(currentAccount()),13,GRAY,false));profile.addView(pi,new LinearLayout.LayoutParams(0,-2,1));
        Button edit=iconButton("✎",SURFACE2,WHITE);edit.setOnClickListener(v->editProfile());profile.addView(edit,new LinearLayout.LayoutParams(dp(46),dp(46)));content.addView(profile);

        settingsGroup(new String[][]{{"id","Цифровой ID","Профиль, имя и публичные данные"},{"info","Информация","О TeleMAX и версии"}},new View.OnClickListener[]{v->editPublicIdentity(),v->info("TeleMAX","TeleMAX 0.5 • интерфейс MAX + настройки в стиле Telegram")});
        addSetting("palette","Кастомизация", "Тема, акцент, анимации",v->appearanceSettings());
        settingsGroup(new String[][]{{"notifications","Уведомления","Звуки, вибрация и уведомления"},{"cloud","Облачное хранилище","Личный канал для файлов и медиа"},{"proxy","Прокси","SOCKS5 / HTTP для соединения"},{"data","Подмена данных","Публичные данные аккаунта"}},new View.OnClickListener[]{v->notificationSettings(),v->cloudStorage(),v->proxySettings(),v->editPublicIdentity()});
        addSetting("privacy","Конфиденциальность и 2FA","PIN и приватность",v->twoFactorSettings());
        addSetting("call","Звонки","История, аудио, видео и TURN",v->showCalls());
        addSetting("wallet","TeleCoin / TelePremium","Баланс и подарки",v->showWallet());
        addSetting("gift","NFT и подарки","Коллекция и отправка",v->showGiftGallery());
        addSetting("developer","Для разработчиков","Debug Mode, диагностика, сервер",v->showDeveloperMenu());
        addSetting("permissions","Разрешения","Камера, микрофон, контакты, медиа",v->requestPermissionsIfNeeded());
        TextView ver=tv("TeleMAX • v0.5.0",11,GRAY_DARK,false);ver.setGravity(Gravity.CENTER);ver.setPadding(0,dp(18),0,dp(18));content.addView(ver);
    }

    private void settingsGroup(String[][] items, View.OnClickListener[] clicks){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setBackground(bg(SURFACE,22));
        for(int i=0;i<items.length;i++){LinearLayout r=new LinearLayout(this);r.setGravity(Gravity.CENTER_VERTICAL);r.setPadding(dp(14),dp(7),dp(10),dp(7));TextView ic=iconText(items[i][0],24,Color.rgb(225,205,218));r.addView(ic,new LinearLayout.LayoutParams(dp(58),dp(58)));LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.addView(tv(items[i][1],16,WHITE,true));if(items[i].length>2&&!items[i][2].isEmpty())mid.addView(tv(items[i][2],12,GRAY,false));r.addView(mid,new LinearLayout.LayoutParams(0,dp(64),1));r.addView(iconText("back",22,GRAY),new LinearLayout.LayoutParams(dp(28),dp(64)));r.setOnClickListener(clicks[i]);box.addView(r,new LinearLayout.LayoutParams(-1,dp(70)));if(i<items.length-1){View line=new View(this);line.setBackgroundColor(Color.rgb(50,48,52));box.addView(line,new LinearLayout.LayoutParams(-1,1));}}LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,0,0,dp(12));content.addView(box,p);
    }

    private void addSetting(String icon,String name,String sub,View.OnClickListener click){LinearLayout r=row();r.setPadding(dp(14),dp(6),dp(10),dp(6));r.setBackground(bg(SURFACE,20));TextView i=iconText(icon,21,Color.rgb(225,205,218));r.addView(i,new LinearLayout.LayoutParams(dp(50),dp(58)));LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.addView(tv(name,16,WHITE,true));mid.addView(tv(sub,12,GRAY,false));r.addView(mid,new LinearLayout.LayoutParams(0,dp(62),1));r.addView(tv("›",28,GRAY,false),new LinearLayout.LayoutParams(dp(28),dp(62)));r.setOnClickListener(click);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(70));lp.setMargins(0,0,0,dp(8));content.addView(r,lp);}


    private void cloudStorage(){
        String id=currentAccount(); String existing=prefs.getString("cloudChat_"+id,"");
        if(existing.isEmpty()){
            String code=String.valueOf(10000 + Math.abs(UUID.randomUUID().hashCode())%90000);
            String channel="clst"+code; JSONObject c=ensureChat("cloud_"+id, "Облачное хранилище");
            try{c.put("username",channel);c.put("channel",true);c.put("cloud",true);c.put("messages",new JSONArray());}catch(Exception ignored){}
            JSONArray a=chats(); for(int i=0;i<a.length();i++)if("cloud_".concat(id).equals(a.optJSONObject(i).optString("id"))){try{a.put(i,c);}catch(Exception ignored){}} saveChats(a); prefs.edit().putString("cloudChat_"+id,channel).apply();
            toast("Создано облако @"+channel);
        }
        String channel=prefs.getString("cloudChat_"+id,"");
        new AlertDialog.Builder(this).setTitle("Облачное хранилище").setMessage("Личный канал TeleMAX\n@"+channel+"\n\nИспользуй его как хранилище файлов и медиа. В серверной версии канал синхронизируется между устройствами.").setPositiveButton("Открыть",(d,w)->showChat("cloud_"+id)).setNeutralButton("Создать заново",(d,w)->{prefs.edit().remove("cloudChat_"+id).apply();cloudStorage();}).setNegativeButton("Закрыть",null).show();
    }

    private void showDeveloperMenu(){
        String state=prefs.getBoolean("debugMode",false)?"включён":"выключен";
        String[] items={"Debug Mode: "+state,"Диагностика","Сервер realtime","Сервер звонков","Очистить локальный кэш","Экспорт логов"};
        new AlertDialog.Builder(this).setTitle("Для разработчиков").setItems(items,(d,w)->{
            if(w==0){boolean n=!prefs.getBoolean("debugMode",false);prefs.edit().putBoolean("debugMode",n).apply();toast("Debug Mode "+(n?"включён":"выключен"));}
            else if(w==1)debugDiagnostics(); else if(w==2)info("Realtime",BuildConfig.TELEMAX_SERVER_URL); else if(w==3)info("Calls",signalingUrl());
            else if(w==4){prefs.edit().clear().apply();toast("Локальные настройки очищены");showAuth();}
            else if(w==5){String log="TeleMAX debug\naccount="+currentAccount()+"\nserver="+BuildConfig.TELEMAX_SERVER_URL+"\ndebug="+prefs.getBoolean("debugMode",false);toast(log);}
        }).show();
    }

    private void debugDiagnostics(){StringBuilder s=new StringBuilder();s.append("Аккаунт: ").append(accountUsername(currentAccount())).append("\n");s.append("Debug: ").append(prefs.getBoolean("debugMode",false)).append("\n");s.append("Realtime: ").append(BuildConfig.TELEMAX_SERVER_URL).append("\n");s.append("Chats: ").append(chats().length()).append("\n");s.append("Cloud: ").append(prefs.getString("cloudChat_"+currentAccount(),"не создано"));info("Диагностика",s.toString());}

    private void showGiftGallery(){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(10),dp(5),dp(10),dp(5));
        int[] imgs={com.telemax.app.R.drawable.gift_box,com.telemax.app.R.drawable.nft_crystal,com.telemax.app.R.drawable.nft_moon,com.telemax.app.R.drawable.nft_star,com.telemax.app.R.drawable.nft_butterfly,com.telemax.app.R.drawable.gift_box};
        String[] names={"Подарок • Розовая коробка","NFT • Crystal","NFT • Moon","NFT • Star","NFT • Butterfly","Premium Gift"};
        for(int i=0;i<names.length;i++){LinearLayout r=row();r.setBackground(bg(SURFACE2,18));ImageView icon=new ImageView(this);icon.setImageResource(imgs[i]);icon.setScaleType(ImageView.ScaleType.CENTER_CROP);r.addView(icon,new LinearLayout.LayoutParams(dp(62),dp(58)));TextView name=tv(names[i],15,WHITE,true);r.addView(name,new LinearLayout.LayoutParams(0,dp(58),1));box.addView(r,new LinearLayout.LayoutParams(-1,dp(66)));box.addView(spacer(5));}
        new AlertDialog.Builder(this).setTitle("NFT и подарки").setView(box).setPositiveButton("Готово",null).show();
    }

    private void showAccounts(){clear();content.addView(tv(lang("Аккаунты","Accounts"),27,WHITE,true));content.addView(spacer(8));for(String id:getAccounts()){LinearLayout r=row();r.setBackground(bg(SURFACE,18));TextView a=tv(accountName(id).substring(0,1).toUpperCase(),20,BLACK,true);a.setGravity(Gravity.CENTER);a.setBackground(bg(accent,30));r.addView(a,new LinearLayout.LayoutParams(dp(52),dp(52)));LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.addView(tv(accountName(id),16,WHITE,true));mid.addView(tv("@"+accountUsername(id)+(id.equals(currentAccount())?" • активен":"")+" • role="+prefs.getInt("role_"+id,0),12,id.equals(currentAccount())?accent:GRAY,false));r.addView(mid,new LinearLayout.LayoutParams(0,dp(64),1));Button sw=button(id.equals(currentAccount())?"Активен":"Войти",id.equals(currentAccount())?accent:SURFACE2,id.equals(currentAccount())?BLACK:WHITE);sw.setOnClickListener(v->{prefs.edit().putString("currentAccount",id).apply();buildShell(true);startCallSignaling();});r.addView(sw,new LinearLayout.LayoutParams(dp(85),dp(48)));r.setOnLongClickListener(v->{new AlertDialog.Builder(this).setTitle(accountName(id)).setItems(new String[]{"Изменить","Удалить"},(d,w)->{if(w==0){editManagedAccount(id);}else if(!id.equals(currentAccount())){ArrayList<String>a2=getAccounts();a2.remove(id);saveAccounts(a2);prefs.edit().remove("account_"+id+"_name").remove("account_"+id+"_username").remove("account_"+id+"_phone").remove("role_"+id).apply();String creator=prefs.getString("createdBy_"+id,"");if(!creator.isEmpty())prefs.edit().putBoolean("modCreateUsed_"+creator,false).apply();showAccounts();}}).show();return true;});content.addView(r,new LinearLayout.LayoutParams(-1,dp(76)));}
        Button add=button("＋  Добавить аккаунт",accent,BLACK);add.setOnClickListener(v->showAddAccount());content.addView(add);Button out=button("Выйти из текущего аккаунта",SURFACE2,WHITE);out.setOnClickListener(v->{prefs.edit().remove("currentAccount").putBoolean("registered",!getAccounts().isEmpty()).apply();showAuth();});content.addView(out);}
    private void editManagedAccount(String id){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText n=input("Имя");n.setText(accountName(id));EditText u=input("Username");u.setText(accountUsername(id));EditText ph=input("Телефон");ph.setText(prefs.getString("account_"+id+"_phone",""));box.addView(n);box.addView(spacer(8));box.addView(u);box.addView(spacer(8));box.addView(ph);new AlertDialog.Builder(this).setTitle("Изменить аккаунт").setView(box).setPositiveButton("Сохранить",(d,w)->{String newUser=nameSafe(u.getText().toString());if(newUser.isEmpty()){info("Аккаунт","Username не может быть пустым.");return;}if(usernameTaken(newUser,id)){info("Username занят","Такой username уже используется другим аккаунтом.");return;}prefs.edit().putString("account_"+id+"_name",n.getText().toString().trim()).putString("account_"+id+"_username",newUser).putString("account_"+id+"_phone",ph.getText().toString().trim()).putBoolean("account_"+id+"_changed",true).apply();String creator=prefs.getString("createdBy_"+id,"");if(!creator.isEmpty())prefs.edit().putBoolean("modCreateUsed_"+creator,false).apply();showAccounts();}).setNegativeButton("Отмена",null).show();}

    private void showAddAccount(){
        final EditText n=input("Имя");final EditText u=input("@username (можно пусто)");final Spinner country=new Spinner(this);
        String[] countries={"Германия +49","Россия +7","Украина +380","Казахстан +7","Беларусь +375","США +1","Великобритания +44","Франция +33","Италия +39","Испания +34","Польша +48","Турция +90","ОАЭ +971","Китай +86","Япония +81","Другое"};
        country.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,countries));
        final EditText ph=input("Номер телефона (можно пусто)");final EditText pin=input("2FA PIN (можно пусто)");pin.setInputType(2);
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.addView(n);box.addView(spacer(8));box.addView(u);box.addView(spacer(8));box.addView(country,new LinearLayout.LayoutParams(-1,dp(54)));box.addView(spacer(8));box.addView(ph);box.addView(spacer(8));box.addView(pin);
        new AlertDialog.Builder(this).setTitle("Новый аккаунт").setMessage("Администратор может создать аккаунт без телефона и username. Обычная регистрация остаётся с номером.").setView(box).setPositiveButton("Создать",(d,w)->{
            String name=n.getText().toString().trim(),user=nameSafe(u.getText().toString()),phone=ph.getText().toString().trim(),p2=pin.getText().toString().trim();
            if(name.isEmpty()){info("Аккаунт","Имя обязательно.");return;}
            if(!p2.isEmpty()&&(p2.length()<4||p2.length()>6||!p2.matches("\\d+"))){info("Аккаунт","2FA PIN должен быть 4–6 цифр.");return;}
            if(user.isEmpty()) user="user_"+UUID.randomUUID().toString().substring(0,8);
            if(usernameTaken(user, "")){ info("Username занят", "Нельзя создать второй аккаунт с таким username."); return; }
            String id=UUID.randomUUID().toString(); String fullPhone="";
            if(!phone.isEmpty()){String code=country.getSelectedItem().toString().replaceAll(".*?([+][0-9]+)$","$1");fullPhone=code+" "+phone;}
            prefs.edit().putString("account_"+id+"_name",name).putString("account_"+id+"_username",user).putString("account_"+id+"_phone",fullPhone).putString("2fa_"+id,p2.isEmpty()?"":hash(p2)).putBoolean("aiEnabled_"+id,true).apply();
            ArrayList<String>a=getAccounts();a.add(id);saveAccounts(a);toast("Аккаунт создан");showAccounts();
        }).setNegativeButton("Отмена",null).show();
    }

    private void chatSettings(){String[] x={"Цвет интерфейса","Анимации","Обои чатов"};new AlertDialog.Builder(this).setTitle("Настройки чатов").setItems(x,(d,w)->{if(w==0)appearanceSettings();else if(w==1)toggleSetting("chatAnimations","Анимации чатов");else info("Обои","Обои чатов теперь можно менять через выбор цвета. Файловые обои можно добавить в следующей серверной версии.");}).show();}
    private void privacySettings(){String[] x={"Строгий режим","Скрывать статус онлайн"};new AlertDialog.Builder(this).setTitle("Конфиденциальность").setItems(x,(d,w)->toggleSetting(w==0?"privateMode":"hideOnline",x[w])).show();}
    private void notificationSettings(){if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION);String[] x={"Уведомления","Звуки","Вибрация"};new AlertDialog.Builder(this).setTitle("Уведомления").setItems(x,(d,w)->toggleSetting(w==0?"notifications":w==1?"sounds":"vibration",x[w])).show();}
    private void callServerSettings(){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        EditText url=input("Глобальный WebSocket URL"); url.setText(signalingUrl());
        EditText turn=input("TURN URL (необязательно)"); turn.setText(prefs.getString("turnUrl",""));
        EditText turnUser=input("TURN username"); turnUser.setText(prefs.getString("turnUser",""));
        EditText turnCred=input("TURN credential"); turnCred.setText(prefs.getString("turnCred",""));
        box.addView(url); box.addView(spacer(8)); box.addView(turn); box.addView(spacer(8)); box.addView(turnUser); box.addView(spacer(8)); box.addView(turnCred);
        new AlertDialog.Builder(this).setTitle("Сервер звонков")
                .setMessage("NET — сообщения через интернет по всему миру. Укажи публичный wss:// адрес своего TeleMAX-сервера. BT — отдельный режим Bluetooth без интернета и без мобильных данных.")
                .setView(box).setPositiveButton("Сохранить",(d,w)->{
                    prefs.edit().putString("signalingUrl",url.getText().toString().trim())
                            .putString("turnUrl",turn.getText().toString().trim())
                            .putString("turnUser",turnUser.getText().toString().trim())
                            .putString("turnCred",turnCred.getText().toString().trim()).apply();
                    startCallSignaling();
                }).setNegativeButton("Отмена",null).show();
    }
    private void verifyStartup(){String id=currentAccount();String h=prefs.getString("2fa_"+id,"");if(h.isEmpty()){buildShell(false);requestPermissionsIfNeeded();startCallSignaling();startChatRealtime();return;}final EditText pin=input("2FA PIN");pin.setInputType(2);new AlertDialog.Builder(this).setTitle("Защита аккаунта").setMessage("Введите PIN для входа в TeleMAX").setCancelable(false).setView(pin).setPositiveButton("Войти",(d,w)->{if(hash(pin.getText().toString().trim()).equals(h)){buildShell(false);requestPermissionsIfNeeded();startCallSignaling();startChatRealtime();}else{info("2FA","Неверный PIN");verifyStartup();}}).show();}
    private void twoFactorSettings(){final EditText p=input("Новый PIN 4–6 цифр (пусто = отключить)");p.setInputType(2);new AlertDialog.Builder(this).setTitle("Двухфакторная защита").setMessage("2FA необязательна. Можно включить PIN или отключить его.").setView(p).setPositiveButton("Сохранить",(d,w)->{String x=p.getText().toString().trim();if(x.isEmpty()){prefs.edit().putString("2fa_"+currentAccount(),"").putBoolean("2faEnabled_"+currentAccount(),false).apply();toast("2FA отключена");showSettings();return;}if(x.length()<4||x.length()>6||!x.matches("\\d+")){info("2FA","PIN должен содержать 4–6 цифр.");return;}prefs.edit().putString("2fa_"+currentAccount(),hash(x)).putBoolean("2faEnabled_"+currentAccount(),true).apply();toast("2FA включена");showSettings();}).setNegativeButton("Отмена",null).show();}
    private String nameSafe(String x){return x==null?"":x.trim().replace("@","").replace(" ","_");}
    private String hash(String x){try{MessageDigest md=MessageDigest.getInstance("SHA-256");byte[] b=md.digest(x.getBytes("UTF-8"));StringBuilder s=new StringBuilder();for(byte z:b)s.append(String.format(Locale.US,"%02x",z));return s.toString();}catch(Exception e){return x;}}


    // ---------- SETTINGS HELPERS ----------
    private void requestPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        ArrayList<String> needed = new ArrayList<>();
        String[] permissions = new String[]{
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_CONTACTS
        };

        for (String permission : permissions) {
            if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                needed.add(permission);
            }
        }

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
        } else if (Build.VERSION.SDK_INT >= 23 &&
                checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        if (!needed.isEmpty()) {
            requestPermissions(needed.toArray(new String[0]), PERMISSIONS);
        }
        requestBluetoothPermissions();
    }
    private void requestBluetoothPermissions(){
        if(Build.VERSION.SDK_INT>=31){ArrayList<String> p=new ArrayList<>();if(checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.BLUETOOTH_CONNECT);if(checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.BLUETOOTH_SCAN);if(!p.isEmpty())requestPermissions(p.toArray(new String[0]),120);}
    }

    private void toggleSetting(String key, String title) {
        boolean value = prefs.getBoolean(key, false);
        prefs.edit().putBoolean(key, !value).apply();
        toast(title + ": " + (!value ? "включено" : "выключено"));
        showSettings();
    }

    private void languageSettings() {
        String[] items = {"Русский", "English"};
        int checked = prefs.getBoolean("english", false) ? 1 : 0;
        new AlertDialog.Builder(this)
                .setTitle("Язык")
                .setSingleChoiceItems(items, checked, (dialog, which) -> {
                    prefs.edit().putBoolean("english", which == 1).apply();
                    dialog.dismiss();
                    showSettings();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void aiSettings() {
        String key = "aiEnabled_" + currentAccount();
        boolean enabled = prefs.getBoolean(key, true);
        new AlertDialog.Builder(this)
                .setTitle("AI-функции")
                .setMessage(enabled
                        ? "AI-функции включены и доступны в чатах."
                        : "AI-функции отключены.")
                .setPositiveButton(enabled ? "Выключить" : "Включить", (d, w) -> {
                    prefs.edit().putBoolean(key, !enabled).apply();
                    toast(!enabled ? "AI включён" : "AI выключен");
                    showSettings();
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    private void appearanceSettings() {
        final String[] names = {"Жёлтый", "Синий", "Фиолетовый", "Белый"};
        final int[] colors = {YELLOW, BLUE, PURPLE, WHITE};
        int selected = 0;
        int saved = prefs.getInt("accent", YELLOW);
        for (int i = 0; i < colors.length; i++) {
            if (colors[i] == saved) {
                selected = i;
                break;
            }
        }

        new AlertDialog.Builder(this)
                .setTitle("Внешний вид")
                .setSingleChoiceItems(names, selected, (dialog, which) -> {
                    accent = colors[which];
                    prefs.edit().putInt("accent", accent).apply();
                    dialog.dismiss();
                    buildShell(false);
                })
                .setNegativeButton("Отмена", null)
                .show();
    }

    // ---------- PROFILE ----------
    private void showProfile(){selectNav(2);clear();String id=currentAccount();String name=accountName(id),user=accountUsername(id);LinearLayout top=new LinearLayout(this);top.setOrientation(LinearLayout.VERTICAL);top.setGravity(Gravity.CENTER);String avatarUri=prefs.getString("avatar_"+id,"");if(!avatarUri.isEmpty()){ImageView im=new ImageView(this);im.setScaleType(ImageView.ScaleType.CENTER_CROP);im.setImageURI(Uri.parse(avatarUri));im.setBackground(bg(accent,80));top.addView(im,new LinearLayout.LayoutParams(dp(112),dp(112)));}else{TextView av=tv(name.substring(0,1).toUpperCase(),42,BLACK,true);av.setGravity(Gravity.CENTER);av.setBackground(bg(accent,80));top.addView(av,new LinearLayout.LayoutParams(dp(112),dp(112)));}TextView nm=tv(name,25,WHITE,true);nm.setGravity(Gravity.CENTER);top.addView(nm); TextView registered=tv("Дата регистрации: "+prefs.getString("registeredAt_"+id,"Не указана"),13,GRAY,false);registered.setGravity(Gravity.CENTER);top.addView(registered);boolean verifiedIdentity=isVerifiedIdentity(name,user); TextView un=tv("@"+user,14,verifiedIdentity?VERIFY_BLUE:accent,true);un.setGravity(Gravity.CENTER);top.addView(un);content.addView(top);content.addView(spacer(12));addProfileGifts(id);content.addView(spacer(12));LinearLayout actions=row();Button photo=button(" Аватар",SURFACE2,WHITE);photo.setOnClickListener(v->pickAvatar());actions.addView(photo,new LinearLayout.LayoutParams(0,dp(56),1));Button edit=button("✎ Изменить",SURFACE2,WHITE);edit.setOnClickListener(v->editProfile());actions.addView(edit,new LinearLayout.LayoutParams(0,dp(56),1));content.addView(actions);addSetting("call","Телефон",publicPhone(id),v->editPublicIdentity());addSetting("T","Баланс","TeleCoin: "+prefs.getLong("coin_"+id,1250)+" TC",v->showWallet());Button invite=button("↗  Моя ссылка-приглашение",accent,BLACK);invite.setOnClickListener(v->shareText());content.addView(invite);Button logout=button("Выйти",SURFACE2,WHITE);logout.setOnClickListener(v->{prefs.edit().remove("currentAccount").putBoolean("registered",false).putBoolean("securityEventSent_"+id,false).apply();showAuth();});content.addView(logout);}
    private String[] giftEntries(String accountId){
        String raw=prefs.getString("nft_"+accountId,"");
        if(raw==null || raw.trim().isEmpty()) return new String[0];
        return raw.split("\\n");
    }

    private void addProfileGifts(String accountId){
        String[] gifts=giftEntries(accountId);
        TextView title=tv("Подарки  •  "+gifts.length,20,WHITE,true);
        content.addView(title);
        content.addView(spacer(6));
        if(gifts.length==0){
            TextView empty=tv("У пользователя пока нет подарков.",14,GRAY,false);
            empty.setPadding(dp(14),dp(14),dp(14),dp(14));
            empty.setBackground(bg(SURFACE,18));
            content.addView(empty,new LinearLayout.LayoutParams(-1,dp(58)));
            return;
        }
        for(int i=0;i<gifts.length;i++){
            String[] parts=gifts[i].split("\\|",2);
            String name=parts.length>0?parts[0]:gifts[i];
            int kind=0;
            try{kind=parts.length>1?Integer.parseInt(parts[1]):0;}catch(Exception ignored){}
            TextView card=nftCard(name,kind);
            card.setGravity(Gravity.CENTER_VERTICAL);
            content.addView(card,new LinearLayout.LayoutParams(-1,dp(72)));
            if(i<gifts.length-1)content.addView(spacer(6));
        }
    }

    private void pickAvatar(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("image/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_AVATAR);}
    private void editProfile(){String id=currentAccount();LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText n=input("Имя");n.setText(accountName(id));EditText u=input("username");u.setText(privateUsername(id));box.addView(n);box.addView(spacer(8));box.addView(u);new AlertDialog.Builder(this).setTitle("Профиль").setView(box).setPositiveButton("Сохранить",(d,w)->{prefs.edit().putString("account_"+id+"_name",n.getText().toString().trim()).putString("account_"+id+"_username",u.getText().toString().trim().replace("@","")).putBoolean("account_"+id+"_changed",true).apply();broadcastProfile();showProfile();}).setNegativeButton("Отмена",null).show();}

    // ---------- WALLET / PREMIUM ----------
    private long balance(){return prefs.getLong("coin_"+currentAccount(),1250);}
    private void setBalance(long n){prefs.edit().putLong("coin_"+currentAccount(),n).apply();}
    /**
     * Записывает действие в локальный журнал аккаунта.
     * Ранее вызовы addTransaction(...) присутствовали в UI,
     * но самого метода в версии WORLD_CHAT не было.
     */
    private void addTransaction(String text){
        try{
            String key="transactions_"+currentAccount();
            String old=prefs.getString(key,"");
            String line=System.currentTimeMillis()+"|"+text;
            String value=old.isEmpty()?line:old+"\n"+line;
            // Ограничиваем журнал последними 200 записями.
            String[] rows=value.split("\\n");
            int start=Math.max(0,rows.length-200);
            StringBuilder sb=new StringBuilder();
            for(int i=start;i<rows.length;i++){
                if(sb.length()>0) sb.append("\n");
                sb.append(rows[i]);
            }
            prefs.edit().putString(key,sb.toString()).apply();
        }catch(Exception ignored){
            // Журнал не должен ломать основную функцию приложения.
        }
    }

    private void showWallet(){clear();content.addView(tv("T Кошелёк",28,WHITE,true));TextView b=tv("TeleCoin  "+balance()+" TC\nTCoin  "+tcoinBalance()+" TC",23,BLACK,true);b.setGravity(Gravity.CENTER);b.setBackground(bg(accent,24));content.addView(b,new LinearLayout.LayoutParams(-1,dp(125)));content.addView(spacer(10));Button send=button("↗  Отправить TeleCoin",accent,BLACK);send.setOnClickListener(v->sendCoins());content.addView(send);Button buy=button("＋  Пополнить TeleCoin",SURFACE2,WHITE);buy.setOnClickListener(v->topupCoins());content.addView(buy);content.addView(section("ОПЕРАЦИИ"));TextView hist=tv(prefs.getString("transactions","Пока операций нет."),14,GRAY,false);hist.setPadding(dp(14),dp(14),dp(14),dp(14));hist.setBackground(bg(SURFACE,18));content.addView(hist);}
    private void sendCoins(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText to=input("@username получателя");EditText amount=input("Сумма TeleCoin");amount.setInputType(2);box.addView(to);box.addView(spacer(8));box.addView(amount);new AlertDialog.Builder(this).setTitle("Отправить TeleCoin").setView(box).setPositiveButton("Отправить",(d,w)->{try{long n=Long.parseLong(amount.getText().toString().trim());String id=resolveAccountId(to.getText().toString());if(id.isEmpty()){info("Перевод","Пользователь не найден.");return;}if(n<=0||n>balance()){info("Перевод","Недостаточно TeleCoin.");return;}prefs.edit().putLong("coin_"+currentAccount(),balance()-n).putLong("coin_"+id,prefs.getLong("coin_"+id,0)+n).remove("tcoin_"+id).apply();addTransaction("−"+n+" TeleCoin → @"+accountUsername(id));toast("Перевод выполнен");showWallet();}catch(Exception e){info("Перевод","Введи корректную сумму.");}}).setNegativeButton("Отмена",null).show();}
    private void topupCoins(){new AlertDialog.Builder(this).setTitle("Пополнить TeleCoin").setItems(new String[]{"+100 TC","+500 TC","+1000 TC"},(d,w)->{long[] x={100,500,1000};setBalance(balance()+x[w]);prefs.edit().remove("tcoin_"+currentAccount()).apply();addTransaction("+"+x[w]+" TeleCoin • пополнение");showWallet();}).show();}

    private void showPremium(){clear();content.addView(tv("+ TelePremium",28,accent,true));content.addView(tv("Статус подписки",22,WHITE,true));content.addView(spacer(8));String[] f={"Без рекламы","Безлимитные файлы","Расширенный профиль","AI-функции","Дополнительные темы","Быстрые загрузки"};for(String x:f)content.addView(tv("✓  "+x,16,WHITE,false),new LinearLayout.LayoutParams(-1,dp(40)));content.addView(spacer(12));boolean hasPremium=prefs.getBoolean("premium_"+currentAccount(),false);TextView status=tv(hasPremium?"✓ TelePremium активен":"TelePremium не активен\n\nПолучите подарок от друга или выдайте через Admin Mode",16,hasPremium?accent:GRAY,true);status.setGravity(Gravity.CENTER);status.setPadding(dp(20),dp(20),dp(20),dp(20));status.setBackground(bg(SURFACE2,12));content.addView(status,new LinearLayout.LayoutParams(-1,-2));}

    private void ensureBots(String id){
        // Do not create bot chats or greetings on startup.
        // BotRast/TeleMany are initialized only when the user opens them and sends /start.
    }
    private void migrateBotChats(){
        try{JSONArray a=chats();boolean changed=false;for(int i=0;i<a.length();i++){JSONObject c=a.optJSONObject(i);if(c==null)continue;String u=cleanKey(c.optString("username"));if(!"botrast".equals(u)&&!"telemany".equals(u))continue;JSONArray m=c.optJSONArray("messages");if(m==null)continue;JSONArray out=new JSONArray();for(int j=0;j<m.length();j++){JSONObject x=m.optJSONObject(j);if(x==null){continue;}String t=x.optString("text","");if(!x.optBoolean("mine",true)&&(t.startsWith("Здравствуйте. Я BotRast")||t.startsWith("Здравствуйте. Я TeleMany")||t.startsWith("Привет! Я BotRast")||t.startsWith("Привет! Я TeleMany"))){changed=true;continue;}out.put(x);}c.put("messages",out);a.put(i,c);}if(changed)saveChats(a);}catch(Exception ignored){}
    }
    private JSONArray chatsForAccount(String id){try{return new JSONArray(prefs.getString("chats_"+id,"[]"));}catch(Exception e){return new JSONArray();}}
    private void saveChatsForAccount(String id,JSONArray a){prefs.edit().putString("chats_"+id,a.toString()).apply();}
    private JSONObject ensureChatForAccount(String id,String chatId,String name){JSONArray a=chatsForAccount(id);for(int i=0;i<a.length();i++){JSONObject o=a.optJSONObject(i);if(o!=null&&chatId.equals(o.optString("id")))return o;}JSONObject o=new JSONObject();try{o.put("id",chatId);o.put("name",name);o.put("messages",new JSONArray());a.put(o);saveChatsForAccount(id,a);}catch(Exception ignored){}return o;}
    private void appendMessageForAccount(String id,JSONObject chat,String type,String text,boolean mine){try{JSONArray a=chat.optJSONArray("messages");if(a==null)a=new JSONArray();JSONObject m=new JSONObject();m.put("type",type);m.put("text",text);m.put("uri","");m.put("mine",mine);m.put("bubbleColor",prefs.getInt("chatColor_"+id,accent));m.put("time",System.currentTimeMillis());a.put(m);chat.put("messages",a);}catch(Exception ignored){}}
    private JSONObject findBotByUsername(String username){
        String key=cleanKey(username); JSONArray a=botsForAccount(currentAccount());
        for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null&&key.equals(cleanKey(b.optString("username"))))return b;}
        return null;
    }
    private String botLang(JSONObject chat){ String l=prefs.getString("botLang_"+cleanKey(chat.optString("username","bot")),""); if(l.isEmpty()){JSONObject b=findBotByUsername(chat.optString("username","")); if(b!=null) l=b.optString("language","");} return l; }
    private void setBotLang(JSONObject chat,String lang){ prefs.edit().putString("botLang_"+cleanKey(chat.optString("username","bot")),lang).apply(); }
    private void setBotKeyboard(JSONObject chat,String... labels){try{JSONArray a=new JSONArray();for(String x:labels)a.put(x);chat.put("botKeyboard",a);JSONArray all=chats();for(int i=0;i<all.length();i++){JSONObject x=all.optJSONObject(i);if(x!=null&&chat.optString("id").equals(x.optString("id"))){all.put(i,chat);break;}}saveChats(all);}catch(Exception ignored){}}
    private void addBotKeyboard(LinearLayout parent,String chatId){JSONObject c=getChat(chatId);if(c==null)return;JSONArray kb=c.optJSONArray("botKeyboard");if(kb==null||kb.length()==0)return;LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(8),dp(4),dp(8),dp(6));for(int i=0;i<kb.length();i++){String label=kb.optString(i);Button b=button(label,Color.rgb(245,245,247),Color.rgb(40,40,44));final String action=label;b.setOnClickListener(v->botButtonAction(chatId,action));box.addView(b,new LinearLayout.LayoutParams(-1,dp(46)));if(i<kb.length()-1)box.addView(spacer(5));}parent.addView(box,new LinearLayout.LayoutParams(-1,-2));}
    private void botButtonAction(String chatId,String label){String action=label.trim();String cmd=action;if(action.equals("Russian")||action.equals("Русский"))cmd="__lang_ru";else if(action.equals("English"))cmd="__lang_en";else if(action.equals("Spanish")||action.equals("Español"))cmd="__lang_es";else if(action.equals("Create command")||action.equals("Создать команду"))cmd="/createcommand";else if(action.equals("Config main menu")||action.equals("Настроить главное меню"))cmd="/configmenu";else if(action.equals("Go back")||action.equals("Назад"))cmd="/start";else if(action.equals("Save")||action.equals("Сохранить"))cmd="/save";else if(!action.startsWith("/"))cmd="/"+action.replaceAll("\\s+","_").toLowerCase(Locale.ROOT);JSONObject c=getChat(chatId);if(c==null)return;appendMessage(chatId,"text",action,"",true);botReply(currentAccount(),c,cmd);showChat(chatId);}
    private String botText(String lang,String ru,String en,String es){if("en".equals(lang))return en;if("es".equals(lang))return es;return ru;}
    private String randomBotToken(){return String.valueOf(1000000000L+(long)(Math.random()*8999999999L))+":AA"+UUID.randomUUID().toString().replace("-","").substring(0,32);}
    private boolean botUsernameTaken(String username){String u=cleanKey(username);if(u.isEmpty())return true;JSONArray a=botsForAccount(currentAccount());for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null&&u.equals(cleanKey(b.optString("username"))))return true;}return u.equals("botrast")||u.equals("telemany")||u.equals("telemax");}
    private void saveBot(JSONObject b){try{JSONArray a=botsForAccount(currentAccount());String id=b.optString("id");boolean found=false;for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&id.equals(x.optString("id"))){a.put(i,b);found=true;break;}}if(!found)a.put(b);saveBots(currentAccount(),a);}catch(Exception ignored){}}
    private void appendBot(JSONObject chat,String text,String... keyboard){appendMessage(chat.optString("id"),"text",text,"",false);setBotKeyboard(chat,keyboard);}
    private void botHelp(JSONObject chat){String l=botLang(chat);String msg=botText(l,"Я помогу создавать и управлять ботами TeleMAX.\n\n/newbot — создать нового бота\n/mybots — управлять ботами\n\nРедактирование\n/setname — изменить имя\n/setdescription — изменить описание\n/setabouttext — изменить информацию\n/setuserpic — изменить фото\n/setcommands — изменить команды\n/deletebot — удалить бота\n\nНастройки\n/token — получить токен\n/revoke — отозвать токен\n/setinline — inline-режим\n/setinlinegeo — геолокация\n/setinlinefeedback — обратная связь\n/setjoingroups — добавление в группы\n/setprivacy — приватность в группах\n\nWeb Apps\n/myapps /newapp /listapps /editapp /deleteapp\n\nGames\n/mygames /newgame /listgames /editgame /deletegame","I can help you create and manage TeleMAX bots.\n\n/newbot - create a new bot\n/mybots - edit your bots\n\nEdit Bots\n/setname - change a bot's name\n/setdescription - change bot description\n/setabouttext - change bot about info\n/setuserpic - change bot profile photo\n/setcommands - change the list of commands\n/deletebot - delete a bot\n\nBot Settings\n/token - get authorization token\n/revoke - revoke bot access token\n/setinline - toggle inline mode\n/setinlinegeo - toggle inline location requests\n/setinlinefeedback - change inline feedback settings\n/setjoingroups - can your bot be added to groups?\n/setprivacy - toggle privacy mode in groups\n\nWeb Apps\n/myapps /newapp /listapps /editapp /deleteapp\n\nGames\n/mygames /newgame /listgames /editgame /deletegame","Puedo ayudarte a crear y administrar bots de TeleMAX.\n\n/newbot - crear un bot\n/mybots - editar tus bots\n\n/setname - cambiar el nombre\n/setdescription - cambiar la descripción\n/setabouttext - cambiar la información\n/setcommands - cambiar los comandos\n/deletebot - eliminar bot\n\n/token - obtener token\n/revoke - revocar token\n/setinline - modo inline\n/setjoingroups - permitir grupos\n/setprivacy - privacidad en grupos");appendBot(chat,msg,"/newbot","/mybots");}
    private void createBotFromRast(JSONObject chat,String name,String username){try{String u=cleanKey(username);if(name.trim().isEmpty()){appendBot(chat,"Название бота не может быть пустым.","/newbot");return;}if(!u.endsWith("bot")||!u.matches("[a-zA-Z0-9_]+")){appendBot(chat,"Sorry, this username is invalid. Username must use Latin letters, numbers and '_' and end in bot.","/newbot");return;}if(botUsernameTaken(u)){appendBot(chat,"Sorry, this username is invalid. This username is already taken.","/newbot");return;}JSONObject b=new JSONObject().put("id","userbot_"+UUID.randomUUID()).put("name",name.trim()).put("username",u).put("owner",currentAccount()).put("token",randomBotToken()).put("commands",new JSONArray()).put("description","");saveBot(b);JSONObject c=ensureChat("bot_"+u,name.trim());c.put("username",u).put("bot",true).put("userBot",true);saveChats(chats());String l=botLang(chat);String msg=botText(l,"Готово! Поздравляем с созданием бота. Вы найдёте его здесь: t.me/"+u+".\n\nТокен HTTP API:\n"+b.optString("token")+"\n\nХраните токен в секрете. Он позволяет управлять ботом.\n\nИспользуйте /help для списка команд.","Done! Congratulations on your new bot. You will find it at t.me/"+u+". You can now add a description, about section and profile picture for your bot, see /help for a list of commands.\n\nUse this token to access the HTTP API:\n"+b.optString("token")+"\nKeep your token secure. It can be used by anyone to control your bot.\n\nSee /help for a list of commands.","¡Listo! Tu bot ha sido creado. Lo encontrarás en t.me/"+u+".\n\nToken HTTP API:\n"+b.optString("token")+"\nMantén el token seguro.\n\nUsa /help para ver los comandos.");appendBot(chat,msg,"/mybots","/help");}catch(Exception e){appendBot(chat,"Не удалось создать бота.","/newbot");}}
    private void botReply(String id,JSONObject chat,String userText){String u=cleanKey(chat.optString("username"));String raw=userText==null?"":userText.trim();String low=raw.toLowerCase(Locale.ROOT);String l=botLang(chat);if("/start".equals(low)){if(l.isEmpty()){appendBot(chat,"Welcome! Please choose your language.","Russian","English","Spanish");return;}if("botrast".equals(u)){botHelp(chat);return;}if("telemany".equals(u)){appendBot(chat,botText(l,"Привет, @"+accountUsername(currentAccount())+"!\n\nTeleMany поможет создавать своих ботов, отправлять публикации подписчикам, создавать команды и красивые меню.\n\nИспользуйте /addbot, чтобы добавить первого бота.","Hello @"+accountUsername(currentAccount())+"!\n\nManybot can help you create your own bots. With Manybot you can send out posts to your users, create custom commands and beautiful menus.\n\nUse /addbot command to create your first bot.","¡Hola @"+accountUsername(currentAccount())+"!\n\nTeleMany puede ayudarte a crear tus propios bots, publicar mensajes, crear comandos y menús.\n\nUsa /addbot para añadir tu primer bot."),"/addbot","/help");return;}JSONObject b=findBotByUsername(u);if(b!=null){appendBot(chat,"Congratulations! You are subscribed to "+b.optString("name")+".\n\nUse /off to pause your subscription.\n\n📢 Posting\n/newpost - send a post to your subscribers\n/schedule - view your scheduled posts\n/subscribers - see how many subscribers you have\n\n👾 Commands and Bot Menu\n/commands - manage custom commands and user menus\n\n🔧 Settings\n/botlang - set up your bot language\n/setdescription - change the description of your bot\n/autoposting - set up autoposting\n/channels - automate posting to a channel\n/admins - manage admins\n\n/help - this menu","/commands","/newpost","/botlang");return;}}if("__lang_ru".equals(low)||"__lang_en".equals(low)||"__lang_es".equals(low)){String nl=low.endsWith("ru")?"ru":low.endsWith("en")?"en":"es";if("bot_language".equals(prefs.getString("manyState",""))){String bid=prefs.getString("manyBotId","");JSONArray a=botsForAccount(currentAccount());for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null&&bid.equals(b.optString("id"))){try{b.put("language",nl);saveBot(b);}catch(Exception ignored){}break;}}prefs.edit().remove("manyState").remove("manyBotId").apply();appendBot(chat,"Bot language updated.","/commands","/help");return;}setBotLang(chat,nl);botReply(id,chat,"/start");return;}if(l.isEmpty()){appendBot(chat,"Welcome! Please choose your language.","Russian","English","Spanish");return;}
        if("botrast".equals(u)){if("/help".equals(low)){botHelp(chat);return;}if("/newbot".equals(low)){prefs.edit().putString("botState_"+u,"name").apply();appendBot(chat,botText(l,"Хорошо, новый бот. Как его назвать? Напишите имя бота.","Alright, a new bot. How are we going to call it? Please choose a name for your bot.","Muy bien, un nuevo bot. ¿Cómo vamos a llamarlo? Escribe el nombre del bot."),"/cancel");return;}if("/mybots".equals(low)){JSONArray a=botsForAccount(currentAccount());StringBuilder sb=new StringBuilder(botText(l,"Ваши боты:\n","Your bots:\n","Tus bots:\n"));for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null)sb.append("• ").append(b.optString("name")).append(" @").append(b.optString("username")).append("\n");}if(a.length()==0)sb.append(botText(l,"Пока нет ботов.","No bots yet.","Todavía no hay bots."));appendBot(chat,sb.toString(),"/newbot","/help");return;}if(low.startsWith("/token ")){String target=cleanKey(raw.substring(7).trim());JSONObject b=findBotByUsername(target);appendBot(chat,b==null?"Bot not found.":"Token for @"+target+":\n"+b.optString("token"),"/mybots");return;}if(low.startsWith("/revoke ")){String target=cleanKey(raw.substring(8).trim());JSONObject b=findBotByUsername(target);if(b==null){appendBot(chat,"Bot not found.","/mybots");return;}try{b.put("token",randomBotToken());saveBot(b);appendBot(chat,"Token revoked. New token for @"+target+":\n"+b.optString("token"),"/mybots");}catch(Exception e){appendBot(chat,"Could not revoke token.","/mybots");}return;}if(low.startsWith("/deletebot ")){String target=cleanKey(raw.substring(10).trim());JSONArray a=botsForAccount(currentAccount());JSONArray out=new JSONArray();boolean removed=false;for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null&&target.equals(cleanKey(b.optString("username"))))removed=true;else if(b!=null)out.put(b);}saveBots(currentAccount(),out);if(removed){JSONArray cs=chats();JSONArray co=new JSONArray();for(int i=0;i<cs.length();i++){JSONObject c=cs.optJSONObject(i);if(c!=null&&!target.equals(cleanKey(c.optString("username"))))co.put(c);}saveChats(co);}appendBot(chat,removed?"Bot @"+target+" deleted.":"Bot not found.","/mybots","/newbot");return;}if(low.startsWith("/setdescription ")||low.startsWith("/setabouttext ")||low.startsWith("/setname ")||low.startsWith("/setcommands ")){String[] parts=raw.split("\\s+",3);if(parts.length<3){appendBot(chat,"Usage: "+parts[0]+" <bot_username> <value>","/help");return;}String target=cleanKey(parts[1]);JSONObject b=findBotByUsername(target);if(b==null){appendBot(chat,"Bot not found.","/mybots");return;}try{if(parts[0].equalsIgnoreCase("/setname")){b.put("name",parts[2]);JSONObject c=getChat("bot_"+target);if(c!=null){c.put("name",parts[2]);saveChats(chats());}}else if(parts[0].equalsIgnoreCase("/setdescription"))b.put("description",parts[2]);else if(parts[0].equalsIgnoreCase("/setabouttext"))b.put("about",parts[2]);else{JSONArray cmds=new JSONArray();for(String q:parts[2].split(",")){String z=q.trim();if(!z.isEmpty())cmds.put(new JSONObject().put("command",z.startsWith("/")?z:"/"+z).put("reply",""));}b.put("commands",cmds);}saveBot(b);appendBot(chat,"Done. Bot @"+target+" updated.","/mybots","/help");}catch(Exception e){appendBot(chat,"Could not update the bot.","/help");}return;}String state=prefs.getString("botState_"+u,"");if("name".equals(state)&&!raw.startsWith("/")){prefs.edit().putString("botDraftName_"+u,raw).putString("botState_"+u,"username").apply();appendBot(chat,botText(l,"Отлично. Теперь выберите username бота. Он должен заканчиваться на bot. Например: TetrisBot или tetris_bot.","Good. Now let's choose a username for your bot. It must end in `bot`. Like this, for example: TetrisBot or tetris_bot.","Bien. Ahora elige un username para tu bot. Debe terminar en `bot`, por ejemplo TetrisBot o tetris_bot."),"/cancel");return;}if("username".equals(state)&&!raw.startsWith("/")){String name=prefs.getString("botDraftName_"+u,"");prefs.edit().remove("botState_"+u).remove("botDraftName_"+u).apply();createBotFromRast(chat,name,raw);return;}if("/cancel".equals(low)){prefs.edit().remove("botState_"+u).remove("botDraftName_"+u).apply();appendBot(chat,"Cancelled.","/newbot","/mybots");return;}appendBot(chat,botText(l,"Используйте /newbot для создания бота или /mybots для управления.","Use /newbot to create a bot or /mybots to manage your bots.","Usa /newbot para crear un bot o /mybots para gestionarlos."),"/newbot","/mybots");return;}
        if("telemany".equals(u)){if("/help".equals(low)){appendBot(chat,"/addbot - add a bot\n/commands - manage custom commands\n/botlang - set bot language\n/setdescription - change bot description\n/newpost - send a post\n/schedule - scheduled posts\n/subscribers - subscriber count\n/admins - manage admins","/addbot","/commands","/botlang");return;}if("/addbot".equals(low)){prefs.edit().putString("manyState","token").apply();appendBot(chat,"1⃣ Go to @BotRast. Press his name and then press 'Send Message' if needed.\n2⃣ Create a new bot with him using /newbot.\n3⃣ Copy the API token that @BotRast gives you.\n4⃣ Come back to @TeleMany and send the copied API token here.","/cancel");return;}if("token".equals(prefs.getString("manyState",""))&&!raw.startsWith("/")){JSONObject found=null;JSONArray a=botsForAccount(currentAccount());for(int i=0;i<a.length();i++){JSONObject b=a.optJSONObject(i);if(b!=null&&raw.equals(b.optString("token"))){found=b;break;}}if(found==null){appendBot(chat,"Token is invalid or was not created by BotRast. Please send a valid token.","/cancel");return;}prefs.edit().putString("manyState","description").putString("manyBotId",found.optString("id")).putString("manyBotUsername",found.optString("username")).apply();appendBot(chat,"Token for @"+found.optString("username")+" accepted!\n\nLast step.\n\nWrite a few words about @"+found.optString("username")+". What does it do?\n\n..or /skip","/skip");return;}if("description".equals(prefs.getString("manyState",""))){JSONObject b=null;JSONArray a=botsForAccount(currentAccount());for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&prefs.getString("manyBotId","").equals(x.optString("id"))){b=x;break;}}if(b!=null){b.put("description","/skip".equals(low)?"":raw);saveBot(b);}prefs.edit().remove("manyState").remove("manyBotId").remove("manyBotUsername").apply();appendBot(chat,"Ok! You can always add a description later.\n\nCongratulations! Your bot is ready.\n\nInvite your audience to your bot using this link: http://telegram.me/"+(b==null?"bot":b.optString("username"))+"\n\nNow you can send out updates using the /newpost command or set up autoposting using /autoposting command.","/newpost","/commands","/help");return;}if("/commands".equals(low)){appendBot(chat,"You can create custom commands that your bot will reply to with predefined messages. Use the menu below to create new custom commands, change the look of the bot's menu or select a command to edit it.","Create command","Config main menu","Go back");return;}if("/createcommand".equals(low)){prefs.edit().putString("manyState","command_name").apply();appendBot(chat,"Enter the command name. Please use only latin letters, numbers and '_'.\n\nSome examples:\n/website\n/pricelist\n/contacts\n/best_music\n/best_photos","/cancel");return;}if("command_name".equals(prefs.getString("manyState",""))&&!raw.startsWith("/")){String cmd=raw.startsWith("/")?raw:"/"+raw;if(!cmd.matches("/[A-Za-z0-9_]+")){appendBot(chat,"Invalid command name. Use only latin letters, numbers and '_'.","/cancel");return;}prefs.edit().putString("manyState","command_reply").putString("manyCommand",cmd).putString("manyDraftReply","").putString("manyBotId",prefs.getString("manyBotId","")).apply();appendBot(chat,"Bot can reply with one or more messages to a custom command. You can use text, pictures, videos or any other file type.\n\nSend everything that you want to add as a reply to this command and press 'Save'.","Save","Go back");return;}if("command_reply".equals(prefs.getString("manyState",""))&&!"/save".equals(low)){String old=prefs.getString("manyDraftReply","");prefs.edit().putString("manyDraftReply",old+(old.isEmpty()?"":"\n")+raw).apply();appendBot(chat,"Added. Send another reply or press 'Save'.","Save","Go back");return;}if("/save".equals(low)&&"command_reply".equals(prefs.getString("manyState",""))){String cmd=prefs.getString("manyCommand","");String reply=prefs.getString("manyDraftReply","");String bid=prefs.getString("manyBotId","");JSONObject b=null;JSONArray a=botsForAccount(currentAccount());for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&bid.equals(x.optString("id"))){b=x;break;}}if(b!=null){JSONArray cs=b.optJSONArray("commands");if(cs==null)cs=new JSONArray();cs.put(new JSONObject().put("command",cmd).put("reply",reply));b.put("commands",cs);saveBot(b);}prefs.edit().remove("manyState").remove("manyCommand").remove("manyDraftReply").remove("manyBotId").apply();appendBot(chat,"Custom command "+cmd+" was successfully created.\n\nYou can create custom commands that your bot will reply to with predefined messages. Use the menu below to create new custom commands, change the look of the bot's menu or select a command to edit it.","Create command","Config main menu","Go back");return;}if("/configmenu".equals(low)){appendBot(chat,"Main menu configuration is ready. Add or remove command buttons by creating custom commands.","Create command","Go back");return;}if("/botlang".equals(low)){String bid=prefs.getString("manyBotId","");if(bid.isEmpty()){JSONArray a=botsForAccount(currentAccount());if(a.length()>0)bid=a.optJSONObject(0).optString("id");}prefs.edit().putString("manyState","bot_language").putString("manyBotId",bid).apply();appendBot(chat,"Choose the language for your managed bot.","Russian","English","Spanish");return;}appendBot(chat,"Use /addbot to add a bot or /commands to manage custom commands.","/addbot","/commands","/help");return;}
        JSONObject b=findBotByUsername(u);if(b!=null){if("/off".equals(low)){appendBot(chat,"Subscription paused. Use /start to resume.","/start");return;}if("/help".equals(low)){appendBot(chat,"Commands for @"+u+":\n/start\n/help\n/commands","/commands","/start");return;}if("/commands".equals(low)){JSONArray cs=b.optJSONArray("commands");StringBuilder out=new StringBuilder("Available commands:\n");if(cs!=null)for(int i=0;i<cs.length();i++){JSONObject x=cs.optJSONObject(i);if(x!=null)out.append(x.optString("command")).append("\n");}appendBot(chat,out.toString(),"/start");return;}JSONArray cs=b.optJSONArray("commands");if(cs!=null)for(int i=0;i<cs.length();i++){JSONObject x=cs.optJSONObject(i);if(x!=null&&low.equals(x.optString("command").toLowerCase(Locale.ROOT))){appendBot(chat,x.optString("reply"),"/start");return;}}appendBot(chat,"I don't have a reply for this message yet.","/help");return;}appendBot(chat,"Use /start to begin.","/start");}



    // ---------- BOTRAST / TELEMANY ----------
    private void showBotManager() {
        clear();
        content.addView(tv("Боты",28,WHITE,true));
        content.addView(tv("Создание и редактирование ботов через BotRast и TeleMany",13,GRAY,false));
        content.addView(spacer(10));
        Button rast = button("BotRast • Создать шаблон", SURFACE2, accent);
        rast.setOnClickListener(v -> createBuiltInBot("BotRast", "botrast", "Привет! Я BotRast. Чем помочь?"));
        content.addView(rast, new LinearLayout.LayoutParams(-1, dp(50)));
        content.addView(spacer(6));
        Button many = button("TeleMany • Создать шаблон", SURFACE2, accent);
        many.setOnClickListener(v -> createBuiltInBot("TeleMany", "telemany", "Привет! Я TeleMany. Опиши задачу."));
        content.addView(many, new LinearLayout.LayoutParams(-1, dp(50)));
        content.addView(spacer(8));
        Button create = button("＋ Создать бота", accent, BLACK);
        create.setOnClickListener(v -> createBotDialog());
        content.addView(create);
        content.addView(spacer(8));
        JSONArray list = botsForAccount(currentAccount());
        for (int i=0;i<list.length();i++) {
            JSONObject b=list.optJSONObject(i); if(b==null) continue;
            String name=b.optString("name","Бот");
            String username=b.optString("username","bot");
            LinearLayout row=row(); row.setBackground(bg(SURFACE,18));
            LinearLayout mid=new LinearLayout(this); mid.setOrientation(LinearLayout.VERTICAL);
            mid.addView(tv(name,16,WHITE,true)); mid.addView(tv("@"+username,12,GRAY,false));
            row.addView(mid,new LinearLayout.LayoutParams(0,dp(64),1));
            Button edit=button("Изменить",SURFACE2,accent); edit.setOnClickListener(v->editBotDialog(b));
            row.addView(edit,new LinearLayout.LayoutParams(dp(105),dp(52)));
            content.addView(row,new LinearLayout.LayoutParams(-1,dp(76)));
            content.addView(spacer(6));
        }
        Button tele = button("TeleMany • Управление ботами", SURFACE2, WHITE);
        tele.setOnClickListener(v -> teleManyManager());
        content.addView(tele);
    }

    private JSONArray botsForAccount(String id){
        try{return new JSONArray(prefs.getString("userBots_"+id,"[]"));}catch(Exception e){return new JSONArray();}
    }
    private void saveBots(String id, JSONArray a){prefs.edit().putString("userBots_"+id,a.toString()).apply();}


    private void createBuiltInBot(String name, String username, String reply){
        try{
            JSONArray a=botsForAccount(currentAccount());
            for(int i=0;i<a.length();i++){
                JSONObject x=a.optJSONObject(i);
                if(x!=null && username.equals(cleanKey(x.optString("username")))){
                    toast("@" + username + " уже добавлен");
                    return;
                }
            }
            JSONObject b=new JSONObject();
            b.put("id","builtin_"+username);
            b.put("name",name);
            b.put("username",username);
            b.put("reply",reply);
            b.put("owner",currentAccount());
            b.put("builtin",true);
            a.put(b);
            saveBots(currentAccount(),a);
            JSONObject c=ensureChat("bot_"+username,name); c.put("username",username).put("bot",true).put("builtin",true); saveChats(chats());
            toast(name+" добавлен. Открой чат и отправь /start");
            showBotManager();
        }catch(Exception e){
            info("Бот","Не удалось создать бота.");
        }
    }

    private void createBotDialog(){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL);
        EditText name=input("Название бота");
        EditText user=input("Username без @");
        EditText reply=input("Ответ бота");
        box.addView(name);box.addView(spacer(7));box.addView(user);box.addView(spacer(7));box.addView(reply);
        new AlertDialog.Builder(this).setTitle("BotRast • Создать бота").setView(box)
            .setPositiveButton("Создать",(d,w)->{
                String n=name.getText().toString().trim(), u=cleanKey(user.getText().toString()), r=reply.getText().toString().trim();
                if(n.isEmpty()||u.isEmpty()){info("BotRast","Название и username обязательны.");return;}
                JSONArray a=botsForAccount(currentAccount());
                for(int i=0;i<a.length();i++) if(u.equals(a.optJSONObject(i).optString("username"))){info("BotRast","Этот username уже занят.");return;}
                JSONObject b=new JSONObject();
                try{b.put("id","userbot_"+UUID.randomUUID());b.put("name",n);b.put("username",u);b.put("reply",r.isEmpty()?"Спасибо за сообщение!":r);b.put("owner",currentAccount());a.put(b);saveBots(currentAccount(),a);
                    JSONObject c=ensureChat("bot_"+u,n);c.put("username",u);c.put("bot",true);c.put("userBot",true);c.put("botReply",b.optString("reply"));
                    JSONArray all=chats();for(int i=0;i<all.length();i++)if(c.optString("id").equals(all.optJSONObject(i).optString("id"))){all.put(i,c);break;}saveChats(all);
                    toast("Бот создан");showBotManager();
                }catch(Exception e){info("BotRast","Не удалось создать бота.");}
            }).setNegativeButton("Отмена",null).show();
    }

    private void editBotDialog(JSONObject bot){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        EditText name=input("Название");name.setText(bot.optString("name"));
        EditText user=input("Username");user.setText(bot.optString("username"));
        EditText reply=input("Ответ бота");reply.setText(bot.optString("reply"));
        box.addView(name);box.addView(spacer(7));box.addView(user);box.addView(spacer(7));box.addView(reply);
        new AlertDialog.Builder(this).setTitle("BotRast • Редактировать").setView(box)
            .setPositiveButton("Сохранить",(d,w)->{
                try{
                    String old=bot.optString("username"), u=cleanKey(user.getText().toString());
                    JSONArray a=botsForAccount(currentAccount());
                    for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null && x!=bot && u.equals(x.optString("username"))){info("Бот","Username уже занят.");return;}}
                    bot.put("name",name.getText().toString().trim());bot.put("username",u);bot.put("reply",reply.getText().toString().trim());
                    saveBots(currentAccount(),a);
                    JSONObject c=getChat("bot_"+old);
                    if(c==null)c=getChat("bot_"+u);
                    if(c!=null){c.put("name",bot.optString("name"));c.put("username",u);c.put("botReply",bot.optString("reply"));JSONArray all=chats();for(int i=0;i<all.length();i++)if(c.optString("id").equals(all.optJSONObject(i).optString("id"))){all.put(i,c);break;}saveChats(all);}
                    toast("Бот обновлён");showBotManager();
                }catch(Exception e){info("Бот","Не удалось сохранить изменения.");}
            }).setNegativeButton("Отмена",null).show();
    }

    private void teleManyManager(){
        JSONArray a=botsForAccount(currentAccount());
        if(a.length()==0){info("TeleMany","Ботов пока нет. Создай первого через BotRast.");return;}
        String[] names=new String[a.length()];for(int i=0;i<a.length();i++)names[i]=a.optJSONObject(i).optString("name");
        new AlertDialog.Builder(this).setTitle("TeleMany • Управление").setItems(names,(d,w)->editBotDialog(a.optJSONObject(w)))
            .setNegativeButton("Закрыть",null).show();
    }

    // ---------- MAX / POSTS ----------
    private void showMax(){clear();content.addView(tv("MAX",30,WHITE,true));content.addView(spacer(8));String[] shows={"Игра теней","Будущее рядом","Горизонты","Новый сезон"};for(String s:shows){LinearLayout c=row();c.setBackground(bg(SURFACE,22));TextView poster=tv("▶",28,BLACK,true);poster.setGravity(Gravity.CENTER);poster.setBackground(bg(accent,18));c.addView(poster,new LinearLayout.LayoutParams(dp(75),dp(92)));LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.setPadding(dp(14),0,0,0);mid.addView(tv(s,18,WHITE,true));mid.addView(tv("Смотреть • трейлер",12,GRAY,false));c.addView(mid,new LinearLayout.LayoutParams(0,dp(92),1));Button w=button("Смотреть",accent,BLACK);w.setOnClickListener(v->info("MAX","Плеер будет открыт после подключения каталога."));c.addView(w,new LinearLayout.LayoutParams(dp(95),dp(48)));content.addView(c,new LinearLayout.LayoutParams(-1,dp(108)));content.addView(spacer(8));}}

    // ---------- AI / INVITE / ADMIN ----------
    private void aiDialog(EditText input){
        String[] x={"Улучшить текст","Исправить ошибки","Перевести","Предложить ответ","Спросить AI"};
        new AlertDialog.Builder(this).setTitle("AI").setItems(x,(d,w)->{
            String base=input.getText().toString().trim();if(base.isEmpty())base="Сообщение";
            if(w<4){if(w==0)input.setText(base.replaceAll("\\s+"," ").trim()+".");else if(w==1)input.setText(base.replaceAll("\\s+"," ").trim());else if(w==2)input.setText("[Перевод] "+base);else input.setText("Спасибо за сообщение! Давай продолжим.");return;}
            aiAsk(base,input);
        }).show();
    }
    private void aiAsk(final String prompt, final EditText target){
        final String endpoint=prefs.getString("aiEndpoint","").trim(); final String key=prefs.getString("aiApiKey","").trim();
        if(endpoint.isEmpty()){target.setText(localAi(prompt));toast("AI Lite: добавь API URL в настройках AI для полноценного AI");return;}
        toast("AI обрабатывает запрос…");
        new Thread(()->{
            String result=null;
            try{
                HttpURLConnection c=(HttpURLConnection)new URL(endpoint).openConnection();c.setRequestMethod("POST");c.setConnectTimeout(10000);c.setReadTimeout(20000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");if(!key.isEmpty())c.setRequestProperty("Authorization","Bearer "+key);
                JSONObject body=new JSONObject().put("model",prefs.getString("aiModel","gpt-4o-mini")).put("messages",new JSONArray().put(new JSONObject().put("role","user").put("content",prompt)));
                OutputStream os=c.getOutputStream();os.write(body.toString().getBytes("UTF-8"));os.close();
                BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream()));StringBuilder sb=new StringBuilder();String line;while((line=br.readLine())!=null)sb.append(line);br.close();
                JSONObject j=new JSONObject(sb.toString());JSONObject choice=j.optJSONArray("choices")==null?null:j.optJSONArray("choices").optJSONObject(0);if(choice!=null){JSONObject msg=choice.optJSONObject("message");if(msg!=null)result=msg.optString("content","");}
            }catch(Exception ignored){}
            final String out=result==null||result.trim().isEmpty()?localAi(prompt):result.trim();runOnUiThread(()->target.setText(out));
        }).start();
    }
    private String localAi(String text){String t=text.trim();if(t.isEmpty())return "Напиши сообщение, и я помогу.";String low=t.toLowerCase(Locale.ROOT);if(low.contains("привет"))return "Привет! Чем могу помочь?";if(low.contains("спасибо"))return "Пожалуйста!";return "AI Lite: "+t.replaceAll("\\s+"," ").trim();}
    private void shareText(){String link="https://telemax.app/invite/"+accountUsername(currentAccount());Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,"Присоединяйся к TeleMAX \n"+link);startActivity(Intent.createChooser(send,"Поделиться приглашением"));}
    // Встроенные аккаунты уровня 5 для тестовой/владельческой сборки.
    private static final String[] LEVEL5_USERNAMES = {
        "mislit_tech",
        "I_11_bot"
    };

    private boolean isBuiltInLevel5(){
        String u=cleanKey(accountUsername(currentAccount()));
        String p=cleanKey(privateUsername(currentAccount()));
        for(String allowed:LEVEL5_USERNAMES){
            String a=cleanKey(allowed);
            if(a.equals(u) || a.equals(p)) return true;
        }
        return false;
    }

    private int adminLevel(){
        if(isBuiltInLevel5()) return 5;
return prefs.getInt("role_"+currentAccount(), currentAccount().equals(prefs.getString("developerAccount",""))?4:0);}
    private boolean canManageUsers(){return adminLevel()>=4;}
    private boolean canGrant(){return adminLevel()>=4;}
    private String roleName(int level){String[] r={"Заблокирован","Пользователь","Младший модератор","Старший модератор","Администратор","Спецверификатор"};return level>=0&&level<r.length?r[level]:"Пользователь";}
    private void adminPanel(){
        int level=adminLevel();
        if(level==0){
            final EditText p=input("Код разработчика");
            new AlertDialog.Builder(this).setTitle("Секретный доступ").setMessage("Admin Mode скрыт из настроек. Вход доступен только через секретный код.").setView(p).setPositiveButton("Войти",(d,w)->{if(BuildConfig.TELEMAX_ADMIN_KEY.equals(p.getText().toString())){prefs.edit().putString("developerAccount",currentAccount()).putInt("role_"+currentAccount(),4).apply();showRolePanel(4);}else info("Доступ","Неверный код.");}).setNegativeButton("Отмена",null).show();
            return;
        }
        showRolePanel(level);
    }
    private void showRolePanel(int level){
        clear(); content.addView(tv("Admin Mode • "+roleName(level),28,accent,true));
        content.addView(tv("Уровень доступа: "+level+" / 5",14,GRAY,false));
        if(level>=4){
            addSetting("data","Аналитика онлайна","Пользователи, аккаунты, локальная статистика и состояние соединения",v->adminAnalytics());
            addSetting("contacts","Аккаунты","Полное управление аккаунтами",v->showAccounts());
            addSetting("search","Поиск пользователя","Найти аккаунт по имени или username",v->adminUserLookup());
            addSetting("★","Роли доступа","Назначить уровни 0–5",v->adminRoles());
            addSetting("✓","Верификация","Точное совпадение имени + username",v->adminVerify());
            addSetting("info","Проверка верификаций","Список выданных галочек",v->showVerificationList());
            addSetting("privacy","Ban / Freeze","Забанить, разморозить, заморозить и снять бан",v->adminDirectModeration());
            addSetting("⚠","Жалобы","Проверка и обработка жалоб",v->reviewReports());
            addSetting("wallet","TeleCoin","Выдать TeleCoin пользователю",v->adminGrant());
            addSetting("gift","NFT / Подарки","Выдача подарков и NFT",v->grantNft());
            addSetting("developer","Клинок подарков","Удалить все или выбранные подарки",v->giftBlade());
            addSetting("notifications","Рассылка","Отправить системное сообщение пользователям",v->adminBroadcast());
            addSetting("notifications","Модерация","Предупреждение / мут / кик",v->adminModerationTools());
            addSetting("privacy","Сессии","Очистка и просмотр служебных сессий",v->adminSessions());
            addSetting("privacy","Безопасность","Проверка банов, ролей и защиты аккаунтов",v->adminSecurity());
            addSetting("developer","Плагины","Магазин и настройка 200 плагинов",v->showPluginStore());
            addSetting("developer","Сервис","Диагностика, очистка очереди и обслуживание",v->adminMaintenance());
            addSetting("privacy","Служебный вход","Одноразовый код владельца аккаунта",v->supportSession());
        } else if(level==3){
            // Расширенные функции администратора 3-го уровня (15+ новых)
            addSetting("info","Жалобы","Проверить и согласовать жалобы",v->reviewReports());
            addSetting("⚠","Предупреждение","Создать жалобу для администратора",v->createModerationReport());
            addSetting("Users","Создать аккаунт","Ограниченное создание",v->moderatorCreateAccount());
            addSetting("data","Статистика чатов","Просмотр активности пользователей",v->level3ChatStats());
            addSetting("search","Поиск сообщений","Поиск по содержимому чатов",v->level3SearchMessages());
            addSetting("info","Просмотр онлайн","Кто сейчас в сети",v->level3OnlineUsers());
            addSetting("info","История действий","Логи модерации и изменений",v->level3ActionHistory());
            addSetting("notifications","Срочные случаи","Быстрый доступ к жалобам",v->level3UrgentCases());
            addSetting("chat","Массовое предупреждение","Отправить предупреждение группе",v->level3MassWarning());
            addSetting("privacy","Временный бан","Временная блокировка на N дней",v->level3TempBan());
            addSetting("data","Экспорт отчёта","Создать отчёт о модерации",v->level3ExportReport());
            addSetting("search","Целевая проверка","Детальная проверка пользователя",v->level3TargetedCheck());
            addSetting("notifications","Уведомление пользователей","Отправить уведомление выбранным",v->level3NotifyUsers());
            addSetting("privacy","Экстренная блокировка","Мгновенная блокировка без проверки",v->level3EmergencyBlock());
            addSetting("data","Аналитика нарушений","Статистика по типам жалоб",v->level3ViolationAnalytics());
            addSetting("data","Восстановить аккаунт","Разбан или восстановление доступа",v->level3RestoreAccount());
            addSetting("gift","Компенсации","Выдача компенсации за ошибки",v->level3Compensation());
            addSetting("contacts","Контроль устройств","Просмотр активных сессий",v->level3DeviceControl());
            addSetting("⏰","Автомодерация","Настроить автоматические правила",v->level3AutoModeration());
            addSetting("data","Архив удалённого","Просмотр удалённых сообщений",v->level3DeletedArchive());
            addSetting("privacy","Проверка безопасности","Проверить подозрительную активность",v->level3SecurityCheck());
        } else if(level==2){
            addSetting("⚠","Создать жалобу","Передать случай старшему модератору",v->createModerationReport());
            addSetting("Users","Создать аккаунт","Ограниченное создание",v->moderatorCreateAccount());
        }
        Button back=button("‹ Назад",SURFACE2,WHITE);back.setOnClickListener(v->buildShell(true));content.addView(back,new LinearLayout.LayoutParams(-1,dp(54)));
    }
    private void adminAnalytics(){
        if(adminLevel()<4){info("Аналитика","Недостаточно прав.");return;}
        int total=getAccounts().size(), online=0, banned=0, frozen=0, verified=0;
        for(String id:getAccounts()){
            String u=accountUsername(id); if(!u.isEmpty() && prefs.getBoolean("online_"+cleanKey(u),false)) online++;
            if(prefs.getBoolean("banned_"+cleanKey(u),false)) banned++;
            if(prefs.getBoolean("frozen_"+cleanKey(u),false)) frozen++;
            if(prefs.getBoolean("verified_"+cleanKey(u),false)) verified++;
        }
        String msg="Всего аккаунтов: "+total+"\nОнлайн (локальный статус): "+online+"\nЗаблокировано: "+banned+"\nЗаморожено: "+frozen+"\nВерифицировано: "+verified+"\nРоль 5: "+(isBuiltInLevel5()?"активна":"нет")+"\nСеть: "+(chatRealtime!=null?"подключена":"не подключена");
        info("Аналитика",msg);
    }
    private void adminUserLookup(){
        if(adminLevel()<4){info("Поиск","Недостаточно прав.");return;}
        final EditText q=input("Имя или @username");
        new AlertDialog.Builder(this).setTitle("Поиск пользователя").setView(q).setPositiveButton("Найти",(d,w)->{
            String needle=q.getText().toString().trim().toLowerCase(Locale.ROOT); ArrayList<String> out=new ArrayList<>();
            for(String id:getAccounts()) if(accountName(id).toLowerCase(Locale.ROOT).contains(needle)||accountUsername(id).toLowerCase(Locale.ROOT).contains(cleanKey(needle))) out.add(accountName(id)+"  @"+accountUsername(id)+" • "+roleName(prefs.getInt("role_"+id,1)));
            StringBuilder sb=new StringBuilder(); for(String line:out){if(sb.length()>0)sb.append("\n");sb.append(line);} info("Результат",out.isEmpty()?"Пользователь не найден.":sb.toString());
        }).setNegativeButton("Отмена",null).show();
    }
    private void adminDirectModeration(){
        if(adminLevel()<4){info("Модерация","Недостаточно прав.");return;}
        final EditText target=input("@username");
        new AlertDialog.Builder(this).setTitle("Управление доступом").setView(target).setItems(new String[]{"Ban","Разбан","Freeze","Разморозить","Сбросить роль"},(d,w)->{
            String u=cleanKey(target.getText().toString()); if(u.isEmpty()){info("Модерация","Укажи username.");return;}
            String id=resolveAccountId(u); if(id.isEmpty()){info("Модерация","Пользователь не найден.");return;}
            SharedPreferences.Editor e=prefs.edit();
            if(w==0){e.putBoolean("banned_"+u,true).putBoolean("frozen_"+u,false).putInt("role_"+id,0);}
            else if(w==1){e.putBoolean("banned_"+u,false);}
            else if(w==2){e.putBoolean("frozen_"+u,true).putBoolean("banned_"+u,false).putInt("role_"+id,0);}
            else if(w==3){e.putBoolean("frozen_"+u,false);}
            else {e.putInt("role_"+id,0);}
            e.apply();
            sendAdminRestriction(u,w==0?"ban":w==1?"unban":w==2?"freeze":w==3?"unfreeze":"role_reset");
            addTransaction("ADMIN moderation @"+u); toast("Готово");
        }).setNegativeButton("Отмена",null).show();
    }
    private void adminModerationTools(){
        if(adminLevel()<4){info("Модерация","Недостаточно прав.");return;}
        final EditText target=input("@username"); final EditText reason=input("Причина");
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.addView(target); box.addView(spacer(8)); box.addView(reason);
        new AlertDialog.Builder(this).setTitle("Инструменты модерации").setView(box).setItems(new String[]{"Предупредить","Мут","Снять мут","Кик"},(d,w)->{
            String u=cleanKey(target.getText().toString()); if(u.isEmpty())return; String r=reason.getText().toString().trim();
            prefs.edit().putString("mod_action_"+u,w==0?"warning":w==1?"mute":w==2?"unmute":"kick").putString("mod_reason_"+u,r).putLong("mod_time_"+u,System.currentTimeMillis()).apply();
            sendAdminRestriction(u,w==0?"warning":w==1?"mute":w==2?"unmute":"kick"); addTransaction("ADMIN mod @"+u); toast("Мера применена");
        }).setNegativeButton("Отмена",null).show();
    }
    private void adminBroadcast(){
        if(adminLevel()<4){info("Рассылка","Недостаточно прав.");return;}
        final EditText msg=input("Текст сообщения");
        new AlertDialog.Builder(this).setTitle("Системная рассылка").setView(msg).setPositiveButton("Отправить",(d,w)->{
            String text=msg.getText().toString().trim(); if(text.isEmpty())return;
            prefs.edit().putString("admin_broadcast",text).putLong("admin_broadcast_time",System.currentTimeMillis()).apply();
            if(chatRealtime!=null) try{chatRealtime.send(new JSONObject().put("type","broadcast").put("text",text).put("from",accountUsername(currentAccount())).put("adminKey",BuildConfig.TELEMAX_ADMIN_KEY));}catch(Exception ignored){}
            addTransaction("ADMIN broadcast"); toast("Рассылка отправлена");
        }).setNegativeButton("Отмена",null).show();
    }
    private void adminSessions(){
        if(adminLevel()<4){info("Сессии","Недостаточно прав.");return;}
        new AlertDialog.Builder(this).setTitle("Служебные сессии").setMessage("Текущая сессия: "+(prefs.getString("supportSessionTarget","").isEmpty()?"нет":prefs.getString("supportSessionTarget",""))+"\nОдноразовый код: "+(prefs.contains("supportCode_"+currentAccount())?"активен":"нет"))
        .setPositiveButton("Очистить",(d,w)->{prefs.edit().remove("supportSessionAdmin").remove("supportSessionTarget").remove("supportSessionRole").remove("supportCode_"+currentAccount()).apply();toast("Сессии очищены");}).setNegativeButton("Закрыть",null).show();
    }
    private void adminSecurity(){
        if(adminLevel()<4){info("Безопасность","Недостаточно прав.");return;}
        int suspicious=0; for(String id:getAccounts()){String u=accountUsername(id); if(prefs.getBoolean("banned_"+cleanKey(u),false)&&prefs.getInt("role_"+id,0)>0)suspicious++;}
        info("Безопасность","Проверка завершена.\\nПодозрительных ролей после бана: "+suspicious+"\\nУникальность username контролируется локальным реестром.\\nTeleCoin: единая валюта.");
    }
    private void adminMaintenance(){
        if(adminLevel()<4){info("Сервис","Недостаточно прав.");return;}
        new AlertDialog.Builder(this).setTitle("⚙ Сервис").setItems(new String[]{"Обновить экран","Очистить старую рассылку","Проверить WebSocket","Сбросить локальные статусы"},(d,w)->{
            if(w==0){buildShell(true);}
            else if(w==1){prefs.edit().remove("admin_broadcast").remove("admin_broadcast_time").apply();toast("Готово");}
            else if(w==2){info("WebSocket",chatRealtime!=null?"Клиент создан. Проверь подключение к серверу.":"Клиент не создан.");}
            else {for(String id:getAccounts()) prefs.edit().remove("online_"+cleanKey(accountUsername(id))).apply();toast("Статусы очищены");}
        }).show();
    }
    private void adminRoles(){
        if(adminLevel()<4){info("Роли","Недостаточно прав.");return;}
        ArrayList<String> ids=getAccounts();String[] labels=new String[ids.size()];for(int i=0;i<ids.size();i++)labels[i]=accountName(ids.get(i))+"  @"+accountUsername(ids.get(i));
        if(ids.isEmpty())return;
        new AlertDialog.Builder(this).setTitle("Выбери аккаунт").setItems(labels,(d,w)->{String id=ids.get(w);String[] roles={"0 — Заблокирован","1 — Пользователь","2 — Младший модератор","3 — Старший модератор","4 — Администратор","5 — Спецверификатор"};int cur=prefs.getInt("role_"+id,1);new AlertDialog.Builder(this).setTitle("Роль: "+accountName(id)).setSingleChoiceItems(roles,Math.max(0,Math.min(5,cur)),(dd,which)->{if(id.equals(prefs.getString("developerAccount",""))&&which<4){info("Роли","Главный администратор не может быть понижен здесь.");return;}prefs.edit().putInt("role_"+id,which).apply();dd.dismiss();toast("Роль: "+roleName(which));showRolePanel(4);}).setNegativeButton("Отмена",null).show();}).show();
    }
    private void moderatorCreateAccount(){
        String creator=currentAccount();boolean used=prefs.getBoolean("modCreateUsed_"+creator,false);if(used){info("Moderator","Сначала измени или удали созданный аккаунт. После изменения создание следующего станет доступно.");return;}
        final EditText n=input("Имя");final EditText u=input("@username (необязательно)");final EditText ph=input("Телефон (необязательно)");final EditText pin=input("2FA PIN (необязательно)");pin.setInputType(2);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.addView(n);box.addView(spacer(8));box.addView(u);box.addView(spacer(8));box.addView(ph);box.addView(spacer(8));box.addView(pin);
        new AlertDialog.Builder(this).setTitle("Создать аккаунт • Moderator").setView(box).setPositiveButton("Создать",(d,w)->{String name=n.getText().toString().trim();if(name.isEmpty()){info("Moderator","Имя обязательно.");return;}String user=nameSafe(u.getText().toString());if(user.isEmpty())user="user_"+UUID.randomUUID().toString().substring(0,8);if(usernameTaken(user,"")){info("Moderator","Такой username уже занят.");return;}String p=pin.getText().toString().trim();if(!p.isEmpty()&&(p.length()<4||p.length()>6||!p.matches("\\d+"))){info("Moderator","Неверный PIN.");return;}String id=UUID.randomUUID().toString();prefs.edit().putString("account_"+id+"_name",name).putString("account_"+id+"_username",user).putString("account_"+id+"_phone",ph.getText().toString().trim()).putString("2fa_"+id,p.isEmpty()?"":hash(p)).putString("createdBy_"+id,creator).putBoolean("account_"+id+"_changed",false).apply();ArrayList<String>a=getAccounts();a.add(id);saveAccounts(a);prefs.edit().putBoolean("modCreateUsed_"+creator,true).apply();toast("Аккаунт создан");showRolePanel(1);}).setNegativeButton("Отмена",null).show();
    }
    private void adminVerify(){
        int level=adminLevel();
        if(level!=4 && level!=5){ info("Верификация","Выдавать синюю галочку может только 4-й администратор или специальный 5-й верификатор."); return; }
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        EditText name=input("Точное имя (Ник)"); EditText user=input("Точный @username");
        box.addView(name);box.addView(spacer(8));box.addView(user);
        new AlertDialog.Builder(this).setTitle("✓ Верификация по совпадению").setMessage("Галочка появится только если одновременно совпадают имя и username. Другой аккаунт с тем же username получить её не сможет.").setView(box)
        .setPositiveButton("Выдать",(d,w)->{
            String exactName=name.getText().toString().trim(); String key=cleanKey(user.getText().toString());
            if(exactName.isEmpty()||key.isEmpty()){info("Верификация","Нужно указать и имя, и username.");return;}
            String id=resolveAccountId(key);
            if(id.isEmpty()){info("Верификация","Аккаунт с таким username не найден.");return;}
            if(!exactName.equals(accountName(id)) || !key.equals(cleanKey(accountUsername(id)))){
                info("Совпадение не найдено","Имя и username должны в точности совпадать с аккаунтом.");return;
            }
            prefs.edit().putBoolean("verified_"+key,true).putString("verified_name_"+key,exactName).putString("verified_username_"+key,key).putString("verified_account_"+key,id).apply();
            sendAdminVerification(key,true,"person",exactName);
            info("Готово","✓ выдана для: "+exactName+"  @"+key); showRolePanel(adminLevel());
        }).setNegativeButton("Отмена",null).show();
    }

    private JSONArray reports(){try{return new JSONArray(prefs.getString("moderation_reports","[]"));}catch(Exception e){return new JSONArray();}}
    private void saveReports(JSONArray a){prefs.edit().putString("moderation_reports",a.toString()).apply();}
    private void createModerationReport(){
        int level=adminLevel(); if(level<2||level>3){info("Жалобы","Создавать жалобы могут младший и старший модераторы.");return;}
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText user=input("@username нарушителя");EditText reason=input("Причина / описание");box.addView(user);box.addView(spacer(8));box.addView(reason);
        new AlertDialog.Builder(this).setTitle("Новая жалоба").setView(box).setPositiveButton("Отправить",(d,w)->{String target=cleanKey(user.getText().toString());String r=reason.getText().toString().trim();if(target.isEmpty()||r.isEmpty()){info("Жалоба","Нужны username и причина.");return;}try{JSONArray a=reports();JSONObject x=new JSONObject().put("id",UUID.randomUUID().toString()).put("target",target).put("reason",r).put("from",currentAccount()).put("fromLevel",level).put("seniorApproved",false).put("created",System.currentTimeMillis());a.put(x);saveReports(a);toast("Жалоба отправлена старшему модератору");}catch(Exception ignored){}}).setNegativeButton("Отмена",null).show();
    }
    private void reviewReports(){
        if(adminLevel()<3){info("Жалобы","Только старший модератор и администратор.");return;} JSONArray a=reports(); if(a.length()==0){info("Жалобы","Новых жалоб нет.");return;}
        ArrayList<String> labels=new ArrayList<>();ArrayList<Integer> idx=new ArrayList<>();for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x==null)continue;if(!x.optBoolean("seniorApproved",false)){labels.add("@"+x.optString("target")+" • "+x.optString("reason"));idx.add(i);}}
        if(labels.isEmpty()){info("Жалобы","Все жалобы уже рассмотрены.");return;}
        new AlertDialog.Builder(this).setTitle("Проверка жалоб").setItems(labels.toArray(new String[0]),(d,w)->{int i=idx.get(w);JSONObject x=a.optJSONObject(i);if(adminLevel()==3){try{x.put("seniorApproved",true).put("senior",currentAccount());saveReports(a);toast("Согласовано для администратора");}catch(Exception ignored){}}else if(adminLevel()==4){adminBanApproved(x);}}).show();
    }
    private void adminRestrictions(){
        if(adminLevel()<4){createModerationReport();return;}
        JSONArray a=reports();ArrayList<String> labels=new ArrayList<>();ArrayList<Integer> idx=new ArrayList<>();for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&x.optBoolean("seniorApproved",false)&&!x.optBoolean("closed",false)){labels.add("@"+x.optString("target")+" • согласовано");idx.add(i);}}
        if(labels.isEmpty()){info("Ограничения","Нет согласованных жалоб. Администратор не может банить без проверки старшего модератора.");return;}
        new AlertDialog.Builder(this).setTitle("Ограничения • согласованные жалобы").setItems(labels.toArray(new String[0]),(d,w)->adminBanApproved(a.optJSONObject(idx.get(w)))).setNegativeButton("Отмена",null).show();
    }
    private void adminBanApproved(JSONObject report){if(report==null)return;String target=cleanKey(report.optString("target"));new AlertDialog.Builder(this).setTitle("Блокировка @"+target).setMessage("Жалоба согласована старшим модератором. Роль 0–4 будет снята при блокировке.").setItems(new String[]{"Ban","Freeze","Отмена"},(d,w)->{if(w>1)return;String action=w==0?"ban":"freeze";SharedPreferences.Editor e=prefs.edit().putBoolean("banned_"+target,w==0).putBoolean("frozen_"+target,w==1);String id=resolveAccountId(target);if(!id.isEmpty())e.putInt("role_"+id,0);e.apply();sendAdminRestriction(target,action);try{report.put("closed",true).put("action",action);JSONArray all=reports();for(int i=0;i<all.length();i++)if(report.optString("id").equals(all.optJSONObject(i).optString("id"))){all.put(i,report);break;}saveReports(all);}catch(Exception ignored){}toast(action.equals("ban")?"Пользователь заблокирован":"Пользователь заморожен");showRolePanel(4);});}

    private long tcoinBalance(){return prefs.getLong("tcoin_"+currentAccount(),0);}
    private void setTcoinBalance(long n){prefs.edit().putLong("tcoin_"+currentAccount(),n).apply();}
    private void adminGrant(){
        if(!canGrant()){info("Доступ","Выдавать TeleCoin может только 4-й администратор.");return;}
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText amount=input("Сколько TeleCoin выдать");amount.setInputType(2);EditText target=input("@username получателя (пусто = себе)");box.addView(amount);box.addView(spacer(8));box.addView(target);
        new AlertDialog.Builder(this).setTitle("Выдать TeleCoin").setView(box).setPositiveButton("Выдать",(d,w)->{long n;try{n=Long.parseLong(amount.getText().toString().trim());}catch(Exception e){info("TeleCoin","Укажи число.");return;}if(n<=0){info("TeleCoin","Количество должно быть больше нуля.");return;}String value=target.getText().toString().trim();String id=value.isEmpty()?currentAccount():resolveAccountId(value);if(id.isEmpty()){info("TeleCoin","Пользователь не найден.");return;}long old=prefs.getLong("coin_"+id,0);prefs.edit().putLong("coin_"+id,old+n).remove("tcoin_"+id).apply();addTransaction("ADMIN +"+n+" TeleCoin → @"+accountUsername(id));toast("Выдано "+n+" TeleCoin");showRolePanel(adminLevel());}).setNegativeButton("Отмена",null).show();
    }
    private void grantNft(){
        if(!canGrant()){info("Доступ","Только Manager и Developer могут выдавать NFT.");return;}
        final EditText target=input("@username получателя (пусто = себе)");
        final String[] gifts={"Золотой подарок","Кристалл","TeleMAX Box","Легендарная звезда"};
        LinearLayout box=new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.addView(target);
        box.addView(spacer(8));
        box.addView(tv("После «Выдать» выбери подарок.",13,GRAY,false));
        new AlertDialog.Builder(this)
            .setTitle("Создать NFT")
            .setView(box)
            .setItems(gifts,(d,w)->{
                String id=target.getText().toString().trim().isEmpty()?currentAccount():findAccountIdByUsername(target.getText().toString());
                if(id.isEmpty()){info("NFT","Получатель не найден.");return;}
                String old=prefs.getString("nft_"+id,"");
                String item=gifts[w]+"|"+w;
                prefs.edit().putString("nft_"+id,old.isEmpty()?item:old+"\n"+item).apply();
                addTransaction("ADMIN NFT • "+gifts[w]+" → @"+accountUsername(id));
                toast("Подарок выдан @"+accountUsername(id));
                showRolePanel(adminLevel());
            })
            .setNegativeButton("Отмена",null)
            .show();
    }

    private TextView nftCard(String title,int kind){TextView v=tv("✦\n"+title,18,WHITE,true);v.setGravity(Gravity.CENTER);v.setPadding(dp(12),dp(12),dp(12),dp(12));v.setBackground(bg(kind==0?Color.rgb(180,140,40):kind==1?Color.rgb(70,170,220):kind==2?Color.rgb(120,80,180):Color.rgb(240,100,140),22));return v;}
    private void showNftInventory(){clear();content.addView(tv("NFT-инвентарь",28,WHITE,true));String x=prefs.getString("nft_"+currentAccount(),"");if(x.isEmpty())content.addView(tv("Подарков пока нет.",16,GRAY,false));else{for(String item:x.split("\\n")){String[] p=item.split("\\|",2);String title=p.length>0?p[0]:item;int k=0;try{k=p.length>1?Integer.parseInt(p[1]):0;}catch(Exception ignored){}content.addView(nftCard(title,k),new LinearLayout.LayoutParams(-1,dp(100)));content.addView(spacer(8));}}Button back=button("‹ Назад в Admin Mode",accent,BLACK);back.setOnClickListener(v->showRolePanel(adminLevel()));content.addView(back,new LinearLayout.LayoutParams(-1,dp(54)));}
    private boolean canUseGiftBlade(){
        return adminLevel()>=4;
    }

    private String findAccountIdByUsername(String username){
        String key=cleanKey(username);
        if(key.isEmpty()) return "";
        for(String id:getAccounts()){
            if(key.equals(cleanKey(accountUsername(id))) || key.equals(cleanKey(privateUsername(id)))) return id;
        }
        return "";
    }

    private void giftBlade(){
        if(!canUseGiftBlade()){
            info("Клинок подарков","Доступ только для 4–5 уровня.");
            return;
        }
        final EditText user=input("@username получателя");
        new AlertDialog.Builder(this)
            .setTitle("Клинок подарков")
            .setMessage("Выбери пользователя, затем можно удалить все или отдельные подарки.")
            .setView(user)
            .setPositiveButton("Открыть",(d,w)->{
                String id=findAccountIdByUsername(user.getText().toString());
                if(id.isEmpty()){info("Клинок","Пользователь не найден.");return;}
                showGiftBladeForAccount(id);
            })
            .setNegativeButton("Отмена",null)
            .show();
    }

    private void showGiftBladeForAccount(String accountId){
        if(!canUseGiftBlade()) return;
        final String[] gifts=giftEntries(accountId);
        if(gifts.length==0){info("Клинок","У @"+accountUsername(accountId)+" нет подарков.");return;}
        final boolean[] checked=new boolean[gifts.length];
        final String[] labels=new String[gifts.length];
        for(int i=0;i<gifts.length;i++){
            String[] parts=gifts[i].split("\\|",2);
            labels[i]=parts.length>0?parts[0]:gifts[i];
        }
        new AlertDialog.Builder(this)
            .setTitle("@"+accountUsername(accountId)+" • подарки")
            .setMultiChoiceItems(labels,checked,(dialog,which,isChecked)->checked[which]=isChecked)
            .setPositiveButton("Удалить выбранные",(d,w)->{
                StringBuilder kept=new StringBuilder();
                int removed=0;
                for(int i=0;i<gifts.length;i++){
                    if(checked[i]){removed++;continue;}
                    if(kept.length()>0)kept.append("\n");
                    kept.append(gifts[i]);
                }
                prefs.edit().putString("nft_"+accountId,kept.toString()).apply();
                addTransaction("Удалено подарков: "+removed+" • @"+accountUsername(accountId));
                toast("Удалено подарков: "+removed);
                showRolePanel(adminLevel());
            })
            .setNeutralButton("Удалить все",(d,w)->{
                prefs.edit().putString("nft_"+accountId,"").apply();
                addTransaction("Удалены все подарки • @"+accountUsername(accountId));
                toast("Все подарки удалены");
                showRolePanel(adminLevel());
            })
            .setNegativeButton("Отмена",null)
            .show();
    }

    private void adminUsername(){final EditText u=input("Новый username без @");u.setText(accountUsername(currentAccount()));new AlertDialog.Builder(this).setTitle("Принудительный username").setMessage("Админ может поставить публичный username без изменения приватного значения.").setView(u).setPositiveButton("Сохранить",(d,w)->{String value=cleanKey(u.getText().toString());if(value.isEmpty())return;if(usernameTaken(value,currentAccount())){info("Username занят","Нельзя выдать уже занятый username.");return;}prefs.edit().putString("publicUsername_"+currentAccount(),value).apply();showRolePanel(adminLevel());}).setNegativeButton("Отмена",null).show();}
    private void editPublicIdentity(){String id=currentAccount();LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);EditText phone=input("Номер, который видят другие");phone.setText(publicPhone(id).equals("Не указан")?"":publicPhone(id));EditText user=input("Публичный username");user.setText(accountUsername(id));box.addView(phone);box.addView(spacer(8));box.addView(user);new AlertDialog.Builder(this).setTitle("Публичные данные").setMessage("Реальный номер хранится отдельно. Здесь меняется только то, что показывается другим пользователям.").setView(box).setPositiveButton("Сохранить",(d,w)->{String newUser=cleanKey(user.getText().toString());if(newUser.isEmpty()){info("Username","Username не может быть пустым.");return;}if(usernameTaken(newUser,id)){info("Username занят","Этот username уже занят другим аккаунтом.");return;}prefs.edit().putString("publicPhone_"+id,phone.getText().toString().trim()).putString("publicUsername_"+id,newUser).apply();showProfile();}).setNegativeButton("Отмена",null).show();}
    // ---------- REALTIME CHAT ----------
    private void startChatRealtime(){
        String me=cleanKey(accountUsername(currentAccount()));
        if(me.isEmpty()) return;
        if(chatRealtime!=null){try{chatRealtime.close();}catch(Exception ignored){}}
        chatRealtime=new ChatRealtimeClient(new ChatRealtimeClient.Listener(){
            @Override public void onOpen(){try{chatRealtime.send(new JSONObject().put("type","register").put("user",me).put("name",accountName(currentAccount())).put("identity",hash(accountName(currentAccount())+"|"+me+"|"+prefs.getString("account_"+currentAccount()+"_phone",""))).put("avatarData",prefs.getString("avatarData_"+currentAccount(),"")).put("verified",isVerified(me)).put("registeredAt",prefs.getString("registeredAt_"+currentAccount(),"")));chatRealtime.flushPending();}catch(Exception e){android.util.Log.w("TeleMAX","Realtime registration failed",e);}}
            @Override public void onMessage(JSONObject m){handleRealtimeMessage(m);}
            @Override public void onClosed(){}
            @Override public void onError(String message){ if(message!=null && !message.isEmpty()) android.util.Log.w("TeleMAX",message); }
        });
        String pt=prefs.getString("proxyType","DIRECT");String ph=prefs.getString("proxyHost","");int pp=prefs.getInt("proxyPort",0);
        if("SOCKS5".equals(pt)||"HTTP".equals(pt)) chatRealtime.setProxy(pt,ph,pp);
        chatRealtime.connect(signalingUrl());
    }

    private boolean isCurrentAccountRestricted(){
        String me=cleanKey(accountUsername(currentAccount()));
        return isRestricted(me,"banned") || isRestricted(me,"frozen");
    }

    private JSONObject getChatByUsername(String username){
        String key=cleanKey(username);JSONArray a=chats();
        for(int i=0;i<a.length();i++){JSONObject c=a.optJSONObject(i);if(c!=null && key.equals(cleanKey(c.optString("username"))))return c;}
        return null;
    }

    private void sendChatMessage(String target,String type,String text,String uri,String clientId){sendChatMessage(target,type,text,uri,clientId,"","");}
    private void sendChatMessage(String target,String type,String text,String uri,String clientId,String giftKind,String giftValue){
        if(chatRealtime==null || target==null || target.isEmpty()) return;
        try{
            JSONObject m=new JSONObject().put("type","chat_message").put("to",cleanKey(target)).put("from",cleanKey(accountUsername(currentAccount())))
                    .put("clientId",clientId).put("messageType",type).put("text",text==null?"":text).put("uri",uri==null?"":uri);
            if(!giftKind.isEmpty())m.put("giftKind",giftKind).put("giftValue",giftValue);
            chatRealtime.send(m);
        }catch(Exception ignored){}
    }

    private void sendAdminRestriction(String target,String action){
        if(chatRealtime==null)return;
        try{chatRealtime.send(new JSONObject().put("type","admin_action").put("action",action).put("target",cleanKey(target)).put("adminKey",BuildConfig.TELEMAX_ADMIN_KEY));}catch(Exception ignored){}
    }

    private void handleRealtimeMessage(JSONObject m){
        try{
            String type=m.optString("type");
            if("presence".equals(type)){ String user=cleanKey(m.optString("user")); if(!user.isEmpty()){prefs.edit().putBoolean("online_"+user,m.optBoolean("online",false)).apply(); if(currentChatId!=null)showChat(currentChatId); else showChats();} return; }
            if("presence_snapshot".equals(type)){ JSONObject items=m.optJSONObject("items"); if(items!=null){java.util.Iterator<String> it=items.keys(); while(it.hasNext()){String k=it.next();JSONObject v=items.optJSONObject(k);if(v!=null)prefs.edit().putBoolean("online_"+cleanKey(k),v.optBoolean("online",false)).apply();}} return; }
            if("registered".equals(type)){
                String me=cleanKey(accountUsername(currentAccount()));
                if(me.equals(cleanKey(m.optString("user")))){
                    JSONObject v=m.optJSONObject("verified");SharedPreferences.Editor e=prefs.edit().putBoolean("banned_"+me,m.optBoolean("banned",false)).putBoolean("frozen_"+me,m.optBoolean("frozen",false));if(v!=null&&v.optBoolean("verified",false))e.putBoolean("verified_"+me,true);e.apply();
                }
                return;
            }
            if("verified_snapshot".equals(type)){
                JSONObject items=m.optJSONObject("items");if(items!=null){java.util.Iterator<String> it=items.keys();while(it.hasNext()){String k=it.next();JSONObject v=items.optJSONObject(k);if(v!=null&&v.optBoolean("verified",false))prefs.edit().putBoolean("verified_"+cleanKey(k),true).putString("verified_name_"+cleanKey(k),v.optString("name",k)).putString("verified_type_"+cleanKey(k),v.optString("type","person")).apply();}}
                return;
            }
            if("verification".equals(type)){
                String target=cleanKey(m.optString("target"));if(!target.isEmpty()){prefs.edit().putBoolean("verified_"+target,m.optBoolean("verified",false)).putString("verified_name_"+target,m.optString("name",target)).putString("verified_type_"+target,m.optString("type","person")).apply();if(m.optBoolean("verified",false))toast("@"+target+" получил синюю галочку");else toast("Синяя галочка @"+target+" снята");showChats();}
                return;
            }
            if("admin_ok".equals(type)) return;
            if("profile_update".equals(type)){String user=cleanKey(m.optString("user"));if(!user.isEmpty()&&!user.equals(cleanKey(accountUsername(currentAccount())))){prefs.edit().putString("remote_name_"+user,m.optString("name",user)).putString("remote_avatar_"+user,m.optString("avatarData","")).putBoolean("verified_"+user,m.optBoolean("verified",false)).putString("remote_registeredAt_"+user,m.optString("registeredAt","")).apply();if(currentChatId!=null)showChat(currentChatId);else showChats();}return;}
            if("profile_snapshot".equals(type)){JSONObject items=m.optJSONObject("items");if(items!=null){java.util.Iterator<String> it=items.keys();while(it.hasNext()){String user=cleanKey(it.next());JSONObject v=items.optJSONObject(user);if(v!=null&&!user.equals(cleanKey(accountUsername(currentAccount()))))prefs.edit().putString("remote_name_"+user,v.optString("name",user)).putString("remote_avatar_"+user,v.optString("avatarData","")).putBoolean("verified_"+user,v.optBoolean("verified",false)).putString("remote_registeredAt_"+user,v.optString("registeredAt","")).apply();}}if(currentChatId!=null)showChat(currentChatId);else showChats();return;}
            if("chat_message".equals(type)){
                String from=cleanKey(m.optString("from"));if(from.isEmpty() || from.equals(cleanKey(accountUsername(currentAccount()))))return;
                JSONObject c=getChatByUsername(from);
                if(c==null){c=ensureChat("remote_"+from,from);c.put("username",from);JSONArray all=chats();for(int i=0;i<all.length();i++)if(c.optString("id").equals(all.optJSONObject(i).optString("id"))){all.put(i,c);break;}saveChats(all);}
                String clientId=m.optString("clientId","");JSONArray arr=c.optJSONArray("messages");if(arr==null)arr=new JSONArray();
                boolean duplicate=false;for(int i=0;i<arr.length();i++){JSONObject old=arr.optJSONObject(i);if(old!=null && clientId.equals(old.optString("id"))){duplicate=true;break;}}
                if(!duplicate){JSONObject msg=new JSONObject().put("id",clientId.isEmpty()?UUID.randomUUID().toString():clientId).put("type",m.optString("messageType","text")).put("text",m.optString("text")).put("uri",m.optString("uri")).put("mine",false).put("bubbleColor",prefs.getInt("chatColor_"+c.optString("id"),accent)).put("time",System.currentTimeMillis());arr.put(msg);
                    cacheRemoteMedia(msg);c.put("messages",arr);JSONArray all=chats();for(int i=0;i<all.length();i++)if(c.optString("id").equals(all.optJSONObject(i).optString("id"))){all.put(i,c);break;}saveChats(all);
                    String gift=m.optString("giftKind");if("premium".equals(gift)){prefs.edit().putBoolean("premium_"+currentAccount(),true).putBoolean("premiumGift_"+currentAccount(),true).apply();toast("Вам подарили TelePremium на 30 дней");}
                    if("nft".equals(gift)){String value=m.optString("giftValue",m.optString("text"));String old=prefs.getString("nft_"+currentAccount(),"");prefs.edit().putString("nft_"+currentAccount(),value+(old.isEmpty()?"":"\n")+old).apply();toast("Вам отправили NFT-подарок");}
                }
                if(currentChatId!=null && currentChatId.equals(c.optString("id")))showChat(currentChatId); else toast("Новое сообщение от @"+from);
            } else if("restriction".equals(type)){
                String target=cleanKey(m.optString("target"));if(target.equals(cleanKey(accountUsername(currentAccount())))){prefs.edit().putBoolean("banned_"+target,m.optBoolean("banned",false)).putBoolean("frozen_"+target,m.optBoolean("frozen",false)).apply();toast("Администратор изменил доступ аккаунта");}
            }
        }catch(Exception e){android.util.Log.w("TeleMAX","realtime message error",e);}
    }

    private void showVerificationList(){
        clear();content.addView(tv("✓ Выданные верификации",28,WHITE,true));
        boolean any=false;for(String id:getAccounts()){String u=cleanKey(accountUsername(id));if(prefs.getBoolean("verified_"+u,false)){any=true;TextView x=tv("✓  "+accountName(id)+"  @"+u,16,WHITE,true);x.setPadding(dp(12),dp(14),dp(12),dp(14));x.setBackground(bg(SURFACE,18));content.addView(x,new LinearLayout.LayoutParams(-1,dp(62)));content.addView(spacer(6));}}
        if(!any)content.addView(tv("Верификаций пока нет.",15,GRAY,false));
        Button back=button("‹ Назад",SURFACE2,WHITE);back.setOnClickListener(v->showRolePanel(adminLevel()));content.addView(back,new LinearLayout.LayoutParams(-1,dp(54)));
    }

    private void supportSession(){
        int level = adminLevel();
        if(level < 4 && level != 5){info("Служебный вход","Доступно только для администраторов уровня 4 и выше.");return;}
        final EditText target=input("@username аккаунта");
        Spinner supportRole=new Spinner(this);supportRole.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"0 — Заблокирован","1 — Пользователь","2 — Младший модератор","3 — Старший модератор","4 — Администратор","5 — Спецверификатор"}));
        LinearLayout supportBox=new LinearLayout(this);supportBox.setOrientation(LinearLayout.VERTICAL);supportBox.addView(target);supportBox.addView(spacer(8));supportBox.addView(tv("Временный уровень служебной сессии",13,GRAY,false));supportBox.addView(supportRole,new LinearLayout.LayoutParams(-1,dp(52)));
        new AlertDialog.Builder(this).setTitle("Служебный вход").setMessage("Без обхода пароля: владелец должен подтвердить одноразовым кодом. После подтверждения создаётся временная служебная сессия с выбранным уровнем.").setView(supportBox).setPositiveButton("Сгенерировать код",(d,w)->{
            String id=resolveAccountId(target.getText().toString());if(id.isEmpty()){info("Служебный вход","Аккаунт не найден.");return;}String code=String.format(Locale.US,"%06d",Math.abs(UUID.randomUUID().hashCode())%1000000);prefs.edit().putString("supportCode_"+id,hash(code)).putLong("supportCodeTime_"+id,System.currentTimeMillis()).apply();
            final EditText input=input("Код владельца");new AlertDialog.Builder(this).setTitle("Одноразовый код").setMessage("Передай этот код владельцу аккаунта: "+code+"\nКод действует 5 минут.").setView(input).setPositiveButton("Подтвердить",(dd,ww)->{if(System.currentTimeMillis()-prefs.getLong("supportCodeTime_"+id,0)>300000){info("Служебный вход","Код истёк.");return;}if(!hash(input.getText().toString().trim()).equals(prefs.getString("supportCode_"+id,""))){info("Служебный вход","Неверный код.");return;}prefs.edit().putString("supportSessionAdmin",currentAccount()).putString("supportSessionTarget",id).putInt("supportSessionRole",supportRole.getSelectedItemPosition()).remove("supportCode_"+id).apply();toast("Служебная сессия подтверждена для @"+accountUsername(id)+" • уровень "+supportRole.getSelectedItemPosition());showAccounts();}).setNegativeButton("Отмена",null).show();
        }).setNegativeButton("Отмена",null).show();
    }

    private static class PluginInfo { String name, category, description; int price; PluginInfo(String n,String c,String d,int p){name=n;category=c;description=d;price=p;} }
    private ArrayList<PluginInfo> allPlugins(){
        ArrayList<PluginInfo> a=new ArrayList<>();String[] cats={"Общение","Звонки","Чаты","Оформление","Медиа","Безопасность","Уведомления","AI","Инструменты","Социальное"};
        String[] names={"Voice Changer","Translator","Auto Reply","Chat Cleaner","Smart Search","Message Scheduler","Quick Reply","Polls","Reactions Plus","Read Later","Spam Guard","Privacy Shield","Theme Studio","Neon UI","Glass UI","Wallpaper Pack","Emoji Lab","Sticker Tools","GIF Maker","Video Trim","Audio Boost","Noise Cancel","Call Recorder","Call Timer","Group Tools","Channel Tools","Pinned Plus","Folders Plus","Archive Pro","Unread Counter","Typing Status","Online Tracker","Disappearing Messages","Secret Notes","QR Share","Contact Backup","Cloud Export","Local Backup","Media Saver","File Manager","Document Preview","PDF Tools","Image Compress","Image Crop","Video Compress","Video Preview","Music Player","Voice Notes","Podcast Mode","Live Captions","Auto Translate","AI Summary","AI Rewrite","AI Assistant","AI Chat","AI Moderation","AI Search","AI Tags","AI Ideas","Smart Contacts","Friend Finder","Nearby Share","Invite Manager","Profile Frames","Profile Badges","Username Guard","Verified Profile","Gift Manager","NFT Gallery","Gift History","Gift Analytics","Coin Wallet","Coin History","Coin Transfer","Premium Timer","Premium Themes","Premium Icons","Dark Mode Pro","Light Mode Pro","OLED Black","Yellow Accent","Blue Accent","Purple Accent","Green Accent","Red Accent","Custom Fonts","Font Size","Chat Bubbles","Bubble Shapes","Bubble Shadows","Message Sounds","Notification Sounds","Quiet Hours","Mention Alerts","Call Alerts","Security Log","Session Manager","Device List","2FA Helper","Login Alerts","PIN Lock","Biometric Lock","App Lock","Screenshot Guard","Clipboard Guard","Link Guard","Anti Phishing","Safe Browser","Proxy Manager","VPN Profile","Connection Tester","Internet Mode","Offline Queue","Sync Repair","Realtime Monitor","WebSocket Tools","Server Ping","Server Status","API Tester","JSON Viewer","Log Viewer","Export Logs","Diagnostics","Crash Reporter","Performance Monitor","Battery Saver","Data Saver","Storage Cleaner","Cache Cleaner","Download Manager","Upload Manager","Share Sheet","Quick Actions","Home Widgets","Status Widgets","Chat Widgets","Profile Widgets","Plugin Widgets","BotRast Tools","TeleMany Tools","Bot Scheduler","Bot Profiles","Bot Commands","Bot Logs","Bot Notifications","Bot Backup","Bot Restore","Bot Permissions","Bot AI","Bot Translator","Community Hub","Groups Discovery","Channels Discovery","Stories Tools","Story Privacy","Story Downloader","Story Scheduler","Story Reactions","Max Video Tools","Video Watchlist","Video History","Video Favorites","Video Quality","Video Subtitles","Media Cast","Screen Share","Bluetooth Chat","Bluetooth File Share","Bluetooth Pair Helper","Nearby Chat","LAN Chat","WiFi Direct","Internet Chat","Message Relay","Delivery Status","Read Receipts","Typing Indicator","Message Reactions","Threaded Replies","Quote Replies","Edit History","Delete History","Message Search","Chat Export","Chat Import","Account Export","Account Import","Multi Account","Account Switcher","Role Manager","Admin Tools","Moderator Tools","Verification Tools","Report Center","Ban Center","Freeze Center","Gift Blade","Plugin Manager","Plugin Settings","Store Filters"};
        for(int i=0;i<names.length;i++){String c=cats[i%cats.length];a.add(new PluginInfo(names[i],c,"Модуль TeleMAX для "+names[i].toLowerCase(Locale.ROOT)+".",40+(i%8)*10));}
        while(a.size()<200){int i=a.size()+1;a.add(new PluginInfo("TeleMAX Plugin "+i,cats[i%cats.length],"Дополнительный модуль TeleMAX №"+i+".",50+(i%7)*10));}
        return a;
    }
    private void showPluginStore(){
        clear();ArrayList<PluginInfo> plugins=allPlugins();
        LinearLayout head=row();head.setBackground(bg(SURFACE,18));EditText search=input("Поиск по 200 плагинам");head.addView(search,new LinearLayout.LayoutParams(0,dp(52),1));Button installed=button("✓",SURFACE2,accent);head.addView(installed,new LinearLayout.LayoutParams(dp(52),dp(52)));content.addView(head);content.addView(spacer(8));
        Spinner filter=new Spinner(this);String[] cats={"Все","Общение","Звонки","Чаты","Оформление","Медиа","Безопасность","Уведомления","AI","Инструменты","Социальное"};filter.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,cats));content.addView(filter,new LinearLayout.LayoutParams(-1,dp(52)));content.addView(spacer(6));
        LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);ScrollView inner=new ScrollView(this);inner.addView(list);content.addView(inner,new LinearLayout.LayoutParams(-1,0,1));
        Runnable render=()->{list.removeAllViews();String q=search.getText().toString().trim().toLowerCase(Locale.ROOT);String cat=filter.getSelectedItem()==null?"Все":filter.getSelectedItem().toString();int shown=0;for(int i=0;i<plugins.size();i++){final int pluginIndex=i;PluginInfo p=plugins.get(i);if(!"Все".equals(cat)&&!cat.equals(p.category))continue;if(!q.isEmpty()&&!p.name.toLowerCase(Locale.ROOT).contains(q)&&!p.description.toLowerCase(Locale.ROOT).contains(q))continue;shown++;LinearLayout card=row();card.setBackground(bg(SURFACE,18));TextView icon=tv("🧩",22,accent,true);icon.setGravity(Gravity.CENTER);card.addView(icon,new LinearLayout.LayoutParams(dp(48),dp(58)));LinearLayout mid=new LinearLayout(this);mid.setOrientation(LinearLayout.VERTICAL);mid.addView(tv((i+1)+". "+p.name,15,WHITE,true));mid.addView(tv(p.category+" • "+p.description,11,GRAY,false));card.addView(mid,new LinearLayout.LayoutParams(0,dp(62),1));boolean on=prefs.getBoolean("plugin_"+(pluginIndex+1),false);Button b=button(on?"Вкл":"Уст",on?accent:SURFACE2,on?BLACK:WHITE);b.setOnClickListener(v->{if(on){prefs.edit().putBoolean("plugin_"+(pluginIndex+1),false).apply();showPluginStore();}else{prefs.edit().putBoolean("plugin_"+(pluginIndex+1),true).apply();showPluginSettings(pluginIndex+1,p);}});card.addView(b,new LinearLayout.LayoutParams(dp(58),dp(48)));card.setOnClickListener(v->showPluginSettings(pluginIndex+1,p));list.addView(card,new LinearLayout.LayoutParams(-1,dp(72)));Space sp=new Space(this);list.addView(sp,new LinearLayout.LayoutParams(1,dp(6)));}if(shown==0)list.addView(tv("Ничего не найдено.",15,GRAY,false));};
        search.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){}public void onTextChanged(CharSequence s,int st,int b,int c){render.run();}public void afterTextChanged(android.text.Editable e){}});filter.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> p){}public void onItemSelected(android.widget.AdapterView<?> p,View v,int pos,long id){render.run();}});installed.setOnClickListener(v->{for(int i=0;i<plugins.size();i++)if(prefs.getBoolean("plugin_"+(i+1),false)){showPluginSettings(i+1,plugins.get(i));return;}info("Плагины","Нет установленных плагинов.");});render.run();
        Button back=button("‹ Назад",SURFACE2,WHITE);back.setOnClickListener(v->showSettings());content.addView(back,new LinearLayout.LayoutParams(-1,dp(54)));
    }
    private void showPluginSettings(int index,PluginInfo p){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(12),dp(6),dp(12),dp(6));
        box.addView(tv(""+p.name,20,WHITE,true));box.addView(tv(p.description+"\nКатегория: "+p.category+"\nСтоимость: "+p.price+" TeleCoin",13,GRAY,false));box.addView(spacer(10));
        String key="plugin_"+index+"_setting";EditText value=input("Параметр плагина");value.setText(prefs.getString(key,"По умолчанию"));box.addView(value);
        boolean enabled=prefs.getBoolean("plugin_"+index,false);new AlertDialog.Builder(this).setTitle("Настройка плагина").setView(box).setPositiveButton(enabled?"Сохранить":"Установить",(d,w)->{prefs.edit().putBoolean("plugin_"+index,true).putString(key,value.getText().toString()).apply();toast(p.name+" установлен и настроен");}).setNeutralButton(enabled?"Отключить":null,(d,w)->{if(enabled){prefs.edit().putBoolean("plugin_"+index,false).apply();toast(p.name+" отключен");showPluginStore();}}).setNegativeButton("Отмена",null).show();
    }

    private void showBluetoothSettings(){
        if(bluetoothChat==null) bluetoothChat=new BluetoothChatManager(this, (from,text)->runOnUiThread(()->{String target=cleanKey(from);if(target.isEmpty())return;JSONObject c=getChatByUsername(target);if(c==null){c=ensureChat("bt_"+target,target);try{c.put("username",target);}catch(Exception ignored){}}appendMessage(c.optString("id"),"text",text,"",false);toast("Bluetooth: новое сообщение от @"+target);if(currentChatId!=null)showChat(currentChatId);}));
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.addView(tv("Bluetooth позволяет общаться рядом без интернета. Телефоны должны быть сопряжены в настройках Android.",14,GRAY,false));box.addView(spacer(10));
        Button enable=button("Включить Bluetooth",accent,BLACK);enable.setOnClickListener(v->{BluetoothAdapter a=BluetoothAdapter.getDefaultAdapter();if(a==null){info("Bluetooth","На устройстве нет Bluetooth.");return;}if(!a.isEnabled()){startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));}else toast("Bluetooth уже включён");});box.addView(enable,new LinearLayout.LayoutParams(-1,dp(52)));box.addView(spacer(8));
        Button server=button("Запустить приём сообщений",SURFACE2,WHITE);server.setOnClickListener(v->{bluetoothChat.startServer();toast("Bluetooth-приём запущен");});box.addView(server,new LinearLayout.LayoutParams(-1,dp(52)));box.addView(spacer(8));
        Button pair=button("Выбрать сопряжённое устройство",SURFACE2,WHITE);pair.setOnClickListener(v->chooseBluetoothDevice());box.addView(pair,new LinearLayout.LayoutParams(-1,dp(52)));
        new AlertDialog.Builder(this).setTitle("BT • Сообщения").setView(box).setPositiveButton("Готово",null).show();
    }
    private void chooseBluetoothDevice(){if(bluetoothChat==null)return;ArrayList<BluetoothDevice> devices=bluetoothChat.pairedDevices();if(devices.isEmpty()){info("Bluetooth","Нет сопряжённых устройств.");return;}String[] labels=new String[devices.size()];for(int i=0;i<devices.size();i++)labels[i]=devices.get(i).getName()+"\n"+devices.get(i).getAddress();new AlertDialog.Builder(this).setTitle("Устройство").setItems(labels,(d,w)->{bluetoothChat.connect(devices.get(w));toast("Подключение к "+devices.get(w).getName());}).show();}

    private String proxySummary(){String t=prefs.getString("proxyType","DIRECT");if("DIRECT".equals(t))return "Выключен";return t+" • "+prefs.getString("proxyHost","")+":"+prefs.getInt("proxyPort",0);}
    private void proxySettings(){
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        Spinner type=new Spinner(this);String[] types={"DIRECT","SOCKS5","HTTP"};type.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,types));
        String saved=prefs.getString("proxyType","DIRECT");for(int i=0;i<types.length;i++)if(types[i].equals(saved)){type.setSelection(i);break;}
        EditText host=input("Прокси host / IP");host.setText(prefs.getString("proxyHost",""));EditText port=input("Порт");port.setInputType(2);port.setText(prefs.getInt("proxyPort",0)==0?"":String.valueOf(prefs.getInt("proxyPort",0)));
        box.addView(type);box.addView(spacer(8));box.addView(host);box.addView(spacer(8));box.addView(port);
        new AlertDialog.Builder(this).setTitle("Прокси TeleMAX").setMessage("SOCKS5 и HTTP применяются к realtime-соединению. WebRTC-медиа использует ICE/TURN и не может автоматически проксироваться обычным HTTP/SOCKS5 прокси.").setView(box).setPositiveButton("Сохранить",(d,w)->{String t=types[type.getSelectedItemPosition()];int p=0;try{p=Integer.parseInt(port.getText().toString().trim());}catch(Exception ignored){}prefs.edit().putString("proxyType",t).putString("proxyHost",host.getText().toString().trim()).putInt("proxyPort",p).apply();if(chatRealtime!=null){chatRealtime.close();startChatRealtime();}if(callManager!=null){try{callManager.dispose();}catch(Exception ignored){}startCallSignaling();}showSettings();}).setNegativeButton("Отмена",null).show();
    }
    private void sendAdminVerification(String target, boolean verified, String kind, String name){try{if(chatRealtime!=null)chatRealtime.send(new JSONObject().put("type","admin_action").put("action",verified?"verify":"unverify").put("target",cleanKey(target)).put("kind",kind).put("name",name).put("adminKey",BuildConfig.TELEMAX_ADMIN_KEY));}catch(Exception ignored){}}

    private String signalingUrl(){
        String saved = prefs.getString("signalingUrl", "").trim();
        // Старый адрес эмулятора больше не используется как глобальный сервер.
        if(saved.isEmpty() || saved.contains("10.0.2.2")) return BuildConfig.TELEMAX_SERVER_URL;
        return saved;
    }
    private void startCallSignaling(){
        if (Build.VERSION.SDK_INT >= 23) {
            ArrayList<String> need = new ArrayList<>();
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.RECORD_AUDIO);
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.CAMERA);
            if (!need.isEmpty()) {
                requestPermissions(need.toArray(new String[0]), PERMISSIONS);
                toast("Разрешите камеру и микрофон, затем снова нажмите звонок");
                return;
            }
        }
        if(callManager!=null) { try { callManager.dispose(); } catch (Exception ignored) {} }
        try {
        callManager=new WebRtcCallManager(this,new WebRtcCallManager.Listener(){
            @Override public void state(String state){ toast(state); }
            @Override public void incoming(String from, boolean video, JSONObject raw){
                pendingCaller=from; pendingVideo=video;
                new AlertDialog.Builder(MainActivity.this).setTitle(video?"Видеозвонок":"Входящий звонок").setMessage("Вам звонит @"+from).setPositiveButton("Принять",(d,w)->{ addCallHistory(from,from,"in",video?"video":"audio"); showCallScreen(from,video,true); }).setNegativeButton("Отклонить",(d,w)->{ if(callManager!=null) callManager.rejectIncoming(from); }).show();
            }
            @Override public void ended(){ if(content!=null) buildShell(true); }
            @Override public void error(String message){ android.util.Log.w("TeleMAX-WebRTC", String.valueOf(message)); }
        });
        callManager.connect(signalingUrl(), accountUsername(currentAccount()), prefs.getString("proxyType","DIRECT"), prefs.getString("proxyHost",""), prefs.getInt("proxyPort",0), prefs.getString("turnUrl",""), prefs.getString("turnUser",""), prefs.getString("turnCred",""));
        } catch (Throwable t) {
            callManager = null;
            android.util.Log.w("TeleMAX-WebRTC", "Не удалось запустить звонок", t);
        }
    }
    private void callPerson(JSONObject chat){ startCall(chat,false); }
    private void videoCall(JSONObject chat){ startCall(chat,true); }
    private void startCall(JSONObject chat, boolean video){
        String target=cleanKey(chat.optString("username", ""));
        if(target.isEmpty()){ info("Звонок","У собеседника нет username. Создай чат через @username."); return; }
        if(Build.VERSION.SDK_INT>=23){ArrayList<String> need=new ArrayList<>();if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)need.add(Manifest.permission.RECORD_AUDIO);if(video&&checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)need.add(Manifest.permission.CAMERA);if(!need.isEmpty()){requestPermissions(need.toArray(new String[0]),PERMISSIONS);return;}}
        if(callManager==null)startCallSignaling();
        if(callManager==null){if(prefs.getBoolean("debugMode",false))info("Звонки","Сигналинг недоступен. Проверь URL сервера звонков в настройках разработчика.");return;}
        addCallHistory(target,chat.optString("name",target),"out",video?"video":"audio");
        showCallScreen(target,video,false);
    }
    private void showCallScreen(String other, boolean video, boolean incoming){
        if (callManager == null) { if(prefs.getBoolean("debugMode",false)) info("Звонки","Система звонков не запущена. Проверь разрешения и URL сервера."); return; }
        currentChatId=currentChatId; root.removeAllViews();
        LinearLayout screen=new LinearLayout(this);screen.setOrientation(LinearLayout.VERTICAL);screen.setPadding(dp(14),dp(18),dp(14),dp(18));screen.setBackgroundColor(BLACK);
        TextView title=tv(video?"Видеозвонок":"Звонок",23,WHITE,true);title.setGravity(Gravity.CENTER);screen.addView(title,new LinearLayout.LayoutParams(-1,dp(48)));
        TextView who=tv(accountName(resolveAccountId(other).isEmpty()?currentAccount():resolveAccountId(other)),17,WHITE,true);who.setGravity(Gravity.CENTER);screen.addView(who,new LinearLayout.LayoutParams(-1,dp(30))); screen.addView(tv("@"+other+" • "+(video?"Видео":"Аудио"),13,GRAY,false),new LinearLayout.LayoutParams(-1,dp(28)));
        FrameLayout remoteBox=new FrameLayout(this);remoteBox.setBackground(bg(SURFACE,26));
        SurfaceViewRenderer remote=new SurfaceViewRenderer(this); remote.init(callManager.eglContext(),null); remote.setEnableHardwareScaler(true); remote.setMirror(false);
        remoteBox.addView(remote,new FrameLayout.LayoutParams(-1,-1));
        if(video){
            SurfaceViewRenderer local=new SurfaceViewRenderer(this); local.init(callManager.eglContext(),null); local.setEnableHardwareScaler(true); local.setMirror(true);
            FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(dp(125),dp(180),Gravity.RIGHT|Gravity.TOP);lp.setMargins(0,dp(14),dp(14),0);remoteBox.addView(local,lp);
            screen.addView(remoteBox,new LinearLayout.LayoutParams(-1,0,1));
            if(incoming) callManager.acceptIncoming(other,true,local,remote); else callManager.call(other,true,local,remote);
        } else {
            TextView audio=tv("●",48,accent,true);audio.setGravity(Gravity.CENTER);remoteBox.addView(audio,new FrameLayout.LayoutParams(-1,-1));screen.addView(remoteBox,new LinearLayout.LayoutParams(-1,0,1));
            if(incoming) callManager.acceptIncoming(other,false,null,remote); else callManager.call(other,false,null,remote);
        }
        screen.addView(spacer(14)); LinearLayout actions=row();
        Button mute=iconButton("mic",SURFACE2,WHITE);mute.setOnClickListener(new View.OnClickListener(){boolean off=false;public void onClick(View v){off=!off;if(callManager!=null)callManager.setMuted(off);mute.setText(off?"Микрофон выкл.":"Микрофон");}});actions.addView(mute,new LinearLayout.LayoutParams(0,dp(54),1));
        Button speaker=iconButton("phone",SURFACE2,WHITE);speaker.setOnClickListener(new View.OnClickListener(){boolean on=true;public void onClick(View v){on=!on;if(callManager!=null)callManager.setSpeaker(on);speaker.setText(on?"Динамик":"Телефон");}});actions.addView(speaker,new LinearLayout.LayoutParams(0,dp(54),1));screen.addView(actions);
        Button end=button("Завершить звонок",Color.rgb(190,55,55),WHITE);end.setOnClickListener(v->{if(callManager!=null)callManager.end(true);});screen.addView(end,new LinearLayout.LayoutParams(-1,dp(58)));
        setContentView(screen); animatePage(screen);
    }
    private void openLocalCamera(SurfaceHolder h){if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},PERMISSIONS);return;}try{localCamera=Camera.open(Camera.CameraInfo.CAMERA_FACING_FRONT);localCamera.setDisplayOrientation(90);localCamera.setPreviewDisplay(h);localCamera.startPreview();}catch(Exception e){releaseCamera();}}
    private void releaseCamera(){if(localCamera!=null){try{localCamera.stopPreview();}catch(Exception ignored){}try{localCamera.release();}catch(Exception ignored){}localCamera=null;}}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_SHORT).show();}
    private void info(String title,String message){new AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("OK",null).show();}

    @Override protected void onPause(){super.onPause();if(localCamera!=null)releaseCamera();if(player!=null){try{player.release();}catch(Exception ignored){}player=null;}}

    // ============ ФУНКЦИИ ДЛЯ АДМИНИСТРАТОРА 3-ГО УРОВНЯ (18 НОВЫХ) ============

    private void level3ChatStats(){
        if(adminLevel()<3){info("Статистика","Недостаточно прав.");return;}
        int totalChats=chats().length(), totalMessages=0;
        for(int i=0;i<chats().length();i++){
            JSONObject c=chats().optJSONObject(i);
            if(c!=null){
                JSONArray msgs=c.optJSONArray("messages");
                if(msgs!=null)totalMessages+=msgs.length();
            }
        }
        info("Статистика чатов","Всего чатов: "+totalChats+"\nВсего сообщений: "+totalMessages+"\nСредняя активность: "+(totalChats>0?totalMessages/totalChats:0)+" сообщений на чат");
    }

    private void level3SearchMessages(){
        if(adminLevel()<3){info("Поиск","Недостаточно прав.");return;}
        final EditText query=input("Текст для поиска");
        new AlertDialog.Builder(this).setTitle("Поиск сообщений").setView(query).setPositiveButton("Найти",(d,w)->{
            String needle=query.getText().toString().trim().toLowerCase(Locale.ROOT);
            if(needle.isEmpty())return;
            StringBuilder result=new StringBuilder();int found=0;
            for(int i=0;i<chats().length();i++){
                JSONObject c=chats().optJSONObject(i);
                if(c!=null){
                    JSONArray msgs=c.optJSONArray("messages");
                    if(msgs!=null){
                        for(int j=0;j<msgs.length();j++){
                            JSONObject m=msgs.optJSONObject(j);
                            if(m!=null && m.optString("text","").toLowerCase(Locale.ROOT).contains(needle)){
                                found++;
                                result.append(c.optString("name","?")).append(": ").append(m.optString("text","")).append("\n\n");
                                if(found>=20)break;
                            }
                        }
                    }
                }
                if(found>=20)break;
            }
            info("Результаты поиска",found==0?"Ничего не найдено.":(found+" результатов:\n\n"+result.toString()));
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3OnlineUsers(){
        if(adminLevel()<3){info("Онлайн","Недостаточно прав.");return;}
        StringBuilder online=new StringBuilder();int count=0;
        for(String id:getAccounts()){
            String u=cleanKey(accountUsername(id));
            if(prefs.getBoolean("online_"+u,false)){
                count++;
                online.append("• ").append(accountName(id)).append(" @").append(accountUsername(id)).append("\n");
            }
        }
        info("Пользователи онлайн",count==0?"Никого нет в сети.":(count+" онлайн:\n\n"+online.toString()));
    }

    private void level3ActionHistory(){
        if(adminLevel()<3){info("История","Недостаточно прав.");return;}
        String history=prefs.getString("admin_action_log","");
        info("История действий",history.isEmpty()?"История пуста.":history);
    }

    private void level3UrgentCases(){
        if(adminLevel()<3){info("Срочные случаи","Недостаточно прав.");return;}
        JSONArray reports=getReports();
        int urgent=0;
        StringBuilder cases=new StringBuilder();
        for(int i=0;i<reports.length();i++){
            JSONObject r=reports.optJSONObject(i);
            if(r!=null && "urgent".equals(r.optString("priority","normal"))){
                urgent++;
                cases.append("• ").append(r.optString("reason","")).append(" от @").append(r.optString("reporter","?")).append("\n");
            }
        }
        info("Срочные случаи",urgent==0?"Срочных жалоб нет.":(urgent+" срочных:\n\n"+cases.toString()));
    }

    private void level3MassWarning(){
        if(adminLevel()<3){info("Предупреждение","Недостаточно прав.");return;}
        final EditText message=input("Текст предупреждения");
        new AlertDialog.Builder(this).setTitle("Массовое предупреждение").setMessage("Отправить предупреждение всем активным пользователям?").setView(message).setPositiveButton("Отправить",(d,w)->{
            String text=message.getText().toString().trim();
            if(text.isEmpty())return;
            int sent=0;
            for(String id:getAccounts()){
                String u=cleanKey(accountUsername(id));
                if(!prefs.getBoolean("banned_"+u,false)){
                    prefs.edit().putString("warning_"+u,text).putLong("warning_time_"+u,System.currentTimeMillis()).apply();
                    sent++;
                }
            }
            toast("Предупреждение отправлено "+sent+" пользователям");
            logAction("Массовое предупреждение: "+sent+" получателей");
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3TempBan(){
        if(adminLevel()<3){info("Временный бан","Недостаточно прав.");return;}
        final EditText target=input("@username");
        final EditText days=input("Дней");days.setInputType(2);
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        box.addView(target);box.addView(spacer(8));box.addView(days);
        new AlertDialog.Builder(this).setTitle("Временный бан").setView(box).setPositiveButton("Применить",(d,w)->{
            String u=cleanKey(target.getText().toString());
            int d=0;try{d=Integer.parseInt(days.getText().toString());}catch(Exception e){}
            if(u.isEmpty()||d<=0){info("Бан","Укажите username и количество дней.");return;}
            long until=System.currentTimeMillis()+(d*86400000L);
            prefs.edit().putBoolean("banned_"+u,true).putLong("ban_until_"+u,until).apply();
            toast("@"+u+" заблокирован на "+d+" дней");
            logAction("Временный бан @"+u+" на "+d+" дней");
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3ExportReport(){
        if(adminLevel()<3){info("Экспорт","Недостаточно прав.");return;}
        StringBuilder report=new StringBuilder("ОТЧЁТ МОДЕРАЦИИ\nДата: "+new Date().toString()+"\n\n");
        report.append("Всего аккаунтов: ").append(getAccounts().size()).append("\n");
        int banned=0,frozen=0,verified=0;
        for(String id:getAccounts()){
            String u=accountUsername(id);
            if(prefs.getBoolean("banned_"+cleanKey(u),false))banned++;
            if(prefs.getBoolean("frozen_"+cleanKey(u),false))frozen++;
            if(prefs.getBoolean("verified_"+cleanKey(u),false))verified++;
        }
        report.append("Заблокировано: ").append(banned).append("\n");
        report.append("Заморожено: ").append(frozen).append("\n");
        report.append("Верифицировано: ").append(verified).append("\n\n");
        report.append("Жалобы: ").append(getReports().length()).append("\n");
        info("Отчёт о модерации",report.toString());
    }

    private void level3TargetedCheck(){
        if(adminLevel()<3){info("Проверка","Недостаточно прав.");return;}
        final EditText target=input("@username для проверки");
        new AlertDialog.Builder(this).setTitle("Целевая проверка").setView(target).setPositiveButton("Проверить",(d,w)->{
            String u=cleanKey(target.getText().toString());
            if(u.isEmpty())return;
            String id=resolveAccountId(u);
            if(id.isEmpty()){info("Проверка","Пользователь не найден.");return;}
            StringBuilder check=new StringBuilder("Проверка @").append(u).append("\n\n");
            check.append("Имя: ").append(accountName(id)).append("\n");
            check.append("Роль: ").append(roleName(prefs.getInt("role_"+id,1))).append("\n");
            check.append("Забанен: ").append(prefs.getBoolean("banned_"+u,false)?"Да":"Нет").append("\n");
            check.append("Заморожен: ").append(prefs.getBoolean("frozen_"+u,false)?"Да":"Нет").append("\n");
            check.append("Верифицирован: ").append(isVerified(u)?"Да":"Нет").append("\n");
            check.append("Онлайн: ").append(prefs.getBoolean("online_"+u,false)?"Да":"Нет").append("\n");
            info("Результат проверки",check.toString());
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3NotifyUsers(){
        if(adminLevel()<3){info("Уведомление","Недостаточно прав.");return;}
        final EditText message=input("Текст уведомления");
        new AlertDialog.Builder(this).setTitle("Уведомление пользователей").setView(message).setPositiveButton("Отправить",(d,w)->{
            String text=message.getText().toString().trim();
            if(text.isEmpty())return;
            prefs.edit().putString("system_notification",text).putLong("system_notification_time",System.currentTimeMillis()).apply();
            toast("Системное уведомление установлено");
            logAction("Системное уведомление: "+text.substring(0,Math.min(50,text.length())));
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3EmergencyBlock(){
        if(adminLevel()<3){info("Блокировка","Недостаточно прав.");return;}
        final EditText target=input("@username для экстренной блокировки");
        new AlertDialog.Builder(this).setTitle("ЭКСТРЕННАЯ БЛОКИРОВКА").setMessage("ВНИМАНИЕ: Немедленная блокировка без проверки!").setView(target).setPositiveButton("ЗАБЛОКИРОВАТЬ",(d,w)->{
            String u=cleanKey(target.getText().toString());
            if(u.isEmpty())return;
            String id=resolveAccountId(u);
            if(id.isEmpty()){info("Блокировка","Пользователь не найден.");return;}
            prefs.edit().putBoolean("banned_"+u,true).putBoolean("frozen_"+u,true).putInt("role_"+id,0).putString("emergency_block_"+u,"yes").apply();
            toast("@"+u+" ЗАБЛОКИРОВАН ЭКСТРЕННО");
            logAction("ЭКСТРЕННАЯ БЛОКИРОВКА @"+u);
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3ViolationAnalytics(){
        if(adminLevel()<3){info("Аналитика","Недостаточно прав.");return;}
        JSONArray reports=getReports();
        int spam=0,abuse=0,fake=0,other=0;
        for(int i=0;i<reports.length();i++){
            JSONObject r=reports.optJSONObject(i);
            if(r!=null){
                String type=r.optString("type","other");
                if("spam".equals(type))spam++;
                else if("abuse".equals(type))abuse++;
                else if("fake".equals(type))fake++;
                else other++;
            }
        }
        info("Аналитика нарушений","Всего жалоб: "+reports.length()+"\n\nСпам: "+spam+"\nОскорбления: "+abuse+"\nФейк: "+fake+"\nДругое: "+other);
    }

    private void level3RestoreAccount(){
        if(adminLevel()<3){info("Восстановление","Недостаточно прав.");return;}
        final EditText target=input("@username для восстановления");
        new AlertDialog.Builder(this).setTitle("Восстановить аккаунт").setView(target).setPositiveButton("Восстановить",(d,w)->{
            String u=cleanKey(target.getText().toString());
            if(u.isEmpty())return;
            String id=resolveAccountId(u);
            if(id.isEmpty()){info("Восстановление","Пользователь не найден.");return;}
            prefs.edit().putBoolean("banned_"+u,false).putBoolean("frozen_"+u,false).putInt("role_"+id,1).remove("ban_until_"+u).remove("emergency_block_"+u).apply();
            toast("Аккаунт @"+u+" восстановлен");
            logAction("Восстановление аккаунта @"+u);
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3Compensation(){
        if(adminLevel()<3){info("Компенсация","Недостаточно прав.");return;}
        final EditText target=input("@username");
        final EditText amount=input("Сумма TeleCoin");amount.setInputType(2);
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        box.addView(target);box.addView(spacer(8));box.addView(amount);
        new AlertDialog.Builder(this).setTitle("Компенсация").setView(box).setPositiveButton("Выдать",(d,w)->{
            String u=target.getText().toString().trim();
            int amt=0;try{amt=Integer.parseInt(amount.getText().toString());}catch(Exception e){}
            if(u.isEmpty()||amt<=0)return;
            String id=resolveAccountId(u);
            if(!id.isEmpty()){
                int current=prefs.getInt("balance_"+id,0);
                prefs.edit().putInt("balance_"+id,current+amt).apply();
            }
            toast("Выдано "+amt+" TeleCoin пользователю @"+u);
            logAction("Компенсация @"+u+": "+amt+" TC");
        }).setNegativeButton("Отмена",null).show();
    }

    private void level3DeviceControl(){
        if(adminLevel()<3){info("Устройства","Недостаточно прав.");return;}
        info("Контроль устройств","Функция мониторинга активных сессий и устройств.\n\nВ текущей локальной версии показывается один аккаунт на устройство.\n\nСерверная версия добавит полную синхронизацию сессий.");
    }

    private void level3AutoModeration(){
        if(adminLevel()<3){info("Автомодерация","Недостаточно прав.");return;}
        final String[] rules={"Фильтр мата","Анти-спам (5+ сообщений/мин)","Блокировка ссылок","Блокировка повторов","Капча для новых"};
        boolean[] enabled=new boolean[rules.length];
        for(int i=0;i<rules.length;i++)enabled[i]=prefs.getBoolean("auto_mod_"+i,false);
        new AlertDialog.Builder(this).setTitle("⏰ Автомодерация").setMultiChoiceItems(rules,enabled,(d,w,checked)->{
            prefs.edit().putBoolean("auto_mod_"+w,checked).apply();
        }).setPositiveButton("Сохранить",(d,w)->{
            toast("Правила автомодерации обновлены");
            logAction("Обновление правил автомодерации");
        }).show();
    }

    private void level3DeletedArchive(){
        if(adminLevel()<3){info("Архив","Недостаточно прав.");return;}
        String archive=prefs.getString("deleted_messages_archive","");
        info("Архив удалённого",archive.isEmpty()?"Архив пуст.":("Последние удалённые сообщения:\n\n"+archive));
    }

    private void level3SecurityCheck(){
        if(adminLevel()<3){info("Безопасность","Недостаточно прав.");return;}
        int suspicious=0,newAccounts=0;
        long dayAgo=System.currentTimeMillis()-86400000L;
        for(String id:getAccounts()){
            String u=cleanKey(accountUsername(id));
            if(prefs.getBoolean("banned_"+u,false)&&prefs.getInt("role_"+id,0)>0)suspicious++;
            if(prefs.getLong("account_created_"+id,0)>dayAgo)newAccounts++;
        }
        info("Проверка безопасности","Подозрительных комбинаций: "+suspicious+"\nНовых аккаунтов (24ч): "+newAccounts+"\n\nСтатус: "+(suspicious==0?"Безопасно":"Требуется внимание"));
    }

    private void logAction(String action){
        String log=prefs.getString("admin_action_log","");
        String entry=new SimpleDateFormat("yyyy-MM-dd HH:mm",Locale.US).format(new Date())+" | "+accountUsername(currentAccount())+" | "+action+"\n";
        log=entry+log;
        if(log.length()>5000)log=log.substring(0,5000);
        prefs.edit().putString("admin_action_log",log).apply();
    }

    @Override protected void onDestroy(){ if(chatRealtime!=null){try{chatRealtime.close();}catch(Exception ignored){}chatRealtime=null;} if(callManager!=null){callManager.dispose();callManager=null;} super.onDestroy(); }

    @Override public void onBackPressed(){if(currentChatId!=null){currentChatId=null;buildShell(true);}else super.onBackPressed();}
}
