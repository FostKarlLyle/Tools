package com.saku.app

import android.webkit.JavascriptInterface
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Jembatan HTTP native: permintaan ke API AI dikirim dari sisi Android, bukan lewat
 * `fetch` di dalam WebView.
 *
 * Alasannya: halaman dimuat dari `file://`, dan di beberapa perangkat WebView menolak
 * permintaan lintas-origin dari halaman file (permintaan diblokir atau dijawab 403),
 * sehingga chat AI gagal terus. Dengan jalur native ini, satu-satunya syarat chat
 * berfungsi hanyalah koneksi internet.
 *
 * Alur: JS memanggil SakuHttp.post(id, url, headers, body) → kerja di background thread
 * → hasil dikirim balik dengan memanggil window.__sakuHttp(id, {status, body}).
 */
class HttpBridge(private val activity: MainActivity) {

    private val pool = Executors.newFixedThreadPool(3)

    @JavascriptInterface
    fun post(id: String, url: String, headersJson: String, body: String) {
        pool.execute { send(id, "POST", url, headersJson, body) }
    }

    @JavascriptInterface
    fun get(id: String, url: String, headersJson: String) {
        pool.execute { send(id, "GET", url, headersJson, null) }
    }

    private fun send(id: String, method: String, url: String, headersJson: String, body: String?) {
        var status = 0
        var text = ""
        var err: String? = null
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 20000
            conn.readTimeout = 60000
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("User-Agent", "SakuAndroid/" + activity.appVersion())
            conn.setRequestProperty("Accept", "application/json, text/plain, */*")
            if (!headersJson.isNullOrBlank()) {
                val h = JSONObject(headersJson)
                val keys = h.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    // header dari JS dipasang setelah default → nilai dari JS yang menang
                    conn.setRequestProperty(k, h.optString(k))
                }
            }
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        } catch (e: Exception) {
            err = e.message ?: e.javaClass.simpleName
        } finally {
            try { conn?.disconnect() } catch (e: Exception) { /* abaikan */ }
        }

        val payload = JSONObject()
        payload.put("status", status)
        payload.put("body", text)
        if (err != null) payload.put("error", err)
        activity.evalJs("window.__sakuHttp && window.__sakuHttp(" + JSONObject.quote(id) + "," + payload + ")")
    }
}
