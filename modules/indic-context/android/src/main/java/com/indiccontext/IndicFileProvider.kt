package com.indiccontext

import androidx.core.content.FileProvider

/** Own subclass so this provider never collides with other modules' FileProvider entries. */
class IndicFileProvider : FileProvider()
