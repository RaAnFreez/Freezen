package id.frezen.overlaycompanion

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * First-party Frezen backend adapter.
 *
 * The visual engine remains local-first. This client never calls SE/NK MOD endpoints
 * and never follows redirects to another host. No server secret is stored in the APK.
 */
internal object FrezenBackendClient {
    data class StatusResult(
        val ok: Boolean,
        val label: String,
        val environment: String = "unknown",
        val serverName: String = "Frezen"
    )

    data class LicenseResult(
        val httpStatus: Int,
        val valid: Boolean,
        val reason: String,
        val responseJson: String
    )

    private fun baseUrl(): String = BuildConfig.FREZEN_API_BASE_URL.trim().trimEnd('/')

    fun isConfigured(): Boolean = try {
        val raw = baseUrl()
        if (raw.isBlank()) false else {
            val uri = URI(raw)
            uri.scheme.equals("https", ignoreCase = true) &&
                !uri.host.isNullOrBlank() &&
                uri.userInfo == null && uri.query == null && uri.fragment == null
        }
    } catch (_: Exception) {
        false
    }

    fun checkStatus(): StatusResult {
        if (!isConfigured()) return StatusResult(false, "LOCAL ONLY")
        return try {
            val response = request("GET", "/api/v1/status", null)
            val json = JSONObject(response.body)
            val ok = response.code == 200 && json.optString("status") == "ok"
            StatusResult(
                ok = ok,
                label = if (ok) "ONLINE" else "HTTP ${response.code}",
                environment = json.optString("environment", "unknown"),
                serverName = json.optString("name", "Frezen")
            )
        } catch (e: Exception) {
            StatusResult(false, when (e) {
                is java.net.SocketTimeoutException -> "TIMEOUT"
                is java.net.UnknownHostException -> "NO NETWORK / DNS"
                else -> "UNAVAILABLE"
            })
        }
    }

    /**
     * Calls Frezen's existing client-license validation endpoint.
     * The Worker remains authoritative for product, expiry, license status and HWID.
     * This method deliberately does not turn network failures into a valid license.
     */
    fun validateLicense(productId: String, licenseKey: String, hwid: String): LicenseResult {
        require(productId.isNotBlank()) { "Product ID is required" }
        require(licenseKey.isNotBlank()) { "License key is required" }
        require(hwid.isNotBlank()) { "Device fingerprint is required" }
        require(productId.length <= 128 && licenseKey.length <= 256 && hwid.length <= 512) {
            "License request fields are too long"
        }
        check(isConfigured()) { "Frezen backend URL is not configured" }
        val payload = JSONObject()
            .put("product_id", productId)
            .put("license_key", licenseKey)
            .put("hwid", hwid)
        val response = request("POST", "/api/v1/client/license/validate", payload.toString())
        val json = try { JSONObject(response.body) } catch (_: Exception) { JSONObject() }
        return LicenseResult(
            httpStatus = response.code,
            valid = response.code in 200..299 && json.optBoolean("valid", false),
            reason = json.optString("reason", json.optString("error", "UNKNOWN")),
            responseJson = response.body.take(16_384)
        )
    }

    private data class HttpResult(val code: Int, val body: String)

    private fun request(method: String, path: String, body: String?): HttpResult {
        val rawBase = baseUrl()
        require(isConfigured()) { "Only a configured HTTPS Frezen URL is allowed" }
        require(path.startsWith("/api/v1/") && !path.contains("..")) { "Invalid API path" }
        val connection = (URL(rawBase + path).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            requestMethod = method
            connectTimeout = 4_000
            readTimeout = 4_000
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "Frezen-Engine/0.9.0")
        }
        try {
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            require(code !in 300..399) { "Server redirect refused" }
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.use {
                BufferedReader(InputStreamReader(it, Charsets.UTF_8)).use(BufferedReader::readText)
            } ?: ""
            return HttpResult(code, responseBody)
        } finally {
            connection.disconnect()
        }
    }
}
