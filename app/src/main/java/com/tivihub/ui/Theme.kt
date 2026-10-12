package com.tivihub.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6A3DE8),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF281A4A),
    onPrimaryContainer = Color(0xFFDCCFFF),
    secondary = Color(0xFFA68BFF),
    background = Color(0xFF09080F),
    surface = Color(0xFF12111B),
    onSurface = Color(0xFFF8F6FF),
    surfaceVariant = Color(0xFF1A1825),
    onSurfaceVariant = Color(0xFFAAA5BB),
    outline = Color(0xFF393545),
    outlineVariant = Color(0xFF292634)
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF6A3DE8),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE8DFFF),
    onPrimaryContainer = Color(0xFF25134F),
    secondary = Color(0xFF7250D5),
    background = Color(0xFFF8F8FA),
    surface = Color.White,
    onSurface = Color(0xFF191620),
    surfaceVariant = Color(0xFFF0EDF6),
    onSurfaceVariant = Color(0xFF615B6E),
    outline = Color(0xFF817A8F),
    outlineVariant = Color(0xFFD9D4E1)
)

private val TiviHubShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

private val TiviHubTypography = Typography().let { defaults ->
    defaults.copy(
        headlineLarge = defaults.headlineLarge.copy(
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-1.2).sp
        ),
        headlineMedium = defaults.headlineMedium.copy(
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.7).sp
        ),
        titleLarge = defaults.titleLarge.copy(
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.25).sp
        ),
        titleMedium = defaults.titleMedium.copy(
            fontWeight = FontWeight.SemiBold,
            letterSpacing = (-0.1).sp
        )
    )
}

@Composable
fun TiviHubTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography = TiviHubTypography,
        shapes = TiviHubShapes,
        content = content
    )
}
