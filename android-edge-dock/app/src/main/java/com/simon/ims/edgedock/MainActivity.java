package com.simon.ims.edgedock;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {

    private static final int REQUEST_OVERLAY_CODE = 2001;
    private static final int REQUEST_PERMISSIONS_CODE = 2002;
    private static final int REQUEST_NOTIFICATION_CODE = 2003;
    private static final int REQUEST_BATTERY_CODE = 2004;

    private TextView mTvOverlayStatus;
    private TextView mTvMicStatus;
    private TextView mTvCameraStatus;
    private TextView mTvBatteryStatus;
    private Button mBtnGrantOverlay;
    private Button mBtnGrantMic;
    private Button mBtnGrantCamera;
    private Button mBtnGrantBattery;
    private Button mBtnToggleService;
    private Button mBtnTestOpen;
    private EditText mEtUrl;
    private Button mBtnSaveUrl;

    private SharedPreferences mPrefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mPrefs = getSharedPreferences("ims_prefs", Context.MODE_PRIVATE);

        mTvOverlayStatus = findViewById(R.id.tv_overlay_status);
        mTvMicStatus = findViewById(R.id.tv_mic_status);
        mTvCameraStatus = findViewById(R.id.tv_camera_status);
        mTvBatteryStatus = findViewById(R.id.tv_battery_status);
        mBtnGrantOverlay = findViewById(R.id.btn_grant_overlay);
        mBtnGrantMic = findViewById(R.id.btn_grant_mic);
        mBtnGrantCamera = findViewById(R.id.btn_grant_camera);
        mBtnGrantBattery = findViewById(R.id.btn_grant_battery);
        mBtnToggleService = findViewById(R.id.btn_toggle_service);
        mBtnTestOpen = findViewById(R.id.btn_test_open);
        mEtUrl = findViewById(R.id.et_url);
        mBtnSaveUrl = findViewById(R.id.btn_save_url);

        String currentUrl = mPrefs.getString("ims_url", EdgeDockService.DEFAULT_URL);
        mEtUrl.setText(currentUrl);

        mBtnGrantOverlay.setOnClickListener(v -> requestOverlayPermission());
        mBtnGrantMic.setOnClickListener(v -> requestHardwarePermissions());
        mBtnGrantCamera.setOnClickListener(v -> requestHardwarePermissions());
        mBtnGrantBattery.setOnClickListener(v -> requestBatteryOptimizationExemption());

        mBtnToggleService.setOnClickListener(v -> toggleDockService());
        mBtnTestOpen.setOnClickListener(v -> testOpenDrawer());

        mBtnSaveUrl.setOnClickListener(v -> {
            String newUrl = mEtUrl.getText().toString().trim();
            if (!newUrl.isEmpty()) {
                mPrefs.edit().putString("ims_url", newUrl).apply();
                Toast.makeText(this, "URL Saved: " + newUrl, Toast.LENGTH_SHORT).show();
            }
        });

        Button btnNotificationSettings = findViewById(R.id.btn_notification_settings);
        btnNotificationSettings.setOnClickListener(v -> {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            try {
                startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(this, "Please disable notifications in App Settings", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    private void refreshStatus() {
        boolean hasOverlay = Settings.canDrawOverlays(this);
        if (hasOverlay) {
            mTvOverlayStatus.setText("Overlay Permission: GRANTED ✓");
            mTvOverlayStatus.setTextColor(0xFF22C55E); // Green
            mBtnGrantOverlay.setVisibility(View.GONE);
        } else {
            mTvOverlayStatus.setText("Overlay Permission: MISSING ✕");
            mTvOverlayStatus.setTextColor(0xFFEF4444); // Red
            mBtnGrantOverlay.setVisibility(View.VISIBLE);
        }

        boolean hasMic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        if (hasMic) {
            mTvMicStatus.setText("Microphone Permission: GRANTED ✓");
            mTvMicStatus.setTextColor(0xFF22C55E);
            mBtnGrantMic.setVisibility(View.GONE);
        } else {
            mTvMicStatus.setText("Microphone Permission: MISSING ✕");
            mTvMicStatus.setTextColor(0xFFEF4444);
            mBtnGrantMic.setVisibility(View.VISIBLE);
        }

        boolean hasCamera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
        if (hasCamera) {
            mTvCameraStatus.setText("Camera Permission: GRANTED ✓");
            mTvCameraStatus.setTextColor(0xFF22C55E);
            mBtnGrantCamera.setVisibility(View.GONE);
        } else {
            mTvCameraStatus.setText("Camera Permission: MISSING ✕");
            mTvCameraStatus.setTextColor(0xFFEF4444);
            mBtnGrantCamera.setVisibility(View.VISIBLE);
        }

        boolean isIgnoringBattery = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                isIgnoringBattery = pm.isIgnoringBatteryOptimizations(getPackageName());
            }
        }
        if (isIgnoringBattery) {
            mTvBatteryStatus.setText("Autostart on Boot: UNRESTRICTED ✓");
            mTvBatteryStatus.setTextColor(0xFF22C55E);
            mBtnGrantBattery.setVisibility(View.GONE);
        } else {
            mTvBatteryStatus.setText("Autostart on Boot: RESTRICTED BY OS (Tap below to allow)");
            mTvBatteryStatus.setTextColor(0xFFF59E0B); // Amber
            mBtnGrantBattery.setVisibility(View.VISIBLE);
        }

        if (hasOverlay && hasMic) {
            boolean serviceEnabled = mPrefs.getBoolean("service_enabled", true);
            if (serviceEnabled) {
                startDockService();
            }
        }
    }

    private void requestOverlayPermission() {
        if (!Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())
            );
            startActivityForResult(intent, REQUEST_OVERLAY_CODE);
        }
    }

    private void requestHardwarePermissions() {
        ActivityCompat.requestPermissions(
                this,
                new String[]{
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.MODIFY_AUDIO_SETTINGS,
                        Manifest.permission.CAMERA
                },
                REQUEST_PERMISSIONS_CODE
        );
    }

    private void requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            try {
                startActivityForResult(intent, REQUEST_BATTERY_CODE);
            } catch (Exception e) {
                try {
                    startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignored) {}
            }
        }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQUEST_NOTIFICATION_CODE
                );
            }
        }
    }

    private void toggleDockService() {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Please enable Overlay Permission first", Toast.LENGTH_SHORT).show();
            requestOverlayPermission();
            return;
        }

        boolean isRunning = mPrefs.getBoolean("service_enabled", true);
        if (isRunning) {
            stopDockService();
            mPrefs.edit().putBoolean("service_enabled", false).apply();
            mBtnToggleService.setText("Start Edge Dock");
            Toast.makeText(this, "IMS Edge Dock Stopped", Toast.LENGTH_SHORT).show();
        } else {
            startDockService();
            mPrefs.edit().putBoolean("service_enabled", true).apply();
            mBtnToggleService.setText("Stop Edge Dock");
            Toast.makeText(this, "IMS Edge Dock Started", Toast.LENGTH_SHORT).show();
        }
    }

    private void startDockService() {
        Intent serviceIntent = new Intent(this, EdgeDockService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        mBtnToggleService.setText("Stop Edge Dock");
    }

    private void stopDockService() {
        Intent serviceIntent = new Intent(this, EdgeDockService.class);
        stopService(serviceIntent);
    }

    private void testOpenDrawer() {
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Please enable Overlay Permission first", Toast.LENGTH_SHORT).show();
            return;
        }
        startDockService();
        Intent openIntent = new Intent(this, EdgeDockService.class);
        openIntent.setAction(EdgeDockService.ACTION_OPEN_DRAWER);
        startService(openIntent);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        refreshStatus();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        refreshStatus();
    }
}
