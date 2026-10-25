package com.simon.ims.edgedock;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageButton;
import android.widget.ProgressBar;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import java.util.HashMap;
import java.util.Map;

public class EdgeDockService extends Service {

    public static final String ACTION_OPEN_DRAWER = "com.simon.ims.edgedock.OPEN_DRAWER";
    public static final String ACTION_CLOSE_DRAWER = "com.simon.ims.edgedock.CLOSE_DRAWER";
    public static final String ACTION_TOGGLE_DRAWER = "com.simon.ims.edgedock.TOGGLE_DRAWER";
    public static final String DEFAULT_URL = "https://simon-ims.ngrok-free.app/";

    private static final String CHANNEL_ID = "ims_edge_dock_silent_channel";
    private static final int NOTIFICATION_ID = 1001;

    private WindowManager mWindowManager;
    private View mHandleView;
    private View mDrawerView;

    private WindowManager.LayoutParams mHandleParams;
    private WindowManager.LayoutParams mDrawerParams;

    private View mCardDrawer;
    private View mScrimView;
    private WebView mWebView;
    private ProgressBar mProgressBar;

    private boolean mIsDrawerOpen = false;
    private boolean mIsDrawerAttached = false;
    private int mCardWidth = 0;

    private SharedPreferences mPrefs;

    // Listens for Home button and Recents gestures to automatically retract the dock
    private final BroadcastReceiver mSystemDialogsReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_CLOSE_SYSTEM_DIALOGS.equals(intent.getAction())) {
                closeDrawer();
            }
        }
    };

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        mPrefs = getSharedPreferences("ims_prefs", MODE_PRIVATE);
        mWindowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        createNotificationChannel();
        startForegroundWithTypes();

        initHandleView();
        initDrawerView();

        // Register Home button listener
        IntentFilter filter = new IntentFilter(Intent.ACTION_CLOSE_SYSTEM_DIALOGS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mSystemDialogsReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mSystemDialogsReceiver, filter);
        }
    }

    private void startForegroundWithTypes() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int fgsTypes = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                fgsTypes |= ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
            }
            startForeground(NOTIFICATION_ID, notification, fgsTypes);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_OPEN_DRAWER.equals(action)) {
                openDrawer();
            } else if (ACTION_CLOSE_DRAWER.equals(action)) {
                closeDrawer();
            } else if (ACTION_TOGGLE_DRAWER.equals(action)) {
                if (mIsDrawerOpen) {
                    closeDrawer();
                } else {
                    openDrawer();
                }
            }
        }
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "IMS Edge Dock (Silent)",
                    NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("Silent background edge dock service");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent settingsIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, settingsIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent toggleIntent = new Intent(this, EdgeDockService.class);
        toggleIntent.setAction(ACTION_TOGGLE_DRAWER);
        PendingIntent togglePendingIntent = PendingIntent.getService(
                this, 1, toggleIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("IMS Edge Dock")
                .setContentText("Running silently in background")
                .setSmallIcon(R.drawable.ic_launcher)
                .setContentIntent(pendingIntent)
                .addAction(R.drawable.ic_chevron_right, "Toggle IMS", togglePendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setVisibility(NotificationCompat.VISIBILITY_SECRET)
                .setSilent(true)
                .build();
    }

    private void initHandleView() {
        LayoutInflater inflater = LayoutInflater.from(this);
        mHandleView = inflater.inflate(R.layout.view_edge_handle, null);

        int layoutType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        int savedY = mPrefs.getInt("handle_y", dpToPx(240));

        mHandleParams = new WindowManager.LayoutParams(
                dpToPx(20),
                dpToPx(140),
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
        );

        mHandleParams.gravity = Gravity.TOP | Gravity.START;
        mHandleParams.x = 0;
        mHandleParams.y = savedY;

        mHandleView.setOnTouchListener(new View.OnTouchListener() {
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;
            private boolean isDragging = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialY = mHandleParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        isDragging = false;
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float deltaX = event.getRawX() - initialTouchX;
                        float deltaY = event.getRawY() - initialTouchY;

                        // Dragging vertically to reposition along the left edge
                        if (Math.abs(deltaY) > dpToPx(8) && Math.abs(deltaY) > Math.abs(deltaX)) {
                            isDragging = true;
                            mHandleParams.y = (int) (initialY + deltaY);
                            mWindowManager.updateViewLayout(mHandleView, mHandleParams);
                        }
                        // Swiping horizontally inward from left edge opens the drawer
                        else if (deltaX > dpToPx(14)) {
                            openDrawer();
                            return true;
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (isDragging) {
                            mPrefs.edit().putInt("handle_y", mHandleParams.y).apply();
                        } else {
                            float totalDeltaX = event.getRawX() - initialTouchX;
                            if (totalDeltaX > dpToPx(10)) {
                                openDrawer();
                            } else {
                                openDrawer();
                            }
                        }
                        return true;
                }
                return false;
            }
        });

        try {
            mWindowManager.addView(mHandleView, mHandleParams);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void initDrawerView() {
        LayoutInflater inflater = LayoutInflater.from(this);
        mDrawerView = inflater.inflate(R.layout.view_edge_drawer, null);

        mCardDrawer = mDrawerView.findViewById(R.id.card_drawer);
        mScrimView = mDrawerView.findViewById(R.id.view_scrim);
        mWebView = mDrawerView.findViewById(R.id.web_view);
        mProgressBar = mDrawerView.findViewById(R.id.web_progress);

        ImageButton btnBrowser = mDrawerView.findViewById(R.id.btn_drawer_browser);
        ImageButton btnTheme = mDrawerView.findViewById(R.id.btn_drawer_theme);
        ImageButton btnRefresh = mDrawerView.findViewById(R.id.btn_drawer_refresh);
        ImageButton btnClose = mDrawerView.findViewById(R.id.btn_drawer_close);

        // Takes full width of the screen
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int screenWidth = metrics.widthPixels;
        mCardWidth = screenWidth;
        mCardDrawer.getLayoutParams().width = WindowManager.LayoutParams.MATCH_PARENT;

        // Scrim click -> closes drawer
        mScrimView.setOnClickListener(v -> closeDrawer());

        // Header buttons
        btnBrowser.setOnClickListener(v -> openInChromeBrowser());
        btnTheme.setOnClickListener(v -> toggleImsTheme());
        btnRefresh.setOnClickListener(v -> loadImsPage());
        btnClose.setOnClickListener(v -> closeDrawer());

        // Intercept Back button key on both mDrawerView and mWebView to retract the dock
        mDrawerView.setFocusable(true);
        mDrawerView.setFocusableInTouchMode(true);
        View.OnKeyListener backListener = (v, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                closeDrawer();
                return true;
            }
            return false;
        };
        mDrawerView.setOnKeyListener(backListener);
        mWebView.setOnKeyListener(backListener);

        // Swipe right-to-left on card to close
        mCardDrawer.setOnTouchListener(new View.OnTouchListener() {
            private float startX;
            private float startY;
            private boolean isSwipingLeft = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = event.getRawX();
                        startY = event.getRawY();
                        isSwipingLeft = false;
                        return false;

                    case MotionEvent.ACTION_MOVE:
                        float deltaX = event.getRawX() - startX;
                        float deltaY = event.getRawY() - startY;
                        if (deltaX < -dpToPx(20) && Math.abs(deltaX) > Math.abs(deltaY)) {
                            isSwipingLeft = true;
                            mCardDrawer.setTranslationX(deltaX);
                            return true;
                        }
                        break;

                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (isSwipingLeft) {
                            float finalDeltaX = event.getRawX() - startX;
                            if (finalDeltaX < -dpToPx(60)) {
                                closeDrawer();
                            } else {
                                mCardDrawer.animate().translationX(0).setDuration(200).start();
                            }
                            return true;
                        }
                        break;
                }
                return false;
            }
        });

        setupWebView();

        int layoutType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        // Critical: FLAG_HARDWARE_ACCELERATED enables WebGL and camera viewfinder streams
        mDrawerParams = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT,
                layoutType,
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
                PixelFormat.TRANSLUCENT
        );
        mDrawerParams.gravity = Gravity.FILL;
        mDrawerParams.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;
    }

    private void setupWebView() {
        // Hardware accelerated layer for smooth WebRTC camera preview
        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);

        // Standard Chrome Mobile User-Agent ensures Google OAuth, camera, and WebSockets work
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36");

        // Enable cookies and third-party cookies for authenticated WebSockets
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(mWebView, true);
        }

        // Auto-grant microphone & camera (WebRTC) permissions for real-time voice and food photos
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Directly grant requested resources (audio/video capture)
                request.grant(request.getResources());
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    mProgressBar.setVisibility(View.VISIBLE);
                } else {
                    mProgressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d("IMS_WEBVIEW", consoleMessage.message() + " -- Line "
                        + consoleMessage.lineNumber());
                return true;
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                try {
                    Intent intent = fileChooserParams.createIntent();
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {}
                return false;
            }
        });

        // Intercept navigation: Handles Tasker flow (Send to AAPS) and closes the dock
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (handleCustomScheme(url)) {
                    return true;
                }
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (handleCustomScheme(url)) {
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (mIsDrawerOpen) {
                    mWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('ims-dock-open'));", null);
                }
            }
        });

        loadImsPage();
    }

    private boolean handleCustomScheme(String url) {
        if (url == null) return false;

        // Check for Tasker, AAPS, or non-http/https Android custom intent schemes
        if (url.startsWith("tasker://") || url.startsWith("intent://") || (!url.startsWith("http://") && !url.startsWith("https://"))) {
            // 1. Immediately close the dock beforehand so the user sees AAPS
            closeDrawer();

            // 2. Guarantee carbs are copied to Android system clipboard if present in query
            try {
                Uri parsedUri = Uri.parse(url);
                String par1 = parsedUri.getQueryParameter("par1");
                if (par1 != null && !par1.trim().isEmpty()) {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    if (clipboard != null) {
                        ClipData clip = ClipData.newPlainText("carbs", par1.trim());
                        clipboard.setPrimaryClip(clip);
                    }
                }
            } catch (Exception ignored) {}

            // 3. Trigger the Tasker / AAPS intent
            try {
                Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                try {
                    Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(fallback);
                    return true;
                } catch (Exception ex) {
                    Log.e("IMS_CUSTOM_SCHEME", "Could not launch custom scheme: " + url, ex);
                }
            }
            return true;
        }
        return false;
    }

    private void loadImsPage() {
        String url = mPrefs.getString("ims_url", DEFAULT_URL);
        Map<String, String> extraHeaders = new HashMap<>();
        extraHeaders.put("ngrok-skip-browser-warning", "true");
        mWebView.loadUrl(url, extraHeaders);
    }

    private void openInChromeBrowser() {
        String url = mPrefs.getString("ims_url", DEFAULT_URL);
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            intent.setPackage("com.android.chrome");
            startActivity(intent);
        } catch (Exception e) {
            intent.setPackage(null);
            try {
                startActivity(intent);
            } catch (Exception ignored) {}
        }
        closeDrawer();
    }

    private void toggleImsTheme() {
        if (mWebView == null) return;
        String js = "(function() {" +
                "  try {" +
                "    var inactive = document.querySelector('.mode-switcher .mode-item:not(.active)');" +
                "    if (inactive) { inactive.click(); return; }" +
                "    var rtheme = document.querySelector('.rtheme');" +
                "    if (rtheme) { rtheme.click(); return; }" +
                "    var themeBtn = document.querySelector('button[aria-label*=\"theme\" i], button[title*=\"theme\" i]');" +
                "    if (themeBtn) { themeBtn.click(); return; }" +
                "    var moonSun = document.querySelector('svg.lucide-sun, svg.lucide-moon');" +
                "    if (moonSun) {" +
                "      var parent = moonSun.closest('button, .mode-item, div');" +
                "      if (parent) { parent.click(); return; }" +
                "    }" +
                "    var cur = localStorage.getItem('app-theme') || 'dark';" +
                "    var next = (cur === 'dark') ? 'light' : 'dark';" +
                "    localStorage.setItem('app-theme', next);" +
                "    localStorage.setItem('hive_graph_theme', next === 'dark' ? 'space' : 'white');" +
                "    if (next === 'dark') {" +
                "      document.documentElement.classList.add('dark');" +
                "    } else {" +
                "      document.documentElement.classList.remove('dark');" +
                "    }" +
                "    document.documentElement.setAttribute('data-theme', next === 'dark' ? 'space' : 'white');" +
                "    window.dispatchEvent(new StorageEvent('storage', { key: 'app-theme', newValue: next, storageArea: localStorage }));" +
                "  } catch(e) { console.error('Theme toggle error', e); }" +
                "})();";
        mWebView.evaluateJavascript(js, null);
    }

    public void openDrawer() {
        if (mIsDrawerOpen) return;

        if (!mIsDrawerAttached) {
            try {
                mWindowManager.addView(mDrawerView, mDrawerParams);
                mIsDrawerAttached = true;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        mIsDrawerOpen = true;
        mDrawerView.setVisibility(View.VISIBLE);
        mScrimView.setAlpha(0f);
        mCardDrawer.setTranslationX(-mCardWidth);

        // Slide in from left (Full Width)
        mCardDrawer.animate()
                .translationX(0)
                .setDuration(260)
                .setInterpolator(new DecelerateInterpolator())
                .start();

        // Fade in scrim
        mScrimView.animate()
                .alpha(1f)
                .setDuration(260)
                .start();

        // Request focus so Back button key events are received immediately
        mDrawerView.requestFocus();

        // Animate IMS face from asleep to awake when drawer opens
        if (mWebView != null) {
            mWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('ims-dock-open'));", null);
        }
    }

    public void closeDrawer() {
        if (!mIsDrawerOpen) return;
        mIsDrawerOpen = false;

        // Animate IMS face back to asleep when drawer closes
        if (mWebView != null) {
            mWebView.evaluateJavascript("window.dispatchEvent(new CustomEvent('ims-dock-close'));", null);
        }

        // Slide out to left
        mCardDrawer.animate()
                .translationX(-mCardWidth)
                .setDuration(220)
                .setInterpolator(new DecelerateInterpolator())
                .start();

        // Fade out scrim
        mScrimView.animate()
                .alpha(0f)
                .setDuration(220)
                .setListener(new AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(Animator animation) {
                        mScrimView.animate().setListener(null);
                        if (!mIsDrawerOpen && mIsDrawerAttached) {
                            try {
                                mWindowManager.removeView(mDrawerView);
                                mIsDrawerAttached = false;
                            } catch (Exception e) {
                                e.printStackTrace();
                            }
                        }
                    }
                })
                .start();
    }

    private int dpToPx(int dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mSystemDialogsReceiver != null) {
            try {
                unregisterReceiver(mSystemDialogsReceiver);
            } catch (Exception ignored) {}
        }
        if (mHandleView != null && mWindowManager != null) {
            try {
                mWindowManager.removeView(mHandleView);
            } catch (Exception ignored) {}
        }
        if (mDrawerView != null && mIsDrawerAttached && mWindowManager != null) {
            try {
                mWindowManager.removeView(mDrawerView);
            } catch (Exception ignored) {}
        }
        if (mWebView != null) {
            mWebView.destroy();
        }
    }
}
