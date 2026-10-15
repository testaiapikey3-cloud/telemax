package com.telemax.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.UUID;

/** Простая Bluetooth Classic передача строк JSON/текста между сопряжёнными телефонами. */
public class BluetoothChatManager {
    public interface Listener { void onMessage(String from, String text); }
    private static final UUID APP_UUID=UUID.fromString("9f4c7f34-1f3c-4f9a-8a9b-123456789040");
    private final Context context; private final Listener listener; private final BluetoothAdapter adapter;
    private BluetoothServerSocket server; private BluetoothSocket socket; private PrintWriter writer;
    public BluetoothChatManager(Context c,Listener l){context=c;listener=l;adapter=BluetoothAdapter.getDefaultAdapter();}
    private boolean allowed(){return Build.VERSION.SDK_INT<31 || (context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED && context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED);}
    public ArrayList<BluetoothDevice> pairedDevices(){ArrayList<BluetoothDevice> out=new ArrayList<>();if(adapter==null||!allowed())return out;try{out.addAll(adapter.getBondedDevices());}catch(SecurityException ignored){}return out;}
    public void startServer(){if(adapter==null||!allowed())return;new Thread(()->{try{server=adapter.listenUsingRfcommWithServiceRecord("TeleMAX",APP_UUID);while(true){BluetoothSocket s=server.accept();if(s!=null){socket=s;writer=new PrintWriter(new OutputStreamWriter(s.getOutputStream()),true);readLoop(s);}}}catch(Exception ignored){}}).start();}
    public void connect(BluetoothDevice device){if(adapter==null||device==null||!allowed())return;new Thread(()->{try{BluetoothSocket s=device.createRfcommSocketToServiceRecord(APP_UUID);s.connect();socket=s;writer=new PrintWriter(new OutputStreamWriter(s.getOutputStream()),true);readLoop(s);}catch(Exception ignored){}}).start();}
    private void readLoop(BluetoothSocket s){try{BufferedReader br=new BufferedReader(new InputStreamReader(s.getInputStream()));String line;while((line=br.readLine())!=null){String[] p=line.split("\\t",2);if(p.length==2&&listener!=null)listener.onMessage(p[0],p[1]);}}catch(IOException ignored){}}
    public void send(String from,String text){if(writer!=null){writer.println(from+"\t"+text);writer.flush();}}
    public void close(){try{if(socket!=null)socket.close();}catch(Exception ignored){}try{if(server!=null)server.close();}catch(Exception ignored){}}
}
