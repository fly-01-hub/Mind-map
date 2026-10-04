package com.fly01hub.researchmind;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLConnection;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Only bundled HTTPS content is rendered. System pickers mediate all shared-file access. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final int PICK_FILE = 10, SAVE_FILE = 11;
    private static final long MAX_FILE_SIZE = 512L * 1024 * 1024;
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    // Export state is owned by the files executor; the picker result is enqueued on it.
    private Export export;

    private static final class Export {
        File file;
        OutputStream stream;
        long expected, written;
        String name, mime, replyId;
        JavaScriptReplyProxy reply;
        boolean picking;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Only URIs chosen by the user through SAF.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/", this::assetResponse).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!local(request.getUrl())) return denied();
                WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                return response != null ? response : denied();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (local(request.getUrl())) return false;
                if (request.isForMainFrame() && ("https".equals(request.getUrl().getScheme()) || "http".equals(request.getUrl().getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                    catch (ActivityNotFoundException error) { alert("没有可打开此链接的浏览器。"); }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                // Unknown .researchmind MIME types must remain selectable after PC transfer.
                pick.setType("*/*");
                pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(pick, PICK_FILE); }
                catch (ActivityNotFoundException error) { chooser.onReceiveValue(null); chooser = null; alert("系统文件选择器不可用。"); }
                return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton("确定", (dialog, button) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message)
                    .setPositiveButton("确定", (dialog, button) -> result.confirm())
                    .setNegativeButton("取消", (dialog, button) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "ResearchMindNative", Collections.singleton(ORIGIN),
                (view, message, sourceOrigin, mainFrame, reply) -> {
                    if (!mainFrame || !local(sourceOrigin)) return;
                    String data = message.getData();
                    if (data == null || data.length() > 300_000) return;
                    files.execute(() -> handleFileMessage(data, reply));
                });
        } else alert("请更新 Android System WebView 后再使用备份保存功能。");
        web.loadUrl(ORIGIN + "/library");
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private WebResourceResponse assetResponse(String path) {
        if (path.contains("..") || path.contains("\\") || path.indexOf('\0') >= 0) return denied();
        String name = path.isEmpty() || !path.substring(path.lastIndexOf('/') + 1).contains(".") ? "index.html" : path;
        try {
            InputStream stream = getAssets().open("web/" + name);
            String mime = URLConnection.guessContentTypeFromName(name);
            if (name.endsWith(".js") || name.endsWith(".mjs")) mime = "application/javascript";
            else if (name.endsWith(".css")) mime = "text/css";
            else if (name.endsWith(".wasm")) mime = "application/wasm";
            else if (name.endsWith(".html")) mime = "text/html";
            else if (name.endsWith(".svg")) mime = "image/svg+xml";
            else if (name.endsWith(".woff2")) mime = "font/woff2";
            else if (name.endsWith(".woff")) mime = "font/woff";
            else if (name.endsWith(".ttf")) mime = "font/ttf";
            return new WebResourceResponse(mime != null ? mime : "application/octet-stream", "UTF-8", 200, "OK",
                Collections.singletonMap("Cache-Control", "no-store"), stream);
        } catch (Exception error) {
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private void handleFileMessage(String data, JavaScriptReplyProxy reply) {
        String id = "";
        try {
            JSONObject message = new JSONObject(data);
            id = message.getString("id");
            if (!id.matches("[a-zA-Z0-9-]{1,64}")) return;
            String action = message.getString("action");
            if ("print".equals(action)) {
                String replyId = id;
                runOnUiThread(() -> {
                    try {
                        PrintManager printer = (PrintManager) getSystemService(PRINT_SERVICE);
                        if (printer == null) throw new Exception("系统打印服务不可用。");
                        printer.print("ResearchMind 文档", web.createPrintDocumentAdapter("ResearchMind"), null);
                        respond(reply, replyId, true, false, "");
                    } catch (Exception error) { respond(reply, replyId, false, false, "系统打印服务不可用。"); }
                });
                return;
            }
            if ("abort".equals(action)) { discardExport(); respond(reply, id, true, false, ""); return; }
            if ("begin".equals(action)) {
                if (export != null) throw new Exception("另一个文件正在保存。");
                long size = message.getLong("size");
                if (size < 0 || size > MAX_FILE_SIZE) throw new Exception("单次导出上限为 512 MB。");
                String name = message.getString("name").replaceAll("[/\\\\\\p{Cntrl}]", "_");
                if (name.isBlank() || name.length() > 180) throw new Exception("文件名无效或过长。");
                Export created = new Export();
                created.name = name;
                created.mime = message.optString("mime", "application/octet-stream");
                if (!created.mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) created.mime = "application/octet-stream";
                created.expected = size;
                created.file = File.createTempFile("researchmind-export-", ".partial", getCacheDir());
                created.stream = new FileOutputStream(created.file);
                export = created;
            } else if ("chunk".equals(action)) {
                if (export == null || export.picking) throw new Exception("导出会话不存在。");
                String encoded = message.getString("data");
                if (encoded.length() > 262_144) throw new Exception("导出分块过大。");
                byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                if (export.written + bytes.length > export.expected) throw new Exception("导出大小不匹配。");
                export.stream.write(bytes);
                export.written += bytes.length;
            } else if ("finish".equals(action)) {
                if (export == null || export.picking || export.written != export.expected) throw new Exception("导出内容不完整。");
                export.stream.close();
                export.stream = null;
                export.picking = true;
                export.reply = reply;
                export.replyId = id;
                String name = export.name, mime = export.mime;
                runOnUiThread(() -> {
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    save.addCategory(Intent.CATEGORY_OPENABLE);
                    save.setType(mime);
                    save.putExtra(Intent.EXTRA_TITLE, name);
                    try { startActivityForResult(save, SAVE_FILE); }
                    catch (ActivityNotFoundException error) {
                        files.execute(() -> { respond(reply, message.optString("id"), false, false, "系统文件保存器不可用。"); discardExport(); });
                    }
                });
                return; // Reply only after the user chooses a destination and the write finishes.
            } else throw new Exception("未知文件操作。");
            respond(reply, id, true, false, "");
        } catch (Exception error) {
            discardExport();
            respond(reply, id, false, false, "文件保存失败：" + error.getMessage());
        }
    }

    private void respond(JavaScriptReplyProxy reply, String id, boolean ok, boolean cancelled, String error) {
        try {
            JSONObject result = new JSONObject().put("id", id).put("ok", ok).put("cancelled", cancelled).put("error", error);
            runOnUiThread(() -> {
                if (!isDestroyed() && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(result.toString());
            });
        } catch (Exception ignored) { /* An invalid request cannot trigger a file write. */ }
    }
    private void discardExport() {
        if (export == null) return;
        try { if (export.stream != null) export.stream.close(); } catch (Exception ignored) { }
        // Only the exact temporary file created by this export session is removed.
        if (export.file != null) export.file.delete();
        export = null;
    }

    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        if (request == PICK_FILE && chooser != null) {
            Uri[] selected = null;
            if (result == RESULT_OK && intent != null) {
                if (intent.getClipData() != null) {
                    selected = new Uri[intent.getClipData().getItemCount()];
                    for (int index = 0; index < selected.length; index++) selected[index] = intent.getClipData().getItemAt(index).getUri();
                } else if (intent.getData() != null) selected = new Uri[] { intent.getData() };
            }
            chooser.onReceiveValue(selected);
            chooser = null;
        } else if (request == SAVE_FILE) {
            Uri destination = result == RESULT_OK && intent != null ? intent.getData() : null;
            files.execute(() -> {
                if (export == null || !export.picking) return;
                try {
                    if (destination == null) respond(export.reply, export.replyId, false, true, "");
                    else {
                        if (!"content".equals(destination.getScheme())) throw new Exception("文件保存位置无效。");
                        try (InputStream input = new FileInputStream(export.file); OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                            if (output == null) throw new Exception("无法写入所选文件。");
                            byte[] buffer = new byte[65_536];
                            int count;
                            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                            output.flush();
                        }
                        respond(export.reply, export.replyId, true, false, "");
                    }
                } catch (Exception error) { respond(export.reply, export.replyId, false, false, "文件写入失败，请勿使用不完整的备份。"); }
                finally { discardExport(); }
            });
        }
    }

    private void alert(String message) { new AlertDialog.Builder(this).setMessage(message).setPositiveButton("确定", null).show(); }
    @Override public void onBackPressed() {
        if (web.canGoBack()) web.evaluateJavascript("window.history.back()", null);
        else super.onBackPressed();
    }
    @Override protected void onPause() {
        if (web != null) web.evaluateJavascript("document.activeElement?.blur();window.dispatchEvent(new Event('researchmind:pause'))", null);
        super.onPause();
    }
    @Override protected void onDestroy() {
        if (chooser != null) { chooser.onReceiveValue(null); chooser = null; }
        files.execute(this::discardExport);
        files.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
