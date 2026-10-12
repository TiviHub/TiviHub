package com.tivihub

import android.app.Application
import androidx.room.Room
import com.tivihub.data.local.CredentialCipher
import com.tivihub.data.local.IptvDatabase
import com.tivihub.data.local.LocalRepository
import com.tivihub.data.network.XtreamApi

class TiviHubApplication : Application() {
    lateinit var repository: LocalRepository
        private set
    lateinit var api: XtreamApi
        private set

    override fun onCreate() {
        super.onCreate()
        val database = Room.databaseBuilder(this, IptvDatabase::class.java, "tivihub.db")
            .addMigrations(IptvDatabase.MIGRATION_1_2)
            .addMigrations(IptvDatabase.MIGRATION_2_3)
            .addMigrations(IptvDatabase.MIGRATION_3_4)
            .addMigrations(IptvDatabase.MIGRATION_4_5)
            .addMigrations(IptvDatabase.MIGRATION_5_6)
            .build()
        repository = LocalRepository(database, CredentialCipher(), filesDir)
        api = XtreamApi()
    }
}
