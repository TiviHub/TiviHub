package com.tivihub

import android.os.Bundle
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.content.pm.ActivityInfo
import android.graphics.Rect
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.tivihub.ui.TiviHubApp
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels {
        val app = application as TiviHubApplication
        MainViewModelFactory(app, app.repository, app.api)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.playerItem.collect { item ->
                    requestedOrientation = if (item == null) {
                        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    } else {
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR
                    }
                }
            }
        }
        setContent {
            TiviHubApp(viewModel)
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (
            viewModel.playerItem.value != null &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        ) {
            val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                builder.setAutoEnterEnabled(true)
            }
            val visibleBounds = Rect()
            if (window.decorView.getGlobalVisibleRect(visibleBounds)) {
                builder.setSourceRectHint(visibleBounds)
            }
            enterPictureInPictureMode(builder.build())
        }
    }
}

private class MainViewModelFactory(
    private val application: TiviHubApplication,
    private val repository: com.tivihub.data.local.LocalRepository,
    private val api: com.tivihub.data.network.XtreamApi
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (!modelClass.isAssignableFrom(MainViewModel::class.java)) {
            throw IllegalArgumentException("Unsupported ViewModel type.")
        }
        @Suppress("UNCHECKED_CAST")
        return MainViewModel(application, repository, api) as T
    }
}
