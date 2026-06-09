/* Cloudflare R2 (S3-compatible) client using AWS Signature V4, browser-native.
   No SDK: signing is done with the Web Crypto API (requires HTTPS/localhost). */
(function (global) {
  "use strict";

  const enc = new TextEncoder();
  const EMPTY_SHA256 =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  function toHex(buf) {
    const b = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(digest);
  }

  async function hmac(keyBytes, msgStr) {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msgStr)));
  }

  // RFC3986 encoding for a single path segment (AWS canonical URI rules).
  function encodeSegment(seg) {
    return encodeURIComponent(seg).replace(
      /[!*'()]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
    );
  }
  function encodeKey(key) {
    return key.split("/").map(encodeSegment).join("/");
  }

  function amzDates(d) {
    const p = (n) => String(n).padStart(2, "0");
    const stamp =
      d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
    const amz =
      stamp +
      "T" +
      p(d.getUTCHours()) +
      p(d.getUTCMinutes()) +
      p(d.getUTCSeconds()) +
      "Z";
    return { stamp, amz };
  }

  async function signingKey(secret, stamp, region, service) {
    const kDate = await hmac(enc.encode("AWS4" + secret), stamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, "aws4_request");
  }

  function fullPrefix(cfg) {
    const p = (cfg.prefix || "").replace(/^\/+|\/+$/g, "");
    return p ? p + "/" : "";
  }

  /** Build a signed request and execute it. Returns the raw fetch Response. */
  async function signedFetch(cfg, method, key, bodyBytes, contentType) {
    const region = cfg.region || "auto";
    const service = "s3";
    const url = new URL(cfg.endpoint);
    const host = url.host;
    const objectKey = fullPrefix(cfg) + key;
    const canonicalUri =
      "/" + encodeSegment(cfg.bucket) + "/" + encodeKey(objectKey);

    const { stamp, amz } = amzDates(new Date());
    const payloadHash = bodyBytes ? await sha256Hex(bodyBytes) : EMPTY_SHA256;

    // Headers to sign (sorted by lowercased name).
    const signed = {
      host: host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
    };
    if (contentType) signed["content-type"] = contentType;
    const names = Object.keys(signed).sort();
    const canonicalHeaders = names.map((n) => n + ":" + signed[n] + "\n").join("");
    const signedHeaders = names.join(";");

    const canonicalRequest = [
      method,
      canonicalUri,
      "", // no query string
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const scope = stamp + "/" + region + "/" + service + "/aws4_request";
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amz,
      scope,
      await sha256Hex(enc.encode(canonicalRequest)),
    ].join("\n");

    const key4 = await signingKey(cfg.secretKey, stamp, region, service);
    const signature = toHex(await hmac(key4, stringToSign));

    const authorization =
      "AWS4-HMAC-SHA256 " +
      "Credential=" + cfg.accessKey + "/" + scope + ", " +
      "SignedHeaders=" + signedHeaders + ", " +
      "Signature=" + signature;

    const fetchHeaders = {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amz,
    };
    if (contentType) fetchHeaders["Content-Type"] = contentType;

    return fetch(url.origin + canonicalUri, {
      method,
      headers: fetchHeaders,
      body: bodyBytes ? bodyBytes : undefined,
    });
  }

  async function describeError(res) {
    let detail = "";
    try {
      const text = await res.text();
      const m = text.match(/<Message>([^<]+)<\/Message>/);
      const c = text.match(/<Code>([^<]+)<\/Code>/);
      detail = (c ? c[1] + ": " : "") + (m ? m[1] : "");
    } catch (_) {}
    return new Error(detail || `${res.status} ${res.statusText}`);
  }

  const R2 = {
    /** Verify credentials + bucket reachability. 404 on a missing key still
        proves auth/CORS are correct (S3 checks the signature before existence). */
    async testConnection(cfg) {
      let res;
      try {
        res = await signedFetch(cfg, "GET", "__quickob_connection_test__");
      } catch (e) {
        throw new Error(
          "通信失敗（CORS未設定の可能性大）。R2バケットにCORS設定を追加してください。詳細: " +
            e.message
        );
      }
      if (res.status === 404 || res.ok) return true;
      if (res.status === 403)
        throw new Error("認証エラー：アクセスキー/シークレットを確認してください");
      throw await describeError(res);
    },

    async getObject(cfg, key) {
      const res = await signedFetch(cfg, "GET", key);
      if (res.status === 404) return null;
      if (!res.ok) throw await describeError(res);
      return await res.text();
    },

    async exists(cfg, key) {
      const res = await signedFetch(cfg, "HEAD", key);
      if (res.status === 404) return false;
      if (res.ok) return true;
      throw await describeError(res);
    },

    async putObject(cfg, key, contentStr) {
      const bytes = enc.encode(contentStr);
      const res = await signedFetch(
        cfg,
        "PUT",
        key,
        bytes,
        "text/markdown; charset=utf-8"
      );
      if (!res.ok) throw await describeError(res);
      return true;
    },

    /** Create a new note, suffixing the name if the key already exists. */
    async createNote(cfg, path, contentStr) {
      let target = path;
      for (let i = 1; i <= 4; i++) {
        if (!(await this.exists(cfg, target))) break;
        target = path.replace(/\.md$/i, `-${i}.md`);
      }
      await this.putObject(cfg, target, contentStr);
      return target;
    },

    /** Append text to an object, creating it if missing. */
    async appendToFile(cfg, path, textToAppend, header) {
      const existing = await this.getObject(cfg, path);
      let next;
      if (existing != null) {
        const base = existing.replace(/\s*$/, "");
        next = base + "\n" + (header ? header + "\n" : "") + textToAppend + "\n";
      } else {
        next = (header ? header + "\n" : "") + textToAppend + "\n";
      }
      await this.putObject(cfg, path, next);
      return path;
    },
  };

  global.R2 = R2;
})(window);
