package com.solotrackr.app;

import android.graphics.Color;
import android.graphics.drawable.Animatable;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.widget.ImageView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // The ring in splash_web_launch is drawn at 0.75 so it fits Android 12's circular
    // launch mask. This overlay is not masked, so it draws that art larger; keep it in
    // step with NATIVE_SCALE in app/components/Splash.tsx (web ring = 192 dp * NATIVE_SCALE).
    private static final float RING_DP = 240f;
    private static final float DRAWN_RING_DP = 144f; // ring diameter inside the 288 dp drawable
    private static final float DRAWABLE_DP = 288f;
    // Backstop if the page never loads and never reports back.
    private static final long MAX_MS = 25000;

    private FrameLayout overlay;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showSplash();
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void hide() {
                main.post(MainActivity.this::hideSplash);
            }
        }, "SoloSplash");
        main.postDelayed(() -> {
            // Page still not loaded (server unreachable / hanging): show the retry screen
            // rather than a blank page behind the splash.
            if (getBridge().getWebView().getProgress() < 100) {
                getBridge().getWebView().loadUrl("https://localhost/index.html");
            }
            hideSplash();
        }, MAX_MS);
    }

    private void showSplash() {
        float density = getResources().getDisplayMetrics().density;
        int size = Math.round(DRAWABLE_DP * (RING_DP / DRAWN_RING_DP) * density);

        overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.parseColor("#050505"));
        overlay.setClickable(true); // swallow touches until the page is up

        ImageView art = new ImageView(this);
        art.setScaleType(ImageView.ScaleType.FIT_CENTER);
        Drawable d = getDrawable(R.drawable.splash_web_launch);
        art.setImageDrawable(d);
        overlay.addView(art, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));

        ViewGroup content = findViewById(android.R.id.content);
        content.addView(overlay, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (d instanceof Animatable) ((Animatable) d).start();
    }

    private void hideSplash() {
        final View v = overlay;
        if (v == null) return;
        overlay = null;
        v.animate().alpha(0f).setDuration(150).withEndAction(() -> {
            ViewGroup parent = (ViewGroup) v.getParent();
            if (parent != null) parent.removeView(v);
        }).start();
    }
}
